/**
 * Extraction schema — the contract between the LLM and everything downstream.
 *
 * The rule this whole project rests on: the model ONLY fills this struct. It is never asked
 * whether an applicant is eligible. Matching is deterministic code over these values.
 *
 * Every value therefore arrives wrapped in `Cited<T>`: the number is useless without the sentence
 * it came from, the document it came from, and the day it was read.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ provenance */

/**
 * Which document a value came from. Enforced as a hierarchy, not a preference:
 * the Zulassungssatzung / Prüfungsordnung is the binding text; the program page is a summary of
 * it; the FAQ is neither. Extracting from a summary when a statute exists is a defect.
 */
export const SourceType = z.enum([
  "satzung", // Zulassungssatzung, Prüfungsordnung, Eignungsfeststellungsordnung — binding
  "program_page", // official program/admission page — a summary
  "faq", // faculty FAQ — weakest, never the sole source for a hard gate
]);
export type SourceType = z.infer<typeof SourceType>;

export const SOURCE_RANK: Record<SourceType, number> = { satzung: 3, program_page: 2, faq: 1 };

export const Provenance = z.object({
  sourceType: SourceType,
  sourceUrl: z.string().url(),
  /** Verbatim text containing the value. The verify step asserts the value appears in here. */
  snippet: z.string().min(1),
  /** Statute section where the model could identify one, e.g. "§ 4 Abs. 3". */
  section: z.string().optional(),
  /** Source language — statutes are frequently German; this is expected, not an anomaly. */
  lang: z.enum(["de", "en"]),
  fetchedAt: z.string().datetime(),
});
export type Provenance = z.infer<typeof Provenance>;

/** A value that cannot exist without its citation. */
const cited = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value,
    provenance: Provenance,
    /** Model self-report. Used for triage/review ordering only — NEVER as a gate. */
    confidence: z.number().min(0).max(1),
  });

/* ------------------------------------------------------------------ requirements */

/**
 * Subject areas for curricular analysis. Programs describe these inconsistently
 * ("mathematics and theoretical computer science" / "formal foundations" / "mathematical
 * fundamentals"), so `label` keeps the program's own wording and `area` is the coarse bucket used
 * for matching. Never discard the original wording — it is what a committee actually reads.
 */
export const SubjectArea = z.enum([
  "cs_fundamentals",
  "math_theory",
  "practical_cs", // software engineering, databases, systems
  "technical_cs", // hardware, operating systems, networks
  "thesis",
  "total", // an aggregate requirement over the whole degree
  "other",
]);
export type SubjectArea = z.infer<typeof SubjectArea>;

export const AreaRequirement = z.object({
  area: SubjectArea,
  /** The program's own phrasing, preserved verbatim. */
  label: z.string().min(1),
  minEcts: z.number().nonnegative(),
});
export type AreaRequirement = z.infer<typeof AreaRequirement>;

/**
 * How a shortfall is treated.
 *  - `points`  — scored; a weakness in one area can be offset elsewhere (TUM: 70+ points passes)
 *  - `binary`  — hard gates; no offsetting
 *  - `unstated` — the source doesn't say. NOT a synonym for either. Renders as unknown.
 */
export const AssessmentStyle = z.enum(["points", "binary", "unstated"]);

/**
 * Conditional admission with make-up coursework. Real, per-program, and stated in the statute —
 * some universities offer it, others reject outright. RWTH caps it: more than 42 CP of additional
 * requirements means admission is not possible.
 */
export const Auflagen = z.object({
  offered: z.enum(["yes", "no", "unstated"]),
  /** Ceiling on make-up credits above which admission is refused, where one is stated. */
  maxEcts: z.number().nonnegative().optional(),
  /** Deadline to clear them, e.g. "first two semesters". */
  deadline: z.string().optional(),
});

