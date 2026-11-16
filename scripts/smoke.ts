// Opt-in live check. Uses your configured key/quota if present; never runs in npm test.
import { writeFile, mkdir } from "node:fs/promises";
import {
  searchProvider,
  findInstitutions,
  expandGraph,
} from "../lib/providers";
import { mergeWorks, peopleFrom } from "../lib/research";
import type { Provider, Work } from "../lib/types";
import { PROVIDERS } from "../lib/types";
async function main() {
  const all: Work[] = [];
  let failures = 0;
  for (const provider of PROVIDERS) {
    try {
      const r = await searchProvider(provider, "tokamak", 1, undefined, {
        from: 2020,
        to: 2026,
        country: "",
        theses: false,
      });
      all.push(...r.works);
      console.log(
        JSON.stringify({
          provider,
          works: r.works.length,
          total: r.total,
          title: r.works[0]?.title,
          authors: r.works[0]?.authors.length,
          warnings: r.warnings,
        }),
      );
    } catch (e) {
      failures++;
      console.log(JSON.stringify({ provider, error: (e as Error).message }));
    }
  }
  try {
    const r = await findInstitutions("Eindhoven");
    console.log(JSON.stringify({ institutions: r.slice(0, 3) }));
  } catch (e) {
    failures++;
    console.log(String(e));
  }
  const works = mergeWorks(all);
  const author = works.flatMap((w) => w.authors).find((a) => a.id);
  if (author?.id)
    try {
      const r = await expandGraph(author.id, "author", 1);
      console.log(
        JSON.stringify({
          author: author.name,
          bibliography: r.works.length,
          profile: r.profile?.name,
        }),
      );
    } catch (e) {
      failures++;
      console.log(String(e));
    }
  console.log(
    JSON.stringify({
      uniqueWorks: works.length,
      researchers: peopleFrom(works, "tokamak").length,
    }),
  );
  if (process.argv.includes("--save")) {
    await mkdir("work", { recursive: true });
    await writeFile(
      "work/live-session.json",
      JSON.stringify(
        {
          version: 1,
          topic: "tokamak",
          options: { from: 2020, to: 2026, country: "", theses: false },
          tasks: [],
          works,
        },
        null,
        2,
      ),
    );
  }
  if (failures) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
