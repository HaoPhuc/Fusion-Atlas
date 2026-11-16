# Start using Fusion Atlas

The app is built and tested. No GitHub repository or Vercel project is connected to this folder yet.

## Try it locally

From this folder, run:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Next.js. If dependencies are already installed, skip `npm ci`.

1. Enter a topic such as **gyrokinetic turbulence** and start with **Anywhere**.
2. Open **Search plan**, review the synonyms, and select one page for an initial search.
3. Start discovery, then inspect **Coverage** for missing sources and pagination limits.
4. Open a researcher to read supporting publications. Follow references, citing works, and the author's bibliography to expand the investigation.
5. Save promising people to **Shortlist**. Record the specific paper, methods you could contribute, and undergraduate eligibility questions.
6. Download a JSON backup. Save a session to preserve the fetched literature and search progress too.

For location searches, select a country or resolve an institution through **Search plan → Institution or city**. City lookup returns candidate institutions; choose the relevant one. Keep unknown affiliations included while exploring.

Run a separate **Theses only** search with HAL / TEL, OpenAIRE, and theses.fr enabled. Use **With supervision evidence** to focus on explicitly named supervisors. Their dossiers distinguish supervised theses from authored work and link to the evidence. **Load full thesis metadata** adds an available theses.fr abstract; **Repository records** opens the underlying university or repository pages. Keep unknown affiliations included: degree institutions are not proof of a supervisor's employer. The search plan also offers French thesis queries.

## Enable deeper searches

Get a free key from [OpenAlex settings](https://openalex.org/settings/api). Copy `.env.example` to `.env.local` and set `OPENALEX_API_KEY`, then restart the app. The other six metadata sources need no API key. No plugin attachments or paid services are required.

Keep real keys out of Git commits and `NEXT_PUBLIC_` variables. The app's **Connections** screen reports whether the server has a key without exposing it.

## Deploy on Vercel

1. Upload the ZIP's source files to a GitHub repository, with `package.json` at its root.
2. Import the repository into Vercel. Select **Next.js**, Node.js **24** (22 also works), and the default build command, `npm run build`.
3. Add `OPENALEX_API_KEY` in Vercel's environment-variable settings. Optionally add `SITE_PASSWORD` to protect your personal API quota and `CONTACT_EMAIL` for Crossref and OpenAIRE.
4. Deploy. Redeploy after changing environment variables.
5. Check **Connections** and run a small search before increasing depth. If configured, enter the deployment password there.

To have the deployment connected for you, provide the target GitHub repository URL and Vercel project/team. Account sign-in may also be needed. Put API keys in the service's environment-variable settings rather than sharing them in chat.

Full thesis reading, current supervision roles, and internship availability still require official-source follow-up. See [README](README.md) for the complete workflow and [validation notes](docs/VALIDATION.md) for completed checks.
