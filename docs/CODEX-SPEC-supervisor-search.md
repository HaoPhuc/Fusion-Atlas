# Implementation spec: fewer duplicates, "new since last search", supervision levels

Audience: a coding agent (Codex) working in this repository. Implement the three features below in the order given, one commit per feature, keeping every existing test green.

## Ground rules

- Read `AGENTS.md` first. This is Next.js 16.4 with breaking changes; consult `node_modules/next/dist/docs/` before touching anything under `app/`.
- The app's core principle is **evidence, not inference**. Never silently merge people when the evidence is ambiguous; never present missing data as a negative signal. Every new label must say what it is based on.
- All persisted formats must stay backward compatible: old `localStorage` values, old session exports (`sessionSchema`, `version: 1`) and old shortlist backups must still load. New fields are optional or have zod defaults.
- No new runtime dependencies. No network calls beyond the existing providers.
- Validation before each commit:
  ```sh
  npm test
  npm run typecheck
  npm run build
  npm run format:check
  ```
- Update `README.md` (the relevant sections) and `docs/VALIDATION.md` for each feature, in the same plain, hedged style they use now.

## Code map (what exists today)

| Area                                      | Location                                                                                                                                                                                                                             | Notes                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work dedup                                | `lib/research.ts` `mergeWorks` (~L158)                                                                                                                                                                                               | Exact DOI / provider identifier only. Title alone never merges. Keep that.                                                                                                         |
| Author merge inside one work              | `lib/research.ts` `mergeAuthors` (~L122)                                                                                                                                                                                             |                                                                                                                                                                                    |
| Person grouping                           | `lib/research.ts` `personKey` (~L251), `peopleFrom` (~L265)                                                                                                                                                                          | Key = ORCID → OpenAlex `id` → `externalId` → `unverified:<name>:<sorted institution set or work id>`. ORCID is bridged to `id`/`externalId` via the `orcids` map.                  |
| Contact identity matching                 | `lib/matching.ts` `contactIdentity` / `sameContact` (~L94–132)                                                                                                                                                                       | Initial-aware name comparison + shared institution. Only used for feedback today.                                                                                                  |
| Ranking                                   | `lib/matching.ts` `rankCandidates` (~L281), `contactCandidates` (~L570), `recommendationGroups` (~L545)                                                                                                                              | `groupKey` ~L514. Fit thresholds `>= 40` / `>= 18`.                                                                                                                                |
| Profile / feedback / verification schemas | `lib/matching.ts` L20–144                                                                                                                                                                                                            | Persisted at `localStorage["fusion-atlas-matching-v2"]`. `studentProfileSchema.degree` is free text, default `"Undergraduate"`. Verification evidence has `kind: "undergraduate"`. |
| Session + shortlist schemas               | `lib/session.ts`                                                                                                                                                                                                                     | Shortlist persisted at `localStorage["fusion-atlas-shortlist"]`.                                                                                                                   |
| Thesis types                              | HAL `lib/repositories.ts` (THESE/HDR/MEM mapping), theses.fr (always doctoral), OpenAIRE (`instances[].type`), DataCite `lib/providers.ts` ~L112 (stores only `resourceTypeGeneral \|\| resourceType`), OpenAlex `type:dissertation` |                                                                                                                                                                                    |
| OpenAIRE thesis filter                    | `lib/providers.ts` ~L390                                                                                                                                                                                                             | `instance_type:Doctoral thesis\|Master thesis\|Thesis`                                                                                                                             |
| Person lookups by key                     | `app/page.tsx` L257, 306–313, 342, 357, 672, 755, 773, 1437–1529, 1889–1944; `lib/matching.ts` L297–352, 422, 593–601; `lib/regions.ts` L176–187; `app/components/region-results.tsx` L52, 73                                        | All compare `p.key` / `personKey` with `===`.                                                                                                                                      |
| Tests                                     | `tests/*.test.ts`, `node:test` + `assert/strict`, fixture helper `work()` in `tests/research.test.ts`                                                                                                                                |                                                                                                                                                                                    |

---

## Feature 1 — Cross-source identity resolution (fewer duplicate people)

### Problem

