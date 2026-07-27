/**
 * Extraction schema v2 — the contract between the LLM and everything downstream.
 *
 * The rule this project rests on: the model ONLY fills this struct. It is never asked whether an
 * applicant is eligible. Matching is deterministic code over these values.
 *
 * Every value arrives wrapped in `cited()`: the number is useless without the sentence it came
 * from, the document it came from, and the day it was read.
 *
 * v2 changes, each forced by a real program in src/seeds.ts rather than by speculation:
 *  - subject areas are an OPEN taxonomy, not a CS-only enum      (field-agnostic; see §Areas)
 *  - alternative requirement sets with k-of-n rules              (KIT CS INT)
 *  - requirements defined by reference to another curriculum     (TU Darmstadt)
 *  - applicant-group-dependent gates and deadlines               (Freiburg, Konstanz, TUM)
 *  - degree-in-progress admission                                (LMU, Hamburg)
 *  - explicit foreign credit-system conversion                   (any non-ECTS transcript)
 */

import { z } from "zod";

/* ------------------------------------------------------------------ provenance */

/**
 * Which document a value came from. A hierarchy, not a preference: the Zulassungssatzung /
 * Prüfungsordnung is binding, the program page is a summary of it, the FAQ is neither.
 * Extracting from a summary when a statute exists is a defect.
 */
export const SourceType = z.enum(["satzung", "program_page", "faq"]);
export type SourceType = z.infer<typeof SourceType>;

export const SOURCE_RANK: Record<SourceType, number> = { satzung: 3, program_page: 2, faq: 1 };

export const Provenance = z.object({
  sourceType: SourceType,
  sourceUrl: z.string().url(),
  /** Verbatim text containing the value. The verify step asserts the value appears in here. */
  snippet: z.string().min(1),
  /** Statute section where identifiable, e.g. "§ 4 Abs. 3". */
  section: z.string().optional(),
  /** Statutes are frequently German. Expected, not an anomaly. */
  lang: z.enum(["de", "en"]),
  fetchedAt: z.string().datetime(),
});
export type Provenance = z.infer<typeof Provenance>;

/** A value that cannot exist without its citation. */
const cited = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value,
    provenance: Provenance,
    /** Model self-report. Triage/review ordering only — NEVER a gate. */
    confidence: z.number().min(0).max(1),
  });

/* ------------------------------------------------------------------ areas (open taxonomy) */

/**
 * Coarse subject areas, deliberately spanning STEM rather than computer science alone.
 *
 * v1 used a CS-only enum. That was wrong in both directions: it couldn't express a physics or
 * materials program's requirements, and it couldn't express a *physics* transcript being matched
 * against a CS program — which is the common real case, not the exception.
 *
 * `canonical` is what deterministic matching compares. `label` always preserves the program's own
 * wording, because that wording is what a committee actually reads, and normalising it away is how
 * you lose the ability to explain a decision.
 */
export const CanonicalArea = z.enum([
  // computing
  "cs_theory", // automata, complexity, computability, formal systems, logic
  "cs_practical", // programming, data structures, algorithms, software engineering, databases
  "cs_technical", // computer architecture, operating systems, networks, embedded, microprocessors
  "cs_applied", // AI/ML, graphics, HCI, security, information systems
  // mathematics
  "math_pure", // analysis, linear algebra, discrete mathematics
  "math_applied", // numerics, stochastics, statistics, computational/mathematical methods
  // physical sciences and engineering
  "physics",
  "electronics", // analog/digital electronics, semiconductor devices, communication systems
  "materials_chemistry",
  "engineering_other",
  // structural
  "thesis",
  "total", // an aggregate over the whole degree
  "other",
]);
export type CanonicalArea = z.infer<typeof CanonicalArea>;

/* ------------------------------------------------------------------ requirements */

export const AreaRequirement = z.object({
  canonical: CanonicalArea,
  /** The program's own phrasing, verbatim. Never discarded. */
  label: z.string().min(1),
  minEcts: z.number().nonnegative(),
  /** Example courses the source names, if any — the best signal for classifying a transcript. */
  exampleCourses: z.array(z.string()).default([]),
});
export type AreaRequirement = z.infer<typeof AreaRequirement>;

