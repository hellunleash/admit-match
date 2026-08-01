# Gotchas

Every trap found by doing this by hand for one applicant across ~12 German MSc programmes. Each one
is a capability the app must have, not a note to remember.

Ordered by how badly getting it wrong hurts the user.

---

## A. Rules that decide the outcome, and are easy to model wrongly

### A1. NC-free vs restricted decides whether the grade matters at all
`zulassungsfrei` means no seat limit was imposed: **every applicant meeting the requirements is
admitted.** No ranking, no competition, grade irrelevant. `zulassungsbeschränkt` means ranking, and
the grade becomes decisive.

Found at TU Dresden Nanoelectronic Systems, § 2 Abs. 1 of its EFO: *"wird jede Bewerberin und jeder
Bewerber zugelassen, die bzw. der die erforderliche Eignung besitzt."*

**App must:** treat this as the first branch of every evaluation, and never assume from silence.
An `unstated` restriction is unknown, not unrestricted.

### A2. There are THREE different grade rules, and conflating them is the worst error
1. **Cutoff** — below it you are rejected. Freiburg: *"Notendurchschnitt von mindestens 2,9."*
2. **Trigger** — below it, an extra assessment follows. Würzburg: worse than 2.5 → 30-minute oral exam.
3. **Points band** — the grade earns points on a scale. Ilmenau: 1.0–1.5 = 30 pts, 1.6–2.0 = 20,
   2.1–2.5 = 10.

**App must:** keep these as distinct fields. A trigger rendered as a cutoff removes a viable
programme; a cutoff rendered as a trigger sends someone to waste €75.

### A3. A points band with no lower entry is a silent zero
Ilmenau's grade table stops at 2.5. A 2.8 does not score "a few points" — it scores **zero out of
30**, in a rubric needing 60 of 90. That is invisible unless you notice the absent band.

**App must:** detect gaps at the bottom of a points scale and compute the applicant's actual score,
not just check the stated minimum.

### A4. Requirements often have NO credit numbers
The entire hardware corridor states **subject areas** with no ECTS figures — RWTH names four areas
with none at all. Demanding a number forces a model to invent one.

**App must:** allow `minEcts` to be absent and treat "named but unquantified" as its own state.

### A5. k-of-n rules
TU Dresden Nanoelectronic Systems, § 5 Abs. 1: six subjects, **at least five** required.

**App must:** support `satisfyAtLeast` per requirement set. Missing one item is not failure.

### A6. Multiple alternative qualifying routes
BTU publishes a physics route (Mathematics, Theoretical Physics, Experimental Physics) **and** an EE
route (Physics, Mathematics, Electronics, Systems and Field Theory). Satisfying either is enough.
Würzburg publishes 180-ECTS and 150-ECTS routes. KIT publishes a fallback needing only 3 of 4 lower
thresholds plus an interview.

**App must:** evaluate every set independently and report the best route, not the first.

### A7. Non-overlapping credit rules
TU Dresden CS: *"sich inhaltlich nicht überschneidende"* — a course cannot count toward two
requirements. Summing requirements independently silently inflates every total.

**App must:** treat matching as an assignment problem, spending each course once.

### A8. Auflagen (conditional admission) and their caps
Some admit with make-up coursework; others reject outright. RWTH caps it: more than 42 CP of
additional requirements and admission is impossible. TU Dresden SEP gives one semester to clear them.

**App must:** carry `offered`, `maxEcts`, `deadline` — a shortfall may be survivable.

### A9. Applicant-group scoping
Rules apply to some applicants and not others: TUM requires GRE for applicants from Bangladesh,
China, India, Iran and Pakistan; RWTH exempts EU/EEA and Bildungsinländer; Konstanz sets 60 points
for Lisbon Convention countries and 80 for non-signatories; Freiburg gives non-EU applicants a
six-week shorter window.

**App must:** scope every rule with the group it applies to, in the source's own words. A
group-scoped rule stored as universal is wrong for exactly the person who needs the tool.

---

## B. Documents: where the truth is, and isn't

### B1. The programme page is a summary and it will mislead you
FAU's page said *"an overall grade of 2.50 or better."* The statute (§ 54 Abs. 6) provides for
*"Abschlussnote zwischen 2,51 und 4,0"* — 2.50 is the threshold for **direct** admission, and
2.51–4.0 routes into the aptitude procedure. Reading only the page removes a viable option.

**App must:** enforce a source hierarchy — statute > programme page > FAQ — and record which tier
every field came from.

