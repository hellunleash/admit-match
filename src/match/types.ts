/**
 * Match types — gates and overlap.
 *
 * The rule that shapes everything here: **only a hard, stated, binary requirement can produce a
 * "no".** Credit shortfalls never do.
 *
 * Under the Lisbon standard a committee weighs "substantial difference" against learning outcomes;
 * nobody is auto-rejected for being 7 ECTS under a guideline. A tool that prints "ineligible" on a
 * credit count is wrong about the law and useless as advice, because it hides exactly the programs
 * worth applying to or arguing for.
 *
 * So: gates filter, curricular fit scores. See ARCHITECTURE.md.
 */

import type { CanonicalArea } from "../schema.js";

/* ------------------------------------------------------------------ gates */

/** Things a source explicitly states, that can genuinely rule an applicant out. */
export type GateKind =
  | "language_of_instruction" // German-taught and the applicant has no German
  | "language_level" // stated CEFR/test level with no accepted evidence route
  | "grade_cutoff" // a STATED minimum German grade, not a guideline
  | "required_test" // GRE/dMAT etc., where it applies to this applicant group
  | "degree_status" // completion required, applicant mid-degree
  | "deadline"; // passed, after back-solving APS / uni-assist lead time

export type Gate = {
  kind: GateKind;
  status: "passed" | "failed" | "unknown";
  /** What the source says, in one line, so a failure is actionable rather than a verdict. */
  detail: string;
  /** What the applicant could do about it, where anything can be done. */
  remedy?: string;
  citation?: { sourceType: string; section?: string; snippet: string; url: string };
};

/* ------------------------------------------------------------------ overlap */

export type MatchStrength =
  | "clear" // the requirement's own wording or example courses plainly cover this
  | "plausible" // defensible; a committee could go either way — the swing set
  | "none";

/** A committee reads learning outcomes. A title is a weaker proxy, and says so. */
export type EvidenceTier = "description_backed" | "title_only";

export type CourseMatch = {
  courseCode: string;
  courseTitle: string;
  credits: number;
  strength: MatchStrength;
  evidence: EvidenceTier;
  /** One sentence, quoting the requirement wording or module topic that decided it. */
  reason: string;
};

export type RequirementOverlap = {
  requirementLabel: string;
  canonical: CanonicalArea[];
  /** Absent where the program names an area without quantifying it. */
  requiredCredits: number | undefined;
  citation?: { sourceType: string; section?: string; snippet: string; url: string };

  strictCredits: number;
  generousCredits: number;
  /** min(matched, required) / required — capped at 1, so surplus in one area can't mask a gap. */
  strictCoverage: number;
  generousCoverage: number;
  /** Credits short under the strict reading. 0 when covered. */
  shortfall: number;

  matched: CourseMatch[];
  /** Courses whose classification would move the number — the only ones worth asking about. */
  swingCourses: CourseMatch[];
};

export type ProgramMatch = {
  programId: string;
  university: string;
  programName: string;
  bestSetId: string;

  /** Hard filters. A failure here is the ONLY thing that removes a program from the shortlist. */
  gates: Gate[];
  gateStatus: "passed" | "failed" | "unknown";

  requirements: RequirementOverlap[];
  /** Credit-weighted across requirements, 0–1. Reported as a range, never a single number. */
  overlapStrict: number;
  overlapGenerous: number;

  /** Largest credit gaps first — what to fix or argue, in priority order. */
  biggestGaps: { requirementLabel: string; shortfall: number }[];

  /** Module descriptions worth requesting: only courses that move the overlap materially. */
  needsEvidenceFor: { courseCode: string; courseTitle: string; because: string }[];

  notes: string[];
};
