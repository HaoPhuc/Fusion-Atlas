# Delivery validation

## New since last search

All 85 automated tests passed, including the 71 existing tests and 14 new history tests. Fixtures cover classification by key, alias and name with a shared affiliation, action precedence, the fixed baseline, group keys, bounded history, import merges, older sessions and preservation of unreadable storage. They also check that a researcher with more than 20 aliases retains the link to an earlier entry. Type checking, the production build and Prettier checks on the changed files passed. The Windows test runner used a temporary preload for the operating-system username lookup.

A local Chromium check against the production build used fixture provider responses. A progressive page left storage untouched. Opening a dossier wrote just that identity, and pausing recorded the other results. The person stayed **New** through a continuation and became **Seen** on a repeat search. The check also covered the first-run header, repeat count, first-seen tooltip, persisted **Hide seen** preference, regional pin visibility, the entry count in the clear confirmation, cancelling and confirming the clear, and restoration from a session export. No browser runtime errors were observed in that workflow.

A fresh browser context restored the exported history and filter preference. Opening an older version-one session in that context preserved the local history.

## Supervision levels

The suite passes all 71 tests (60 existing and 11 new). Offline fixtures check the six provider mappings, including DataCite’s “Master’s dissertation”, DOI and identifier-bridge merges, authored versus supervised works, and the inclusive five-year boundary. Ranking tests check the +6 and +10 bonuses, the higher-level question, the unchanged score for missing evidence, reviewed group contacts and the topic requirement for the contact lane. Backup and CSV tests cover unspecified levels on old records, the bachelor profile default, source links under earlier identity keys and formula escaping.

Type checking, the production build and Prettier checks on the changed files passed. On this Windows sandbox the test runner used a temporary Node preload for the operating-system username lookup. A production Chromium check imported a version-one session with an older profile, changed the student level to master, checked the recommendation and filtered the Researchers list. The dossier summary fit at 1440, 768 and 390 px. A fresh browser profile restored the student level and thesis evidence from the exported session.

The repository contains no confirmed OpenAIRE Graph v4 bachelor instance-type filter label. A single request for `instance_type:Bachelor thesis` returned no usable response in this environment. The thesis-only filter still requests doctoral, master and generic theses. An offline fixture verifies how an incoming `Bachelor thesis` instance is displayed.

## Cross-source researcher identities

All 60 automated tests passed, including the 45 existing tests and 15 identity tests. Fixtures cover identifier bridges, shared affiliations and RORs, ambiguous initials, same-paper homonyms, work-scoped names, distinct coauthors, manual decisions and shuffled provider order. They also check historical keys after work deduplication, feedback and scoped official-page lookups, regional pins, shortlist backups and version-one sessions.

Type checking, the production build and the repository formatting check passed. The Windows sandbox could not return a username to the test runner through Node’s `os.userInfo()`. A temporary preload supplied the environment username so `tsx` could select its temporary directory.

A local production-browser check imported a version-one session without identity fields. The dossier showed both candidates for an abbreviated name on desktop and at 390 px. Separate runs exercised **Different people** and **Same person**. Saving the merged researcher used the canonical key. Opening the exported session payload in a fresh browser profile restored the decision and shortlist. These checks used fixture records. They do not measure identity accuracy across live providers.

## Contact roles · version 1.4

All 45 automated tests passed. The production build completed with TypeScript checks. Chromium checks used imported plasma-control searches with an empty literature set so the named contacts came directly from the reviewed institutional sources.

In the Eindhoven regional shortlist, prioritizing doctoral and postdoctoral researchers surfaced Loes Jansen. Switching that slot manually to Matthijs van Berkel preserved every other slot. Prioritizing project supervisors surfaced Tijs Wijkamp, whose source describes daily supervision on a doctoral project. The country-scoped view also surfaced Jansen and kept van Berkel accessible in the same group. The checks covered the source link, saved preference, mobile layout at 390 px, and browser runtime errors.

## Geographic shortlist · version 1.3