### B2. "Statute" is not one document type
A **Prüfungsordnung** governs examinations, a **Studienordnung** the curriculum, a
**Zugangs-/Zulassungsordnung** admission, an **Eignungsfeststellungsordnung** the aptitude
procedure. We pulled TU Dresden SEP's 2026 Prüfungsordnung and it contained no admission rules at
all — newest version, wrong type.

**App must:** classify document type and seek the admission-relevant one.

### B3. The current rule is base statute + amendments
German statutes change by **Änderungssatzung**. FAU publishes a consolidated version
("07.08.2024 in der Fassung vom 13.02.2026") alongside the base and the amendment. Reading only the
newest PDF gives you a diff, not the rule.

**App must:** prefer consolidated versions; otherwise assemble base + amendments in order.

### B4. Old dates can still be current
Freiburg's Zulassungsordnung is dated **19.01.2009** and is the version the university links today.
Age is not staleness.

**App must:** never rank by date alone — use the version the institution links as current.

### B5. The statute may not exist publicly
BTU's Micro- and Nanoelectronics is absent from BTU's own master regulations index; only a 2023
draft exists in faculty documents.

**App must:** record "no statute published" as a finding with reduced confidence — not silently
fall back to page tier as if it were equivalent.

### B6. Programmes get renamed
Organic and Molecular Electronics is now **Sustainable Electronics and Photonics**, same course id
4856. Applying under the old name, or missing the programme entirely, is a live risk.

**App must:** track programme identity by institutional id, not title, and surface renames.

### B7. Statutes are German PDFs
Native PDF ingestion, German-language extraction, and § references preserved. Converting to text
first destroys the section structure that makes a citation worth having.

### B8. Where the documents actually live
Every university publishes binding rules in an official gazette — *Amtliche Bekanntmachungen* /
*Amtliche Mitteilungen* — as dated, numbered PDFs in a stable archive. Some offer mailing lists.
The gazette number is a natural version key.

**App must:** track gazette indexes rather than re-scraping programme pages. See ARCHITECTURE.md L2.

---

## C. The applicant's own data is harder than the requirements

### C1. Credits are not ECTS, and the conversion is by DURATION
German universities and uni-assist evaluate Indian degrees **by duration, not by the credit number
on the mark sheet**: 3 years = 180 ECTS, 4 years = 240 ECTS. A 4-credit Indian course is not
"4 ECTS" — it is roughly 5.3.

**App must:** model the credit system explicitly, allow `ectsPerUnit` to be null, and render unknown
as unknown. Silently multiplying by 1.0 and comparing against a statutory threshold is the
highest-consequence hallucination available — the number looks precise and is invented.

### C2. The grade conversion hinges on a value not on the transcript
Modified Bavarian Formula: `Z = ((Nmax − Nd) / (Nmax − Nmin)) × 3 + 1`. **`Nmin` must come from
anabin**, not from the transcript. For India it is 4.0 or 5.0 depending on the institution, and the
difference moves the result by 0.3–1.0 grade points — enough to flip a 2.9 cutoff.

**App must:** treat `nmin` as a sourced field with a provenance tier, and show the resulting grade as
a range when it is unresolved. The authoritative answer is uni-assist's **VPD**.

### C3. Student portals publish semester totals, not per-course credits
The result page gave semester totals only. Per-course credits had to be inferred and reconciled —
and two values could only be derived from the semester sum.

**App must:** validate per-course credits against published semester totals and flag inferred values.

### C4. Project, thesis and internship modules are not normal courses
Assuming 4 credits each left a 22-credit gap against a stated 176.

**App must:** never assume uniform credit weights; flag unreconciled totals rather than proceeding.

### C5. Module handbooks are per-department
The Engineering Physics handbook covered 14 of 38 requested modules. Mathematics and Programming —
the most decisive courses for a CS or EE application — belong to other departments and were absent.

**App must:** track which modules have descriptions, request the owning department's handbook, and
never let an empty entry masquerade as evidence.

### C6. Titles are nearly contentless; learning outcomes decide
The legal standard is **"kein wesentlicher Unterschied"** (Lisbon Recognition Convention, in force
in Germany since 2007), assessed on **learning outcomes**. uni-assist: *a transcript with lecture
titles only is not sufficient.* "Mathematical Physics" turned out to contain Fourier transforms;
"Digital and Analog Electronics" contained Boolean algebra, K-maps and CMOS logic families. Judging
by title got both wrong.