1. A person with no ORCID appears as several people: one keyed by OpenAlex ID, one by `idhal:`/`idref:` external ID, and one or more `unverified:` entries from Crossref/arXiv/OpenAIRE where only a name exists.
2. The `unverified:` key uses the **whole sorted institution set**, so the same name at "TU/e" and at "TU/e + DIFFER" becomes two people.
3. `sameContact`'s initial-aware name logic ("J. Smith" vs "Jan Smith") is not used when grouping.

### Design

Create `lib/identity.ts` and make `peopleFrom` use it.

**1. Name compatibility helper.** Move the name logic out of `sameContact` into an exported `namesCompatible(a: string, b: string): boolean` in `lib/identity.ts`, and have `sameContact` call it (behaviour unchanged; existing tests must pass). Rules (same as today): both names ≥ 2 tokens after `normalize`; same last token; same first initial; if both first tokens are longer than one character they must be equal; middle tokens longer than one character must match. Non-Latin names: compare by exact `normalize` equality only (do not split CJK names).

**2. Union-find over author occurrences.** An _occurrence_ is one author or supervisor entry on one work. Build clusters with these rules, in order:

- **Rule A — shared identifier (automatic).** Occurrences that share any of these tokens are unioned: `orcid:<orcidKey>`, the OpenAlex `id`, the `externalId`. Tokens that appear together on a single occurrence are unioned with each other (this generalises the existing `orcids` map).
- **Conflict guard (always).** Never union two clusters if together they would contain two different ORCIDs, two different OpenAlex IDs, or two different external IDs with the same scheme prefix (e.g. two different `idhal:` values). The test _"strong author IDs keep homonyms separate even on the same paper"_ must keep passing. Two different authors on the **same work** are never unioned with each other.
- **Rule B — name + shared institution (automatic only when unambiguous).** For an occurrence with at least one institution: find clusters that (a) have a `namesCompatible` name, (b) share at least one institution — same `Institution.id`, or `matchesInstitution(name, name)` from `lib/contact-routes.ts`, or same ROR — and (c) pass the conflict guard. If **exactly one** such cluster exists, union. If more than one, do not merge; record them as possible duplicates (below).
- **Rule C — no affiliation, no identifier.** Unchanged: the occurrence stays scoped to its work. Keep the test _"unknown names stay work scoped and non-Latin names are not collapsed"_ passing.

Evaluate Rule B deterministically: process works sorted by `id`, occurrences in author order, so results do not depend on provider arrival order.

**3. Canonical key and aliases.** Each cluster becomes one `Person`.

- `key`: the most stable identifier in the cluster — ORCID key (`orcid:…`) → smallest OpenAlex `id` → smallest `externalId` → `unverified:<normalized name>:<smallest institution id-or-normalized-name>` (one institution, not the joined set) → `unverified:<name>:<work id>` for work-scoped names.
- `aliases: string[]`: every key the **old** `personKey` function would have produced for any occurrence in the cluster, plus every key the cluster has had under the rules above. This keeps saved shortlist entries, feedback, verifications and region-board pins that reference old keys working.
- `identity` label: keep `"Provider identifier"` when every merge was Rule A; use `"Merged by name and shared institution (unverified)"` when any Rule B merge happened; keep `"Unverified name / affiliation grouping"` otherwise.
- Add `mergedBy?: { rule: "identifier" | "name-institution" | "manual"; detail: string }[]` so the dossier can explain each merge (e.g. `"J. Smith at Eindhoven University of Technology matched Jan Smith"`).

**4. Possible duplicates (shown, never auto-merged).** Add `possibleDuplicates?: { key: string; name: string; reason: string }[]` to `Person`. Populate when:

- Rule B found more than one candidate cluster, or
- two clusters have `namesCompatible` names, no conflict, different institutions, and share **≥ 2 coauthor clusters**.

Cap at 5 per person.

**5. Manual decisions.** Extend `matchingStateSchema` with

```ts
identityDecisions: z.array(z.object({
  keys: z.array(z.string().max(500)).min(2).max(10),
  decision: z.enum(["same", "different"]),
  decidedAt: z.string(),
})).max(500).default([]),
```

Pass it to `peopleFrom` as a new optional last parameter. `"same"` unions those clusters (still subject to the ORCID/OpenAlex conflict guard; if blocked, ignore the decision and add a warning to `mergedBy`). `"different"` prevents Rule B merging and suppresses the possible-duplicate entry between them. Match decision keys against `key` **or** `aliases`.

