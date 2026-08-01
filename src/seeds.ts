/**
 * Seed list — German MSc Computer Science programs.
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
 *   "opened"  — the URL was opened and confirmed to be the right document.
 *   "found"   — surfaced by search and plausible, but NOT opened. Not usable for extraction.
 *   "todo"    — not located yet.
 *
 * Nothing is extracted from a seed below "opened". The whole product is a claim about provenance;
 * the seed list is where that claim starts.
 *
 * `notes` record what was read on the page. On day 2 they double as a free correctness check:
 * the extractor has to reproduce them without being shown them.
 */

export type CheckState = "opened" | "found" | "todo";

export type Seed = {
  programId: string;
  university: string;
  city: string;
  programName: string;
  /** Language of instruction — CONFIRMED where the page states it, else "unknown". */
  taughtInHint: "english" | "german" | "mixed" | "unknown";
  admissionUrl?: string;
  admissionChecked: CheckState;
  /** Zulassungssatzung / Prüfungsordnung / Eignungsfeststellungsordnung / Fachspezifische Bestimmungen. */
  statuteUrl?: string;
  statuteChecked: CheckState;
  notes?: string;
};

/**
 * HARDWARE / SEMICONDUCTOR CORRIDOR — the real target list.
 *
 * Selected on two axes, because admission difficulty and ecosystem quality are inversely
 * correlated and a portfolio needs one of each:
 *   1. does the programme accept a physics-family degree (stated, not hoped)
 *   2. is it inside a semiconductor cluster, for Werkstudent and thesis placement
 *
 * The MSc CS seeds below this block are the WRONG corridor and stay only as extractor fixtures —
 * their statutes are cached, so they are free regression tests.
 */