/**
 * One coherent way to qualify. Programs often publish more than one.
 *
 * KIT CS (INT): primary set is maths 25 / theory 15 / practical 30 / computer engineering 8.
 * If unmet, admission remains possible when at least 3 of 4 LOWER thresholds are met plus an
 * aptitude interview. That is a second RequirementSet with `satisfyAtLeast: 3` and
 * `additionalStep: "interview"` — not a footnote.
 */
export const RequirementSet = z.object({
  setId: z.string().min(1),
  label: z.string().min(1), // "primary" | "alternative via aptitude interview"
  requirements: z.array(AreaRequirement),
  /** null/undefined = ALL requirements must hold. A number = k-of-n. */
  satisfyAtLeast: z.number().int().positive().optional(),
  /** Extra step this route demands, e.g. an interview or written test. */
  additionalStep: z.string().optional(),
});

/**
 * TU Darmstadt defines admission by reference to its OWN bachelor's curriculum: >=60 CP that
 * "must not differ significantly" from the entry-level skills of its B.Sc. Computer Science,
 * mapped course by course. There are no subject-area totals to compare against, so this cannot be
 * expressed as AreaRequirement and must not be forced into one.
 */
export const ReferenceCurriculumRequirement = z.object({
  referenceProgram: z.string().min(1), // "B.Sc. Computer Science, TU Darmstadt"
  minEcts: z.number().nonnegative(),
  /** Verbatim equivalence wording — "must not differ significantly" is doing real work. */
  equivalenceWording: z.string().min(1),
  referenceCurriculumUrl: z.string().url().optional(),
  /** Where the university publishes a self-assessment mapping tool. */
  selfAssessmentUrl: z.string().url().optional(),
});

/* ------------------------------------------------------------------ applicant-group gating */

/**
 * Several gates apply to some applicants and not others, so a requirement is a pair of
 * (rule, who it applies to). Encoding only the rule produces a confidently wrong answer for
 * exactly the applicants who need the tool.
 *
 * Real cases in the seed set:
 *  - TUM: GRE required for applicants from Bangladesh, China, India, Iran, Pakistan
 *  - Konstanz: pass mark 60 for Lisbon Convention countries, 80 for non-signatories
 *  - Freiburg: non-EU application window is six weeks shorter than the EU one
 *  - RWTH: EU/EEA citizens and Bildungsinländer exempt from a test requirement
 */
export const ApplicantGroup = z.object({
  /** Verbatim group wording from the source. Authoritative over the codes below. */
  description: z.string().min(1),
  nationalities: z.array(z.string()).default([]),
  euEea: z.enum(["only", "excluded", "any"]).default("any"),
  lisbonConvention: z.enum(["signatory", "non_signatory", "any"]).default("any"),
});

const groupScoped = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ appliesTo: ApplicantGroup.optional(), value });

/* ------------------------------------------------------------------ other gates */

export const AssessmentStyle = z.enum(["points", "binary", "unstated"]);

/** Points-based procedures publish a rubric. Konstanz: grade 0–20, subject relevance 0–40,
 *  motivation 0–10, bonus 0–15, GRE/GMAT 0–20 (non-Lisbon applicants only). */
export const PointsRubric = z.object({
  criteria: z.array(
    z.object({ name: z.string(), max: z.number(), appliesTo: ApplicantGroup.optional() })
  ),
  /** Pass marks can differ by applicant group — hence a list, not a number. */
  passMarks: z.array(groupScoped(z.number())),
});

/** Conditional admission with make-up coursework. Stated in the statute, therefore extractable. */
export const Auflagen = z.object({
  offered: z.enum(["yes", "no", "unstated"]),
  /** Ceiling above which admission is refused, where stated. */
  maxEcts: z.number().nonnegative().optional(),
  deadline: z.string().optional(),
});

export const LanguageRequirement = z.object({
  language: z.enum(["english", "german"]),
  cefr: z.string().optional(), // "B2", "C1"
  test: z
    .object({ name: z.string(), overall: z.number().optional(), minBand: z.number().optional() })
    .optional(),
  waiverIfMediumOfInstruction: z.enum(["yes", "no", "unstated"]),
  /** Whether this is required to ENROL/for a visa rather than to be admitted. */
  requiredFor: z.enum(["admission", "enrolment", "unstated"]).default("admission"),
});

