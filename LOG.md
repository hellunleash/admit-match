# Build log

Dated entries. Decisions, dead ends, and numbers — including the bad ones.
Newest at the top.

Format: date, what changed, what I learned, what's next. Short is fine. Skipping a week is fine.
Rewriting history to look smarter is not.

---

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
