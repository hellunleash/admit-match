# admit-match — Plan

Real-time eligibility matching for grad programs. Every requirement cited to its source page,
with the date it was fetched.

Status: **planning**. Built in public — see [LOG.md](LOG.md).

---

## 1. The problem

Deciding where to apply means answering one question per program: *given my CGPA, GRE, degree, and
the specific courses I've taken, am I actually eligible?* Today you either pay a consultant several
hundred euros to answer it, or you use a database (Mastersportal, DAAD, Yocket) that lists programs
without matching them to your profile — and whose data is often a cycle out of date.

The requirements themselves are public. They're just scattered across PDFs, JS-rendered tabs, and
pages three links deep, in inconsistent formats, and they change every intake cycle.

So: **existing tools tell you what programs exist. This tells you which ones you qualify for, and
shows you the source line for every claim.**

## 2. The one architectural rule

**The LLM extracts. Code decides.**

The model's only job is to read a page and emit a strict struct:

```ts
{ ects_required: 180, min_cgpa: 3.0, gre_required: false, deadline: "2026-01-15", ... }
```

Eligibility is then evaluated in plain deterministic TypeScript comparing that struct to the user's
profile. No LLM is ever asked "is this person eligible?"

Extraction is a language problem; matching is a logic problem. Fusing them produces confident wrong
answers, and a wrong "you're eligible" costs someone an application fee and a cycle.

**Corollary — every extracted field carries provenance.** Source URL, the exact snippet it came
from, and a fetch timestamp. The output is never "you're eligible." It is:

> Eligible — 180 ECTS required, you have 186. *Source: [tum.de/…] · "Applicants must hold a degree
> comprising at least 180 ECTS" · verified 2026-07-24.*

That verifiability is the entire reason to trust this over a consultant, and it's the thing static
databases structurally cannot offer.

## 3. Scope: one corridor, deep

Not "universities." **MS in Computer Science, Germany + Netherlands, ~40 programs.**

Forty programs with accurate, cited, current requirements is a usable product. Two thousand
programs at 60% accuracy is the stale database this replaces. Depth is the differentiator.

The corridor is the one I'm personally applying to, so my own use is the QA loop.

Expansion (new country, new field) is a data problem once the pipeline works, not a rebuild. It is
explicitly deferred until v1 is accurate.

## 4. Stack

