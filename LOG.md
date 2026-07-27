# Build log

Dated entries. Decisions, dead ends, and numbers — including the bad ones.
Newest at the top.

Format: date, what changed, what I learned, what's next. Short is fine. Skipping a week is fine.
Rewriting history to look smarter is not.

---

## 2026-07-28 — Re-running stopped costing money

The API bill was not a model-pricing problem. It was me re-sending the same 700 KB statute PDFs on
every run to test **prompt** changes. The documents hadn't changed; the code had.

Three fixes:

- **Disk cache** for fetched documents (`.cache/docs/`, gitignored, keyed by URL hash, 14-day TTL,
  `--refresh` to override). University statutes change about once a cycle.
- **Skip when nothing changed.** A sidecar `<programId>.meta.json` records the document hashes,
  prompt version and model that produced each snapshot. Same inputs → no API call at all. Verified:
  second run of TU Dresden printed `skipped — documents, prompt and model unchanged (no API call)`.
- **Repair retries instead of re-runs.** A validation failure used to resend the entire PDF. It now
  sends only the previous JSON plus the errors — a couple of thousand tokens instead of 55,000. The
  model doesn't need to re-read a statute to fix a type error in its own output.

Also checked the alternatives before assuming a model swap was the answer. **DeepSeek V3**
($0.14/$0.28 per M) is cheaper per token but text-only — no native PDF, so it needs a
PDF→text step, which is exactly what we avoid to keep the § structure. **Kimi K2.5** ($0.60/$2.50)
and **K2.6** ($0.95/$4.00) are *more* expensive than Gemini Flash on input, which is ~95% of our
spend. Gemini Flash with native PDF stays. Flash-Lite ($0.10/M) is a 3× saving worth A/B-ing once
there's a golden set to measure it against — not before, since cheaper output that's wrong costs
more than it saves. Noting for later: 2.5 Flash is scheduled for deprecation on 16 Oct 2026.

**Per-requirement provenance paid off immediately.** Dresden now extracts 2 requirement sets with
ZERO defects, and each threshold cites its own statute line — § 5 Abs. 2 Nr. 1, Nr. 2, Nr. 3. The
fabricated "90 total" is gone; the model kept 90 in the set *label*, where the statute actually says
it, and no longer emits it as a requirement it invented by addition.

The multi-area fix shows up too: "Grundlagen der Mathematik, theoretische Informatik, KI" now maps
to `math_applied+cs_theory+cs_applied` instead of being flattened to one bucket.

**Next:** the match engine — my transcript against these requirements.

## 2026-07-28 — Day 2: the extractor, and a header that wasn't ASCII

Wrote fetch → extract → verify → snapshot. Ran it. It failed, which is why running it mattered.

**The bug:** my User-Agent string contained an em-dash. HTTP header values are ByteStrings, so
every single request threw `character at index 62 has a value of 8212` before touching the network.
Both documents reported "FAILED" and it looked exactly like the universities blocking a scraper.
Fixed to ASCII; the same run then pulled a **92 KB statute PDF and 12,776 characters** of the
TU Dresden admission page. A typecheck would never have caught this.

Fetch is three tiers: plain fetch → Jina Reader → (deferred) Playwright. Under 800 characters of
text means the page is probably client-rendered, so Jina gets a turn; if that's also thin the page
is *logged as needing Playwright* rather than silently extracted from nothing. PDFs are never
converted — they go to Gemini as bytes, because a parse-then-hope pipeline loses the § structure
that makes a citation worth having.

Validation is zod-then-retry rather than a hand-written JSON `responseSchema`. The schema has
nested unions and applicant-group scoping; maintaining a parallel JSON Schema would be a second
source of truth waiting to drift. One retry feeds the validation errors back.

`verify()` runs on every extraction: numeric values must literally appear in their cited snippet
(German decimal commas normalised), snippets can't be empty, and a field read from a summary page
when a statute was available is flagged as a source-tier violation. Issues are reported per-field
rather than failing the whole program — one bad number shouldn't discard fourteen good ones.

