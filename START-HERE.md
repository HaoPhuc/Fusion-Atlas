# Start using Fusion Atlas

This folder is ready to use as the root of a GitHub repository for Vercel.

## Try it locally

From this folder, run:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Next.js. If dependencies are already installed, skip `npm ci`.

1. Under **Edit profile**, add the methods you can contribute and any country preference.
2. Enter a topic. For a first example, try **spectroscopy** with **Australia** selected. Choose **Start discovery**.
3. Open **Recommended contacts**. The ANU project lists Cormac Corr as supervisor. Follow the project page to check which student formats fit your plans. Other searches can surface named thesis supervisors or another institution’s application process.
4. Read **Your next step** and **Still to confirm**. Save promising contacts or use the feedback selector to dismiss a poor fit. Hidden leads can be restored.
5. **Continue sweep** expands the search across the selected queries and sources. **Coverage** shows what was checked. **Researchers** and **Papers & theses** let you investigate the underlying records.
6. Use **Save session** to export the search, contact evidence, profile and feedback. The shortlist also has an independent JSON backup.

The header lets you switch between Dark, Light and System. Dark is the initial setting.

For location searches, select a country or resolve an institution through **Search plan → Institution or city**. City lookup returns candidate institutions; choose the relevant one. Keep unknown affiliations included while exploring.

Run a separate **Theses only** search with HAL / TEL, OpenAIRE, and theses.fr enabled. Use **With supervision evidence** to focus on explicitly named supervisors. Their dossiers distinguish supervised theses from authored work and link to the evidence. **Load full thesis metadata** adds an available theses.fr abstract; **Repository records** opens the underlying university or repository pages. Keep unknown affiliations included: degree institutions are not proof of a supervisor's employer. The search plan also offers French thesis queries.

## Enable deeper searches

Get a free key from [OpenAlex settings](https://openalex.org/settings/api). Copy `.env.example` to `.env.local` and set `OPENALEX_API_KEY`, then restart the app. The other six metadata sources need no API key. The official-page reader also works without a key. If you already use Brave Search API, you can optionally add `BRAVE_SEARCH_API_KEY` to locate deeper profiles. No plugin attachments or paid services are required.

Keep real keys out of Git commits and `NEXT_PUBLIC_` variables. The app's **Connections** screen reports whether the server has a key without exposing it.

## Deploy on Vercel

1. Upload the ZIP's source files to a GitHub repository, with `package.json` at its root.
2. Import the repository into Vercel. Select **Next.js**, Node.js **24** (22 also works), and the default build command, `npm run build`.
3. Add `OPENALEX_API_KEY` in Vercel's environment-variable settings. Optionally add `SITE_PASSWORD` to protect your personal API quota and `CONTACT_EMAIL` for Crossref and OpenAIRE.
4. Deploy. Redeploy after changing environment variables.
5. Check **Connections** and run a small search before increasing depth. If configured, enter the deployment password there.

To have the deployment connected for you, provide the target GitHub repository URL and Vercel project/team. Account sign-in may also be needed. Put API keys in the service's environment-variable settings rather than sharing them in chat.

Open the source on each card to check current availability, eligibility and funding. See [README](README.md) for the complete workflow and [validation notes](docs/VALIDATION.md) for completed checks.
