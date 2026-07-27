# Build log

Dated entries. Decisions, dead ends, and numbers — including the bad ones.
Newest at the top.

Format: date, what changed, what I learned, what's next. Short is fine. Skipping a week is fine.
Rewriting history to look smarter is not.

---

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
