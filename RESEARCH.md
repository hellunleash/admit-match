# RESEARCH — country rules as a separate layer

Why the same profile is eligible in Germany and ineligible in the US, and why that difference
cannot live in the program extractor.

Scope of this document: **Germany, MS, 2026–27 cycle**, in depth. Other countries are sketched only
enough to prove the layering is necessary.

Every factual claim is dated and sourced. Rules change per cycle; an undated claim in this file is
a bug.

---

## 1. The core insight

A program page says *"a bachelor's degree with at least 180 ECTS in Computer Science."* That
sentence is meaningless on its own. Whether you satisfy it depends on rules that are **nowhere on
that page**:

- Is your university even recognised in Germany? (anabin institution status)
- Has your degree been verified? (APS, mandatory for Indian applicants)
- Does your 8.4/10 CGPA convert to a 1.7 or a 2.4? (Modified Bavarian Formula, using scale bounds
  from anabin — not from your transcript)
- Do you need an aptitude test that didn't exist last year? (dMAT)
- Do you apply to the university, or through a clearing house? (uni-assist vs direct)

None of that is extractable from the program page, because the page assumes it. A US program page
assumes an entirely different set. **This is a second layer, not a harder extraction problem.**

## 2. The architectural decision

Two layers, built differently on purpose:

| | Country Rules Pack | Program Requirements |
|---|---|---|
| **How many** | ~1 per country, ~10 rules each | ~40 programs × ~15 fields |
| **How it's built** | Hand-curated, LLM-*assisted* research, human-verified | LLM-extracted from live pages |
| **Volatility** | Changes 1–3× per year, with announcements | Changes every intake cycle, silently |
| **Failure cost** | Catastrophic (wrong gate = wrong shortlist) | Contained to one program |
| **Stored as** | Versioned TS/JSON, dated, cited, in git | Snapshot JSON, dated, cited, in git |
| **Executed by** | Deterministic code | Deterministic code, over extracted structs |

**A rules pack is codified, never inferred at runtime.** An LLM helps *research* a rule; it never
*decides* one. There are ten of them per country, they're high-stakes, and they're announced
publicly — writing them by hand and citing each one is both feasible and correct. Asking a model to
re-derive "does this applicant need APS?" on every run is how you get a confident wrong gate.

The extractor stays country-agnostic. It reads a page and fills a struct. The rules pack decides
what that struct *means* for a given applicant.

## 3. Germany — the full gate chain (MS, 2026–27)

The order matters. Failing an early gate makes every later one irrelevant, and no existing tool
models this as a chain.

### 3.1 anabin institution status — the gate before all gates
*Confidence: high. Verified 2026-07-27.*

