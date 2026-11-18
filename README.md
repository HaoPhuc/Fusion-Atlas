# Fusion Atlas

A personal research discovery app for finding **nuclear fusion researchers worldwide**, with evidence from papers, preprints, and theses. The shortlist workflow is tailored to **undergraduate internships**.

Start with a research method and a country, or search worldwide. The standard **Recommended contacts** view presents up to eight groups or institutions with a named person, evidence of research fit, a next step and outstanding eligibility questions. Open a card’s source to decide whether to write. **Researchers** retains the wider literature search.

For example, search **spectroscopy** in **Australia**. ANU’s MAGPIE project names Cormac Corr as supervisor and lists undergraduate project formats. The card links to that student project so you can ask about the next intake. [ANU project and contact](https://physics.anu.edu.au/study/projects/project.php?ProjectID=14).

The interface starts in dark mode. The header offers Light and System and remembers your choice in this browser.

## Geographic shortlist

Choose **Discover → Choose locations**, select your home city, a radius and five other countries, then apply the layout and start a worldwide search. Three slots cover the radius across national borders. Two cover your home country beyond the radius, with different cities preferred. Each destination receives one slot. A single-country or institution search continues to use the standard results.

With OpenAlex selected, the quick pass also runs scoped searches for countries with a listed town inside the circle, your home country, and your destinations. Results arrive progressively. Campus cities from reviewed group pages and exact OpenAlex institution records provide approximate straight-line distances. An indexed organization can have multiple campuses. Papers without coordinates can support a foreign-country lead when the personal affiliation supplies a country. Verify the work location and undergraduate eligibility on the group page.

Use **Already contacted**, **Replace this group**, or **Skip institution** on a card. Country selectors change one international slot. Filled peers are held in place, and open slots have a **Search deeper** action for their geography. A strong paper can surface an institution for investigation while the supervisor role is unresolved. Coverage includes each regional query and its errors. Session exports retain the layout, fetched evidence and skipped groups. Profile settings and contact history also persist in this browser.

The bundled city index is derived from GeoNames cities15000. City name, ASCII name, country, administrative code and coordinates were selected and sorted by population. This personal-use app needs no geocoding account. [GeoNames downloads](https://download.geonames.org/export/dump/) · [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

## Start locally

Use Node.js 22 or newer (tested with Node 24) and npm.

```sh
npm ci
```

Copy `.env.example` to `.env.local`, then optionally fill in the variables below. The app starts without keys, with limited OpenAlex paging.

```sh
npm run dev
```

Open the Local URL printed by Next.js, normally `http://127.0.0.1:3000`.

## Deploy your repository on Vercel

1. Put the contents of this folder in a Git repository. Include `package-lock.json`; exclude `node_modules`, `.next`, `.env.local`, and `work` (already covered by `.gitignore`).
2. In Vercel, import the repository as a **Next.js** project. If you keep this folder nested, select it as the Root Directory.
3. Use Node.js 22 or 24. Keep the default build command (`npm run build`) and output settings. This app needs its server API route; do not configure a static export or GitHub Pages hosting.
4. Add the environment variables below to the deployment environment you use.
5. Deploy. Open **Connections** in the app and confirm whether your OpenAlex key is configured. Redeploy after changing environment variables.

This delivery is source code, not a live Vercel deployment. See [Vercel's Next.js guide](https://vercel.com/docs/frameworks/full-stack/nextjs) and [environment variable instructions](https://vercel.com/docs/environment-variables).

| Variable               | Purpose                                                                            | Needed?                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `OPENALEX_API_KEY`     | Deeper cursor paging and a larger free API budget                                  | Strongly recommended                                                     |
| `BRAVE_SEARCH_API_KEY` | Optional search within the institution’s official domain for deeper staff profiles | Optional. The built-in page reader and manual URL entry work without it. |
| `CONTACT_EMAIL`        | Your real email for Crossref and OpenAIRE's polite request pools                   | Optional                                                                 |
| `SITE_PASSWORD`        | Shared password protecting this deployment's research API                          | Recommended for a publicly reachable personal deployment                 |

Do not prefix secrets with `NEXT_PUBLIC_`. The browser never receives your API key. If you set `SITE_PASSWORD`, enter that deployment password in **Connections**; it stays in page memory. The interface and seed directory remain public, while research API calls require the password. This is simple personal-deployment access control, not a multi-user account system.

## Free tools and accounts

Only **OpenAlex** needs an account for the intended deeper workflow. Create a free account, verify your email, and copy the key from [OpenAlex settings](https://openalex.org/settings/api). Its documentation says cursor paging beyond the first page requires a key; free usage has quotas and rate limits. This app stops and reports source limits rather than claiming complete coverage. [Authentication and quotas](https://help.openalex.org/api/authentication/) · [Paging](https://help.openalex.org/api/paging/).

The following scholarly integrations are built in. You can also set a server-side Brave Search API key for additional staff-profile discovery. The profile reader, reviewed contacts and recommendations work without that service.

| Source    | Evidence it adds                                                                      | Important gap                                                                                 |
| --------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| OpenAlex  | Papers, author identifiers, affiliations, institutions, citation graph                | Identities and affiliations may be incomplete or historical                                   |
| Crossref  | Publisher DOI metadata, articles, some dissertations                                  | Many records lack abstracts or author affiliations                                            |
| DataCite  | Repository DOI records, including theses and research outputs                         | Theses without registered DOIs may be absent                                                  |
| arXiv     | Preprints and author names, sometimes affiliations                                    | Not a comprehensive thesis catalogue                                                          |
| HAL / TEL | Papers, theses, PDFs when supplied, and explicit thesis directors                     | Primarily French repository coverage; identities and individual affiliations can be absent    |
| OpenAIRE  | International repository records, doctoral and master's theses, repository links      | Dates may reflect deposits; linked organizations are work context, not personal affiliations  |
| theses.fr | Completed French doctorates, named supervisors, IdRef identities, on-demand abstracts | French doctorate coverage; does not cover every thesis level or current supervisor employment |

The other six public metadata integrations need no additional API keys. No paid LLM, database, search API, or scraping service is required. Vercel hosting and provider quotas still apply; free does not mean unlimited. Primary API references: [Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/), [DataCite](https://support.datacite.org/docs/api-queries), [arXiv](https://info.arxiv.org/help/api/user-manual.html), [HAL](https://api.archives-ouvertes.fr/docs/search), [OpenAIRE v4](https://graph.openaire.eu/docs/apis/graph-api-v4/), [theses.fr OpenAPI](https://theses.fr/api/v1/recherche/openapi.yaml). CORE is not integrated: the keyless endpoint returned a rate limit during evaluation, so it is not counted as available coverage.

## How to search thoroughly

1. **Start globally.** Enter a method or topic such as `gyrokinetic turbulence`, `tungsten irradiation`, or `machine learning plasma control`. The default date range covers the current year and the preceding six years; widen it for older groups and foundational work.
2. **Review Search plan.** The app suggests fusion terminology and accepts up to eight queries. **Add French thesis queries** adds curated French terms for the selected topic. Add synonyms, alternative spellings, facility names, and other native-language terms yourself. Expansion is a curated vocabulary, not an LLM or semantic search.
3. **Choose depth.** Each page requests up to 50 records per query per source. With the geographic layout disabled, the default Quick shortlist checks the primary query at up to three selected sources in parallel, then optionally checks two official websites. Source results appear as they arrive. Choose one, two, or four full pages per query for broader discovery. **Continue sweep** adds a page to every unfinished task and retries failed tasks. **Pause** stops the browser loop and retains its progress. Keep the tab open during a search.
4. **Repeat with location.** A country constrains OpenAlex upstream and researcher affiliations downstream. For a city, open Search plan, choose city lookup, and select an institution from the candidates. City search is an institution lookup, not a geographic-radius sweep. An institution name is explicitly resolved to an OpenAlex identifier before applying it. Search each relevant parent institution separately.
5. **Retain unknown affiliations.** Other sources often provide names without a resolvable institution ID or country. These remain potential leads unless you turn off **Include unknown affiliations**. A paper with an author in your country does not make every coauthor local. The Papers tab retains global and unknown-location records for inspection.
6. **Search theses separately.** Enable **Theses only**. OpenAlex, Crossref, and DataCite request dissertation records; HAL requests thesis/habilitation/memoir types; OpenAIRE requests doctoral, master, and generic thesis types; theses.fr searches completed doctorates; arXiv is skipped. Select **With supervision evidence** to see people explicitly named in HAL's director field, theses.fr's director records, or DataCite's thesis Supervisor contributors. Each relationship has a source link. Reviewers, corresponding authors, free-text contributors, and author order are not treated as supervision evidence. **Load full thesis metadata** adds the abstract from theses.fr when an NNT is available and the abstract is missing. It does not read the PDF.
7. **Trace promising work.** Open a researcher, fetch their bibliography, or follow a paper's references and citing works. DOI-only works can first be resolved in OpenAlex automatically. Reference lists are paged in batches of 50 IDs beyond the former 100-ID cap. Follow-ups retain a link to their seed work; they can fall outside the original dates and keywords and are not assumed to match your topic.
8. **Verify on official pages.** Use **Check official pages** for a candidate or supply a profile URL on the institution’s own domain. Cards show dated passages and links. The full researcher dossier also offers manual searches. Check present affiliation, supervision role, degree requirements, citizenship/visa rules, funding, and dates on the official program or lab page.
9. **Record and export.** Save a researcher and keep notes about a specific paper, your skills, questions, and eligibility checks. Export CSV for a spreadsheet, or JSON for a restorable backup.

## How contacts are selected

- The contact view combines eleven reviewed group or project contacts across six institutions with worldwide discovery through papers, theses and official staff pages. A named group or project takes precedence where available. Other candidates are grouped by a recorded personal affiliation. A country or institution constraint requires a matching personal affiliation in Recommended contacts. The broader Researchers tab can retain unknown-location leads. A thesis without an established employer retains its own lead.
- Topic and method matches, skills, preferred work style, location, explicit thesis supervision and recent role evidence determine priority. Broad coauthorship alone cannot create a suggested supervisor. Students can inspect up to three additional authors with strong research matches and check their roles.
- Dated project instructions and personal contacts link to institutional sources. The app also lists relevant central application routes at MIT, PPPL and UKAEA. A published role or earlier thesis cannot confirm a vacancy, funding or visa eligibility. Dates, degree requirements and funding remain questions to resolve with the host.
- **Good match** and **Too theoretical** adjust ranking. **Wrong methods / topic**, **Not eligible** and **Dismiss** hide that contact for the topic. **Already contacted** applies across topics for the same identity. Use **Hidden by your feedback** to restore leads.
- The reader checks up to five public HTML pages per person and observes the site's crawler rules. It can miss pages behind scripts, indexed under another spelling, hosted on a separate domain or unavailable to automated readers. Freshness flags appear after 30 days. A failed check leaves the evidence gap visible.

## Coverage and ranking

- Searches are worldwide and are **not restricted to the seed directory**. The 309-entry directory is a starting map assembled on 14 November 2026: 277 main research/development entries, 24 broader university leads, and 8 coordinating bodies. It includes historical entries; consult each evidence link and verify present activity. See [the original directory and sources](docs/worldwide-fusion-research-directory.md).
- Each retrieved publication retains its sources, original queries, retrieval timestamp, DOI/provider identifiers, authors, and links. Repository records, explicit supervisor evidence, institutional context, keywords, and graph seed links are preserved where supplied, including in session backups.
- Duplicate works merge by exact DOI or provider identifier, including French NNTs and HAL aliases. This connects HAL and theses.fr records even without DOIs. Titles alone do not cause a merge; preprint and journal versions may remain separate.
- Person grouping prefers ORCID, then OpenAlex ID, then explicit IdRef/HAL identities. Unidentified people may be grouped by exact normalized name and affiliation; this is explicitly unverified. Names without affiliations stay scoped to individual works. Provider identity errors and same-name/same-lab collisions remain possible. OpenAIRE's `orcid_pending` links are not promoted to verified ORCID identities.
- Authored works and supervised theses remain separate roles. Degree-awarding institutions and OpenAIRE's linked organizations appear as work context; they never establish a supervisor's employer or country. Keep unknown affiliations visible to avoid dropping these leads. Verify the person's current official profile.
- In the full **Researchers** tab, sorting uses matched terms in titles, abstracts and indexed keywords, retrieved query works, and recent evidence. The formula is `8 × matched terms + 2 × min(query works, 10) + min(works in the last 3 calendar years plus current year, 5)`. Citation counts and author order do not establish relevance, seniority, or suitability. Counts describe retrieved evidence, not complete careers.
- Coverage shows pages fetched, provider estimates, and errors. Estimates overlap across queries and sources and are **not** a count of distinct fusion publications. Crossref is a relevance search and can return loosely related records; read the evidence.
- Regular search tasks are bounded to 200 pages (10,000 records) per query/provider. OpenAlex without a key stops at the first search page. References use explicit ID batches, so further reference pages do not require an OpenAlex cursor; up to 10,000 IDs per seed are supported. Author/citing-work cursor paging still needs the free key. A full-corpus harvest is outside this app's scope.
- Abstracts and structured metadata are searched and shown. Full PDFs require manual reading. The official-page reader reports published text and links, including qualifying contacts. The app does not generate email addresses or establish current vacancies. Closed theses, papers missing from indexes, new labs, and private company work need additional institutional searches.

## Saving your work

- Your profile, feedback and official-page checks persist locally. **Save session** includes these settings and can transfer them between browsers. Previous session formats still open.
- The shortlist and notes live in this browser's `localStorage`. They do not sync to another browser or Vercel.
- **Save session** downloads the search scope, fetched works, cursors, source warnings, and current shortlist. **Open session** restores it. Existing local shortlist entries win when a backup contains the same identity, so newer local notes are not overwritten.
- **Backup JSON** and **Restore backup** on the Shortlist page transfer the shortlist independently. CSV is an export for reading/editing elsewhere, not an import format.
- Imports are validated and limited to 25 MB; sessions accept up to 20,000 work records. Very large research projects should be split into narrower saved sessions. Clearing browser storage without a backup loses the shortlist.
- Searches run in the open browser, with up to three scholarly requests in parallel. Closing the tab stops progress. There are no background jobs, scheduled alerts, or automatic emails.

## Architecture and operation

Next.js App Router + React + TypeScript. `app/api/research/route.ts` is a Node.js route with validated inputs and a 60-second duration request. It calls the scholarly APIs and reads public HTTPS pages on resolved institution domains. Keys remain on the server. The client orchestrates individual paginated requests, so a whole research sweep need not fit in one serverless invocation.

- `lib/providers.ts`: adapters, normalized metadata, short-lived cache, timeouts, one transient retry, author/citation expansion.
- `lib/repositories.ts`: HAL, OpenAIRE and theses.fr normalization with explicit supervisor roles and repository provenance.
- `lib/research.ts`: query vocabulary, exact identifier deduplication, person grouping, location filtering, explainable sorting, safe link/CSV helpers.
- `lib/session.ts`: validated session and shortlist backup formats.
- `data/organizations.json`: editable organization leads with evidence URLs.
- `app/page.tsx` and `app/globals.css`: search, results, evidence dossier, directory, shortlist, connections.

Provider responses also have a five-minute server cache. Up to 60 successful search pages persist in this browser for 24 hours. **Connections → Clear cached searches** removes those pages. arXiv requests are spaced at least 3.1 seconds apart per server instance, including retries; this is suitable for personal use, not coordinated rate limiting across many serverless instances. For a public multi-user service, add durable authentication, a shared queue/rate limiter, persistent storage, and usage limits before scaling. The optional password helps keep a personal deployment's quota personal.

Checking a person sends their name and indexed institution to your deployment and, when configured, to Brave Search. The reader requests matching public pages from the institution. Queries and institution lookups are sent to the relevant data providers through your deployment. Shortlist notes are stored locally and in your downloaded backups, not sent to scholarly APIs. Follow provider terms and publication licenses when redistributing metadata or full texts.

## Validation and development

```sh
npm test
npm run typecheck
npm run build
npm run format:check
```

The unit tests exercise deduplication, homonym separation, ORCID normalization, non-Latin names, individual-author location filtering, source normalization, unsafe URLs, CSV formula escaping, session validation, and API access/input validation.

An opt-in live adapter check makes real provider requests and may consume quota:

```sh
npm run smoke
npm run smoke:deep
```

If running that command locally with a key, set the environment variable in your shell or use Node's `--env-file=.env.local` option; Next.js automatically reads `.env.local` for the web app, but a standalone script does not.

No fake research results are shipped as production data. See [validation notes](docs/VALIDATION.md) for the checks performed on this delivery and remaining limitations.

## Extending coverage

The most useful next additions are institution-specific repository adapters and expanding the reviewed group and undergraduate programme directory. A durable database and job queue would support unattended sweeps and change tracking. Semantic search or an LLM can assist query expansion and paper triage, but should retain source evidence and uncertainty; neither is necessary for this version. New integrations are not silently enabled or represented as existing coverage.

Code is MIT-licensed. The license does not override the rights or terms of third-party data, documents, and linked publications.
