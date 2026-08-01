/**
 * The judge: decides, per requirement, which of an applicant's courses count — and evaluates the
 * hard gates.
 *
 * This is the only model call in the matching path. Everything downstream of it
 * (src/match/engine.ts) is deterministic arithmetic, so the model's job is narrow and checkable:
 * read a requirement's own wording, read a course, say `clear` / `plausible` / `none`, and quote the
 * words that decided it.
 *
 * It is explicitly NOT asked whether the applicant is eligible, nor to add credits, nor to weigh
 * requirements against each other. Those are the engine's job, and a model that does them produces
 * a confident number nobody can audit.
 *
 * Cost: one call per (profile, programme). Cached on profile hash + snapshot hash, so re-running a
 * shortlist is free the way re-extraction is.
 */

import { z } from "zod";
import { providerFor, DEFAULT_MODEL } from "../extract/registry.js";
import type { Chunk } from "../extract/provider.js";
import type { ProgramRequirements } from "../schema.js";
import type { Profile } from "../profile.js";
import type { CourseMatch, Gate } from "./types.js";

export const JUDGE_PROMPT_VERSION = "2026-07-29.1";

/* ------------------------------------------------------------------ output schema */

const Judgement = z.object({
  requirementIndex: z.number().int().nonnegative(),
  courseCode: z.string(),
  strength: z.enum(["clear", "plausible", "none"]),
  /** One sentence quoting the requirement wording or the course topic that decided it. */
  reason: z.string(),
});

const GateJudgement = z.object({
  kind: z.enum([
    "language_of_instruction",
    "language_level",
    "grade_cutoff",
    "required_test",
    "degree_status",
    "deadline",
  ]),
  status: z.enum(["passed", "failed", "unknown"]),
  detail: z.string(),
  remedy: z.string().optional(),
});

export const JudgeOutput = z.object({
  judgements: z.array(Judgement).default([]),
  gates: z.array(GateJudgement).default([]),
});

/* ------------------------------------------------------------------ prompt */

const SYSTEM = `You compare an applicant's completed courses against a German master's programme's
admission requirements, and you evaluate its hard gates. You are a reader and a comparer — never a
decision-maker about admission.

HOW TO JUDGE A COURSE AGAINST A REQUIREMENT

German recognition law (Lisbon Recognition Convention, in force in Germany since 2007) asks whether
there is a SUBSTANTIAL DIFFERENCE in LEARNING OUTCOMES — not whether titles match. Course titles
differ between universities for identical material. So:

- "clear"     — the requirement's own wording, or an example course it names, plainly covers this
                course's subject matter. A committee would not argue about it.
- "plausible" — a defensible reading that a committee could go either way on. Overlapping but not
                central, or a title whose content you cannot confirm.
- "none"      — different subject matter.

Judge on CONTENT. Where a course has a description or topic list, that is your evidence and it
outranks its title. Where you only have a title, be honest: an ambiguous title is "plausible", not
"clear". Never upgrade a guess by assuming what a course probably contained.

Every course is judged against every requirement independently. Do not worry about a course being
used twice, do not add up credits, and do not decide whether the applicant qualifies — arithmetic and
assignment happen in code afterwards.

HOW TO EVALUATE GATES

Only report a gate as "failed" when the programme's own text STATES the rule and the applicant
plainly does not meet it. Report "unknown" when the source is silent or the applicant's data is
missing. Silence is never a failure.

- language_of_instruction — the programme is taught in a language the applicant cannot follow
- language_level          — a stated CEFR level or test score, with no accepted evidence route open
- grade_cutoff           — a STATED minimum grade, not a guideline or a trigger for extra assessment
- required_test          — a test required for THIS applicant's group (check nationality/EU status)
- degree_status          — the applicant's degree status is inadmissible (e.g. completion required)
- deadline               — the stated deadline for the target intake has passed

For each gate give a one-line "detail" quoting what the source says, and a "remedy" where the
applicant could realistically act (take IELTS, register for the test, apply next intake).

Return ONLY JSON:
{"judgements":[{"requirementIndex":0,"courseCode":"EP102","strength":"clear|plausible|none","reason":"..."}],
 "gates":[{"kind":"...","status":"passed|failed|unknown","detail":"...","remedy":"..."}]}

Omit "none" judgements entirely — they are the default and listing them wastes output.`;

/* ------------------------------------------------------------------ input assembly */

type ModuleDescription = {
  code: string;
  contentSummary?: string;
  topics?: string[];
  learningOutcomes?: string[];
};

const normCode = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

function describeCourses(profile: Profile, modules: ModuleDescription[]): string {
  const byCode = new Map(modules.map((m) => [normCode(m.code), m]));
  return profile.courses
    .filter((c) => c.passed)
    .map((c) => {
      const m = byCode.get(normCode(c.code));
      const detail = m
        ? ` | content: ${(m.contentSummary ?? "").slice(0, 300)} | topics: ${(m.topics ?? [])
            .join("; ")
            .slice(0, 500)}`
        : ` | (title only — no module description available)`;
      return `${c.code} "${c.title}" (${c.credits} cr)${detail}`;
    })
    .join("\n");
}

