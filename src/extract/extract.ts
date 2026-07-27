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
import { generateStructured, pdfPart, textPart, type Part } from "./gemini.js";
import type { FetchedDoc } from "./fetch.js";

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

Return ONLY JSON matching the requested shape.`;

export type ExtractionInput = {
  programId: string;
  university: string;
  programName: string;
  field: string;
  docs: { doc: FetchedDoc; sourceType: SourceType }[];
};

export type VerifyIssue = {
  path: string;
  kind: "snippet_missing_value" | "source_tier_violation" | "empty_snippet";
  detail: string;
};

export type ExtractionResult =
  | { ok: true; data: z.infer<typeof ProgramRequirements>; issues: VerifyIssue[]; costHint: number }
  | { ok: false; error: string };

export async function extractProgram(input: ExtractionInput): Promise<ExtractionResult> {
  const usable = input.docs.filter((d) => d.doc.kind !== "failed");
  if (usable.length === 0) return { ok: false, error: "no usable documents fetched" };

  const parts: Part[] = [
    textPart(
      `Program: ${input.programName}\nUniversity: ${input.university}\nField: ${input.field}\n` +
        `programId: ${input.programId}\n\n` +
        `Documents follow, each labelled with its sourceType and URL. Use the STRONGEST source ` +
        `available for each field and set sourceType to the document you actually read it in.`
    ),
  ];

  for (const { doc, sourceType } of usable) {
    if (doc.kind === "text") {
      parts.push(
        textPart(
          `\n--- DOCUMENT (sourceType=${sourceType}, url=${doc.url}, fetchedAt=${doc.fetchedAt}) ---\n` +
            doc.text.slice(0, 200_000)
        )
      );
    } else if (doc.kind === "pdf") {
      parts.push(
        textPart(
          `\n--- DOCUMENT (sourceType=${sourceType}, url=${doc.url}, fetchedAt=${doc.fetchedAt}) — PDF follows ---`
        )
      );
      parts.push(pdfPart(doc.bytes));
    }
  }

  const result = await generateStructured(parts, SYSTEM_PROMPT, ProgramRequirements);
  if (!result.ok) return { ok: false, error: result.error };

  const bestAvailable = usable
    .map((d) => d.sourceType)
    .reduce<SourceType>((best, t) => (SOURCE_RANK[t] > SOURCE_RANK[best] ? t : best), "faq");

  return {
    ok: true,
    data: result.value,
    issues: verify(result.value, bestAvailable),
    // Flash pricing is a rounding error at this volume; this is a relative signal, not a bill.
    costHint: result.usage.totalTokens,
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
      issues.push({ path, kind: "empty_snippet", detail: "no snippet supplied" });
      return;
    }
    if (SOURCE_RANK[prov.sourceType] < SOURCE_RANK[bestAvailable]) {
      issues.push({
        path,
        kind: "source_tier_violation",
        detail: `read from ${prov.sourceType} while ${bestAvailable} was available`,
      });
    }
    for (const n of numbers) {
      if (!snippetSupportsNumber(prov.snippet, n)) {
        issues.push({
          path,
          kind: "snippet_missing_value",
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

  checkCited(
    "requirementSets",
    data.requirementSets,
    data.requirementSets.value.flatMap((set) => set.requirements.map((r) => r.minEcts))
  );

  if (data.referenceCurriculum) {
    checkCited("referenceCurriculum", data.referenceCurriculum, [data.referenceCurriculum.value.minEcts]);
  }
  checkCited("auflagen", data.auflagen, data.auflagen.value.maxEcts ? [data.auflagen.value.maxEcts] : []);
  checkCited("assessmentStyle", data.assessmentStyle, []);
  checkCited("deadlines", data.deadlines, []);
  checkCited("tests", data.tests, []);
  checkCited("language", data.language, []);

  return issues;
}
