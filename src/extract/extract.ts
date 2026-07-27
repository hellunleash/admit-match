/**
 * Extraction + verification.
 *
 * The prompt's single job is to make the model a reader, not a judge. It never decides eligibility,
 * never converts grades, never infers a value that isn't written down. Where a source is silent the
 * answer is "unstated" — which is a real answer and must not collapse into a plausible default.
 */

import { z } from "zod";
import {
  ProgramRequirements,
  SOURCE_RANK,
  snippetSupportsNumber,
  type SourceType,
} from "../schema.js";
import { providerFor, DEFAULT_MODEL } from "./registry.js";
import type { Chunk, Usage } from "./provider.js";
import { observeWith } from "../tracing.js";
import type { FetchedDoc } from "./fetch.js";

/**
 * Bump on every prompt change. Tagged onto each trace so "which prompt version regressed?" is a
 * query rather than an archaeology exercise — the whole reason for tracing the extractor at all.
 */
export const PROMPT_VERSION = "2026-07-28.3";

export const SYSTEM_PROMPT = `You extract admission requirements from German university documents into JSON.

You are a READER, not a judge. Rules, in order of importance:

1. NEVER decide whether an applicant is eligible. You emit requirements only.
2. NEVER invent, round, average or infer a value. If a document does not state something, use
   "unstated" (or omit the optional field). Silence is a finding, not a gap to fill.
3. EVERY value needs a "snippet": verbatim text from the document that contains that value. The
   snippet is checked mechanically against the value afterwards — a value whose snippet does not
   contain it is discarded, so a wrong snippet is worse than no answer.
4. Prefer the STATUTE over a summary page. When you are reading a Zulassungssatzung,
   Prüfungsordnung, Eignungsfeststellungsordnung or Fachspezifische Bestimmungen, set
   sourceType="satzung" and record the section (e.g. "§ 4 Abs. 3") whenever it is identifiable.
5. Documents are frequently in German. Extract faithfully; keep "label" fields in the document's
   own words and set lang accordingly. Do not translate a label into what you think it means.
6. Many requirements apply only to SOME applicants (by nationality, EU/EEA status, or Lisbon
   Convention status). When a rule is group-scoped, fill "appliesTo" with the document's own
   wording. A group-scoped rule recorded as universal is a serious error.
7. Programs often publish MORE THAN ONE way to qualify. Emit each as a separate requirementSet.
   If a route needs only some of its thresholds (e.g. "at least 3 of the following four"), set
   satisfyAtLeast accordingly and put the extra step in additionalStep.
8. Distinguish a grade CUTOFF (below it, rejected) from a grade TRIGGER (below it, an extra exam or
   interview follows). They are different fields and conflating them changes the answer.
9. Requirements written qualitatively ("sufficient merit", "appropriate curricular content",
   "strong background in mathematics") go in "qualitative" verbatim. Never convert them to numbers.

Return ONLY JSON in exactly this shape. Every "cited" wrapper is {value, provenance, confidence}.
Omit optional fields entirely rather than emitting null.

{
  "programId": "<given to you>",
  "university": "<given to you>",
  "programName": "<given to you>",
  "field": "<given to you>",
  "degree": "MSc",

  "taughtIn":            { "value": "english|german|mixed", "provenance": PROV, "confidence": 0.0-1.0 },
  "admissionRestricted": { "value": "nc|nc_free|unstated",  "provenance": PROV, "confidence": 0.0-1.0 },

  // OPTIONAL. Only when a grade below which applicants are REJECTED is stated. German 1.0-4.0 scale.
  "minGermanGrade": { "value": 2.5, "provenance": PROV, "confidence": 0.9 },
  // OPTIONAL. A grade below which an EXTRA STEP follows (not a rejection).
  "gradeTriggeredAssessment": { "value": { "worseThan": 2.5, "consequence": "oral aptitude test, approx 30 minutes" }, "provenance": PROV, "confidence": 0.9 },

  // Each distinct ROUTE to qualifying is its own set.
  "requirementSets": { "value": [
    { "setId": "primary", "label": "primary requirements",
      "requirements": [
        // canonical is an ARRAY: list every area the requirement covers. "Grundlagen der Mathematik,
        // theoretische Informatik, KI" is ONE requirement covering ["math_pure","cs_theory","cs_applied"].
        // Do not split it into three requirements, and do not pick just one area.
        { "canonical": ["math_pure|math_applied|cs_theory|cs_practical|cs_technical|cs_applied|physics|electronics|materials_chemistry|engineering_other|thesis|total|other"],
          "label": "<the document's OWN wording, verbatim>",
          "minEcts": 25,                    // OMIT when the document names an area with no credit figure
          "provenance": PROV,               // THIS requirement's own line — not the section as a whole
          "exampleCourses": ["<courses the document names, if any>"] }
      ],
      "satisfyAtLeast": 3,                       // OMIT unless the source says "at least N of the following"
      "additionalStep": "aptitude interview"     // OMIT unless this route demands an extra step
    }
  ], "provenance": PROV, "confidence": 0.9 },

  // OPTIONAL. Only when admission is defined by reference to ANOTHER program's curriculum.
  "referenceCurriculum": { "value": { "referenceProgram": "B.Sc. Computer Science, TU Darmstadt", "minEcts": 60, "equivalenceWording": "<verbatim>", "referenceCurriculumUrl": "...", "selfAssessmentUrl": "..." }, "provenance": PROV, "confidence": 0.8 },

  "assessmentStyle": { "value": "points|binary|unstated", "provenance": PROV, "confidence": 0.9 },
  // OPTIONAL, only when points-based.
  "pointsRubric": { "value": { "criteria": [ { "name": "subject relevance", "max": 40, "appliesTo": GROUP } ], "passMarks": [ { "appliesTo": GROUP, "value": 80 } ] }, "provenance": PROV, "confidence": 0.8 },

  "auflagen":        { "value": { "offered": "yes|no|unstated", "maxEcts": 42, "deadline": "first two semesters" }, "provenance": PROV, "confidence": 0.8 },
  "degreeInProgress":{ "value": { "allowed": "yes|no|unstated", "minEctsSoFar": 150, "thesisMustBeRegistered": true, "certificateDeadline": "<verbatim>" }, "provenance": PROV, "confidence": 0.8 },

  // ONE entry per LANGUAGE, not per test. Every accepted proof goes in acceptedEvidence —
  // "English C1, satisfied by TOEFL 100 or IELTS 7.0 or ..." is ONE requirement with many doors.
  "language": { "value": [ { "language": "english|german", "cefr": "C1",
      "acceptedEvidence": [ { "name": "TOEFL iBT", "overall": 100 }, { "name": "IELTS", "overall": 7.0, "minBand": 5.5 }, { "name": "medium of instruction certificate", "note": "<verbatim conditions>" } ],
      "waiverIfMediumOfInstruction": "yes|no|unstated", "requiredFor": "admission|enrolment|unstated" } ], "provenance": PROV, "confidence": 0.9 },
  "tests":    { "value": [ { "name": "GRE General Test", "required": "yes|no|unstated", "thresholds": "<verbatim>", "appliesTo": GROUP, "exemptions": "<verbatim>" } ], "provenance": PROV, "confidence": 0.9 },
  "interview":{ "value": "yes|no|unstated", "provenance": PROV, "confidence": 0.9 },

  "applicationRoute": { "value": "direct|uni_assist|both|unstated", "provenance": PROV, "confidence": 0.9 },
  "deadlines": { "value": [ { "intake": "winter|summer", "opens": "1 April", "closes": "31 May", "appliesTo": GROUP } ], "provenance": PROV, "confidence": 0.9 },

  "qualitative": [ { "value": "<verbatim qualitative requirement>", "provenance": PROV, "confidence": 0.9 } ],

  "extractedAt": "<ISO 8601 timestamp>"
}

PROV = { "sourceType": "satzung|program_page|faq", "sourceUrl": "<exact url given in the document header>",
         "snippet": "<verbatim text containing the value>", "section": "§ 4 Abs. 3", "lang": "de|en",
         "fetchedAt": "<the fetchedAt given in that document's header>" }

GROUP (omit entirely when a rule applies to everyone) =
  { "description": "<the document's own wording>", "nationalities": ["India"],
    "euEea": "only|excluded|any", "lisbonConvention": "signatory|non_signatory|any" }

Hard rules about shape, learned from real failures:
- EVERY cited wrapper needs all three of value, provenance, confidence. A wrapper without
  provenance is discarded, so omit the whole field rather than emitting a bare value.
- "tests", "language", "deadlines" and "requirementSets" are CITED WRAPPERS whose value happens to
  be an array. Write {"value": [...], "provenance": {...}, "confidence": 0.9} — never a bare array.
- Omit fields you cannot fill. Do NOT write null: no field anywhere accepts null.
- Each entry in "requirements" carries its OWN provenance, quoting the specific line that states
  that threshold. Do not reuse one snippet for several thresholds.
- NEVER add up numbers. If a statute lists 35, 35 and 20, do not emit a 90 "total" requirement —
  that total appears in no sentence, and a value you computed is a value you invented.
- Arrays are never null: use [] when a document states nothing.
- Enums must be exactly one of the listed literals. "not specified" is written as "unstated".
- NUMBER and BOOLEAN fields must be a number or a boolean. Never write "unstated" into one —
  omit the field instead. Omission already means unknown.
- minEcts is OPTIONAL. Many programs name required subject areas with no credit figure attached.
  Omit minEcts in that case; do NOT invent, estimate or infer a number.
- Every required top-level field must be present: taughtIn, admissionRestricted, requirementSets,
  assessmentStyle, auflagen, degreeInProgress, language, tests, interview, applicationRoute,
  deadlines, qualitative, extractedAt.`;