The prompt's whole job is to make the model a reader, not a judge. Nine rules, and the ones that
matter most: never decide eligibility, never infer an unstated value ("silence is a finding"),
every value needs a verbatim snippet, group-scoped rules must carry their group, and a grade
CUTOFF is a different field from a grade TRIGGER.

Also reconciled the transcript credits — 4 per course, 2 for workshops/electives — against the
published semester totals. **128/128, all six semesters balance**, with failed courses excluded.
Two values had to be inferred (MG301 and HU302A at 3 credits) because they're the only numbers that
make their semesters add up. Flagged as inferred rather than quietly used.

Confirmed from the DTU grading ordinance that the Bavarian formula bounds are nmax 10 / nmin 4, so
CGPA 6.4 converts to a **German 2.8**. Still needs anabin, which is the authority German
universities actually use, but the university's own table agreeing makes it a figure rather than a
guess.

**Blocked on:** `GEMINI_API_KEY`. Everything up to the model call is verified working.

## 2026-07-28 — Schema v2, and the profile stops being a number

Rewrote the schema against the four gaps from yesterday, plus a fifth that only appeared once I put
a real transcript into it.

**The profile is no longer per-area ECTS totals — it's a course list.** v1 asked "how many maths
credits do you have". The question that decides admissions is "which of YOUR courses would this
committee count toward ITS definition of maths". Totals discard the mapping, and the mapping is the
whole explanation. Each course now carries a classification with a `basis`
(`user`/`rule`/`llm`/`program_example`), a confidence, and **alternatives** — which is what makes
the reclassification line possible at all.

**Subject areas went from a CS-only enum to an open STEM taxonomy.** The old enum was wrong in both
directions: it couldn't express a physics program's requirements, and it couldn't express a physics
*transcript* being matched against a CS program — which is the common case, not the exception. So
extending beyond CS later needs no rewrite; the field is data, and areas are canonical buckets with
the program's own wording preserved alongside.

