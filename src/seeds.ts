/**
 * Seed list — 15 German MSc Computer Science programs.
 *
 * Hand-curated on purpose. Auto-discovering programs is a v2 problem and an excellent way to spend
 * three weeks generating noise.
 *
 * Each seed needs TWO URLs: the admission page (a summary) and the binding statute
 * (Zulassungssatzung / Prüfungsordnung / Eignungsfeststellungsordnung — usually a German PDF).
 * The statute is the authoritative source; extracting from the summary when a statute exists is a
 * defect, not a shortcut.
 *
 * `checked` is deliberately explicit:
 *   "opened"     — I opened the URL myself and confirmed it is the right document.
 *   "found"      — surfaced by search and plausible, but NOT yet opened. Not usable for extraction.
 *   "todo"       — not located yet.
 *
 * Nothing is extracted from a seed below "opened". The whole product is a claim about provenance;
 * the seed list is where that claim starts.
 */

export type CheckState = "opened" | "found" | "todo";

export type Seed = {
  programId: string;
  university: string;
  city: string;
  programName: string;
  /** Language of instruction as commonly reported — to be CONFIRMED by extraction, not trusted. */
  taughtInHint: "english" | "german" | "mixed" | "unknown";
  admissionUrl?: string;
  admissionChecked: CheckState;
  /** Zulassungssatzung / Prüfungsordnung / Eignungsfeststellungsordnung. */
  statuteUrl?: string;
  statuteChecked: CheckState;
  /** Anything already known that extraction must reproduce — a free correctness check on day 2. */
  notes?: string;
};