export type ExtractionInput = {
  programId: string;
  university: string;
  programName: string;
  field: string;
  docs: { doc: FetchedDoc; sourceType: SourceType }[];
  /** Defaults to DEFAULT_MODEL. Set by `--model` so an A/B is a flag, not a code change. */
  model?: string;
};

export type VerifyIssue = {
  path: string;
  kind: "snippet_missing_value" | "weaker_source_used" | "empty_snippet";
  /**
   * "defect" quarantines the field — it cannot prove itself, so it must not reach a user.
   * "review" is a signal for a human, not a failure.
   */
  severity: "defect" | "review";
  detail: string;
};

export type ExtractionResult =
  | {
      ok: true;
      data: z.infer<typeof ProgramRequirements>;
      issues: VerifyIssue[];
      usage: Usage;
    }
  | { ok: false; error: string };

export async function extractProgram(input: ExtractionInput): Promise<ExtractionResult> {
  const usable = input.docs.filter((d) => d.doc.kind !== "failed");
  if (usable.length === 0) return { ok: false, error: "no usable documents fetched" };

  const chunks: Chunk[] = [
    {
      kind: "text",
      text:
        `Program: ${input.programName}\nUniversity: ${input.university}\nField: ${input.field}\n` +
        `programId: ${input.programId}\n\n` +
        `Documents follow, each labelled with its sourceType and URL. Use the STRONGEST source ` +
        `available for each field and set sourceType to the document you actually read it in.`,
    },
  ];

  for (const { doc, sourceType } of usable) {
    const header = `\n--- DOCUMENT (sourceType=${sourceType}, url=${doc.url}, fetchedAt=${doc.fetchedAt})`;
    if (doc.kind === "text") {
      chunks.push({ kind: "text", text: `${header} ---\n${doc.text.slice(0, 200_000)}` });
    } else if (doc.kind === "pdf") {
      chunks.push({ kind: "text", text: `${header} — PDF follows ---` });
      chunks.push({ kind: "pdf", bytes: doc.bytes });
    }
  }

  const model = input.model ?? DEFAULT_MODEL;
  const provider = providerFor(model);

  const result = await observeWith("extract_program", async () => {
    const r = await provider.generate(chunks, SYSTEM_PROMPT, ProgramRequirements);
    return {
      result: r,
      fields: {
        input: {
          programId: input.programId,
          docs: usable.map((d) => ({ sourceType: d.sourceType, kind: d.doc.kind })),
        },
        output: r.ok ? { requirementSets: r.value.requirementSets.value.length } : { error: r.error },
        metadata: {
          model,
          attempts: r.attempts,
          promptVersion: PROMPT_VERSION,
          ...(r.ok
            ? {
                inputTokens: r.usage.inputTokens,
                outputTokens: r.usage.outputTokens,
                thinkingTokens: r.usage.thinkingTokens,
                costUsd: r.usage.costUsd,
              }
            : {}),
        },
      },
    };
  });

  if (!result.ok) return { ok: false, error: result.error };

  const bestAvailable = usable
    .map((d) => d.sourceType)
    .reduce<SourceType>((best, t) => (SOURCE_RANK[t] > SOURCE_RANK[best] ? t : best), "faq");

  return {
    ok: true,
    data: result.value,
    issues: verify(result.value, bestAvailable),
    usage: result.usage,
  };
}

