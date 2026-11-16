// Opt-in live repository checks; uses public API quotas. npm run smoke:deep
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { searchProvider, thesisDetails, expandGraph } from "../lib/providers";
import { mergeWorks, peopleFrom } from "../lib/research";
import { sessionSchema } from "../lib/session";
import type { Work } from "../lib/types";

async function main() {
  const all: Work[] = [];
  const options = { from: 2020, to: 2026, theses: true, country: "" };
  let failures = 0;
  for (const provider of ["hal", "openaire", "thesesfr"] as const) {
    try {
      const r = await searchProvider(
        provider,
        "tokamak",
        1,
        undefined,
        options,
      );
      assert.ok(r.works.length > 0, `${provider}: expected thesis records`);
      all.push(...r.works);
      let secondPage = 0;
      if (r.next) {
        const next = await searchProvider(
          provider,
          "tokamak",
          2,
          r.next,
          options,
        );
        secondPage = next.works.length;
        assert.ok(
          next.works.some((w) => !r.works.some((x) => x.id === w.id)),
          `${provider}: repeated first page`,
        );
        all.push(...next.works);
      }
      console.log(
        JSON.stringify({
          provider,
          firstPage: r.works.length,
          secondPage,
          total: r.total,
          supervisors: r.works.reduce(
            (n, w) => n + (w.supervisors?.length || 0),
            0,
          ),
        }),
      );
    } catch (e) {
      failures++;
      console.log(JSON.stringify({ provider, error: (e as Error).message }));
    }
  }
  try {
    const details = await thesisDetails("2021COAZ4098");
    assert.ok(details.works[0].abstract.length > 100);
    assert.ok(details.works[0].supervisors?.length);
    all.push(...details.works);
    console.log(
      JSON.stringify({
        thesisDetails: "2021COAZ4098",
        abstractCharacters: details.works[0].abstract.length,
      }),
    );
  } catch (e) {
    failures++;
    console.log(JSON.stringify({ detailError: (e as Error).message }));
  }
  const works = mergeWorks(all);
  const session = sessionSchema.parse(
    JSON.parse(
      JSON.stringify({
        version: 1,
        topic: "tokamak",
        options,
        works,
        tasks: [],
      }),
    ),
  );
  const supervisors = peopleFrom(works, "tokamak").filter(
    (p) => p.supervisedWorkIds?.length,
  );
  assert.ok(supervisors.length, "Expected explicit supervision records");
  console.log(
    JSON.stringify({
      records: all.length,
      uniqueWorks: works.length,
      supervisorIdentities: supervisors.length,
    }),
  );
  // This article is indexed in OpenAlex; resolve via DOI and request references.
  try {
    const r = await expandGraph(
      "doi:10.1088/0029-5515/47/6/S01",
      "references",
      1,
    );
    assert.ok(r.works.some((w) => w.relatedTo?.length));
    console.log(
      JSON.stringify({
        doiGraph: r.works.length,
        references: r.total,
        next: r.next,
      }),
    );
    if (r.total > 100) {
      const third = await expandGraph(r.id!, "references", 3);
      assert.ok(third.works.length);
      console.log(JSON.stringify({ referencesBeyond100: third.works.length }));
    }
  } catch (e) {
    failures++;
    console.log(JSON.stringify({ graphError: (e as Error).message }));
  }
  if (process.argv.includes("--save")) {
    await mkdir("work", { recursive: true });
    await writeFile("work/deep-session.json", JSON.stringify(session));
  }
  if (failures) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