export const SEEDS: Seed[] = [
  {
    programId: "tum-informatics-msc",
    university: "Technische Universität München",
    city: "Munich",
    programName: "Master Informatics",
    taughtInHint: "english",
    admissionUrl: "https://www.cit.tum.de/en/cit/studies/degree-programs/master-informatics/",
    admissionChecked: "found",
    statuteUrl:
      "https://www.cit.tum.de/fileadmin/w00byx/cit/Studium/Studiengaenge/Master_Informatik/Lesb.F._FPSO_MA_Informatik_mit_5._AES_vom_19.08.2024.pdf",
    statuteChecked: "found",
    notes:
      "Points-based Eignungsverfahren; 70+ points passes. Application deadlines reported as 31 May (winter) / 30 Nov (summer). Eignungsverfahren annex: https://www.tum.de/fileadmin/user_upload_87/gi32rab/FPSO/Informatik_MA_EV_2._AS_270122.pdf",
  },
  {
    programId: "rwth-cs-msc",
    university: "RWTH Aachen University",
    city: "Aachen",
    programName: "Computer Science M.Sc.",
    taughtInHint: "mixed",
    admissionUrl:
      "https://www.informatik.rwth-aachen.de/cms/informatik/studium/vor-dem-studium/bewerbungsinfos/~npqg/master-informatik/?lidx=1",
    admissionChecked: "found",
    statuteUrl: "https://sc.informatik.rwth-aachen.de/en/pos-und-modulhandbuecher/",
    statuteChecked: "found",
    notes:
      "Auflagen ceiling: >42 CP of additional requirements => admission not possible. GRE General Test gate (Quant >75th pct, Verbal >15th pct, AW >=3.5), EU/EEA + Bildungsinländer exempt. Four named areas: applied CS, technical CS, theoretical CS, mathematics. Statute page is an index, not the PDF — resolve to the MPO document.",
  },
  {
    programId: "tu-dresden-cs-msc",
    university: "Technische Universität Dresden",
    city: "Dresden",
    programName: "Computer Science M.Sc.",
    taughtInHint: "english",
    admissionUrl:
      "https://tu-dresden.de/ing/informatik/studium/studienangebot/master-studiengaenge/m-sc-computer-science/admission",
    admissionChecked: "found",
    statuteUrl:
      "https://www.verw.tu-dresden.de/amtbek/PDF-Dateien/2025-02/02_eignungsfesto_MACSc13022025.pdf",
    statuteChecked: "found",
    notes:
      "Eignungsfeststellungsordnung as a dated PDF (2025-02) — the cleanest statute-tier source in the seed set. English C1 reported.",
  },
  {
    programId: "kit-informatics-msc",
    university: "Karlsruher Institut für Technologie",
    city: "Karlsruhe",
    programName: "Informatik M.Sc.",
    taughtInHint: "german",
    admissionUrl: "https://www.informatik.kit.edu/english/14344.php",
    admissionChecked: "found",
    statuteUrl: "https://www.informatik.kit.edu/downloads/studium/Auswahlsatzung_Informatik_Master.pdf",
    statuteChecked: "found",
    notes:
      "German C1 required — German-taught, so a hard filter for most international applicants. 180 ECTS / >=3-year bachelor's. Alternative path via aptitude interview if requirements are not met. KIT also runs a separate English-taught 'Computer Science M.Sc.' (https://www.sle.kit.edu/english/vorstudium/master-computer-science.php) — treat as a distinct seed once confirmed.",
  },
  {
    programId: "tu-berlin-cs-msc",
    university: "Technische Universität Berlin",
    city: "Berlin",
    programName: "M.Sc. Computer Science (Informatik)",
    taughtInHint: "unknown",
    admissionUrl:
      "https://www.tu.berlin/en/eecs/academics-teaching/study-offer/masters-programs/msc-computer-science-informatik/msc-cs-in-application-admission",
    admissionChecked: "found",
    statuteChecked: "todo",
  },
  {
    programId: "uni-konstanz-cis-msc",
    university: "Universität Konstanz",
    city: "Konstanz",
    programName: "M.Sc. Computer and Information Science",
    taughtInHint: "english",
    admissionUrl:
      "https://www.informatik.uni-konstanz.de/studium/master-of-science/msc-computer-and-information-science/study/master-of-science/master-computer-and-information-science/admission-procedure/",
    admissionChecked: "found",
    statuteChecked: "todo",
  },
  {
    programId: "uni-wuerzburg-cs-msc",
    university: "Julius-Maximilians-Universität Würzburg",
    city: "Würzburg",
    programName: "Master Computer Science",
    taughtInHint: "unknown",
    admissionUrl:
      "https://www.informatik.uni-wuerzburg.de/en/studies/degree-programmes/master-computer-science/application/",
    admissionChecked: "found",
    statuteChecked: "todo",
  },

  /* --------------------------------------------------------------------------------
   * Located but not yet sourced. Candidates chosen for a spread of admission MECHANISMS
   * (points vs binary, NC vs NC-free, English vs German, uni-assist vs direct) rather than
   * for ranking — the extractor has to survive the variety, not the prestige.
   * ------------------------------------------------------------------------------ */
  {
    programId: "tu-darmstadt-cs-msc",
    university: "Technische Universität Darmstadt",
    city: "Darmstadt",
    programName: "M.Sc. Computer Science",
    taughtInHint: "unknown",
    admissionChecked: "todo",
    statuteChecked: "todo",
  },
  {
    programId: "uni-stuttgart-cs-msc",
    university: "Universität Stuttgart",
    city: "Stuttgart",
    programName: "M.Sc. Computer Science",
    taughtInHint: "unknown",
    admissionChecked: "todo",
    statuteChecked: "todo",
  },
  {
    programId: "uni-saarland-cs-msc",
    university: "Universität des Saarlandes",
    city: "Saarbrücken",
    programName: "M.Sc. Computer Science",
    taughtInHint: "unknown",
    admissionChecked: "todo",
    statuteChecked: "todo",
  },
  {
    programId: "uni-freiburg-cs-msc",
    university: "Albert-Ludwigs-Universität Freiburg",
    city: "Freiburg",
    programName: "M.Sc. Computer Science",
    taughtInHint: "unknown",
    admissionChecked: "todo",
    statuteChecked: "todo",
  },
  {
    programId: "lmu-cs-msc",
    university: "Ludwig-Maximilians-Universität München",
    city: "Munich",
    programName: "M.Sc. Informatik",
    taughtInHint: "unknown",
    admissionChecked: "todo",
    statuteChecked: "todo",
  },
  {
    programId: "uni-passau-cs-msc",
    university: "Universität Passau",
    city: "Passau",
    programName: "M.Sc. Computer Science",
    taughtInHint: "unknown",
    admissionChecked: "todo",
    statuteChecked: "todo",
  },
  {
    programId: "uni-bonn-cs-msc",
    university: "Rheinische Friedrich-Wilhelms-Universität Bonn",
    city: "Bonn",
    programName: "M.Sc. Computer Science",
    taughtInHint: "unknown",
    admissionChecked: "todo",
    statuteChecked: "todo",
  },
  {
    programId: "uni-hamburg-cs-msc",
    university: "Universität Hamburg",
    city: "Hamburg",
    programName: "M.Sc. Informatik",
    taughtInHint: "unknown",
    admissionChecked: "todo",
    statuteChecked: "todo",
  },
];

export const seedStats = () => ({
  total: SEEDS.length,
  admissionOpened: SEEDS.filter((s) => s.admissionChecked === "opened").length,
  admissionFound: SEEDS.filter((s) => s.admissionChecked === "found").length,
  statuteFound: SEEDS.filter((s) => s.statuteChecked === "found").length,
  extractable: SEEDS.filter((s) => s.admissionChecked === "opened" && s.statuteChecked === "opened")
    .length,
});