Principle: **do not build infrastructure that already exists and works for free or near-free.**
Every row below is either a free tier or fractions of a cent per run.

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (Node 22+) | Existing fluency; Playwright and the LLM SDKs are first-class. Velocity beats theoretical fit. |
| Fetch (static) | **undici** / native fetch | Most university pages are server-rendered HTML. Don't launch a browser when a GET works. |
| Fetch (JS-rendered) | **Playwright** | Only for pages that genuinely need it. Local, free, no service. |
| Page → clean text | **Jina Reader** (`r.jina.ai`) first, Playwright fallback | Free hosted URL→markdown. Skips writing a boilerplate stripper. Fall back locally when it fails or rate-limits. |
| PDFs | **Gemini native PDF input** | Requirements live in PDFs constantly. Multimodal ingestion beats a parse-then-hope pipeline, and it's already in the extraction budget. |
| Extraction LLM | **Gemini 2.5 Flash**, structured output via `responseSchema` | Cheap, long context, native PDF, schema-enforced JSON. Escalate to a stronger model only on low-confidence rows. |
| Storage | **SQLite** (better-sqlite3) for queries + **JSON snapshots committed to git** | Zero infra. Git gives free version history — a diff literally shows when a university changed its requirements. That diff is a product feature and a content stream. |
| Scheduled recrawl | **GitHub Actions cron** | Free scheduler. Opens a PR with the updated JSON; the diff is the changelog. No queue, no worker, no cron server. |
| UI | **Next.js on Vercel** free tier | Known stack. Static-ish, one page. |
| Profile storage | **localStorage / URL params — no accounts in v1** | No auth, no database, no privacy surface. GRE and CGPA never leave the browser. Biggest scope cut available and it also happens to be the ethical default. |
| Observability | **Langfuse** free tier | Traces extraction calls, cost, failures. Not building this. |
| Extraction QA | **golden set + promptfoo**, later [llm-eval-harness](https://github.com/hellunleash/llm-eval-harness) | Accuracy must be a measured number, not a vibe. |

### Explicitly NOT built

Crawler framework, job queue, auth, user database, hosted scheduler, boilerplate stripper, PDF
parser, admin UI. Every one of these has a free tool or is unnecessary at this scope.

### Cost

~40 programs × a handful of pages each, Gemini Flash with schema output: **cents per full
recrawl.** Recrawls are weekly. Cost is a rounding error and is not a design constraint — accuracy
is.

## 5. Pipeline

```
seed list (40 programs, hand-curated URLs)
      │
      ▼
  discover ── find the requirements/admission pages (bounded link-following, allowlisted domains)
      │
      ▼
   fetch  ── undici → Jina Reader → Playwright fallback; PDFs passed through as-is
      │
      ▼
  extract ── Gemini Flash + strict schema; each field emits {value, snippet, sourceUrl, confidence}
      │
      ▼
  verify  ── deterministic checks: units sane, dates parseable, values in range,
             snippet actually contains the value. Fails go to a review queue, not to users.
      │
      ▼
  snapshot ── write JSON to git + SQLite; timestamp everything
      │
      ▼
   match  ── plain TS: profile × requirements → eligible / borderline / ineligible + reasons
```

The **verify** step is what keeps hallucinated numbers out. If the model claims `min_cgpa: 3.0` but
the cited snippet doesn't contain "3.0", the field is rejected. Cheap, deterministic, catches the
failure mode that matters most.

Seeds are hand-curated. Auto-discovering universities is a v2 problem and a great way to spend
three weeks producing noise.

## 6. Match output

Three states, never a single score:

- **Eligible** — every hard requirement satisfied, each with its citation
- **Borderline** — a soft or ambiguous requirement (e.g. "strong background in mathematics"), shown
  with the snippet so the human judges
- **Ineligible** — with the *specific* blocking requirement and its source

Plus, per program: what's missing, what's unverified, and when the data was last checked. A stale
row says so instead of quietly pretending to be current.

Ambiguity is surfaced, never resolved by guessing. "Strong background in mathematics" has no
numeric answer, and inventing one is exactly the failure this project exists to avoid.

## 7. Accuracy, measured

Hand-verify 30 programs — read the pages myself, record the true values. That's the golden set.

Reported metrics, published in the README and updated as they move:

- **Field-level extraction accuracy** (per field type — ECTS, CGPA, GRE, deadline)
- **Hallucination rate** — fields whose cited snippet doesn't support the value
- **Coverage** — fields found vs fields that exist on the page
- **Staleness** — age distribution of the snapshot

Publishing an honest 82% beats claiming an unmeasured 99%, and the failure analysis is the most
interesting thing to write about while building in public.

## 8. Roadmap

**Phase 0** — repo, LOG.md, seed list of 40 programs with hand-checked requirement URLs.
**Phase 1** — fetch + extract + verify for 5 programs. Prove the schema survives real pages.
**Phase 2** — deterministic match engine + CLI. First end-to-end answer for my own profile.
**Phase 3** — all 40 programs, golden set, published accuracy numbers.
**Phase 4** — Next.js UI with citations and fetch dates. Demo GIF in the README.
**Phase 5** — GitHub Actions weekly recrawl; requirement-change diffs as a changelog.
**Later** — second corridor, ambiguity-clarification chat, deadline reminders.

## 9. Ethics and politeness

- Respect `robots.txt`. Rate-limit hard. Cache aggressively; never re-fetch what hasn't changed.
- Domain allowlist — only official university domains, no aggregators.
- Public information only. No accounts, no personal data stored server-side, no scraping behind
  logins.
- The tool advises; it never tells someone they will or won't be admitted. Requirements are
  necessary conditions, not sufficient ones, and the UI says so.

## 10. Open questions

- **Ambiguous requirements** — how much to surface vs. how much to normalize. Leaning: surface
  everything, normalize nothing, until the golden set shows a pattern worth encoding.
- **Course-level prerequisites** ("must have completed a course in algorithms") need transcript
  parsing. Deferred — v1 matches on aggregate signals (ECTS, CGPA, degree, GRE).
- **Change detection granularity** — diffing raw pages is noisy; diffing extracted structs is clean
  but misses what the extractor doesn't capture. Probably both, with the struct diff as the alert.