**6. Key lookups.** Add `export function personHasKey(p: Pick<Person, "key" | "aliases">, key: string)` to `lib/identity.ts`. Replace every `===` comparison listed in the code map with it (shortlist, feedback, verifications, selection, region board pins, region-results). When saving new feedback/verification/shortlist entries, store the canonical `key`.

**7. UI.**

- Researcher dossier: show the merge explanations from `mergedBy`. For each possible duplicate show "Possibly the same person as _Name_ — reason" with **Same person** / **Different people** buttons that write an `identityDecisions` entry.
- Cards in the Researchers list and recommendation cards: a small "possible duplicate" marker when `possibleDuplicates` is non-empty.

**8. Institution grouping (small, same commit).** In `rankCandidates`, `groupKey` currently uses `primary.id || normalize(primary.name)`. When the institution has a `ror`, use `ror:<ror>` as the key so the same institution indexed under two OpenAlex records collapses. Do **not** attempt a parent-organization hierarchy in this change (no ROR API calls); note it as future work in the README.

### Types and schemas to update

- `lib/types.ts` `Person`: add `aliases?: string[]`, `mergedBy?`, `possibleDuplicates?`.
- `lib/session.ts` `person` schema: the same fields, all optional, with sensible `.max()` limits.
- `lib/matching.ts` `matchingStateSchema`: `identityDecisions` with default `[]`.

### Tests (`tests/identity.test.ts`, new)

1. OpenAlex-ID occurrence and HAL `idhal:` occurrence of the same name at the same institution, no ORCID → **1** person (Rule B), `identity` says unverified merge, `aliases` contains both old keys.
2. Same as 1 but the two occurrences carry different OpenAlex IDs → **2** people.
3. "J. Smith" (TU/e) and "Jan Smith" (TU/e) → 1 person; "J. Smith" (TU/e) and "Jane Smith" + "John Smith" both at TU/e → no merge for "J. Smith", possible-duplicate entries on it.
4. "Jan Smith" at {TU/e} on one work and {TU/e, DIFFER} on another, no IDs → 1 person (fixes the institution-set split).
5. Same name, no institutions, no IDs, two works → 2 people (Rule C unchanged).
6. Two authors with the same name on the **same** work, same institution → never merged.
7. Clusters with compatible names, different institutions, sharing 2 coauthors → listed as possible duplicates, not merged.
8. `identityDecisions` `"same"` merges two clusters; `"different"` blocks a Rule B merge; `"same"` between two different ORCIDs is ignored.
9. Results are identical when the input works array is shuffled.
10. A shortlist entry / feedback stored under an old `unverified:` key still matches the merged person via `personHasKey`.
11. An old session JSON without the new fields still parses.

All existing tests in `tests/research.test.ts` and `tests/matching.test.ts` must pass unchanged.

---

## Feature 2 — Supervision level (PhD / MSc / BSc)

### Goal

Show which student levels a person has evidence of supervising, use it as a **ranking signal and a stated gap**, never as a hard filter in Recommended contacts.

### Design

**1. Type.** In `lib/types.ts`:

```ts
export const SUPERVISION_LEVELS = [
  "bachelor",
  "master",
  "doctoral",
  "habilitation",
  "unknown",
] as const;
export type SupervisionLevel = (typeof SUPERVISION_LEVELS)[number];
```

Add `level?: SupervisionLevel` to `Work`. Add it to the session `work` schema as an optional enum.

**2. Set the level in each adapter** (where raw metadata is available), not by re-parsing `type` later:

| Source               | Mapping                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| HAL (`normalizeHal`) | `THESE` → doctoral, `HDR` → habilitation, `MEM` → master; other doc types → leave undefined                                                       |
| theses.fr            | doctoral                                                                                                                                          |
| OpenAIRE             | instance type `Doctoral thesis` → doctoral, `Master thesis` → master, `Bachelor thesis` → bachelor, `Thesis` → unknown                            |
| DataCite             | if `resourceTypeGeneral` is Dissertation/Thesis or `resourceType` matches thesis: derive from the **`resourceType` free text only** — `/\b(ph\.?d | doctor | doctoral | dissertation)\b/i`→ doctoral,`/\b(master | msc | m\.sc)\b/i`→ master,`/\b(bachelor | bsc | b\.sc | honours)\b/i` → bachelor, else unknown. Check bachelor and master before doctoral (resourceType "Master's dissertation" exists). |
| OpenAlex             | `type: dissertation` → unknown (OpenAlex does not distinguish)                                                                                    |
| Crossref             | `type: dissertation` → unknown                                                                                                                    |

