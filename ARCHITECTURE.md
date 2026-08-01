# Architecture

What the pipeline should be, layer by layer — and why the current one is wrong in two places.

Status: design. Supersedes the pipeline sketch in [PLAN.md](PLAN.md) §5 and the match model in
[RESEARCH.md](RESEARCH.md) §3.7.

---

## The two mistakes

**1. We scrape what should be looked up.** Every run rediscovers programs from hand-curated URLs and
re-reads program pages. But Germany already maintains authoritative registries of who exists, and
every university already publishes its statutes as a dated, numbered gazette series. Scraping a
marketing page to learn a rule that was formally published in an *Amtliche Bekanntmachung* is doing
archaeology on a document that has a canonical address.

**2. We treat ECTS as a gate.** It isn't one. Under the Lisbon standard a committee weighs
*substantial difference*; nobody is auto-rejected for being 7 ECTS short of a guideline. A tool that
prints "ineligible" on a credit count is both wrong about the law and useless as advice — it hides
the programs worth arguing for.

---

## Layers

### L1 — Registry: who exists

**Now:** 15 hand-written seeds. **Should be:** a real registry, refreshed rarely.

| Source | What it gives | Access |
|---|---|---|
| **Hochschulkompass** (HRK) | 19,000+ programmes, all state-recognised German HEIs. Maintained *by the universities themselves*, so it is as authoritative as a directory gets. | No public API; HRK provides **data exports to collaborative partners**. Ask. |
| **DAAD International Programmes** | Internationally oriented / English-taught programmes specifically — exactly our corridor. Now surfaced via My GUIDE. | No public API found; ask DAAD. |
| **DEQAR** (EQAR) | Accredited programmes across the EHEA, with QA reports and decisions. **Has a documented API** (docs.deqar.eu) built to be fed live. | Public API. Free. |

**Correction (verified 2026-07-29): DEQAR cannot be the German programme registry.** German
institutions may hold *Systemakkreditierung*, under which the institution self-accredits its own
programmes — and those programmes are then **not listed individually** in DEQAR, only the
institution's system accreditation. TU Dresden, TUM, RWTH and KIT are precisely that case, so a
DEQAR-driven registry would return their institutions and none of their programmes. Programme
accreditation (and therefore individual DEQAR records) is the obligatory route only for institutions
*without* system accreditation — disproportionately Fachhochschulen.

So the order is:

1. **Hochschulkompass — primary.** It is the only source that is complete by construction: every
   state-recognised HEI, every programme, entered by the universities themselves. No public API, so
   **write to HRK for a partner data export**. That single email replaces the whole discovery layer.
2. **DAAD International Programmes — secondary.** English-taught subset, which is most of our
   corridor, and useful for cross-checking Hochschulkompass coverage.
3. **DEQAR — accreditation status only**, not discovery. Genuinely useful for confirming a
   programme-accredited FH is in good standing, and it has the only real API of the three.

Until an export arrives, seeds stay hand-curated — which is fine at 40 programmes and honest about
what it is.

Registry data changes on the order of an intake cycle. Refresh monthly at most.

### L2 — Statutes: what the rules are

**This is the biggest available win, and we're not using it.**

Every German university publishes binding rules in an official gazette — *Amtliche Bekanntmachungen*
/ *Amtliche Mitteilungen* — as **dated, numbered PDFs in a stable archive**: `2022-050.pdf`,
`04_2021 Zweite Satzung zur Änderung…pdf`. RWTH keeps expired versions online. Stuttgart offers a
**mailing list for new announcements**.

So the statute layer should be:

1. Resolve each programme once to its **gazette series**, not to a marketing page.
2. Poll the gazette **index** (cheap HTML), not the documents.
3. The gazette number *is* the version key. A new number is the only reason to fetch a PDF.
4. Subscribe to the announcement mailing list where one exists — push instead of poll.

A *Änderungssatzung* (amending statute) is a first-class object: rules change by amendment, and the
current rule is a base statute plus its amendments. Reading only the newest PDF gets you a diff and
not the rule. This is also why "extract the current page" was always fragile — the page is a summary
of a document set, and the document set is public and versioned.

**Consequence:** in steady state we fetch almost nothing and extract almost nothing. Today's cost is
dominated by re-reading unchanged 700 KB PDFs; with gazette tracking, an unchanged programme costs
one conditional GET on an index page.

### L3 — Fetch: cheap and polite

Already decent (disk cache, 14-day TTL, allowlist). Missing:

- **Conditional GET** — send `If-None-Match` / `If-Modified-Since`, honour `304 Not Modified`. Free,
  and it makes refresh nearly costless.
- **`sitemap.xml`** for `lastmod` hints before fetching anything.
- **Wayback CDX API** to recover a statute version that a university has replaced — useful when a
  requirement changes mid-cycle and an applicant needs the rule as it stood.

