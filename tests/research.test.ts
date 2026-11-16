import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expand,
  mergeWorks,
  peopleFrom,
  normalize,
  safeUrl,
  csvCell,
} from "../lib/research";
import {
  abstractFromIndex,
  normalizeOpenAlex,
  normalizeCrossref,
  normalizeDataCite,
  parseArxiv,
  searchProvider,
} from "../lib/providers";
import { sessionSchema } from "../lib/session";
import type { Work } from "../lib/types";
const work = (changes: Partial<Work> = {}): Work => ({
  id: "fixture:1",
  title: "Plasma turbulence in fusion",
  year: 2025,
  type: "article",
  abstract: "",
  url: "https://example.org/paper",
  authors: [],
  sources: ["Fixture"],
  queries: ["plasma turbulence"],
  citedBy: 0,
  references: [],
  discovered: "query",
  retrievedAt: "2026-11-14T00:00:00Z",
  ...changes,
});
test("query expansion adds fusion synonyms but preserves explicit methods", () => {
  assert.ok(expand("tungsten").includes("plasma facing components fusion"));
  assert.ok(
    expand("gyrokinetic turbulence").includes("gyrokinetic turbulence"),
  );
  assert.ok(expand("tokamak material simulation control").length <= 6);
});
test("same DOI merges sources and author metadata without mutating inputs", () => {
  const a = work({
    doi: "10.1/ABC",
    authors: [{ name: "Test Researcher", institutions: [] }],
  });
  const b = work({
    id: "https://openalex.org/W1",
    doi: "https://doi.org/10.1/abc",
    openalexId: "https://openalex.org/W1",
    sources: ["OpenAlex"],
    authors: [
      {
        name: "Test Researcher",
        id: "https://openalex.org/A1",
        institutions: [],
      },
    ],
  });
  const merged = mergeWorks([a, b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].authors[0].id, b.authors[0].id);
  assert.equal(a.authors[0].id, undefined);
  assert.deepEqual(merged[0].sources, ["Fixture", "OpenAlex"]);
});
test("a later identifier bridge coalesces all records, but a title alone does not", () => {
  assert.equal(
    mergeWorks([
      work({ id: "a", doi: "10.1/a" }),
      work({ id: "b" }),
      work({ id: "b", doi: "10.1/a" }),
    ]).length,
    1,
  );
  assert.equal(mergeWorks([work({ id: "a" }), work({ id: "b" })]).length, 2);
});
test("strong author IDs keep homonyms separate even on the same paper", () => {
  const merged = mergeWorks([
    work({ authors: [{ name: "Test Name", id: "A1", institutions: [] }] }),
    work({ authors: [{ name: "Test Name", id: "A2", institutions: [] }] }),
  ]);
  assert.equal(merged[0].authors.length, 2);
  assert.equal(peopleFrom(merged, "plasma").length, 2);
});
test("ORCID normalization connects author IDs and retains bibliography lookup ID", () => {
  const ps = peopleFrom(
    [
      work({
        id: "a",
        authors: [
          { name: "Test One", orcid: "0000-0001-0002-000X", institutions: [] },
        ],
      }),
      work({
        id: "b",
        authors: [
          {
            name: "Test One",
            orcid: "https://orcid.org/0000-0001-0002-000x",
            id: "A1",
            institutions: [],
          },
        ],
      }),
      work({
        id: "c",
        authors: [{ name: "Test One", id: "A1", institutions: [] }],
      }),
    ],
    "plasma",
  );
  assert.equal(ps.length, 1);
  assert.equal(ps[0].works.length, 3);
  assert.equal(ps[0].id, "A1");
});
test("unknown names stay work scoped and non-Latin names are not collapsed", () => {
  assert.equal(normalize("王明"), "王明");
  const ps = peopleFrom(
    [
      work({
        authors: [
          { name: "王明", institutions: [] },
          { name: "李明", institutions: [] },
        ],
      }),
      work({ id: "2", authors: [{ name: "王明", institutions: [] }] }),
    ],
    "plasma",
  );
  assert.equal(ps.length, 3);
});
test("geographic filters apply to the individual author, not a coauthor", () => {
  const w = work({
    authors: [
      {
        name: "Local",
        id: "A1",
        institutions: [
          { id: "https://openalex.org/I1", name: "Lab", country: "NL" },
        ],
      },
      {
        name: "Abroad",
        id: "A2",
        institutions: [
          { id: "https://openalex.org/I2", name: "Other", country: "US" },
        ],
      },
      {
        name: "Unknown",
        institutions: [{ id: "unresolved", name: "Unresolved lab" }],
      },
    ],
  });
  assert.deepEqual(
    peopleFrom([w], "plasma", "NL", "", true)
      .map((p) => p.name)
      .sort(),
    ["Local", "Unknown"],
  );
  assert.deepEqual(
    peopleFrom([w], "plasma", "NL", "", false).map((p) => p.name),
    ["Local"],
  );
  assert.equal(
    peopleFrom([w], "plasma", "", "https://openalex.org/I1", true).length,
    2,
  );
});
test("citation counts cannot dominate topic relevance", () => {
  const list = peopleFrom(
    [
      work({
        title: "Unrelated",
        citedBy: 999999,
        authors: [{ name: "Popular", id: "A1", institutions: [] }],
      }),
      work({
        id: "b",
        authors: [{ name: "Relevant", id: "A2", institutions: [] }],
      }),
    ],
    "plasma turbulence",
  );
  assert.equal(list[0].name, "Relevant");
});
test("outbound links and CSV cells reject executable content", () => {
  assert.equal(safeUrl("javascript:alert(1)"), undefined);
  assert.equal(safeUrl("data:text/html,test"), undefined);
  assert.equal(safeUrl("https://example.org"), "https://example.org/");
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell('a"b'), '"a""b"');
});
test("provider normalization recovers abstracts, dates, ORCID and thesis metadata", () => {
  assert.equal(
    abstractFromIndex({ fusion: [1], Nuclear: [0] }),
    "Nuclear fusion",
  );
  assert.equal(
    normalizeOpenAlex({ id: "W1", authorships: [], publication_year: 2024 })
      .year,
    2024,
  );
  assert.equal(
    normalizeCrossref({
      DOI: "10.1/x",
      title: ["T"],
      abstract: "<jats:p>Text</jats:p>",
      published: { "date-parts": [[2023]] },
    }).abstract,
    "Text",
  );
  const d = normalizeDataCite({
    id: "10.1/y",
    attributes: {
      titles: [{ title: "Thesis" }],
      types: { resourceTypeGeneral: "Dissertation" },
      creators: [
        {
          name: "Test",
          nameIdentifiers: [
            {
              nameIdentifierScheme: "ORCID",
              nameIdentifier: "0000-0001-0002-000X",
            },
          ],
        },
      ],
    },
  });
  assert.equal(d.type, "Dissertation");
  assert.ok(d.authors[0].orcid);
});
test("arXiv parses namespaces, author affiliation, DOI and PDF links", () => {
  const r = parseArxiv(
    '<feed xmlns:opensearch="http://a" xmlns:arxiv="http://b"><opensearch:totalResults>1</opensearch:totalResults><entry><id>https://arxiv.org/abs/1234.5678</id><title>Fusion</title><published>2024-02-01</published><summary>Summary</summary><arxiv:doi>10.1/z</arxiv:doi><author><name>Test Name</name><arxiv:affiliation>Test Lab</arxiv:affiliation></author><link title="pdf" href="https://arxiv.org/pdf/1234.5678"/></entry></feed>',
  );
  assert.equal(r.total, 1);
  assert.equal(r.works[0].authors[0].institutions[0].name, "Test Lab");
  assert.equal(r.works[0].doi, "10.1/z");
  assert.ok(r.works[0].pdf);
});
test("untrusted session imports require structured work and cursor data", () => {
  assert.equal(
    sessionSchema.safeParse({
      version: 1,
      topic: "fusion",
      options: { from: 2020, to: 2026, country: "", theses: false },
      tasks: [],
      works: [work()],
    }).success,
    true,
  );
  assert.equal(
    sessionSchema.safeParse({ version: 1, works: [{}] }).success,
    false,
  );
});
test("missing provider identifiers survive a JSON session round trip", () => {
  const w = normalizeOpenAlex({
    id: "https://openalex.org/W42",
    authorships: [
      {
        author: {
          display_name: "Test missing metadata",
          id: null,
          orcid: null,
        },
        is_corresponding: null,
        institutions: [
          {
            id: "https://openalex.org/I42",
            display_name: "Test lab",
            country_code: null,
            ror: null,
          },
        ],
      },
    ],
  });
  const session = {
    version: 1,
    topic: "fusion",
    options: { from: 2020, to: 2026, country: "", theses: false },
    tasks: [],
    works: [w],
  };
  assert.equal(
    sessionSchema.safeParse(JSON.parse(JSON.stringify(session))).success,
    true,
  );
  assert.equal(w.authors[0].orcid, undefined);
});
test("OpenAlex includes filters and reports keyless pagination limits", async () => {
  const original = global.fetch,
    key = process.env.OPENALEX_API_KEY;
  delete process.env.OPENALEX_API_KEY;
  try {
    global.fetch = async (input: any) => {
      const u = new URL(input);
      assert.ok(
        u.searchParams.get("filter")?.includes("institutions.country_code:NL"),
      );
      return Response.json({
        results: [{ id: "Wfixture", authorships: [] }],
        meta: { count: 300, next_cursor: "next" },
      });
    };
    const r = await searchProvider(
      "openalex",
      "test filter fixture",
      1,
      undefined,
      { from: 2020, to: 2026, country: "NL", theses: false },
    );
    assert.equal(r.next, undefined);
    assert.match(r.warnings.join(" "), /OPENALEX_API_KEY/);
  } finally {
    global.fetch = original;
    if (key) process.env.OPENALEX_API_KEY = key;
  }
});