function describeRequirements(program: ProgramRequirements, setId: string): string {
  const set =
    program.requirementSets.value.find((s) => s.setId === setId) ?? program.requirementSets.value[0];
  if (!set) return "(no requirement set)";
  return set.requirements
    .map(
      (r, i) =>
        `[${i}] ${r.label}${r.minEcts !== undefined ? ` — requires ${r.minEcts} ECTS` : " — no credit figure stated"}` +
        (r.exampleCourses.length ? ` | named examples: ${r.exampleCourses.join("; ")}` : "")
    )
    .join("\n");
}

function describeGateContext(program: ProgramRequirements, profile: Profile): string {
  const lines: string[] = [];
  lines.push(`taught in: ${program.taughtIn.value}`);
  lines.push(`admission restricted: ${program.admissionRestricted.value}`);
  if (program.minGermanGrade) lines.push(`stated minimum German grade: ${program.minGermanGrade.value}`);
  if (program.gradeTriggeredAssessment)
    lines.push(
      `grade trigger (NOT a cutoff): worse than ${program.gradeTriggeredAssessment.value.worseThan} → ${program.gradeTriggeredAssessment.value.consequence}`
    );
  for (const l of program.language?.value ?? []) {
    lines.push(
      `language: ${l.language} ${l.cefr ?? ""} (required for ${l.requiredFor}) — accepted: ` +
        (l.acceptedEvidence.map((e) => `${e.name}${e.overall ? ` ${e.overall}` : ""}`).join(", ") || "unstated")
    );
  }
  for (const t of program.tests?.value ?? []) {
    lines.push(
      `test: ${t.name} required=${t.required}${t.thresholds ? ` (${t.thresholds})` : ""}` +
        `${t.appliesTo ? ` — applies to: ${t.appliesTo.description}` : ""}` +
        `${t.exemptions ? ` — exempt: ${t.exemptions}` : ""}`
    );
  }
  if (program.degreeInProgress)
    lines.push(`degree in progress allowed: ${program.degreeInProgress.value.allowed}`);
  for (const d of program.deadlines?.value ?? []) {
    lines.push(`deadline ${d.intake}: ${d.closes}${d.appliesTo ? ` (${d.appliesTo.description})` : ""}`);
  }

  lines.push(`\nAPPLICANT: nationality ${profile.nationality}, degree "${profile.degreeTitle}"`);
  lines.push(`degree status: ${profile.status}${profile.thesisRegistered ? " (thesis registered)" : ""}`);
  lines.push(
    `grade: ${profile.cgpa ?? "?"} on ${profile.gradeScale.name} (max ${profile.gradeScale.nmax}, min pass ${profile.gradeScale.nmin})`
  );
  lines.push(`language tests held: ${profile.tests.map((t) => `${t.name} ${t.score}`).join(", ") || "none"}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ run */

export type JudgeResult = {
  ok: true;
  matchesByRequirement: Map<number, CourseMatch[]>;
  gates: Gate[];
  costUsd: number;
} | { ok: false; error: string; costUsd: number };

export async function judge(
  program: ProgramRequirements,
  setId: string,
  profile: Profile,
  modules: ModuleDescription[],
  model = process.env["JUDGE_MODEL"] ?? DEFAULT_MODEL
): Promise<JudgeResult> {
  const chunks: Chunk[] = [
    {
      kind: "text",
      text:
        `PROGRAMME: ${program.programName} — ${program.university}\n\n` +
        `REQUIREMENTS (judge every course against every one, by index):\n${describeRequirements(program, setId)}\n\n` +
        `GATE CONTEXT:\n${describeGateContext(program, profile)}\n\n` +
        `APPLICANT COURSES (passed only):\n${describeCourses(profile, modules)}`,
    },
  ];

  const provider = providerFor(model);
  const res = await provider.generate(chunks, SYSTEM, JudgeOutput);
  if (!res.ok) return { ok: false, error: res.error, costUsd: res.usage.costUsd };

  const byCode = new Map(profile.courses.map((c) => [normCode(c.code), c]));
  const described = new Set(modules.map((m) => normCode(m.code)));
  const matchesByRequirement = new Map<number, CourseMatch[]>();

  for (const j of res.value.judgements) {
    if (j.strength === "none") continue;
    const course = byCode.get(normCode(j.courseCode));
    // A judgement about a course the applicant doesn't have is discarded, not trusted.
    if (!course || !course.passed) continue;

    const list = matchesByRequirement.get(j.requirementIndex) ?? [];
    list.push({
      courseCode: course.code,
      courseTitle: course.title,
      credits: course.credits,
      strength: j.strength,
      // Evidence tier is decided by what we actually SENT, not by what the model claims.
      evidence: described.has(normCode(course.code)) ? "description_backed" : "title_only",
      reason: j.reason,
    });
    matchesByRequirement.set(j.requirementIndex, list);
  }

  // Clear matches first: the engine spends courses in order under the non-overlap rule, and a
  // certain match should claim a requirement before a speculative one does.
  for (const list of matchesByRequirement.values()) {
    list.sort((a, b) => (a.strength === b.strength ? b.credits - a.credits : a.strength === "clear" ? -1 : 1));
  }

  return {
    ok: true,
    matchesByRequirement,
    gates: res.value.gates.map((g) => ({
      kind: g.kind,
      status: g.status,
      detail: g.detail,
      ...(g.remedy ? { remedy: g.remedy } : {}),
    })),
    costUsd: res.usage.costUsd,
  };
}