/**
 * Deterministic verification. Runs after every extraction, and its failures are quarantined rather
 * than surfaced — a field that cannot prove itself does not reach a user.
 */
export function verify(
  data: z.infer<typeof ProgramRequirements>,
  bestAvailable: SourceType
): VerifyIssue[] {
  const issues: VerifyIssue[] = [];

  const checkCited = (path: string, node: unknown, numbers: number[]) => {
    if (typeof node !== "object" || node === null || !("provenance" in node)) return;
    const prov = (node as { provenance: { snippet?: string; sourceType: SourceType } }).provenance;

    if (!prov.snippet || prov.snippet.trim().length === 0) {
      issues.push({ path, kind: "empty_snippet", severity: "defect", detail: "no snippet supplied" });
      return;
    }
    // REVIEW, not defect. Plenty of real facts — deadlines, accepted English tests — are published
    // only on the program page and appear in no statute. Treating that as a violation produced five
    // false positives on the very first extraction. Whether the statute *also* covers a field is
    // not mechanically knowable, so this flags for a human instead of pretending to know.
    if (SOURCE_RANK[prov.sourceType] < SOURCE_RANK[bestAvailable]) {
      issues.push({
        path,
        kind: "weaker_source_used",
        severity: "review",
        detail: `read from ${prov.sourceType} while ${bestAvailable} was available — confirm the statute is silent on this`,
      });
    }
    for (const n of numbers) {
      if (!snippetSupportsNumber(prov.snippet, n)) {
        issues.push({
          path,
          kind: "snippet_missing_value",
          severity: "defect",
          detail: `value ${n} does not appear in the cited snippet`,
        });
      }
    }
  };

  checkCited("taughtIn", data.taughtIn, []);
  checkCited("admissionRestricted", data.admissionRestricted, []);
  if (data.minGermanGrade) checkCited("minGermanGrade", data.minGermanGrade, [data.minGermanGrade.value]);
  if (data.gradeTriggeredAssessment) {
    checkCited("gradeTriggeredAssessment", data.gradeTriggeredAssessment, [
      data.gradeTriggeredAssessment.value.worseThan,
    ]);
  }

  // The wrapper carries no numbers of its own — each requirement is checked against ITS OWN
  // citation. A threshold whose line doesn't contain it was derived rather than read.
  checkCited("requirementSets", data.requirementSets, []);
  data.requirementSets.value.forEach((set, si) => {
    set.requirements.forEach((req, ri) => {
      const path = `requirementSets[${si}].requirements[${ri}] (${req.label.slice(0, 40)})`;
      if (req.minEcts === undefined) return; // named but unquantified — legitimate
      if (!req.provenance) {
        issues.push({
          path,
          kind: "empty_snippet",
          severity: "defect",
          detail: `minEcts ${req.minEcts} has no citation of its own`,
        });
        return;
      }
      if (!snippetSupportsNumber(req.provenance.snippet, req.minEcts)) {
        issues.push({
          path,
          kind: "snippet_missing_value",
          severity: "defect",
          detail: `value ${req.minEcts} does not appear in its cited snippet — derived, not read`,
        });
      }
    });
  });

  if (data.referenceCurriculum) {
    const refMin = data.referenceCurriculum.value.minEcts;
    checkCited("referenceCurriculum", data.referenceCurriculum, refMin === undefined ? [] : [refMin]);
  }
  if (data.auflagen) {
    const max = data.auflagen.value.maxEcts;
    checkCited("auflagen", data.auflagen, max === undefined ? [] : [max]);
  }
  if (data.assessmentStyle) checkCited("assessmentStyle", data.assessmentStyle, []);
  if (data.deadlines) checkCited("deadlines", data.deadlines, []);
  if (data.tests) checkCited("tests", data.tests, []);
  if (data.language) checkCited("language", data.language, []);

  // Absence is recorded, not defaulted. A missing field means the source was silent (or the model
  // missed it) — both are worth knowing and neither is a value.
  for (const [name, present] of [
    ["assessmentStyle", Boolean(data.assessmentStyle)],
    ["auflagen", Boolean(data.auflagen)],
    ["language", Boolean(data.language)],
    ["deadlines", Boolean(data.deadlines)],
  ] as const) {
    if (!present) {
      issues.push({ path: name, kind: "empty_snippet", severity: "review", detail: "not extracted" });
    }
  }

  return issues;
}
