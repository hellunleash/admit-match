/**
 * The match engine. Deterministic: it consumes course→requirement judgements and produces a
 * verdict. It never calls a model and never decides eligibility "by feel".
 *
 * Two rules the German statutes force, both easy to get wrong in a way that silently inflates
 * every total:
 *
 *  1. NON-OVERLAPPING credits. Dresden requires "sich inhaltlich nicht überschneidende"
 *     Leistungspunkte, so one course cannot count toward two requirements at once. Summing each
 *     requirement independently would let a single course satisfy three of them.
 *  2. STRICT decides the verdict. A total that only clears the bar under a generous reading is
 *     `uncertain`, never `eligible` — telling someone they qualify on a maybe costs them €75 and
 *     an application cycle.
 */

import type { CourseMatch, ProgramMatch, RequirementOutcome } from "./types.js";

/** Assignment under the non-overlap rule: a course is spent once, on the requirement that needs it
 *  most. "Most" = the scarcest requirement first, so a course isn't wasted on one already met. */
function assign(
  requirements: { label: string; minEcts: number | undefined; candidates: CourseMatch[] }[],
  include: (m: CourseMatch) => boolean
): Map<string, CourseMatch[]> {
  const spent = new Set<string>();
  const out = new Map<string, CourseMatch[]>();
  for (const r of requirements) out.set(r.label, []);

  // Quantified requirements first, tightest first: an unquantified area can absorb leftovers, and
  // a course spent on a satisfied requirement is a course that can't rescue a failing one.
  const order = [...requirements].sort((a, b) => {
    if ((a.minEcts === undefined) !== (b.minEcts === undefined)) return a.minEcts === undefined ? 1 : -1;
    return (b.minEcts ?? 0) - (a.minEcts ?? 0);
  });

  for (const r of order) {
    let total = 0;
    for (const m of r.candidates.filter(include)) {
      if (spent.has(m.courseCode)) continue;
      if (r.minEcts !== undefined && total >= r.minEcts) break; // satisfied — leave the rest
      spent.add(m.courseCode);
      out.get(r.label)!.push(m);
      total += m.credits;
    }
  }
  return out;
}

const sum = (list: CourseMatch[]) => list.reduce((n, m) => n + m.credits, 0);

export type EngineInput = {
  programId: string;
  university: string;
  programName: string;
  setId: string;
  requirements: {
    label: string;
    canonical: RequirementOutcome["canonical"];
    minEcts: number | undefined;
    citation?: RequirementOutcome["citation"];
    /** Every course judged against THIS requirement, in the judge's preferred order. */
    candidates: CourseMatch[];
  }[];
  otherGates: ProgramMatch["otherGates"];
  notes?: string[];
};

export function evaluate(input: EngineInput): ProgramMatch {
  const strictAssign = assign(input.requirements, (m) => m.strength === "clear");
  const generousAssign = assign(input.requirements, (m) => m.strength !== "none");

  const requirements: RequirementOutcome[] = input.requirements.map((r) => {
    const strict = strictAssign.get(r.label) ?? [];
    const generous = generousAssign.get(r.label) ?? [];
    const strictEcts = sum(strict);
    const generousEcts = sum(generous);

    let verdict: RequirementOutcome["verdict"];
    if (r.minEcts === undefined) {
      // Named but unquantified (RWTH does this for all four areas). There is no number to clear, so
      // claiming "met" would be inventing a threshold the statute declined to state.
      verdict = strictEcts > 0 ? "met" : "uncertain";
    } else if (strictEcts >= r.minEcts) {
      verdict = "met";
    } else if (generousEcts >= r.minEcts) {
      verdict = "uncertain"; // the swing courses decide this one
    } else {
      verdict = "not_met";
    }

    // Swing courses: plausible-but-not-clear matches that are load-bearing — present only when the
    // generous reading clears a bar the strict reading doesn't.
    const swingCourses =
      verdict === "uncertain" && r.minEcts !== undefined
        ? generous.filter((m) => m.strength === "plausible")
        : [];

    return {
      requirementLabel: r.label,
      canonical: r.canonical,
      minEcts: r.minEcts,
      ...(r.citation ? { citation: r.citation } : {}),
      strictEcts,
      generousEcts,
      matched: generous,
      swingCourses,
      verdict,
    };
  });

  const blockers = requirements.filter((r) => r.verdict === "not_met").map((r) => r.requirementLabel);
  const uncertain = requirements.filter((r) => r.verdict === "uncertain");

  const verdict: ProgramMatch["verdict"] =
    blockers.length > 0 ? "ineligible" : uncertain.length > 0 ? "uncertain" : "eligible";

  /**
   * The escalation ask, and the reason it stays short: evidence is requested ONLY for courses whose
   * classification changes the verdict. If a requirement fails by 60 ECTS, no module description
   * rescues it and nobody should be asked for one. Precision that changes nothing is not worth a
   * person's time.
   */
  const seen = new Set<string>();
  const needsEvidenceFor: ProgramMatch["needsEvidenceFor"] = [];
  for (const r of uncertain) {
    for (const m of r.swingCourses) {
      if (m.evidence === "description_backed" || seen.has(m.courseCode)) continue;
      seen.add(m.courseCode);
      needsEvidenceFor.push({
        courseCode: m.courseCode,
        courseTitle: m.courseTitle,
        because: `decides "${r.requirementLabel.slice(0, 60)}" — ${r.strictEcts}/${r.minEcts} certain, ${r.generousEcts} if counted`,
      });
    }
  }

  return {
    programId: input.programId,
    university: input.university,
    programName: input.programName,
    bestSetId: input.setId,
    requirements,
    verdict,
    blockers,
    needsEvidenceFor,
    otherGates: input.otherGates,
    notes: input.notes ?? [],
  };
}