The production-browser workflow on 18 November 2026 used Utrecht, a 150 km radius, and Germany, France, the United States, Switzerland and the United Kingdom as destinations. The topic was **machine learning plasma control**. The app ran scoped OpenAlex searches, retrieved institution coordinates, and retained separate literature results. Some slots stayed open when the returned evidence lacked a qualifying group or location.

The workflow exercised all ten slot positions, an official EPFL group contact, marking the DIFFER group contact as already contacted, keeping the other filled positions in place, and changing the UK slot to Japan. It also checked phone layout, persistent settings, and importing the actual exported session with its coordinates and search progress. An initial test exposed the same contact appearing under abbreviated authorship. The released matcher checks known identifiers and same-institution name variants. Contact history from previous exports with reviewed group identities is also recognized.

All 42 automated tests passed, including geographic allocation, cross-border radius matching, alternatives, incomplete evidence, targeted queries and abbreviated contact names. The Next.js production build passed. The desktop, tablet and phone layout inspection returned zero warnings or failures.

## Supervisor matching and themes · version 1.2

Checked 18 November 2026 using the local production build. All 36 tests, TypeScript checks and the Next.js production build passed.

- A live **spectroscopy / Australia** quick pass retrieved 150 works and displayed 286 literature identities including unknown affiliations. After applying the location and role requirements, the contact view showed **one named contact**, Cormac Corr, among 125 in-scope identities. The official project page specifies vacation scholar and undergraduate project formats. Three other institutions had strong authors available for role checks. [ANU project](https://physics.anu.edu.au/study/projects/project.php?ProjectID=14)
- The repeat reused all three scholarly pages from the browser cache. In one run with automatic website checks disabled, the first pass with an empty browser cache took 2.18 seconds and the repeat took 0.77 seconds. Server caches, network conditions and the source mix affect timings. Optional website reading adds time.
- The live official-page reader recovered the leader field for Ivo Classen and DIFFER’s student eligibility wording. Wisconsin’s engineering site returned HTTP 403 to the reader. The app reported the access limit and retained the manually reviewed link. [DIFFER research groups](https://www.differ.nl/research/fusion) · [DIFFER placements](https://www.differ.nl/working-at/internships-and-thesis-projects)
- Twelve Chromium checks covered the live recommendation, hiding and restoring a contact, saving the profile and contact, cache reuse, previous and current session imports, mobile layout, browser runtime errors and Dark, Light and System settings. A live session exposed two abstracts over 30,000 characters. They now round-trip with their full text inside the existing 25 MB file limit.
- The layout inspector reported zero failures or warnings at 1440, 768 and 390 px. The contact screen was also inspected with real search results. [Desktop contact view](screenshots/contact-dark.jpg) · [Mobile contact view](screenshots/contact-mobile.jpg)
- The ten reviewed individual contacts span five institutions. The seven scholarly indexes can surface additional groups worldwide. Source records and named contacts do not establish current openings. Optional authenticated Brave search and a live Vercel deployment were outside this test.

## Previous release · version 1.1

Checked 16 November 2026 (Europe/Amsterdam). The following results describe the earlier release.

## Code and build

- 26 automated tests passed with `npm test`, including role separation, NNT deduplication, conflicting IdRef identities, repository normalization, supervisor-aware backups, bounded adapter queries, full thesis enrichment, and reference paging beyond 100 IDs.
- TypeScript checks passed. The `typecheck` script generates Next.js route types before checking, so it also works on a fresh checkout.
- `npm run build` produced the static interface and dynamic `/api/research` route successfully. A Windows sandbox permission error during an intermediate rebuild was resolved by stopping the dev server and rebuilding with the appropriate local permissions.
- Formatting checks passed. The dependency audit during installation reported zero known vulnerabilities at that time.

## Live source checks

The `tokamak` search for 2020–2026 retrieved 50 records each from all seven sources: OpenAlex, Crossref, DataCite, arXiv, HAL, OpenAIRE, and theses.fr. Exact identifier deduplication produced 320 unique work records in that test. These are query results, not a validated list of internship-relevant papers.

The separate thesis smoke test fetched up to two pages per new source:

| Source    | First page | Second page | Reported total | Supervisor entries on first page |
| --------- | ---------: | ----------: | -------------: | -------------------------------: |
| HAL / TEL |         50 |           4 |             54 |                               85 |
| OpenAIRE  |         50 |          50 |            595 |                                0 |
| theses.fr |         50 |          38 |             88 |                               94 |

Together with one full thesis detail record, those calls returned 243 records, merged to 199 distinct works, with 154 supervisor identities. Some identities remain unverified work-scoped names; these counts are not unique confirmed people or internship offers. HAL/theses.fr overlap merged by exact NNT and DOI. OpenAIRE's untyped contributors and pending ORCIDs were not promoted to supervisors or confirmed identities.

The detail endpoint returned a 2,707-character abstract for NNT `2021COAZ4098`. DOI resolution followed by reference discovery also worked live. A separate third-page reference request for `https://openalex.org/W4364365991` retrieved 50 works from a 228-reference seed, demonstrating retrieval beyond the former 100-ID cap without a key.

Previously checked workflows (15 November), with author bibliography and institution lookup also rechecked on 16 November:

| Feature                      | Observed result                                              |
| ---------------------------- | ------------------------------------------------------------ |
| OpenAlex dissertation search | 50 dissertation records returned                             |
| DataCite dissertation search | 50 Dissertation records returned                             |
| Crossref dissertation search | Successful response with zero records for the tested query   |
| Institution name search      | Returned Eindhoven University of Technology among candidates |
| City lookup                  | Returned institution candidates in Eindhoven                 |
| Author bibliography          | Returned publications and indexed affiliation history        |
| References                   | Returned 50 works from a seed with 88 indexed references     |
| Citing works                 | Returned 50 works from a seed with 535 indexed citing works  |

No OpenAlex key was provided during testing. Keyless access and its pagination warning were exercised live. Authenticated deep cursor paging is implemented against the documented API but was not exercised with a real key.

## Browser workflow

A real headless Chromium browser passed the 14 original regression checks: initial empty state, directory search, live researcher discovery, visible coverage limits, linked supporting publications, author history, persistence of shortlist notes and follow-up stage, JSON backup contents, safe CSV export, session restoration without overwriting newer local notes, mobile dossier layout, mobile return to the researcher list, connection guidance, and absence of browser runtime exceptions. An initial run encountered an upstream OpenAlex HTTP 429; the error appeared in coverage, and a later rerun passed after access recovered.

Thirteen additional checks passed for the seven source selectors, French query helper, live thesis search, supervisor-only filtering, explicit role and IdRef evidence, separate thesis authors, loading an abstract, tablet/mobile layouts, role-preserving shortlist backups, session restoration, connection guidance, and absence of browser exceptions.

This testing caught and fixed two issues: provider `null` identifiers breaking saved-data validation, and differing country display names between server/browser causing hydration errors. Optional metadata now normalizes correctly and import validation tolerates older null fields. Country labels are fixed. Unreadable saved browser data is preserved instead of automatically overwritten.

## Visual review

Desktop (1440 px), tablet (768 px), and mobile (390 px) layouts were inspected and screenshots reviewed. The final automatic layout inspection reported **0 failures and 0 warnings**.

The design uses a neutral research workspace: a topic search followed by an explicit literature → people → shortlist sequence. The wide layout shares a consistent canvas edge; tablet stacks the starting panels; mobile folds navigation into a horizontal row and shows a single researcher dossier. Blue highlights evidence counts and matching terms. Empty states do not invent papers or people, and missing affiliations are labelled explicitly. Directory counts are computed from the bundled 309 entries.

The source-style linter reports the four numbered workflow steps. They are retained because they express the actual sequence of investigation, rather than decorating unrelated sections.

## Limits of this validation

This is not an exhaustive audit of source coverage or author identity accuracy. It does not validate all 309 organizations' current activity, verify current supervisor employment or internship availability, test every possible country/query, or load-test a multi-user deployment. No live Vercel deployment or authenticated API account was created. Metadata can be incomplete or use repository deposit dates. Full PDFs are not read automatically. Official repository and lab follow-up remains necessary for unindexed work and current undergraduate opportunities.