export const HARDWARE_SEEDS: Seed[] = [
  {
    programId: "btu-micro-nano-msc",
    university: "BTU Cottbus-Senftenberg",
    city: "Cottbus",
    programName: "Micro- and Nanoelectronics M.Sc.",
    taughtInHint: "english",
    admissionUrl: "https://www.b-tu.de/en/micro-nano-electronics-ms",
    admissionChecked: "opened",
    statuteChecked: "todo",
    notes:
      "Listed as 'without admission limits' (NC-frei) on the programme page — MUST be confirmed in the statute. Equivalence defined by CONTENT: a degree counts if Mathematics, Theoretical Physics and Experimental Physics are comparable in scope. Described as aimed at physicists and electrical engineers for the semiconductor industry. Foreign qualifications route via uni-assist; WS 2026/27 window was 20 Apr – 15 Jul. Ecosystem: iCampus Cottbus — BTU + IHP Leibniz + Ferdinand-Braun-Institut + Fraunhofer IZM + IPMS, EUR 20M BMBF to 2026; IHP building a EUR 39.4M facility for ~100 researchers. Weak for corporate Werkstudent (no fab, Dresden 89 km / ~2h by train, direct regional every 4h; Berlin ~1h15), strong for thesis-to-PhD.",
  },
  {
    programId: "tud-nanoelectronic-systems-msc",
    university: "Technische Universität Dresden",
    city: "Dresden",
    programName: "Nanoelectronic Systems M.Sc.",
    taughtInHint: "english",
    admissionUrl:
      "https://tu-dresden.de/ing/elektrotechnik/studium/im_studium/studiengaenge/masters-programme-nanoelectronic-systems/prospective-students/admission-requirements",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "EE faculty. Six named prerequisite subjects including Advanced Mathematics plus electronics/physics foundations — the prerequisite list is the risk, since an EE faculty enumerates EE subjects and the applicant lacks Signals & Systems. Best ecosystem in Europe: Silicon Saxony, 600+ companies, ~1/3 of Europe's chips, GlobalFoundries, four Infineon fabs (Smart Power Fab opened July 2026), Bosch, TSMC JV, Fraunhofer IPMS/CNT, NaMLab. Apply via uni-assist.",
  },
  {
    programId: "tud-organic-molecular-electronics-msc",
    university: "Technische Universität Dresden",
    city: "Dresden",
    programName: "Organic and Molecular Electronics M.Sc.",
    taughtInHint: "english",
    admissionUrl: "https://tu-dresden.de/mn/physik/studium/master-ome/application",
    admissionChecked: "found",
    statuteUrl:
      "https://tu-dresden.de/studium/vor-dem-studium/studienangebot/sins/sins_eignungsfeststellung_detail?autoid=4856",
    statuteChecked: "found",
    notes:
      "PHYSICS FACULTY — accepts physics, chemistry, nanotechnology, materials science or related. Aptitude assessment covers classical mechanics, electrodynamics, optics, thermodynamics, quantum theory and composition of matter: the applicant's transcript covers all six. Requires a 4-YEAR bachelor for non-EU applicants (B.Tech qualifies). English C1 / IELTS 7.0 — a real gate. DEADLINE CONFLICT: non-EU deadline 31 MAY for the October intake, and the applicant graduates end of May 2027 — verify whether pre-graduation application is permitted. Possibly renamed 'Sustainable Electronics and Photonics' (same course id 4856) — confirm.",
  },
  {
    programId: "tu-ilmenau-micro-nano-msc",
    university: "Technische Universität Ilmenau",
    city: "Ilmenau",
    programName: "Micro- and Nanotechnologies M.Sc.",
    taughtInHint: "english",
    admissionUrl: "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/4823/",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "Built on semiconductor technology, microelectronics, microtechnologies and nanotechnologies — explicitly deepens a bachelor's or practical background in those fields. X-FAB on the doorstep. DAAD listing is tier-2; resolve the university's own programme page and statute.",
  },
  {
    programId: "hm-engineering-physics-msc",
    university: "Hochschule München (University of Applied Sciences)",
    city: "Munich",
    programName: "Engineering Physics M.Sc.",
    taughtInHint: "unknown",
    admissionUrl: "https://sci.hm.edu/studierende/studiengaenge/bachelor/technische_physik/index.en.html",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "UNVERIFIED whether the MASTER exists in this shape — only the bachelor page is confirmed. Bachelor runs specialisation tracks in semiconductor/micro- and nanotechnology and in photonics/laser technology, with standing Industrial Advisory Boards for both. Same degree title as the applicant's, so recognition friction is near zero. Munich ecosystem: Infineon HQ, Apple silicon design centre, Intel, Fraunhofer EMFT. FH — PhD via cooperative doctorate.",
  },
  {
    programId: "th-wildau-photonics-meng",
    university: "TH Wildau",
    city: "Wildau (Berlin)",
    programName: "Photonics M.Eng.",
    taughtInHint: "english",
    admissionUrl: "https://en.th-wildau.de/study/programmes/photonics-meng",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "Switching to English from WS 2026/27. ~40 min from Berlin. Maps to the applicant's fibre optics, optical communication and electrodynamics coursework. FH — cooperative doctorate route for a PhD.",
  },
];

