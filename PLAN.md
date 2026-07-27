# admit-match — Plan

Real-time eligibility matching for grad programs. Every requirement cited to its source page,
with the date it was fetched.

Status: **planning**. Built in public — see [LOG.md](LOG.md).
Country-rule research (Germany, in depth): [RESEARCH.md](RESEARCH.md).

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

Not "universities." **Germany only. Field: the hardware/AI intersection**, not computer science —
embedded and edge AI, AI accelerators and VLSI, microelectronics and nanoelectronics, electrical
engineering and information technology with an ML specialisation, communications and signal
processing.

Chosen because that's where the applicant profile actually sits (semiconductor devices, compact
modelling, chiplets packaging, microprocessor architecture, digital and analog electronics,
communication systems) and because those programs' curricular analyses ask for exactly that
background. A pure MSc CS asks for 100+ ECTS of computer science and maths, which an Engineering
Physics degree does not have and cannot acquire retroactively.

~40 programs. The 15 MSc CS seeds in `src/seeds.ts` were the wrong corridor and are being replaced;
they stay only as extractor test fixtures, since the pipeline is field-agnostic and their statutes
are already cached.

Forty programs with accurate, cited, current requirements is a usable product. Two thousand
programs at 60% accuracy is the stale database this replaces. Depth is the differentiator — the
goal is that no other product models the German pipeline this precisely.

Germany specifically, and not "Europe," because the country layer is not shared: anabin recognition,
APS, dMAT, the Modified Bavarian Formula and uni-assist routing are German facts that do not
transfer to the Netherlands, let alone the US. See [RESEARCH.md](RESEARCH.md).

The corridor is the one I'm personally applying to, so my own use is the QA loop.