export const LanguageRequirement = z.object({
  language: z.enum(["english", "german"]),
  /** CEFR where stated (C1, B2…). KIT's MSc Informatik requires German C1; many others English C1. */
  cefr: z.string().optional(),
  /** Test thresholds, e.g. { test: "IELTS", overall: 6.5, minBand: 5.5 }. */
  test: z
    .object({
      name: z.string(),
      overall: z.number().optional(),
      minBand: z.number().optional(),
    })
    .optional(),
  /** Whether an English-medium bachelor's waives the test, where the source says. */
  waiverIfEnglishMedium: z.enum(["yes", "no", "unstated"]),
});

/** A standardised test gate, e.g. RWTH's GRE percentile requirement with an EU exemption. */
export const TestRequirement = z.object({
  name: z.string(), // "GRE General Test"
  required: z.enum(["yes", "no", "unstated"]),
  /** Verbatim thresholds — percentiles and scores vary too much to normalise safely. */
  thresholds: z.string().optional(),
  /** Who is exempt, verbatim, e.g. "EU/EEA citizens and Bildungsinländer". */
  exemptions: z.string().optional(),
});

/* ------------------------------------------------------------------ the program record */

export const ProgramRequirements = z.object({
  programId: z.string().min(1),
  university: z.string().min(1),
  programName: z.string().min(1),
  degree: z.literal("MSc"),
  /** Language of instruction — decides whether German C1 is a gate or a nice-to-have. */
  taughtIn: cited(z.enum(["english", "german", "mixed"])),

  /** Restricted (NC) or admission-free. ~80% of German computing programs are NC-free, where
   *  admission turns on meeting subject requirements rather than a grade rank. */
  admissionRestricted: cited(z.enum(["nc", "nc_free", "unstated"])),

  /** Grade cutoff, ONLY where one genuinely exists. Absent for most NC-free programs — and absence
   *  must never render as "no requirements". */
  minGermanGrade: cited(z.number().min(1).max(4)).optional(),

  /** The curricular analysis. This, not the grade, is usually the real gate. */
  areaRequirements: cited(z.array(AreaRequirement)),

  assessmentStyle: cited(AssessmentStyle),
  /** Pass mark where the procedure is points-based (TUM: 70). */
  pointsPassMark: cited(z.number()).optional(),

  auflagen: cited(Auflagen),

  language: cited(z.array(LanguageRequirement)),
  tests: cited(z.array(TestRequirement)),

  /** Whether an interview / aptitude conversation forms part of the procedure. */
  interview: cited(z.enum(["yes", "no", "unstated"])),

  /** Direct to the university, or via uni-assist (€75 first application, €30 each additional). */
  applicationRoute: cited(z.enum(["direct", "uni_assist", "both", "unstated"])),

  /** Program deadlines as stated. The EFFECTIVE deadline is computed later by subtracting
   *  uni-assist processing, APS lead time, and a dMAT test date where applicable. */
  deadlines: cited(
    z.array(
      z.object({
        intake: z.enum(["winter", "summer"]),
        /** ISO date where resolvable, otherwise the source's own wording ("May 31"). */
        date: z.string(),
        appliesTo: z.string().optional(), // e.g. "international applicants"
      })
    )
  ),

  /** Requirements that are genuinely qualitative ("strong background in mathematics"). Surfaced
   *  with their snippet for a human to judge. Never normalised into a number — inventing one is
   *  precisely the failure this project exists to prevent. */
  qualitative: z.array(cited(z.string())),

  extractedAt: z.string().datetime(),
});
export type ProgramRequirements = z.infer<typeof ProgramRequirements>;

/* ------------------------------------------------------------------ verify */

/**
 * Deterministic anti-hallucination check: a numeric value must literally appear in the snippet
 * that was cited for it. Cheap, and it kills the failure mode that matters most.
 *
 * Handles the German decimal comma ("2,5") alongside the English point.
 */
export function snippetSupportsNumber(snippet: string, value: number): boolean {
  const haystack = snippet.replace(/,/g, ".");
  const needle = String(value);
  return haystack.includes(needle);
}
