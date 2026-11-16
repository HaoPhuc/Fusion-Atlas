# Delivery validation

Checked 16 November 2026 (Europe/Amsterdam), version 1.1. Data-source responses are snapshots, not promises about future availability.

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
