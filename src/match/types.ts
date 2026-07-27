/**
 * Match types.
 *
 * The design in one line: match each course against each REQUIREMENT'S OWN WORDING, compute the
 * answer twice (strict and generous), and only ask the applicant for more evidence when the gap
 * between those two answers actually changes the verdict.
 *
 * What this deliberately does NOT do:
 *  - classify courses into global buckets. Dresden's "Systems & Infrastructure" and TU Berlin's
 *    "computer engineering or information technology" are different sets; routing both through one
 *    taxonomy loses the distinction that decides the case.
 *  - soften anyone's threshold. 25 ECTS means 25. The range below expresses uncertainty in MY
 *    reading of the transcript, never leniency in THEIR rule.
 */

import type { CanonicalArea } from "../schema.js";

/** How well a course satisfies one specific requirement. */
export type MatchStrength =
  | "clear" // the requirement's own wording or example courses plainly cover this
  | "plausible" // defensible, and a committee could go either way — this is the swing set
  | "none";

/** What the judgement rests on. A committee reads learning outcomes; a title is a weaker proxy. */
export type EvidenceTier = "description_backed" | "title_only";

export type CourseMatch = {
  courseCode: string;
  courseTitle: string;
  /** Home-system credits. Conversion to ECTS happens once, explicitly, and may be unknown. */
  credits: number;
  strength: MatchStrength;
  evidence: EvidenceTier;
  /** Why, in one sentence, quoting the requirement wording or module topic that decided it. */
  reason: string;
};

export type RequirementOutcome = {
  requirementLabel: string;
  canonical: CanonicalArea[];
  /** Absent where the program names an area without quantifying it (RWTH does this for all four). */
  minEcts: number | undefined;
  /** Statute line for the requirement itself, so the number is always traceable. */
  citation?: { sourceType: string; section?: string; snippet: string; url: string };

  /** Only `clear` matches. */
  strictEcts: number;
  /** `clear` + `plausible`. */
  generousEcts: number;

  matched: CourseMatch[];
  /** Courses whose inclusion moves the total across `minEcts` — the ones worth asking about. */
  swingCourses: CourseMatch[];

  verdict: "met" | "not_met" | "uncertain";
};

export type ProgramMatch = {
  programId: string;
  university: string;
  programName: string;

  /** Best qualifying route, where a program publishes more than one (Würzburg has two). */
  bestSetId: string;
  requirements: RequirementOutcome[];

  /**
   * `eligible` only when every requirement is met even under the STRICT reading. Anything resting
   * on a generous reading is `uncertain` — an applicant told "eligible" on a maybe would spend
   * €75 and a cycle finding out otherwise.
   */
  verdict: "eligible" | "uncertain" | "ineligible";

  /** Requirements that fail even generously. These are the real blockers. */
  blockers: string[];

  /**
   * The escalation ask: module descriptions needed ONLY for courses that would change the verdict.
   * Empty when the outcome is the same either way — precision that changes nothing is not worth
   * asking a person for.
   */
  needsEvidenceFor: { courseCode: string; courseTitle: string; because: string }[];

  /** Gates outside the curricular analysis: language, tests, degree status, deadlines. */
  otherGates: { name: string; status: "met" | "not_met" | "unknown"; detail: string }[];

  notes: string[];
};