anabin (ZAB's database of foreign education) classifies **institutions**:

- **H+** — institution comparable to a German Hochschule
- **H+/-** — case-by-case; some of its degrees qualify, some don't
- **H-** — not recognised

If your university is H-, no German master's admission follows, regardless of grades. If it's
H+/-, your specific degree needs individual assessment.

**Critical nuance most tools get wrong:** H+ describes the *institution*, not your *degree*. An H+
university does not guarantee your particular qualification is deemed equivalent. Any tool that
reports "your uni is H+, you're fine" is wrong, and that's a differentiator we can state plainly.

### 3.2 Grade conversion — Modified Bavarian Formula
*Confidence: high. Verified 2026-07-27.*

```
Z = ( (Nmax − Nd) / (Nmax − Nmin) ) × 3 + 1
```

`Nmax` = best possible grade in the foreign system, `Nmin` = minimum passing grade, `Nd` = the
grade achieved. Output is the German 1.0–4.0 scale (1.0 best).

Used by most German public universities and by uni-assist. **`Nmax` and `Nmin` come from anabin for
your country's system, not from your transcript** — this is where hand-rolled calculators get it
wrong, and where a correct implementation is visibly better.

This is pure arithmetic: **deterministic code, never an LLM.** It is the single clearest example of
the extract-vs-decide split in the whole product.

Caveat to encode: some universities publish their own conversion table instead. Where a program
does, that table wins over the formula, and the citation must say which was used.

### 3.3 APS certificate — mandatory for Indian applicants
*Confidence: high. Verified 2026-07-27.*

- Required for **all** Indian students applying for a German master's, **regardless of subject**
- In force since November 2022
- Fee ~INR 18,000, non-refundable
- Processing 3–4 weeks normally, **up to 3 months in peak season**
- Validity: indefinite once issued

The processing time is the product-relevant part. It makes APS a **timeline dependency**, not just
a checkbox: a July 15 uni-assist deadline means APS in hand by ~May, which means applying ~April.
A tool that shows a deadline without back-solving the APS lead time is showing a deadline the user
will miss.

### 3.4 dMAT (Digital Master Test) — new, and mis-reported everywhere
*Confidence: medium-high on the facts below; one open question flagged. Verified 2026-07-27.*

- Announced ~June 2026; part of the APS process for selected Indian master's applicants
- **Applies from Summer Semester 2027 intake onward.** Winter Semester 2026/27 applicants are
  **not** affected — the first certificates only issue in October 2026
- Fields named: Engineering, Business, Commerce, Accounting, Finance, Economics, Management
- Structure: Core Module (analytical/logical/mathematical aptitude) + Subject Module (bachelor's
  discipline). ~3.5 hours with a break
- Cost: €150
- 2026 cycle dates: registration **15 Sep 2026**, test **26 Sep 2026**, certificate **12 Oct 2026**

**WORKING ASSUMPTION (2026-07-27): Computer Science counts under the notified "Engineering"
family, so dMAT applies to MSc CS applicants from SS2027.** Sources name engineering and
business/commerce families without listing CS explicitly, so this is a *decision*, not a verified
fact. It is the conservative direction — assuming it applies means preparing for a test you might
not need, rather than missing one you did.

Flagged in the UI as an assumption with its own citation, and to be replaced with an official
answer from APS India. This is the one rules-pack entry currently carrying stated uncertainty, and
it is deliberately visible rather than silently baked in.

This exam is also the strongest proof of why the rules layer must be separate and versioned: it
did not exist twelve months ago, it applies to some applicants and not others, and it is keyed to
*intake semester*, not application date.

### 3.5 uni-assist vs direct application
*Confidence: high on mechanics.*

Some universities take applications directly; others route through uni-assist, which pre-checks
documents and issues a VPD (preliminary review documentation).

- Fee: **€75 first application, €30 each additional**
- Adds its own processing time on top of the university's deadline

Per-program routing is an extracted field (it's stated on the page). The *fee and lead-time model*
is a rules-pack fact. Cost-per-application is a real decision input nobody surfaces — applying to
12 programs through uni-assist is €405 before you've bought a plane ticket.

### 3.6 Deadlines and intakes
*Confidence: high on structure; per-program dates must be extracted.*

- Winter semester (Oct start) is the main intake; summer (Apr start) is smaller and many CS
  programs don't offer it
- A commonly cited uni-assist winter deadline is **15 July**, but per-program deadlines vary widely
  and are the authoritative value — extract them, don't assume
- Some programs are open-admission, some restricted (NC), some run their own aptitude assessment

**Deadlines must be back-solved, not displayed.** Effective personal deadline = program deadline −
uni-assist processing − APS lead time − (dMAT test date, if applicable). That chain is the feature.

### 3.7 How admission is ACTUALLY decided — NC-frei, and why GPA usually isn't the gate
*Confidence: high on the mechanism. Verified 2026-07-27. Per-program thresholds must be extracted.*

This is the single most misunderstood part of the German pipeline, and the core of what this
product does that nothing else does.

**~79.5% of computing programs in Germany are NC-free (zulassungsfrei).** For MSc Computer Science
specifically, a Numerus Clausus grade cutoff is usually *not* how admission is decided.

**NC-frei does not mean "easy" or "automatic."** It means the selection mechanism is different:

- **NC / zulassungsbeschränkt** — more applicants than seats, ranked, typically by grade. A cutoff
  exists and moves per cycle.
- **NC-frei / zulassungsfrei** — no ranked quota. You are admitted if you **meet the
  subject-specific requirements**. Fail one, and a 1.2 GPA doesn't save you.

So for most German MSc CS programs, the question is not *"is my CGPA high enough?"* It's
**"does my transcript contain the right credits?"**

#### Eignungsfeststellungsverfahren (aptitude assessment) and curricular analysis

Most MSc CS programs run an *Eignungsfeststellungsverfahren* — an aptitude assessment. Its core is
a **curricular analysis**: your bachelor's transcript is decomposed by subject area and compared
against per-area ECTS minimums.

A representative shape (real, and exactly the kind of rule this product must model):

- ≥ **100 ECTS** in computer science and mathematics fundamentals
- of which ≥ **25 ECTS** specifically in **mathematics and theoretical computer science**
- a completed **thesis** worth ≥ **10 ECTS**

Two applicants with the same CGPA get opposite outcomes here, decided entirely by transcript
composition. **No existing tool models this.** Aggregator databases show "MSc CS, NC-frei" and stop
— which is worse than useless, because it reads as "no barrier."

#### Two decision styles, and they behave differently

- **Points-based** — the committee scores curricular fit, grade, and sometimes motivation
  letter/interview/essay, then admits above a threshold. A shortfall in one area can be offset.
- **Binary** — requirements are hard gates; accept or reject. No offsetting.

The style is an extracted per-program field, because it changes what "borderline" means. Under
binary, a 95-ECTS applicant against a 100-ECTS requirement is *rejected*. Under points, they may
still be admitted.

#### Other criteria that appear alongside

Grade is explicitly allowed to be one factor but **not the only** criterion. Programs commonly add
a letter of motivation, a CV, an entrance test, or an interview — and **C1 English** is a frequent
requirement for English-taught MSc CS, notably stricter than the IELTS 6.5 that generic guides
assume.

#### The authoritative source is the Satzung, not the web page
*Confidence: high on the mechanism. Verified 2026-07-27.*

Program web pages are **summaries**. The binding text is the **Zulassungssatzung** (admission
statute) or **Prüfungsordnung** (examination regulations) — a formal legal document, usually a PDF,
usually in German, amended between cycles.

That's why the numbers on web pages read as vague: precision was dropped in summarising, not
withheld. The precise version is one link deeper.

**Source hierarchy — extract in this order, and record which was used:**

1. **Zulassungssatzung / Prüfungsordnung** (binding, cite by § where possible)
2. Official program admission page (summary, use when no statute is findable)
3. Faculty FAQ (weakest; never the sole source for a hard gate)

A field extracted from tier 2 when a tier-1 document exists is a **defect**, not a shortcut. No
aggregator reads the statutes; doing so is the single biggest depth advantage available, and it is
the difference between deep extraction and confident vagueness.

Two consequences for the pipeline: statutes are **PDFs** (so PDF ingestion is not optional) and
they are **in German** (so extraction must run on German legal text, not just English marketing
copy). Gemini Flash ingests both natively, so this costs implementation attention rather than
money.

#### Where the leniency actually is
*Confidence: medium-high. Auflagen mechanism verified 2026-07-27; prevalence not yet measured.*

Thresholds look soft on web pages, which invites the assumption that there's a tolerance band on
the number. There isn't. The slack is real but it lives in three specific, *declared* places:

1. **Course-to-area classification.** The threshold is usually exact; what's soft is *which of your
   courses count toward it*. Whether "Discrete Structures" lands in maths/theory or CS fundamentals
   is a committee decision. This is where a 95-vs-100 gap actually disappears — not by waiving 5
   ECTS, but by counting a course you didn't.
2. **Auflagen — conditional admission.** Some universities admit with a requirement to make up
   missing coursework in the first semesters; **others reject outright.** Per-program, stated in
   the statute, therefore extractable as a field.
3. **Points-based offsetting.** Where assessment is points-based, a curricular shortfall can be
   offset by grade or motivation. Where it's binary, it cannot.

**Explicitly rejected: any tolerance band, of any width, anywhere in the app.** Committees do
exercise judgement in the ways listed above, but that judgement is theirs and it is not a
percentage. Encoding "within X% still counts" would fabricate leniency that appears in no source,
could not be cited, and would err in the dangerous direction — telling an applicant they're fine
when the committee will reject them. A threshold is unmet or it is met.

What the three mechanisms above *do* justify is showing the applicable mechanism alongside a
shortfall, quoted from the statute — `auflagenOffered`, `assessmentStyle`, and the classification
of the user's own courses. The app reports the gap and the mechanism; it never softens the number.

The most valuable single line the product can emit falls out of this:

> Your *Discrete Mathematics* (6 ECTS) is currently classified as CS fundamentals. If the committee
> counts it as maths/theory, you'd be 1 ECTS short instead of 7.

That sentence is only possible because classification is modelled, rather than a single total.

#### How committees actually decide a course counts — not by name
*Confidence: high. Verified 2026-07-28.*

The obvious objection to curricular analysis is that course titles differ between universities even
when the material is identical. Committees know this, and the law already answers it.

**The legal standard is "wesentlicher Unterschied" (substantial difference)**, from the Lisbon
Recognition Convention, ratified in Germany in 2007. It deliberately replaced the older test of
"equivalence". The question is not *do these match* but:

> is the difference so significant that it would likely prevent the applicant from successfully
> continuing their studies or meeting the program's qualification objectives?

**Learning outcomes are at the centre of that assessment**, considered together with level,
workload and program profile. Where the outcomes were achieved — which university, which country,
university or Fachhochschule — is explicitly not a factor. Differences in course title or module
label do not by themselves prevent recognition when the learning outcomes align.

Two consequences worth stating plainly to an applicant: the burden leans *toward* recognition, and
a degree title that doesn't say "Computer Science" is not itself a barrier.

**The evidence they read is the Modulhandbuch** (module handbook / syllabus): content, learning
objectives, workload and requirements per module. uni-assist is explicit — *a transcript with
lecture titles only is not sufficient.* It must be in German or English; where a university issues
no such document, the applicant may compile the relevant course contents themselves plus written
confirmation of that fact.

**This is a direct verdict on our match design.** Matching on course titles is structurally weaker
than what a committee does. "Computational Methods" is nearly contentless as a string; its module
description determines whether it was numerical analysis or introductory scripting. So:

- `Course.description` (learning outcomes from the Modulhandbuch) becomes the field that matters,
  and titles become a fallback.
- Every match carries an **evidence tier**: `description_backed` (what a committee could act on)
  versus `title_only` (provisional, and labelled as such in the UI — a title-only match is a guess
  about a guess and must never render as a finding).
- The comparison to implement is "no substantial difference in learning outcomes against this
  requirement's wording", not string similarity.

#### Product consequences (these change v1's data model)

1. **The user profile is not just CGPA.** It needs an **ECTS breakdown by subject area** — CS
   fundamentals, mathematics/theoretical CS, thesis credits. Without that, eligibility can't be
   computed for the majority of programs.
2. **Extraction must capture per-area credit minimums**, not one number. The schema needs a list of
   `{area, minEcts}` rules, not `ects_required: 180`.
3. **"NC-frei" must never render as "no requirements."** It renders as *"no grade cutoff — admission
   depends on these credit requirements,"* with the list.
4. **Match reasons become specific and useful**: not "ineligible," but *"you have 18 ECTS in
   maths/theory, this program requires 25 — here's the line that says so."* That sentence is the
   product.
5. **`assessmentStyle`** (`points` | `binary`) and **`auflagenOffered`** (`yes` | `no` | `unstated`)
   become extracted fields, because they decide whether a shortfall is fatal.
6. **Every field records `sourceType`** (`satzung` | `program_page` | `faq`) alongside its URL and
   snippet, so source quality is visible and auditable rather than assumed.

### 3.8 Language — deferred to Phase 2, but sketched here
*Confidence: medium. Per-program verification required.*

English-taught MS CS programs still vary in ways that break naive matching:

- Most require IELTS/TOEFL, but **thresholds differ per program** (6.5 vs 7.0 overall, and some
  set per-band minimums)
- Some waive it if the bachelor's was English-medium — and the *evidence* accepted for that varies
  (medium-of-instruction letter vs. degree certificate wording)
- Some English-taught programs still require **A1/A2 German** for enrolment or visa purposes
- German-taught programs need TestDaF/DSH, which changes the candidate pool entirely

Same country, same city, sometimes the same faculty — different rules. This is precisely why
language cannot be a country-level rule and must be an extracted, cited, per-program field.

## 4. What is code, what is LLM, what is neither

| Fact | Source | Decided by |
|---|---|---|
| anabin institution status | anabin lookup | Code (lookup) |
| German grade equivalent | Bavarian formula + anabin bounds | **Code (arithmetic)** |
| APS required? | Rules pack (nationality → rule) | **Code** |
| dMAT required? | Rules pack (nationality + field + intake semester) | **Code** |
| Effective deadline | Rules pack lead times + extracted deadline | **Code** |
| ECTS / CGPA threshold | Program page | LLM extracts → code compares |
| IELTS threshold + bands | Program page | LLM extracts → code compares |
| uni-assist or direct | Program page | LLM extracts |
| "Strong background in mathematics" | Program page | **Neither — surfaced with snippet, human decides** |

Nothing in the right column is an LLM *decision*. That's the invariant.

## 5. Why other countries can't share the pack

Sketched only to prove the layering:

- **US** — no central credential database, no APS equivalent, GRE increasingly optional but
  program-specific, 4-year-degree expectations that collide with 3-year Indian bachelor's, GPA on a
  4.0 scale with no official conversion authority, per-university transcript evaluation (WES etc.)
- **Netherlands** — numerus fixus, Studielink central application, different credential recognition
- **UK** — 2:1 / 2:2 classification system, no ECTS, per-university India-grade tables

The 3-year-bachelor's problem alone flips eligibility between Germany and the US for the same
applicant. One rules pack per country, versioned independently. No shared abstraction beyond the
interface.

## 6. Volatility model — what goes stale, and how fast

| Fact | Changes | Detection |
|---|---|---|
| Program deadlines | Every cycle | Weekly recrawl; struct diff |
| ECTS/CGPA thresholds | Occasionally, silently | Struct diff — the alert |
| Language thresholds | Occasionally | Struct diff |
| APS/dMAT rules | 1–3×/year, announced | Manual, on announcement; rules pack version bump |
| anabin status | Rarely | Re-check per cycle |
| Bavarian formula | Effectively never | — |

**Struct diffs in git are the change-detection mechanism** (see PLAN.md §4). A university quietly
raising its IELTS floor from 6.5 to 7.0 shows up as a one-line diff in a PR. That diff is a product
feature, an alert, and a build-in-public post at the same time.

Rules-pack facts get a `verifiedOn` date and a source URL. Anything past its staleness window
renders as "unverified" rather than silently asserting a stale rule.

## 7. Phase 3 — decision factors beyond eligibility

Eligibility narrows the list. It doesn't choose. Deliberately **not** in v1, and deliberately not
LLM-scored when it arrives — these are inputs a human weighs, presented with sources:

- **Industry vs research orientation** — TU9 and TUM/RWTH-style research density vs Fachhochschule
  applied/industry focus. Materially different outcomes; rarely surfaced side by side
- **Regional employment reality** — Munich and Stuttgart (automotive, industrial software), Berlin
  (startups, product), Aachen/Karlsruhe (research-adjacent). Where the jobs actually are for your
  specialisation
- **Hiring constraints** — German-language expectations in practice even for English-taught
  graduates, work-permit and post-study visa terms, whether local employers hire non-German speakers
  in that sector
- **Cost of living vs Munich premium** — a cheaper city can beat a better-ranked program
- **Specialisation depth** — does the department actually have people in your area, or one course

**Rule for this phase:** present factors with sources, never fuse them into a single
recommendation score. The moment you emit "Program A: 87/100," you've become the black box you set
out to replace. Weighting is the user's job; surfacing evidence is ours.

## 8. Open questions

1. **Does CS fall under dMAT's notified fields?** Currently answered by *assumption* (yes, under
   Engineering — see §3.4). Needs official confirmation from APS India; until then it renders as an
   assumption in the UI, not a fact.
2. **3-year Indian bachelor's acceptance** — per-program in Germany. Needs its own extracted field
   and probably a rules-pack note.
6. **Per-area ECTS taxonomy** — programs describe subject areas in inconsistent language
   ("mathematics and theoretical computer science", "formal foundations", "mathematical
   fundamentals"). Normalising these into a small area vocabulary without distorting meaning is the
   hardest extraction problem in v1. Leaning: keep the program's own wording as the label, map to a
   coarse area for matching, and always show the original snippet.
3. **anabin programmatic access** — is there a stable machine-readable path, or does this need
   careful scraping / a cached snapshot? Affects §3.1 feasibility directly.
4. **Per-university conversion tables** overriding the Bavarian formula — how common? Determines
   whether that's an edge case or a first-class field.
5. **English-medium waiver evidence** — what documents each program accepts. Likely too varied to
   normalise; probably a surfaced snippet.

## 9. Sources

Verified 2026-07-27. Aggregator sources are used for *signal*; official sources must confirm
anything that becomes a gate.

- [dMAT overview (Jamboree)](https://www.jamboreeindia.com/know-how/dmat-germany-explained-what-indian-students-planning-a-masters-in-germany-need-to-know)
- [dMAT added to APS process, SS2027 (Collegedunia)](https://collegedunia.com/germany/news/germany-adds-dmat-test-to-aps-process-for-indian-masters-applicants-from-summer-2027)
- [dMAT structure and dates (Shiksha)](https://www.shiksha.com/studyabroad/digital-master-test-dmat-exam-guide-articlepage-234591)
- [APS India official FAQ](https://aps-india.de/faqs/)
- [APS certificate requirements (Studying in Germany)](https://www.studying-in-germany.org/aps-certificate/)
- [Requirements for Indian students 2026](https://www.studying-in-germany.org/requirements-to-study-in-germany-for-indian-students/)
- [Modified Bavarian Formula (Heidelberg)](https://backend.uni-heidelberg.de/en/documents/modified-bavarian-formula/download)
- [Grade conversion (TUM)](https://www.tum.de/en/studies/application/application-info-portal/grade-conversion-formula-for-grades-earned-outside-germany)
- [Grade conversion (Uni Passau)](https://www.sobi.uni-passau.de/en/study/examinations/grade-conversion)
- [anabin (Wikipedia overview)](https://en.wikipedia.org/wiki/Anabin)
- [HRK nexus — Anerkennung guidance (substantial difference, learning outcomes)](https://www.hrk-nexus.de/themen/anerkennung/haeufig-gestellte-fragen-zur-anerkennung/)
- [HRK Modus — academic recognition](https://www.hrk-modus.de/en/information/topics/recognition)
- [uni-assist — module manuals (Modulhandbuch)](https://www.uni-assist.de/en/tools/glossary-of-terms/description/term/module-manuals-modulhandbuch/)
