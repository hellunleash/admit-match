# admit-match

Real-time eligibility matching for grad programs. Every requirement cited to its source page, with
the date it was fetched.

**Status: planning.** Nothing built yet. See [PLAN.md](PLAN.md) for the design, and
[LOG.md](LOG.md) for the build log — I'm building this in public, failures included.

## Why

Existing tools (Mastersportal, DAAD, university aggregators) tell you what programs exist. They
don't tell you which ones *you* qualify for, and their data is often a cycle out of date. The
alternative is paying a consultant several hundred euros to read admission pages for you.

The requirements are public. They're just scattered across PDFs, JS-rendered tabs, and pages three
links deep, in inconsistent formats, and they change every intake cycle.

## What it does

Give it your profile (degree, ECTS, CGPA, GRE). It returns programs as **eligible / borderline /
ineligible**, with the specific blocking requirement and a citation for every claim:

> **Eligible** — 180 ECTS required, you have 186.
> *Source: tum.de/… · "Applicants must hold a degree comprising at least 180 ECTS" · verified 2026-07-24*

## Design rules

- **The LLM extracts, code decides.** No model is ever asked whether you're eligible — it fills a
  strict struct, and plain TypeScript does the matching.
- **Every field carries provenance.** Source URL, exact snippet, fetch date. A field whose snippet
  doesn't contain its claimed value is rejected before it reaches you.
- **Ambiguity is surfaced, not guessed.** "Strong background in mathematics" has no numeric answer,
  so you get the snippet and make the call.
- **No accounts.** Your CGPA and GRE stay in your browser.
- **Accuracy is a published number**, not a claim. Measured against a hand-verified golden set.

## Scope

**MS in Computer Science · Germany only.** Depth over breadth — the goal is to model the German
pipeline more precisely than anything else available, not to cover every country badly.

Germany's rules don't transfer: anabin recognition, APS, dMAT, the Modified Bavarian Formula and
uni-assist routing are German facts. A second country means a second rules pack, and that's
deferred until Germany is genuinely the best resource that exists.

### Why "NC-frei" is the interesting part

Around 80% of German computing programs have no Numerus Clausus. That does **not** mean no barrier
— it means the grade cutoff isn't the mechanism. Admission turns on a *curricular analysis*: your
transcript decomposed by subject area against per-area ECTS minimums (e.g. ≥100 ECTS in CS and
maths, of which ≥25 in maths/theoretical CS, plus a ≥10 ECTS thesis).

Two applicants with identical CGPAs get opposite outcomes. Aggregator sites show "MSc CS · NC-frei"
and stop, which reads as *no requirements*. This tool tells you which credits you're short and
quotes the line that says so.

## Caveats

Requirements are necessary conditions, not sufficient ones. This tool does not predict admission,
and it is not a substitute for reading the official page before you apply. Crawling respects
robots.txt, is rate-limited, and touches official university domains only.

## License

MIT