### L4 — Extraction: mostly right, wrongly triggered

The extractor itself is fine — native PDF, snippet-verified, cited, per-requirement provenance. What
is wrong is *when* it runs. Bound to gazette numbers rather than to "the user typed --all", it runs
once per document version, ever.

Two additions worth making:
- **Amendment-aware extraction**: extract the base statute, then apply amendments in order, keeping
  each rule's own citation.
- **Golden set** (still the blocking gap): 30 hand-verified fields, so model or prompt changes are
  measured rather than eyeballed. This is what makes a Flash-Lite or GPT-5-nano swap decidable.

### L5 — Storage

JSON snapshots in git stay: diffable, free version history, and a requirement change shows up as a
one-line PR diff. Add a derived SQLite index for query speed once the corpus is >100 programmes.

### L6 — Matching: see below. This changes the most.

### L7 — Serving

Static site plus JSON. No accounts; the profile stays in the browser. Unchanged.

---

## The new match model: gates and overlap

**Only hard, stated, binary rules can produce "no".** Everything else is a score with an explanation.

### Gates (can produce a "no", each with a citation)

| Gate | Source of truth |
|---|---|
| Admission restricted (NC) and the applicant is below a **stated** cutoff | `admissionRestricted`, `minGermanGrade` |
| Language level not met (and no accepted evidence route) | `language.acceptedEvidence` |
| Required test missing where it applies to this applicant group | `tests` + `ApplicantGroup` (GRE, dMAT) |
| Degree status inadmissible (e.g. completion required, applicant mid-degree) | `degreeInProgress` |
| Deadline already passed for the target intake, after back-solving APS/uni-assist lead time | `deadlines` + rules pack |
| Language of instruction the applicant cannot meet (German-taught) | `taughtIn` |

A gate fails only on something the source **states**. An unstated rule is never a gate — silence is
a finding, not a rejection.

### Overlap (never produces a "no")

Curricular fit is a **score with an explanation**, because that is how it is actually decided:

```
requirementCoverage = min(matchedCredits, requiredCredits) / requiredCredits
programOverlap      = Σ(requiredCredits × coverage) / Σ(requiredCredits)
```

Reported per requirement and overall, **strict and generous** (see RESEARCH.md §3.7), with:

- which courses matched, and how much each contributed
- which requirement is the biggest shortfall, in credits
- the swing courses whose classification would move the number
- the statute line for the requirement itself

So a result reads:

> **TU Dresden — Nanoelectronic Systems** · gates: passed · overlap **72–81%**
> Systems & Infrastructure 35/35 ✓ (microprocessor architecture, digital & analog electronics)
> Foundations & Theory 24/35 — short 11 (maths I & II, computational methods, mathematical physics)
> Software Development 8/20 — short 12 (programming fundamentals, intro to computing)
> Swing: *Computational Methods* (4 cr) could count as foundations or software development.

Nobody is told "ineligible" for that. They are told exactly what is thin and by how much — which is
what lets them decide whether to apply, argue it, or fix it with an elective.

### Ranking

Shortlist = gates passed, ordered by overlap, with the shortfall shown. Programmes failing a gate go
to a separate list with the *specific* gate and its citation — because "you need German C1" is
actionable and "ineligible" is not.

---

## What to build in order

1. **Gates + overlap scoring** — the match model above. Biggest product change, no new infrastructure.
2. **Gazette tracking (L2)** for the hardware/AI corridor — kills the recurring fetch/extract cost.
3. **Registry (L1)** — request the Hochschulkompass export; DAAD as secondary; DEQAR for
   accreditation status only.
4. **Conditional GET + sitemap (L3)** — small, cheap, compounding.
5. **Golden set (L4)** — unblocks model choice and drift detection.

## Where things are stored, and what is never stored

| Thing | Source | Stored? | Where |
|---|---|---|---|
| Programme list | Hochschulkompass export / DAAD | yes, as data | `src/seeds.ts` → later a data file |
| Statute PDFs | University gazette (no API exists for these) | yes, cached bytes | `.cache/docs/` — gitignored, 14-day TTL |
| Extracted requirements | our extractor | yes, committed | `snapshots/*.json` — the diff is the changelog |
| Extraction provenance | our extractor | yes, committed | `snapshots/*.meta.json` |
| Applicant transcript | the user | **never leaves the machine** | `profile.local.json` — gitignored |
| Module descriptions | Modulhandbuch | local only | `modules.local.json` — gitignored |
| Match results | computed | not stored | derived on demand |

Nobody serves German statutes over an API. They are PDFs in university gazettes, which is exactly
why fetching them is version-tracked rather than live: fetch once per gazette number, extract once,
commit the result, and every later run reads the snapshot.

Deferred: amendment chains, Wayback recovery, SQLite index, second country.