export const TestRequirement = z.object({
  name: z.string(), // "GRE General Test"
  required: z.enum(["yes", "no", "unstated"]),
  /** Verbatim — percentiles and scores vary too much to normalise safely. */
  thresholds: z.string().optional(),
  appliesTo: ApplicantGroup.optional(),
  exemptions: z.string().optional(),
});

/** LMU and Hamburg admit before graduation: ~150 ECTS plus a registered bachelor's thesis. */
export const DegreeInProgress = z.object({
  allowed: z.enum(["yes", "no", "unstated"]),
  minEctsSoFar: z.number().nonnegative().optional(),
  thesisMustBeRegistered: z.boolean().optional(),
  /** When the final certificate has to arrive. */
  certificateDeadline: z.string().optional(),
});

export const Deadline = z.object({
  intake: z.enum(["winter", "summer"]),
  opens: z.string().optional(),
  /** ISO date where resolvable, else the source's own wording ("31 May"). */
  closes: z.string(),
  appliesTo: ApplicantGroup.optional(),
});

/* ------------------------------------------------------------------ the program record */

export const ProgramRequirements = z.object({
  programId: z.string().min(1),
  university: z.string().min(1),
  programName: z.string().min(1),
  /** Not CS-only: the corridor is German MSc, and the field is data. */
  field: z.string().min(1), // "Computer Science", "Computational Science", "Physics"
  degree: z.literal("MSc"),

  taughtIn: cited(z.enum(["english", "german", "mixed"])),
  admissionRestricted: cited(z.enum(["nc", "nc_free", "unstated"])),

  /** Grade cutoff ONLY where one exists. Absent for most NC-free programs, and absence must never
   *  render as "no requirements". */
  minGermanGrade: cited(z.number().min(1).max(4)).optional(),
  /** A grade that triggers extra assessment rather than rejection (Würzburg: worse than 2.5 can
   *  trigger a ~30-minute oral exam). Different thing entirely from a cutoff. */
  gradeTriggeredAssessment: cited(z.object({ worseThan: z.number(), consequence: z.string() })).optional(),

  /** Ways to qualify. More than one is normal. */
  requirementSets: cited(z.array(RequirementSet)),
  referenceCurriculum: cited(ReferenceCurriculumRequirement).optional(),

  assessmentStyle: cited(AssessmentStyle),
  pointsRubric: cited(PointsRubric).optional(),

  auflagen: cited(Auflagen),
  degreeInProgress: cited(DegreeInProgress),

  language: cited(z.array(LanguageRequirement)),
  tests: cited(z.array(TestRequirement)),
  interview: cited(z.enum(["yes", "no", "unstated"])),

  applicationRoute: cited(z.enum(["direct", "uni_assist", "both", "unstated"])),
  deadlines: cited(z.array(Deadline)),

  /** Genuinely qualitative requirements ("sufficient merit", "appropriate curricular content",
   *  "strong background in mathematics"). Surfaced with their snippet for a human to judge, never
   *  normalised into a number — inventing one is the failure this project exists to prevent. */
  qualitative: z.array(cited(z.string())),

  extractedAt: z.string().datetime(),
});
export type ProgramRequirements = z.infer<typeof ProgramRequirements>;

/* ------------------------------------------------------------------ verify */

/**
 * Deterministic anti-hallucination check: a numeric value must literally appear in the snippet
 * cited for it. Cheap, and it kills the failure mode that matters most.
 * Handles the German decimal comma ("2,5") alongside the English point.
 */
export function snippetSupportsNumber(snippet: string, value: number): boolean {
  return snippet.replace(/,/g, ".").includes(String(value));
}

/** Source-tier check: a field may not come from a weaker document than one already available. */
export function violatesSourceHierarchy(used: SourceType, bestAvailable: SourceType): boolean {
  return SOURCE_RANK[used] < SOURCE_RANK[bestAvailable];
}