Do not infer level from titles or abstracts.

**3. OpenAIRE bachelor theses.** In `lib/providers.ts` ~L390, add bachelor theses to the `instance_type` filter **only after verifying** the exact label OpenAIRE's Graph API v4 accepts (check the OpenAIRE instance-type vocabulary docs, or make one manual request with `npm run smoke` style tooling). If the label cannot be confirmed, leave the filter unchanged and record that in `docs/VALIDATION.md`.

**4. `mergeWorks`.** When merging, keep the most specific level: any concrete level beats `unknown`/undefined; if two records disagree on concrete levels, keep the first and do not guess (add nothing).

**5. Summary function.** New `lib/levels.ts`:

```ts
export type LevelSummary = {
  counts: Record<SupervisionLevel, number>; // supervised works, all years
  recent: Record<SupervisionLevel, number>; // supervised works with year >= currentYear - 5
  lowest?: Exclude<SupervisionLevel, "unknown">; // ordering: bachelor < master < doctoral < habilitation
  officialUndergraduate?: { url: string; checkedAt: string; text: string }; // from verification evidence kind "undergraduate"
};
export function supervisionLevels(
  p: Person,
  verification?: Verification,
  now?: Date,
): LevelSummary;
```

Count only works in `p.supervisedWorkIds`. Authored theses are the person's **own** degree, not supervision — exclude them. `officialUndergraduate` counts as bachelor-level evidence for `lowest`, and is the strongest evidence.

**6. Student level in the profile.** Add `studentLevel: z.enum(["bachelor", "master", "doctoral"]).default("bachelor")` to `studentProfileSchema`. Keep the existing free-text `degree`. Add a select for it in the profile form (`app/components/matching-panel.tsx`), next to degree.

**7. Ranking (`rankCandidates`).** Using `supervisionLevels`:

- Evidence at **or below** the student's level within the last 5 years: small bonus (start at **+6**).
- `officialUndergraduate` evidence and `studentLevel === "bachelor"`: larger bonus (start at **+10**; does not stack with the +6).
- Only higher-level evidence: **no penalty**. Add a gap: `"Recorded supervision is at {lowest} level only; ask whether they take {studentLevel} students."`
- No supervision evidence at all: no change to the score, and no new gap (absence is not evidence).
- The level bonus must never move a candidate without a topic match (`hasTopicMatch`) into the contact lane, and must not change the `>= 40` / `>= 18` lane thresholds. Calibrate the numbers so existing `tests/matching.test.ts` expectations hold; if one must change, explain why in the commit message.

**8. UI.**

- Researcher dossier and recommendation cards: one line such as
  `Supervised (last 5 yrs): 3 PhD · 1 MSc · 0 BSc · 2 unspecified — lowest level seen: MSc`
  and, when present, `Official page mentions undergraduate projects (checked 12 Nov 2026)` with its link.
- A caveat beside it (tooltip or small text): "Bachelor and master theses are rarely indexed, so a missing level is not evidence that they won't supervise it."
- Researchers tab: optional filter "Supervision at or below my level", **off by default**. Do not add a level filter to Recommended contacts.
- CSV export (`shortlistCsv` in `lib/research.ts`): add a `Supervision levels` column with the summary line. Keep the existing CSV formula-escaping via `csvCell`.

### Tests (`tests/levels.test.ts`, new)

1. Adapter mapping for every row of the table above (use fixtures, no network).
2. DataCite `resourceType: "Master's dissertation"` → master (not doctoral).
3. `mergeWorks` of an OpenAlex `unknown` dissertation and a HAL `MEM` record with the same DOI → master.
4. A person who **authored** a doctoral thesis and **supervised** one master thesis → counts `{ master: 1 }`, lowest master.
5. Works older than 5 years appear in `counts` but not in `recent`.
6. `officialUndergraduate` makes `lowest` bachelor even with only doctoral theses.
7. Ranking: with equal topic evidence, a candidate with recent MSc supervision ranks above one with only PhD supervision for `studentLevel: "master"`; the PhD-only candidate gets the gap text; a candidate with no supervision evidence keeps the same score as before this change.
8. A level bonus alone cannot put a no-topic-match candidate in the contact lane.
9. An old profile in `localStorage` without `studentLevel` parses with default `"bachelor"`.

