/**
 * Applicant profile — course-level, because German MSc admission is decided on transcript
 * composition rather than on a grade.
 *
 * v1 modelled the profile as per-area ECTS totals. That was wrong for the same reason the CS-only
 * area enum was wrong: the interesting question is not "how many maths credits do you have" but
 * "which of YOUR courses would this committee count toward ITS definition of maths". Totals throw
 * away the mapping, and the mapping is the entire explanation.
 *
 * NOTHING personal lives in this file. Profiles load from `profile.local.json`, which is
 * gitignored. Transcripts carry grades, failures and identifying detail and never belong in a
 * public repository.
 */

import { z } from "zod";
import { CanonicalArea } from "./schema.js";

/* ------------------------------------------------------------------ credit systems */

/**
 * Foreign transcripts are not denominated in ECTS. A 4-year Indian B.Tech reports "credits" on a
 * local scale, and the conversion to ECTS is an assumption, not arithmetic.
 *
 * So it is modelled explicitly, carries its basis, and is flagged in output. Silently multiplying
 * by a guessed factor and then comparing against a statutory 100-ECTS threshold would be the
 * highest-consequence hallucination in the product — the number would look precise and be invented.
 */
export const CreditSystem = z.object({
  name: z.string(), // "DTU credits", "ECTS"
  /** Multiplier to ECTS. `null` = unknown, and unknown must render as unknown. */
  ectsPerUnit: z.number().positive().nullable(),
  basis: z.enum([
    "official_ects", // already ECTS
    "university_statement", // the university publishes a conversion
    "workload_derived", // derived from documented contact hours / workload
    "assumed", // a working guess — ALWAYS surfaced to the user
    "unknown",
  ]),
  note: z.string().optional(),
});

/**
 * Grade scales, for the Modified Bavarian Formula:
 *   Z = ((Nmax - Nd) / (Nmax - Nmin)) * 3 + 1
 * `nmax`/`nmin` must come from anabin for the country's system, NOT from the transcript — this is
 * where hand-rolled CGPA calculators go wrong.
 */
export const GradeScale = z.object({
  name: z.string(), // "India 10-point CGPA"
  nmax: z.number(), // best achievable
  nmin: z.number(), // minimum pass
  source: z.enum(["anabin", "university", "assumed"]),
});

export function toGermanGrade(achieved: number, scale: { nmax: number; nmin: number }): number {
  const z = ((scale.nmax - achieved) / (scale.nmax - scale.nmin)) * 3 + 1;
  return Math.round(z * 100) / 100;
}

/* ------------------------------------------------------------------ courses */

/**
 * How a course was assigned to an area. Committees exercise judgement here, so the app records who
 * decided and never pretends a classification is a fact.
 */
export const ClassificationBasis = z.enum([
  "user", // the applicant said so
  "rule", // deterministic keyword/code rule
  "llm", // model-proposed, needs confirmation
  "program_example", // the program's own example course list named it
]);

export const CourseClassification = z.object({
  canonical: CanonicalArea,
  basis: ClassificationBasis,
  confidence: z.number().min(0).max(1),
  /** Plausible alternatives. This is what powers "if they counted X as theory instead…". */
  alternatives: z.array(CanonicalArea).default([]),
});

export const Course = z.object({
  code: z.string(),
  title: z.string(),
  semester: z.number().int().positive(),
  /** Credits in the HOME system. Conversion happens once, explicitly, at match time. */
  credits: z.number().nonnegative(),
  grade: z.string(), // "B+", "P", "F" — kept verbatim
  passed: z.boolean(),
  classification: CourseClassification.optional(),
});
export type Course = z.infer<typeof Course>;

export const Profile = z.object({
  degreeTitle: z.string(), // "B.Tech Engineering Physics"
  institution: z.string(),
  country: z.string(),
  creditSystem: CreditSystem,
  gradeScale: GradeScale,
  /** Aggregate on the home scale. Converted via toGermanGrade(), never eyeballed. */
  cgpa: z.number().optional(),
  status: z.enum(["completed", "in_progress"]),
  /** For programs that admit before graduation (LMU, Hamburg). */
  thesisRegistered: z.boolean().optional(),
  nationality: z.string(),
  courses: z.array(Course),
  tests: z
    .array(z.object({ name: z.string(), score: z.string(), takenOn: z.string().optional() }))
    .default([]),
});
export type Profile = z.infer<typeof Profile>;

/* ------------------------------------------------------------------ derived totals */

export type AreaTotal = {
  canonical: CanonicalArea;
  homeCredits: number;
  ects: number | null; // null when the conversion factor is unknown
  courseCount: number;
  /** Courses that could plausibly move into another area — the reclassification headroom. */
  reclassifiable: { code: string; title: string; credits: number; couldBe: CanonicalArea[] }[];
};

/**
 * Totals per area, with reclassification headroom preserved.
 *
 * Failed courses are excluded from totals: a failed course carries no credit. It stays in the
 * profile because some programs ask about attempts, and dropping it would misrepresent the
 * transcript.
 */
export function areaTotals(profile: Profile): AreaTotal[] {
  const factor = profile.creditSystem.ectsPerUnit;
  const byArea = new Map<CanonicalArea, AreaTotal>();

  for (const course of profile.courses) {
    if (!course.passed || !course.classification) continue;
    const area = course.classification.canonical;
    const entry = byArea.get(area) ?? {
      canonical: area,
      homeCredits: 0,
      ects: factor === null ? null : 0,
      courseCount: 0,
      reclassifiable: [],
    };
    entry.homeCredits += course.credits;
    if (factor !== null && entry.ects !== null) entry.ects += course.credits * factor;
    entry.courseCount += 1;
    if (course.classification.alternatives.length > 0) {
      entry.reclassifiable.push({
        code: course.code,
        title: course.title,
        credits: course.credits,
        couldBe: course.classification.alternatives,
      });
    }
    byArea.set(area, entry);
  }

  return [...byArea.values()].sort((a, b) => b.homeCredits - a.homeCredits);
}