Also added, each forced by a specific program: `RequirementSet` with k-of-n
(KIT INT's 3-of-4 fallback plus interview), `ReferenceCurriculumRequirement` (TU Darmstadt defining
admission by reference to its own B.Sc. core), `ApplicantGroup` scoping on tests/pass marks/
deadlines (TUM's GRE-for-India, Konstanz's 60-vs-80, Freiburg's shorter non-EU window),
`DegreeInProgress` (LMU/Hamburg at ~150 ECTS with a registered thesis), and
`gradeTriggeredAssessment` as a distinct thing from a cutoff (Würzburg's 2.5 → oral exam).

**Credit conversion is now explicit and allowed to be unknown.** A foreign transcript isn't
denominated in ECTS, and multiplying by a guessed factor before comparing against a statutory
100-ECTS threshold would be the highest-consequence hallucination in the product: the number would
look precise and be invented. `ectsPerUnit` is nullable, carries a `basis`, and `null` renders as
unknown rather than as zero or as a guess. Same treatment for the Bavarian formula's `nmin`, which
must come from anabin.

Personal data is gitignored (`profile.local.json`, `*.local.json`, `transcripts/`). A transcript
carries grades and failures; it doesn't go in a public repo, and git history is forever.

**Next:** fill per-course credits from the official transcript — the result page only publishes
semester totals — then Day 2 extraction.

## 2026-07-27 — Day 1b: all 15 seeds sourced, and the schema is already too small

Worked through every seed against official pages. 15/15 now have an admission URL, 6 have a statute
URL, and 6 admission pages were opened and read rather than trusted from a search snippet.

Corrections to yesterday's optimism, worth recording because both were plausible and wrong:

- **RWTH's 42 CP Auflagen ceiling and GRE percentile gate are NOT on the official admission page.**
  They came from a search summary. Marked UNVERIFIED until located in the MPO. The schema fields
  they justified stay, because other programs need them — but the *facts* don't get to be facts yet.
- **TUM's "70 points passes" is likewise not on the program page.** Same treatment.
- **KIT is two programs, not one**: German-taught Informatik M.Sc. (German C1) and English-taught
  Computer Science M.Sc. (INT). Seeding it as one entry would have been silently wrong.

### Four things the real pages do that the schema can't express yet

1. **Alternative requirement sets** (KIT INT). Primary: maths 25 / theory 15 / practical 30 /
   computer engineering 8. If unmet, admission is still possible when **at least 3 of 4** lower
   thresholds {20, 15, 20, 6} are met *plus* an aptitude interview. My schema has one requirement
   list, not a fallback ladder with a k-of-n rule.
2. **Requirements defined by reference to another curriculum** (TU Darmstadt). Not subject-area
   totals — ≥60 CP that "must not differ significantly" from TUD's own B.Sc. core courses, mapped
   course by course. This is course-level equivalence, which I'd deferred to v1.
3. **Nationality-dependent gates.** Freiburg's deadlines split EU vs non-EU (non-EU gets a window
   six weeks shorter). Konstanz's pass mark is 60 for Lisbon Convention countries and **80 for
   non-signatories**, with GRE/GMAT worth up to 20 points for the latter only. A deadline isn't
   per-intake; it's per-intake-per-applicant-group.
4. **Admission before graduation.** LMU and Hamburg both accept ~150 ECTS with a registered (not
   completed) thesis. The profile model assumed a finished degree.

None of these are edge cases — they're 5 of 15 programs. Fixing the schema before extracting beats
extracting into a shape that can't hold the answer.

### The variance is the product

Same country, same degree, same subject:

- **English B2** (TU Berlin, KIT INT) vs **English C1 / IELTS 7.0** (TU Dresden, Bonn, Stuttgart)
- **German C1 required** (KIT Informatik, Hamburg) — two "German MSc CS" programs most
  international applicants simply cannot enter, and nothing on an aggregator listing says so
- **Binary** (TU Dresden: accepted or rejected, no conditional admission) vs **points-based**
  (Konstanz, with a published 0–105 rubric)
- **Grade-triggered testing** (Würzburg: worse than 2.5 German scale → 30-minute oral exam)
- **Nationality-triggered testing** (TUM: GRE required for applicants from Bangladesh, China,
  India, Iran, Pakistan — minimum quantitative 164)

Also confirmed Würzburg is the actual source of the 100 / 25 / 10 ECTS example I'd written into
RESEARCH.md §3.7 as "representative". Good — it was real.

**Next:** schema v2 for the four gaps above, then Day 2 extraction on the 5 programs that have both
documents.

## 2026-07-27 — Day 1: schema + seeds

Scaffolded (TS strict, zod, typecheck green) and wrote [`src/schema.ts`](src/schema.ts) and
[`src/seeds.ts`](src/seeds.ts).

Every extracted value is wrapped in `Cited<T>` — value plus `{sourceType, sourceUrl, snippet,
section, lang, fetchedAt}`. There is no way to express a bare number in this schema, which is the
point. `snippetSupportsNumber()` is the deterministic anti-hallucination check: a numeric value must
literally appear in the snippet cited for it, with German decimal commas normalised.

Four real programs immediately justified fields I'd have called speculative yesterday:

- **TUM** — points-based Eignungsverfahren, **70+ points passes**. So `pointsPassMark` is real, not
  hypothetical.
- **RWTH** — **Auflagen ceiling of 42 CP**: more than that in additional requirements and admission
  is impossible. Also a GRE percentile gate (Quant >75th, Verbal >15th, AW ≥3.5) that **exempts
  EU/EEA and Bildungsinländer**. Confirms `auflagen.maxEcts` and `TestRequirement.exemptions`.
- **KIT** — Informatik M.Sc. requires **German C1**. A "German MSc CS" that most international
  applicants can't enter, and invisible on aggregator listings.
- **TU Dresden** — a dated Eignungsfeststellungsordnung PDF. Cleanest statute-tier source so far.

Seeds have an explicit `checked` state: `opened` / `found` / `todo`. **Nothing gets extracted below
`opened`.** Right now 7 of 15 have URLs surfaced by search and **0 are `opened`** — I found them,
I haven't verified them. Recording that honestly rather than letting a plausible URL masquerade as
a checked one; the entire product is a claim about provenance, so the seed list is where that claim
either starts or quietly dies.

Remaining 8 chosen for a spread of *mechanisms* — points vs binary, NC vs NC-free, English vs
German, uni-assist vs direct — not for ranking. The extractor has to survive variety, not prestige.

**Next:** open all 15 admission pages + statutes, flip them to `opened`, fix whatever the search
results got wrong. Then Day 2 extraction on 5.

## 2026-07-27 — The web page isn't the rule

Chased why ECTS requirements read as vague online. They aren't vague — the web page is a
**summary**. The binding text is the **Zulassungssatzung / Prüfungsordnung**: a formal statute,
usually a PDF, usually in German, amended between cycles. The precision was dropped in summarising,
not withheld.

So the source hierarchy is now enforced, not preferred: **statute > program page > FAQ**, every
field records which tier it came from, and extracting from a summary when a statute exists is a
defect. No aggregator reads the statutes. That's the depth advantage, and it was sitting one link
deeper the whole time.

Cost: **PDF ingestion comes back into week 1** (I'd cut it), and extraction has to work on German
legal text, not English marketing copy. Gemini Flash takes both natively, so it's attention, not
money. Playwright stays cut.

Also resolved the "surely there's a 10–20% tolerance on ECTS" intuition. There isn't a tolerance
band — the slack is real but lives in three declared places:

1. **Course-to-area classification** — the threshold is exact, what's soft is which of *your*
   courses count toward it. This is where a 95-vs-100 gap actually vanishes.
2. **Auflagen** — conditional admission with make-up coursework. Some universities offer it, others
   reject outright. Stated in the statute, so it's a field, not a guess.
3. **Points-based offsetting** — only where assessment is points-based, never where it's binary.

Explicitly refused to encode a blanket percentage tolerance. It appears in no source, can't be
cited, and errs in the dangerous direction — telling someone they're fine when the committee will
reject them.

*(Correction, same day: I first replaced it with a "near-miss band" — within 20% of an unmet
threshold renders as borderline. Cut that too. The question was about how real admission committees
behave, not a request for a feature, and I turned an answer into a spec. Committee judgement is
real but it isn't a percentage, and a UX cutoff dressed as a threshold is the same fabrication in a
smaller font. The app reports the gap and quotes the applicable mechanism —
`auflagenOffered`, `assessmentStyle`, course classification — and never softens the number.)*

Best sentence the product can emit, and it only exists because classification is modelled rather
than totalled:

> Your *Discrete Mathematics* (6 ECTS) is currently classified as CS fundamentals. If the committee
> counts it as maths/theory, you'd be 1 ECTS short instead of 7.

**Next:** Day 1 — 15 seeds with statute URLs, and the schema.

## 2026-07-27 — NC-frei doesn't mean easy, and MVP is a week

Researched the thing that was confusing me: if a German MSc CS program has no NC, on what basis is
anyone admitted or rejected?

**~79.5% of computing programs in Germany are NC-free.** For MSc CS, a grade cutoff usually isn't
the mechanism at all. NC-frei means *no ranked quota* — you're admitted if you meet the
subject-specific requirements. Those requirements are a **curricular analysis**: your transcript
decomposed by subject area against per-area ECTS minimums. A representative one is ≥100 ECTS in
CS+maths, of which ≥25 in maths/theoretical CS, plus a ≥10 ECTS thesis.

Two applicants with identical CGPAs get opposite outcomes, decided purely by transcript
composition. Aggregators show "MSc CS · NC-frei" and stop, which reads as *no barrier* and is worse
than showing nothing.

Two consequences that changed the data model on day zero:

- **Profile is not a CGPA.** It's an ECTS breakdown by subject area.
- **Schema carries `{area, minEcts}` rules**, not `ects_required: 180`.

Also learned programs split into **points-based** (shortfalls can offset) vs **binary** (hard
gates) assessment, which changes what "borderline" even means. That's now an extracted field.

Decided the dMAT/CS question by **assumption rather than waiting**: counting CS under Engineering,
so dMAT applies from SS2027. It's the conservative direction — preparing for a test I might not
need beats missing one I did. It renders in the UI as an assumption with its own citation, not as a
fact, until APS India confirms.

**Locked Germany-only** and set a **7-day MVP**: 15 programs, end-to-end answer for my own profile
with citations. Cutting Playwright, PDFs, the cron, Promptfoo, and the eval harness out of week 1
entirely. Accuracy is the constraint, program count is the variable — if the schema doesn't survive
real pages on day 2, the list shrinks, not the standard.

## 2026-07-27 — Country rules are a separate layer

Wrote [RESEARCH.md](RESEARCH.md) on the German pipeline. The finding that reshaped the design:

A program page saying *"180 ECTS in Computer Science"* is meaningless alone. Whether you satisfy it
depends on things that are nowhere on that page — is your university H+ in anabin, do you need APS,
how does 8.4/10 convert (Modified Bavarian Formula, and the scale bounds come from anabin, not your
transcript), does dMAT apply, do you apply direct or via uni-assist.

So: **two layers.** Country rules are hand-curated, versioned, dated, cited — ~10 per country,
high-stakes, publicly announced, and an LLM only helps *research* them, never *decides* one at
runtime. Program requirements are LLM-extracted, because there are hundreds of fields and they
change silently.

Consequence I like: **deadlines get back-solved.** Program deadline minus uni-assist processing
minus APS lead time (3 weeks, up to 3 months in peak season) minus a dMAT test date where it
applies. Showing the raw deadline shows one you'll miss.

dMAT is the proof the rules layer must be versioned: it did not exist a year ago, applies from
Summer 2027 intake only, and covers some fields and not others. Open question I couldn't close —
whether **Computer Science** counts as a notified field. Sources name engineering and
business/commerce families; CS isn't listed explicitly. Highest-value unknown in the doc, and the
whole v1 corridor depends on it.

Also narrowed scope: **Germany only**, dropped the Netherlands. The country layer doesn't transfer,
so "Europe" would have meant two rules packs before proving one.

Not building observability or eval infra — Langfuse for traces, Promptfoo for extraction-prompt
evals. Own tooling only for the statistical gating layer neither ships, and only once accuracy is
real enough to gate.

**Next:** verify the CS/dMAT question at the official APS source, then the 40-program seed list.

## 2026-07-27 — Plan

Wrote [PLAN.md](PLAN.md). Nothing built yet.

Two decisions that shape everything downstream:

**The LLM extracts, code decides.** No model is ever asked "is this person eligible?" It reads a
page and fills a strict struct; a plain TypeScript comparison does the matching. Extraction is a
language problem, matching is a logic problem, and fusing them is how you get a confident wrong
answer. A wrong "eligible" costs someone an application fee and a cycle.

**Every field carries its source snippet, URL, and fetch date** — and a deterministic verify step
rejects any field whose cited snippet doesn't actually contain the claimed value. That check is
free and it kills the hallucination path that matters most.

Scope is deliberately narrow: MS CS, Germany + Netherlands, ~40 programs. Forty accurate cited
programs beats two thousand at 60%. It's also the corridor I'm applying to, so my own use is the QA
loop.

Stack is chosen to avoid building infrastructure: Jina Reader for page→text, Gemini Flash with
schema output for extraction, SQLite plus JSON snapshots committed to git (a diff shows when a
university changed its requirements — free version history and a content stream), GitHub Actions
cron as the scheduler, no accounts so GRE and CGPA never leave the browser.

**Next:** seed list of 40 programs with hand-checked requirement URLs, then run fetch + extract on
5 of them to see whether the schema survives contact with real pages. Expecting it not to.
