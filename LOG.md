# Build log

Dated entries. Decisions, dead ends, and numbers — including the bad ones.
Newest at the top.

Format: date, what changed, what I learned, what's next. Short is fine. Skipping a week is fine.
Rewriting history to look smarter is not.

---

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