export const SEEDS: Seed[] = [
  {
    programId: "tum-informatics-msc",
    university: "Technische Universität München",
    city: "Munich",
    programName: "Master Informatics",
    taughtInHint: "english",
    admissionUrl: "https://www.cit.tum.de/en/cit/studies/degree-programs/master-informatics/",
    admissionChecked: "opened",
    statuteUrl:
      "https://www.cit.tum.de/fileadmin/w00byx/cit/Studium/Studiengaenge/Master_Informatik/Lesb.F._FPSO_MA_Informatik_mit_5._AES_vom_19.08.2024.pdf",
    statuteChecked: "found",
    notes:
      "English-taught. Two-stage Eignungsverfahren: (1) application review — statement of reasons, scientific essay, curriculum analysis; (2) 90-min written test (general foundations, mathematics, computation theory, practical informatics). GRE REQUIRED for applicants from Bangladesh, China, India, Iran, Pakistan — minimum quantitative reasoning 164. Deadlines: winter 1 Feb–31 May, summer 1 Oct–30 Nov (visa applicants advised end of March/October). FPSO is German-only. Points pass mark of 70 came from a search summary, NOT this page — verify in the FPSO/Eignungsverfahren annex before treating as fact.",
  },
  {
    programId: "rwth-cs-msc",
    university: "RWTH Aachen University",
    city: "Aachen",
    programName: "Computer Science M.Sc.",
    taughtInHint: "mixed",
    admissionUrl:
      "https://www.informatik.rwth-aachen.de/cms/informatik/studium/vor-dem-studium/bewerbungsinfos/~npqg/master-informatik/?lidx=1",
    admissionChecked: "opened",
    statuteUrl: "https://sc.informatik.rwth-aachen.de/en/pos-und-modulhandbuecher/",
    statuteChecked: "found",
    notes:
      "Four required areas: applied CS (programming, data structures & algorithms, databases & information systems, software engineering); technical CS (technical CS, OS & systems software, data communication & security, systems programming); theoretical CS (formal systems, automata & processes, computability & complexity, mathematical logic); mathematics (discrete maths, analysis for computer scientists, linear algebra, applied stochastics). Both German AND English proficiency required (§3 of the general examination regulations); an English-written bachelor thesis may serve as English evidence. UNVERIFIED: the 42 CP Auflagen ceiling and the GRE percentile gate appeared in a search summary but are NOT on this page — locate them in the MPO before use. Statute link is an index page, not the PDF.",
  },
  {
    programId: "tu-dresden-cs-msc",
    university: "Technische Universität Dresden",
    city: "Dresden",
    programName: "Computer Science M.Sc.",
    taughtInHint: "english",
    admissionUrl:
      "https://tu-dresden.de/ing/informatik/studium/studienangebot/master-studiengaenge/m-sc-computer-science/admission",
    admissionChecked: "opened",
    statuteUrl:
      "https://www.verw.tu-dresden.de/AmtBek/PDF-Dateien/2025-02/02_eignungsfesto_MACSc13022025.pdf",
    statuteChecked: "found",
    notes:
      "90 ECTS required across three NON-OVERLAPPING areas: Systems & Infrastructure >=35 (OS, networks, distributed systems, architecture, databases, security, graphics, HCI); Foundations & Theory >=35 (mathematics, theoretical CS, AI); Software Development >=20 (programming fundamentals, data structures, software engineering). English C1 — TOEFL iBT 100+, IELTS 7.0+, Cambridge C1, PTE 78+, UNIcert III, or a prior degree taught entirely in English. BINARY assessment: applications are only accepted or rejected, no conditional admission. Deadlines: international winter 1 Apr–31 May, summer 1 Oct–30 Nov; domestic winter 1 Jun–15 Jul, summer 1 Dec–15 Jan. Eignungsfeststellungsordnung dated 13.02.2025.",
  },
  {
    programId: "kit-informatik-msc-de",
    university: "Karlsruher Institut für Technologie",
    city: "Karlsruhe",
    programName: "Informatik M.Sc. (German-taught)",
    taughtInHint: "german",
    admissionUrl: "https://www.sle.kit.edu/english/vorstudium/master-informatics.php",
    admissionChecked: "found",
    statuteUrl:
      "https://www.informatik.kit.edu/downloads/studium/Auswahlsatzung_Informatik_Master.pdf",
    statuteChecked: "found",
    notes:
      "GERMAN-TAUGHT: requires German C1. Bachelor's in informatics or essentially equivalent, >=3 years, >=180 ECTS. Alternative path via aptitude interview if requirements are not met. This is the case aggregators hide — a 'German MSc CS' that most international applicants cannot enter. Distinct from the English-taught Computer Science M.Sc. (INT) below.",
  },
  {
    programId: "kit-cs-msc-int",
    university: "Karlsruher Institut für Technologie",
    city: "Karlsruhe",
    programName: "Computer Science M.Sc. (INT, English-taught)",
    taughtInHint: "english",
    admissionUrl: "https://www.sle.kit.edu/english/vorstudium/master-computer-science.php",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "English B2. Per-area minimums: mathematics >=25 CP, theoretical CS >=15, practical CS >=30, computer engineering >=8. ALTERNATIVE PATHWAY: if those aren't met but at least 3 of {maths 20, theoretical CS 15, practical CS 20, computer engineering 6} are, admission is possible after an aptitude interview. Deadlines reported 15 Jun (winter) / 15 Jan (summer). The alternative pathway is a schema gap — see LOG 2026-07-27 (day 1b).",
  },
  {
    programId: "tu-berlin-cs-msc",
    university: "Technische Universität Berlin",
    city: "Berlin",
    programName: "M.Sc. Computer Science (Informatik)",
    taughtInHint: "english",
    admissionUrl:
      "https://www.tu.berlin/en/eecs/academics-teaching/study-offer/masters-programs/msc-computer-science-informatik/msc-cs-in-application-admission",
    admissionChecked: "opened",
    statuteUrl:
      "https://www.static.tu.berlin/fileadmin/www/10000040/1_Studium_Lehre/1_Studienangebot/2_Masterstudiengaenge/2_M_CS/Zugangsordnung_MSc_CS_AMBl._Nr._26_vom_31.10.2018.pdf",
    statuteChecked: "found",
    notes:
      "English-taught, ADMISSION-FREE (no NC). 36 CP in CS foundations, made up of 12 CP theoretical CS + 12 CP computer engineering/IT + 12 CP methodological & practical CS; plus 18 CP mathematics; plus >=30 CP computer science excluding the thesis. English B2 only — notably lower than Dresden's C1. Foreign degrees route through uni-assist (VPD required from summer semester 2026); German degrees apply directly. English reading version of the statute: https://www.static.tu.berlin/fileadmin/www/10000040/1_Studium_Lehre/1_Studienangebot/2_Masterstudiengaenge/2_M_CS/Reading_Version_ZO_MSc_ComputerScience_Informatik__EN.pdf",
  },
  {
    programId: "uni-konstanz-cis-msc",
    university: "Universität Konstanz",
    city: "Konstanz",
    programName: "M.Sc. Computer and Information Science",
    taughtInHint: "unknown",
    admissionUrl:
      "https://www.informatik.uni-konstanz.de/studium/master-of-science/msc-computer-and-information-science/study/master-of-science/master-computer-and-information-science/admission-procedure/",
    admissionChecked: "opened",
    statuteChecked: "todo",
    notes:
      "POINTS-BASED with a published rubric: grade 0–20, subject relevance 0–40, motivation 0–10, bonus 0–15, GRE/GMAT 0–20 (non-Lisbon-Convention applicants only). Thresholds: 60 points for Lisbon Convention signatory countries, 80 for non-signatories. India is not a Lisbon signatory, so the 80-point bar and the GRE/GMAT component both apply. English 'high B2' — TOEFL 90, IELTS 6.0, Cambridge FCE grade C, or 4+ subject courses taught in English. Per-area ECTS not stated on this page — must come from the statute (German PDF, linked on page as 'M.Sc. CIS admission regulations (GER)'); resolve its URL.",
  },
  {
    programId: "uni-wuerzburg-cs-msc",
    university: "Julius-Maximilians-Universität Würzburg",
    city: "Würzburg",
    programName: "Master Computer Science",
    taughtInHint: "unknown",
    admissionUrl:
      "https://www.informatik.uni-wuerzburg.de/en/studies/degree-programmes/master-computer-science/application/",
    admissionChecked: "opened",
    statuteUrl:
      "https://www.uni-wuerzburg.de/fileadmin/32020000/Ordnungen/Informatik-MA-120-5aes-20210428-kon-Netz.pdf",
    statuteChecked: "found",
    notes:
      "This is the source of the representative example in RESEARCH.md §3.7: >=100 ECTS in fundamental CS and maths, of which >=25 ECTS in mathematical and theoretical CS, plus a completed thesis worth >=10 ECTS. Language: German B2 OR English C1, or a medium-of-instruction certificate. GRADE-TRIGGERED aptitude test: a bachelor's grade worse than 2.5 (German scale) can trigger an ~30-minute oral test covering theoretical, practical and technical CS. Deadlines: summer 31 Aug–31 Oct, winter 31 Jan–15 Mar; late results by 15 Mar / 15 Sep.",
  },

  /* --------------------------------------------------------------------------------
   * Not yet sourced. Chosen for a spread of admission MECHANISMS (points vs binary,
   * NC vs NC-free, English vs German, uni-assist vs direct) rather than for ranking —
   * the extractor has to survive variety, not prestige.
   * ------------------------------------------------------------------------------ */
  {
    programId: "tu-darmstadt-cs-msc",
    university: "Technische Universität Darmstadt",
    city: "Darmstadt",
    programName: "M.Sc. Computer Science",
    taughtInHint: "unknown",
    admissionUrl:
      "https://www.informatik.tu-darmstadt.de/studium_fb20/im_studium/studiengaenge_liste/computer_science_msc.en.jsp",
    admissionChecked: "found",
    statuteUrl:
      "https://www.informatik.tu-darmstadt.de/media/informatik/fb20_studium/formulare_und_dokumente/ordnungen/ordnungen_cs/pruefungsordnungen_cs_2023/ordnung_des_studiengangs_m_sc_computer_science_po_2023_14045087.en.pdf",
    statuteChecked: "found",
    notes:
      "180 ECTS overall, of which >=60 CP must not differ significantly from the entry-level skills of TU Darmstadt's own B.Sc. Computer Science — i.e. the requirement is defined by reference to ANOTHER program's curriculum, not by subject-area totals. Applicants map each transcript course onto TUD's B.Sc. core courses (self-assessment tool provided); below 60 ECTS of equivalent content, additional coursework is needed before applying. This is the most course-level-granular requirement in the seed set and a hard case for the schema. Darmstadt also runs a separate 'Informatik M.Sc.' (https://www.informatik.tu-darmstadt.de/studium_fb20/im_studium/studiengaenge_liste/informatik_msc.en.jsp) — distinct program, not yet seeded. English PO 2023 statute available, which is rare.",
  },
  {
    programId: "uni-stuttgart-cs-msc",
    university: "Universität Stuttgart",
    city: "Stuttgart",
    programName: "Computer Science M.Sc.",
    taughtInHint: "english",
    admissionUrl:
      "https://www.f05.uni-stuttgart.de/en/cs/prospective-students/msc-computerscience/",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "English-taught, so no German proof required. English C1. Bachelor's of >=6 semesters in CS, software engineering or a closely related subject. 'Professional suitability assessment' criteria live in the admission regulations — statute URL still to be resolved. Program overview page: https://www.uni-stuttgart.de/en/study/study-programs/Computer-Science-M.Sc.-00001/",
  },
  {
    programId: "uni-saarland-cs-msc",
    university: "Universität des Saarlandes",
    city: "Saarbrücken",
    programName: "M.Sc. Computer Science",
    taughtInHint: "english",
    admissionUrl:
      "https://saarland-informatics-campus.de/en/studium-studies/master-english/application-guide/",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "Bachelor's with >=180 CP in CS/informatics or related, plus 'sufficient merit' and 'appropriate curricular content' — deliberately qualitative wording that the schema must surface rather than normalise. Named subject areas: mathematics (discrete maths, real analysis & multivariable calculus, linear algebra, numerical methods, stochastics, statistics) and theoretical informatics (complexity, computability). Application goes to the department for aptitude assessment. Described as highly competitive: meeting the minimum does not guarantee admission — a good test of the eligible-vs-likely distinction the product must never blur.",
  },
  {
    programId: "uni-freiburg-cs-msc",
    university: "Albert-Ludwigs-Universität Freiburg",
    city: "Freiburg",
    programName: "Computer Science M.Sc.",
    taughtInHint: "english",
    admissionUrl:
      "https://www.tf.uni-freiburg.de/en/study-programs/computer-science/m-sc-computer-science",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "International program for German and foreign students. NATIONALITY-SPLIT DEADLINES: winter — non-EU 15 Apr–31 May, EU 15 Apr–15 Jul; summer — non-EU 1 Nov–15 Dec, EU 1 Nov–15 Jan. Non-EU applicants get a window six weeks shorter, which the deadline model must represent (deadlines are per-intake AND per-applicant-group). Three curriculum options: open curriculum, AI specialisation, cyber-physical systems. Central page: https://uni-freiburg.de/en/studies/degree-programmes/degree-programme/181/",
  },
  {
    programId: "lmu-cs-msc",
    university: "Ludwig-Maximilians-Universität München",
    city: "Munich",
    programName: "M.Sc. Informatik",
    taughtInHint: "unknown",
    admissionUrl:
      "https://www.ifi.lmu.de/studium/studiengaenge/master/master_informatik/index.html",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "Requires a >=6-semester degree in CS or a related field PLUS successful completion of an Eignungsverfahren (aptitude assessment). Notable: a transcript showing ~150 ECTS in a CS bachelor's can suffice in some cases — i.e. application before graduation is possible, which breaks the assumption that a completed degree is a precondition. Registration for the aptitude procedure: by 15 Jan (summer) / 15 Jul (winter). Central page: https://www.lmu.de/de/studium/studienangebot/alle-studienfaecher-und-studiengaenge/informatik-master-hauptfach-4501.html",
  },
  {
    programId: "uni-bonn-cs-msc",
    university: "Rheinische Friedrich-Wilhelms-Universität Bonn",
    city: "Bonn",
    programName: "M.Sc. Computer Science",
    taughtInHint: "english",
    admissionUrl:
      "https://www.informatik.uni-bonn.de/en/studies/master-programs/master-computer-science/msc-cs",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "English C1. TOEFL or IELTS is MANDATORY — applications without one are not considered — but EU citizens with >=8 years of school English are exempt, as are nationals/first-degree-holders of several English-speaking countries. Required module coverage: mathematical foundations, algorithms, programming, software technology, information systems, plus a scientific thesis (named areas, no ECTS figures given on this tier — the statute should carry them). Admission FAQ: https://www.informatik.uni-bonn.de/en/studies/faqs/faq-admission",
  },
  {
    programId: "uni-hamburg-cs-msc",
    university: "Universität Hamburg",
    city: "Hamburg",
    programName: "M.Sc. Informatik",
    taughtInHint: "german",
    admissionUrl: "https://www.inf.uni-hamburg.de/en/studies/master/inf/msc-inf-application.html",
    admissionChecked: "found",
    statuteChecked: "todo",
    notes:
      "GERMAN REQUIRED before starting for anyone whose first degree wasn't at a German-language university, plus a self-declaration of sufficient English. Second German-taught program in the set alongside KIT Informatik. Applicants must show >=150 ECTS and a formally registered bachelor's thesis — again, admission before graduation. Deadlines: 1 May–15 Jun (winter, from WiSe 2025/26), 1 Dec–15 Jan (summer). Faculty overview PDF: https://www.uni-hamburg.de/onTEAM/studiengaenge/informatik.pdf",
  },
];

export const seedStats = () => ({
  total: SEEDS.length,
  admissionOpened: SEEDS.filter((s) => s.admissionChecked === "opened").length,
  admissionFound: SEEDS.filter((s) => s.admissionChecked === "found").length,
  statuteFound: SEEDS.filter((s) => s.statuteChecked === "found").length,
  /** Ready for extraction: both documents opened and confirmed. */
  extractable: SEEDS.filter((s) => s.admissionChecked === "opened" && s.statuteChecked === "opened")
    .length,
});