---

## Feature 3 — "New since last search"

### Goal

When the student re-runs or widens a search, they should immediately see which people and groups they have **not** looked at before, and be able to hide the rest.

### Design

**1. Ledger.** New `lib/seen.ts` with a zod schema, persisted at `localStorage["fusion-atlas-seen-v1"]`:

```ts
seenEntry = {
  key: string,                 // canonical person key (Feature 1)
  aliases: string[],           // max 20
  name: string,
  institutions: string[],      // names, max 5
  groupKeys: string[],         // recommendation groupKeys, max 10
  topics: string[],            // max 20, most recent first
  firstSeenAt: string,         // ISO
  lastSeenAt: string,
}
seenLedger = { version: 1, entries: seenEntry[] /* max 5000 */, lastRunAt?: string }
```

When over 5000 entries, evict by oldest `lastSeenAt`. Validate on read; if invalid, keep the raw value untouched (same pattern as the shortlist load in `app/page.tsx` ~L199) and show a non-blocking error.

**2. Baseline semantics.** When a new search run **starts**, snapshot the ledger as the run's baseline. Every person in that run is classified against the baseline, so people found in this run stay "new" throughout it:

- **acted**: has any feedback entry (`matching.feedback`), is on the shortlist, or has a verification — checked via `personHasKey` and `sameContact`.
- **seen**: in the baseline (match on `key`, any alias, or `sameContact` against the entry's name + institutions), and not acted.
- **new**: otherwise.

Do the same for groups: a recommendation group is **new** when its `groupKey` is not in any baseline entry's `groupKeys`.

**3. When to write.** Upsert every person in the current results into the ledger when the run's sweep finishes, when the user pauses, and when they open a result's dossier (the opened person only). Use one debounced write; do not write on every progressive provider page.

**4. UI.**

- Badges on Researchers list rows, matching-panel cards and region-results cards: **New**, **Seen** (with "first seen {date}" in a tooltip), **Acted**.
- Results header: `{total} results · {new} new since {baseline lastRunAt, formatted}`. On the first run (empty ledger) show nothing extra.
- Toggle **Hide seen** (hides "seen" and "acted"; never hides anything pinned on the region board). Persist the toggle with the other UI preferences in the matching profile (`hideSeen: z.boolean().default(false)` on `studentProfileSchema`).
- **Connections** page: **Clear seen history** button with a confirmation dialog stating how many entries will be removed.

**5. Session export/import.** Add optional `seen` (the ledger) to `sessionSchema`. On import, union with the local ledger: same key or alias → merge aliases/topics/groupKeys, keep the earliest `firstSeenAt` and latest `lastSeenAt`.

### Tests (`tests/seen.test.ts`, new — pure functions, no DOM)

1. Classification: a person in the baseline → seen; not in it → new; with feedback → acted (feedback wins over seen).
2. A person whose key changed after Feature 1's merge is still "seen" via an alias.
3. A person matched only by `sameContact` (initials vs full name, same institution) is "seen".
4. People found during the current run stay "new" until the next run starts, even after the ledger is written mid-run.
5. Eviction keeps the 5000 most recently seen entries.
6. Group classification by `groupKey`.
7. Session import merges ledgers (earliest `firstSeenAt`, union of aliases).
8. An invalid ledger in storage is not overwritten.
9. An old session JSON without `seen` still parses.

---

## Out of scope (mention as future work in README, do not build)

- ROR parent-organization hierarchy collapsing (needs ROR API calls).
- Linking preprint and journal versions of the same paper.
- Group-level "you already contacted someone in this group" warning.
- Recording replies such as "only takes master's students" in an outreach tracker.
- Any LLM or fuzzy-title matching.

## Definition of done

- Three commits (identity, levels, seen), each passing `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`.
- New tests listed above exist and pass; no existing test was weakened.
- A session exported before these changes loads after them, and a session exported after them loads in a fresh browser.
- README "How contacts are selected", "Coverage and ranking" and "Saving your work" sections describe the new behaviour and its limits; `docs/VALIDATION.md` records what was checked and what could not be verified (e.g. the OpenAIRE bachelor-thesis label).