A second country is a new rules pack plus new seeds once the pipeline works — not a rebuild, but
explicitly deferred until Germany is accurate.

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
| Observability | **Langfuse** free tier | Traces every extraction call — cost, latency, failures, prompt version. Not building our own tracer. |
| Prompt eval + optimisation | **Promptfoo** | Extraction-prompt matrices, model comparison, CI regression runs against the golden set. MIT, and the default for this in 2026. |
| Statistical gating | later: [llm-eval-harness](https://github.com/hellunleash/llm-eval-harness) | The thin layer neither Langfuse nor Promptfoo ships — noise-floor calibration and variance-corrected thresholds, so accuracy gates don't false-alarm. Only once extraction accuracy is real enough to gate. |

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
  discover ── find the admission page AND the binding Zulassungssatzung /
             Prüfungsordnung PDF (bounded link-following, allowlisted domains)
      │
      ▼
   fetch  ── undici → Jina Reader → Playwright fallback; statute PDFs passed to
             Gemini as-is (German-language legal text is expected, not an edge case)
      │
      ▼
  extract ── Gemini Flash + strict schema; each field emits
             {value, snippet, sourceUrl, sourceType, confidence}
      │
      ▼
  verify  ── deterministic checks: units sane, dates parseable, values in range,
             snippet actually contains the value. Fails go to a review queue, not to users.
      │
      ▼
  snapshot ── write JSON to git + SQLite; timestamp everything
      │
      ▼
   match  ── plain TS: profile × requirements × COUNTRY RULES PACK
             → eligible / borderline / ineligible + reasons + effective deadline
```

**The rules pack is the second input to matching, and it is not extracted.** A program page says
"180 ECTS" and assumes everything else: whether your institution is recognised (anabin), whether
your degree must be verified (APS), how your CGPA converts (Modified Bavarian Formula, using scale
bounds from anabin rather than your transcript), whether a new aptitude test applies (dMAT), and
whether you apply direct or through uni-assist. None of that is on the page.

So country rules are **hand-curated, versioned, dated, and cited in git** — roughly ten per country,
high-stakes, publicly announced. An LLM assists the research; it never decides a rule at runtime.
Program requirements are the opposite: many, messy, silently changing, and therefore extracted.

One consequence worth naming: deadlines are **back-solved, not displayed**. The effective personal
deadline is the program deadline minus uni-assist processing, minus APS lead time (3 weeks to 3
months), minus a dMAT test date where it applies. Showing a raw deadline shows one the user will
miss.

The **verify** step is what keeps hallucinated numbers out. If the model claims `min_cgpa: 3.0` but
the cited snippet doesn't contain "3.0", the field is rejected. Cheap, deterministic, catches the
failure mode that matters most.

**Source hierarchy is enforced, not preferred.** Statute (`satzung`) beats program page beats FAQ,
every field records which tier it came from, and extracting from a summary page when a statute
exists is a defect. Web pages are summaries; the binding text is the Zulassungssatzung, and that's
where the precision that looks "vague" online actually lives. See RESEARCH.md §3.7.

Seeds are hand-curated. Auto-discovering universities is a v2 problem and a great way to spend
three weeks producing noise.

## 6. Match output

**The profile is not just a CGPA.** For German MSc CS, most programs are NC-free and admission
turns on transcript *composition*, not grade rank — per-area ECTS minimums (e.g. ≥100 ECTS in
CS+maths, of which ≥25 in maths/theoretical CS, plus a ≥10 ECTS thesis), assessed through an
*Eignungsfeststellungsverfahren*. See RESEARCH.md §3.7.

So the profile input is an **ECTS breakdown by subject area**, and the extraction schema carries a
list of `{area, minEcts}` rules rather than a single number. This is the difference between a tool
that works and one that reports "NC-frei" as though it meant "no requirements."

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

### MVP: 7 days, Germany only

Target: **a working end-to-end answer for my own profile across 15 programs**, with citations.
Fifteen, not forty — forty is the v1 target, fifteen is what fits a week without cutting accuracy.

| Day | Deliverable | Explicitly not doing |
|---|---|---|
| 1 | Seed list: 15 German MSc CS programs — admission page **and Zulassungssatzung URL** hand-checked for each. Extraction schema with per-area ECTS rules, `assessmentStyle`, `auflagenOffered`, `sourceType`. | Auto-discovery of programs |
| 2 | Fetch (undici → Jina Reader) + Gemini Flash extraction on 5 programs, **statute PDFs included, German text expected**. Langfuse wired. | Playwright |
| 3 | Verify step (snippet must contain the value) + source-tier enforcement + JSON snapshot to git. | Review-queue UI |
| 4 | Germany rules pack: anabin status, Bavarian formula, APS, dMAT, uni-assist. Deterministic match engine. | Any second country |
| 5 | CLI end-to-end: my profile → eligible/borderline/ineligible with reasons + back-solved deadlines. Hand-verify 10 programs, publish accuracy. | Promptfoo suite |
| 6 | Minimal Next.js page: profile form → results with citations and fetch dates. | Auth, accounts, styling polish |
| 7 | Remaining programs to 15, README demo GIF, LOG entry with real numbers. | Weekly cron |

**Week-1 cuts, deliberate:** no Playwright (skip pages that need it, log them), no GitHub Actions
cron, no Promptfoo, no `llm-eval-harness`. All of those are v1, not MVP.

**PDF ingestion is NOT cut**, despite being an obvious week-1 candidate. The binding requirements
live in Zulassungssatzung PDFs, frequently in German — extracting only from English summary pages
would produce exactly the vague, uncitable output this project exists to replace. Gemini Flash
takes both natively, so the cost is attention, not money.

If day 2 shows the schema doesn't survive real pages, the schema changes and the seed list shrinks.
Accuracy is the constraint; program count is the variable.

### After the MVP

**v1** — 40 programs, Playwright + PDF ingestion, hand-verified golden set with published
per-field accuracy, Promptfoo extraction evals, GitHub Actions weekly recrawl with struct-diff
changelogs.
**Phase 2** — language requirements in depth (per-band IELTS minimums, English-medium waivers, A1/A2
German for enrolment or visa), course-level prerequisites from a parsed transcript.
**Phase 3** — decision factors beyond eligibility (see RESEARCH.md §7).
**Deferred indefinitely** — second country. Germany only until Germany is genuinely the best
resource that exists.

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