**App must:** carry an evidence tier per match (`description_backed` vs `title_only`), set from what
was actually supplied, and render title-only matches as provisional.

### C7. What a degree implies vs what it enumerates
A physics degree implies probability (statistical mechanics, quantum mechanics, Fermi-Dirac
statistics) even when no course is named "Probability". It does **not** imply object-oriented
programming. Demanding a citation for the former is uselessly pedantic; assuming the latter is
hallucination.

**App must:** distinguish discipline-implied fundamentals from specific skills — and be explicit
about which side of the line each judgement sits on.

### C8. Failed courses carry no credit but still belong on the record
Some programmes ask about attempts. Dropping them misrepresents the transcript; counting them
inflates totals.

### C9. Applying before graduation is normal, and has stated thresholds
TU Dresden SEP: *"confirmation of at least 80% of the credit points required for graduation"* plus a
written confirmation of anticipated graduation date. LMU and Hamburg accept ~150 ECTS with a
registered thesis.

**App must:** model `degreeInProgress` with its threshold, and back-solve whether the applicant
qualifies at application time rather than at graduation.

---

## D. Process traps outside the university

### D1. Two deadlines, not one
TU Dresden SEP requires a **separate aptitude-assessment registration (1–31 May)** alongside the
programme application (1 April – 31 May). Missing the registration ends the application.

### D2. Deadlines split by nationality AND by degree origin
SEP publishes four: German 1 Jun–15 Jul; EU 1 Apr–15 Jul; non-EU with a German degree 1 Apr–15 Jul;
**non-EU with a foreign degree 1 Apr–31 May.**

### D3. The stated deadline is not the effective one
Effective deadline = programme deadline − uni-assist processing (3–4 weeks) − APS lead time
(3 weeks to 3 months in peak season) − dMAT test date where applicable.

**App must:** back-solve and display the effective personal deadline, never the raw one.

### D4. Country-specific procedures that don't appear on programme pages
**APS** is mandatory for Indian applicants since Nov 2022, ~INR 18,000, valid for life. **dMAT**
applies to Indian applicants in notified fields from Summer Semester 2027 — registration and test
dates are fixed and annual. A TU Dresden page listing APS for Chinese, Mongolian and Vietnamese
applicants is **not** an Indian exemption.

**App must:** keep these in the country rules pack, versioned and dated — not extract them from
programme pages, which are incomplete on them.

### D5. Application route changes cost and time
uni-assist: €75 first application, €30 each additional, 3–4 weeks processing. Direct application
(TU Ilmenau) costs neither. The VPD from uni-assist is also the authoritative grade conversion.

### D6. Language rules have three independent dimensions
CEFR level; the list of accepted evidence; and **whether a medium-of-instruction letter counts**.
TU Dresden SEP accepts an English-medium degree in place of a test. **Freiburg explicitly refuses
it** and requires IELTS 7.0. Same level, opposite outcome.

Also: required *for admission* vs *for enrolment* vs *for the visa* are different things, and
TU Chemnitz requires German A1 for admission and A2 by the third semester.

---

## E. Engineering traps in the pipeline itself

- **Reasoning tokens are billed at the output rate and are invisible.** Gemini 2.5 Flash has
  thinking on by default; it lives in `thoughtsTokenCount`, not `candidatesTokenCount`. It was ~90%
  of the bill. Disabling it entirely then **dropped a real requirement** — a bounded budget is the
  answer, and any cost optimisation must be measured against correctness.
- **Re-sending unchanged documents is the whole bill.** Cache documents, skip when document hash +
  prompt version + model are unchanged, and repair validation failures from the previous JSON rather
  than resending the PDF.
- **HTTP header values must be ASCII.** An em-dash in a User-Agent throws before the request, and
  the failure looks exactly like being blocked.
- **A TLD allowlist is not a domain allowlist.** TU Berlin lives on `tu.berlin`.
- **Models write `null` where the instruction said omit.** Strip nulls before validation.
- **Whole-document validation is the wrong granularity.** One bad optional field discarding twenty
  good cited ones contradicts the field-level quarantine the design is built on.
- **Provenance must sit on the array element, not the wrapper.** One snippet cannot support three
  thresholds — and wrapper-level provenance simultaneously produced false defects *and* hid a real
  hallucination (a "90 ECTS total" the model computed by adding 35+35+20).
- **Never let the model add numbers.** A value it computed is a value it invented.
