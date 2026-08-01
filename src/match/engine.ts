/**
 * Match engine — deterministic. Consumes course→requirement judgements and gate evaluations, emits
 * a shortlist entry. It never calls a model and never decides eligibility by feel.
 *
 * Design rules, each learned from a real German statute:
 *
 *  1. **Gates filter; credits score.** Only a stated, binary rule (language, a real grade cutoff, a
 *     required test, degree status, a passed deadline) removes a program. A credit shortfall never
 *     does — it becomes a number with an explanation.
 *  2. **Non-overlapping credits.** Dresden requires "sich inhaltlich nicht überschneidende"
 *     Leistungspunkte: a course is spent once. Summing requirements independently would let one
 *     course satisfy three of them and silently inflate every score.
 *  3. **Coverage is capped per requirement.** Surplus in one area cannot mask a gap in another —
 *     that is precisely the substitution a curricular analysis refuses to make.
 */

import type {
  CourseMatch,
  Gate,
  ProgramMatch,
  RequirementOverlap,
} from "./types.js";

/**
 * Assignment under the non-overlap rule. Tightest quantified requirement first: an unquantified
 * area can absorb leftovers, and a course spent on an already-satisfied requirement is a course
 * that cannot close a gap elsewhere.
 */
function assign(
  requirements: { label: string; requiredCredits: number | undefined; candidates: CourseMatch[] }[],
  include: (m: CourseMatch) => boolean
): Map<string, CourseMatch[]> {
  const spent = new Set<string>();
  const out = new Map<string, CourseMatch[]>();
  for (const r of requirements) out.set(r.label, []);

  const order = [...requirements].sort((a, b) => {
    const aQ = a.requiredCredits === undefined;
    const bQ = b.requiredCredits === undefined;
    if (aQ !== bQ) return aQ ? 1 : -1;
    return (b.requiredCredits ?? 0) - (a.requiredCredits ?? 0);
  });

  for (const r of order) {
    let total = 0;
    for (const m of r.candidates.filter(include)) {
      if (spent.has(m.courseCode)) continue;
      if (r.requiredCredits !== undefined && total >= r.requiredCredits) break;
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
    canonical: RequirementOverlap["canonical"];
    requiredCredits: number | undefined;
    citation?: RequirementOverlap["citation"];
    candidates: CourseMatch[];
  }[];
  gates: Gate[];
  notes?: string[];
};

/** Below this, a swing course isn't worth asking a human for a document. */
const MATERIAL_SWING_CREDITS = 2;

export function evaluate(input: EngineInput): ProgramMatch {
  const strictAssign = assign(input.requirements, (m) => m.strength === "clear");
  const generousAssign = assign(input.requirements, (m) => m.strength !== "none");

  const requirements: RequirementOverlap[] = input.requirements.map((r) => {
    const strict = strictAssign.get(r.label) ?? [];
    const generous = generousAssign.get(r.label) ?? [];
    const strictCredits = sum(strict);
    const generousCredits = sum(generous);

    // An unquantified requirement (RWTH names four areas with no figures) has no denominator.
    // Coverage is "did anything match at all" — inventing a threshold the statute declined to
    // state would be exactly the fabrication this project exists to avoid.
    const req = r.requiredCredits;
    const cov = (credits: number) =>
      req === undefined ? (credits > 0 ? 1 : 0) : Math.min(1, credits / req);

    return {
      requirementLabel: r.label,
      canonical: r.canonical,
      requiredCredits: req,
      ...(r.citation ? { citation: r.citation } : {}),
      strictCredits,
      generousCredits,
      strictCoverage: cov(strictCredits),
      generousCoverage: cov(generousCredits),
      shortfall: req === undefined ? 0 : Math.max(0, req - strictCredits),
      matched: generous,
      swingCourses: generous.filter((m) => m.strength === "plausible"),
    };
  });

  /**
   * Credit-weighted overlap: a 35-credit requirement matters more than a 10-credit one. Unquantified
   * requirements get a nominal weight so they count without dominating — they carry no credit figure
   * to weight by, and dropping them entirely would flatter programs that quantify nothing.
   */
  const weightOf = (r: RequirementOverlap) => r.requiredCredits ?? 10;
  const totalWeight = requirements.reduce((n, r) => n + weightOf(r), 0) || 1;
  const weighted = (pick: (r: RequirementOverlap) => number) =>
    requirements.reduce((n, r) => n + weightOf(r) * pick(r), 0) / totalWeight;

  const biggestGaps = requirements
    .filter((r) => r.shortfall > 0)
    .map((r) => ({ requirementLabel: r.requirementLabel, shortfall: r.shortfall }))
    .sort((a, b) => b.shortfall - a.shortfall);

  /**
   * Evidence is requested only where it moves the number materially. If a requirement is short by
   * 30 credits, no module description rescues it and nobody should be asked for one; precision that
   * changes nothing is not worth a person's time.
   */
  const seen = new Set<string>();
  const needsEvidenceFor: ProgramMatch["needsEvidenceFor"] = [];
  for (const r of requirements) {
    if (r.shortfall === 0) continue;
    for (const m of r.swingCourses) {
      if (m.evidence === "description_backed") continue;
      if (m.credits < MATERIAL_SWING_CREDITS || seen.has(m.courseCode)) continue;
      seen.add(m.courseCode);
      needsEvidenceFor.push({
        courseCode: m.courseCode,
        courseTitle: m.courseTitle,
        because:
          `"${r.requirementLabel.slice(0, 55)}": ${r.strictCredits}/${r.requiredCredits} certain, ` +
          `${r.generousCredits} if this counts`,
      });
    }
  }

  const failed = input.gates.some((g) => g.status === "failed");
  const unknown = input.gates.some((g) => g.status === "unknown");

  return {
    programId: input.programId,
    university: input.university,
    programName: input.programName,
    bestSetId: input.setId,
    gates: input.gates,
    gateStatus: failed ? "failed" : unknown ? "unknown" : "passed",
    requirements,
    overlapStrict: weighted((r) => r.strictCoverage),
    overlapGenerous: weighted((r) => r.generousCoverage),
    biggestGaps,
    needsEvidenceFor,
    notes: input.notes ?? [],
  };
}

/**
 * Shortlist ordering: gate failures are separated rather than buried, because "you need German C1"
 * is actionable and a low rank is not. Within each group, higher overlap first.
 */
export function shortlist(matches: ProgramMatch[]): {
  eligible: ProgramMatch[];
  gated: ProgramMatch[];
} {
  const byOverlap = (a: ProgramMatch, b: ProgramMatch) =>
    b.overlapStrict - a.overlapStrict || b.overlapGenerous - a.overlapGenerous;
  return {
    eligible: matches.filter((m) => m.gateStatus !== "failed").sort(byOverlap),
    gated: matches.filter((m) => m.gateStatus === "failed").sort(byOverlap),
  };
}
