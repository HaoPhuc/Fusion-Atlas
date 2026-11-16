import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHal,
  normalizeOpenAire,
  normalizeThesesFr,
} from "../lib/repositories";
import {
  normalizeDataCite,
  expandGraph,
  searchProvider,
  thesisDetails,
} from "../lib/providers";
import { mergeWorks, peopleFrom, shortlistCsv } from "../lib/research";
import { sessionSchema } from "../lib/session";
import { PROVIDERS } from "../lib/types";

const thesis = () =>
  normalizeThesesFr(
    {
      nnt: "2025TEST0001",
      titrePrincipal: "Tokamak turbulence",
      dateSoutenance: "12/06/2025",
      auteurs: [{ nom: "Student", prenom: "A", ppn: "123456789" }],
      directeurs: [{ nom: "Advisor", prenom: "B", ppn: "98765432X" }],
      rapporteurs: [{ nom: "Reviewer", prenom: "C", ppn: "111111111" }],
      etabSoutenanceN: "Test University",
      etabSoutenancePpn: "222222222",
      sujets: [{ libelle: "gyrokinetic" }],
    },
    "tokamak",
  );

test("thesis participants retain explicit roles without invented employment or reviewer supervision", () => {
  const w = thesis();
  assert.equal(w.year, 2025);
  assert.deepEqual(
    w.authors.map((a) => a.name),
    ["A Student"],
  );
  assert.deepEqual(
    w.supervisors?.map((a) => a.name),
    ["B Advisor"],
  );
  assert.equal(w.supervisors?.[0].profileUrl, "https://www.idref.fr/98765432X");
  const ps = peopleFrom([w], "gyrokinetic", "FR");
  const supervisor = ps.find((p) => p.name === "B Advisor")!;
  assert.equal(supervisor.authoredWorkIds?.length, 0);
  assert.deepEqual(supervisor.supervisedWorkIds, [w.id]);
  assert.deepEqual(supervisor.institutions, []);
  assert.equal(peopleFrom([w], "tokamak", "FR", "", false).length, 0);
  assert.ok(supervisor.matched.includes("gyrokinetic"));
  assert.ok(!ps.some((p) => p.name.includes("Reviewer")));
});

test("HAL and theses.fr join by NNT without DOI, retain both records, and enrich supervisor identity", () => {
  const hal = normalizeHal({
    halId_s: "tel-test",
    nntId_s: "2025TEST0001",
    title_s: ["French title"],
    en_title_s: ["English title"],
    docType_s: "THESE",
    authFullName_s: ["A Student"],
    director_s: ["B Advisor"],
    authorityInstitution_s: ["Test University"],
  });
  const merged = mergeWorks([hal, thesis()]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].supervisors?.length, 1);
  assert.equal(merged[0].supervisors?.[0].externalId, "idref:98765432X");
  assert.equal(merged[0].records?.length, 2);
  assert.equal(hal.supervisors?.[0].externalId, undefined);
  assert.equal(peopleFrom(merged, "tokamak").length, 2);
  const different = thesis();
  different.id = "nnt:2024TEST0002";
  different.identifiers = [different.id];
  assert.equal(mergeWorks([hal, different]).length, 2);
  assert.equal(
    peopleFrom([thesis(), different], "tokamak").find(
      (p) => p.name === "B Advisor",
    )?.works.length,
    2,
  );
});

test("supervisor homonyms with conflicting IdRef identities stay separate", () => {
  const a = thesis();
  const b = thesis();
  b.supervisors![0].externalId = "idref:333333333";
  assert.equal(mergeWorks([a, b])[0].supervisors?.length, 2);
});

test("OpenAIRE keeps repository links and work context without promoting pending ORCIDs or free-text contributors", () => {
  const w = normalizeOpenAire({
    id: "fixture",
    mainTitle: "Tokamak thesis",
    publicationDate: "2023-01-01",
    type: "publication",
    authors: [
      {
        fullName: "A Student",
        pid: { id: { scheme: "orcid_pending", value: "0000-0000-0000-0001" } },
      },
    ],
    contributors: ["B Advisor"],
    countries: [{ code: "NL" }],
    organizations: [
      { legalName: "University", websiteurl: "https://example.org" },
    ],
    instances: [
      {
        type: "Doctoral thesis",
        urls: ["https://example.org/thesis", "javascript:alert(1)"],
        hostedBy: { value: "Repository" },
      },
    ],
    pids: [{ scheme: "doi", value: "10.1234/Test" }],
  });
  assert.equal(w.type, "Doctoral thesis");
  assert.equal(w.doi, "10.1234/test");
  assert.equal(w.records?.length, 1);
  assert.equal(w.authors[0].orcid, undefined);
  assert.deepEqual(w.authors[0].institutions, []);
  assert.equal(w.supervisors, undefined);
});

test("DataCite exposes only explicitly typed thesis supervisors", () => {
  const w = normalizeDataCite({
    id: "10.1234/test",
    attributes: {
      types: { resourceTypeGeneral: "Dissertation" },
      creators: [{ name: "Student" }],
      contributors: [
        { name: "Supervisor", contributorType: "Supervisor" },
        { name: "Editor", contributorType: "Editor" },
        { name: "Contact", contributorType: "ContactPerson" },
      ],
    },
  });
  assert.deepEqual(
    w.supervisors?.map((a) => a.name),
    ["Supervisor"],
  );
  assert.deepEqual(
    w.authors.map((a) => a.name),
    ["Student"],
  );
});

test("new provenance, roles, and seven-source query plans survive session and shortlist exports", () => {
  const w = thesis();
  const person = peopleFrom([w], "tokamak").find(
    (p) => p.name === "B Advisor",
  )!;
  const saved = {
    person,
    notes: "Verify availability",
    status: "To investigate",
    savedAt: new Date().toISOString(),
  };
  const raw = {
    version: 1,
    topic: "tokamak",
    options: { from: 2020, to: 2026, country: "", theses: true },
    works: [w],
    tasks: PROVIDERS.flatMap((provider) =>
      Array.from({ length: 8 }, (_, i) => ({
        provider,
        query: `tokamak ${i}`,
        page: 1,
      })),
    ),
    shortlist: [saved],
  };
  const restored = sessionSchema.parse(JSON.parse(JSON.stringify(raw)));
  assert.equal(restored.tasks.length, 56);
  assert.equal(
    restored.works[0].supervisors?.[0].externalId,
    "idref:98765432X",
  );
  assert.deepEqual(restored.shortlist?.[0].person.supervisedWorkIds, [w.id]);
  assert.ok(shortlistCsv([saved]).includes('"Named supervisor evidence"'));
});

test("references page beyond 100 IDs without a key and retain their seed provenance", async () => {
  const original = global.fetch;
  const key = process.env.OPENALEX_API_KEY;
  delete process.env.OPENALEX_API_KEY;
  const urls: URL[] = [];
  global.fetch = async (input) => {
    const u = new URL(String(input));
    urls.push(u);
    return Response.json(
      u.pathname.includes("/W98765001")
        ? {
            referenced_works: Array.from(
              { length: 127 },
              (_, i) => `https://openalex.org/W${i + 1}`,
            ),
          }
        : {
            results: [
              {
                id: "https://openalex.org/W101",
                title: "Reference",
                authorships: [],
              },
            ],
          },
    );
  };
  try {
    const r = await expandGraph(
      "https://openalex.org/W98765001",
      "references",
      3,
    );
    assert.equal(r.total, 127);
    assert.equal(r.next, undefined);
    assert.equal(urls[1].searchParams.get("filter")?.split("|").length, 27);
    assert.ok(
      urls[1].searchParams.get("filter")?.startsWith("openalex_id:W101|"),
    );
    assert.equal(
      r.works[0].relatedTo?.[0].id,
      "https://openalex.org/W98765001",
    );
    assert.deepEqual(r.warnings, []);
  } finally {
    global.fetch = original;
    if (key) process.env.OPENALEX_API_KEY = key;
  }
});

test("new adapters transmit bounded date/type filters and advance pages", async () => {
  const original = global.fetch;
  const urls: URL[] = [];
  global.fetch = async (input) => {
    const u = new URL(String(input));
    urls.push(u);
    if (u.hostname === "theses.fr")
      return Response.json({
        totalHits: 102,
        theses: Array.from({ length: 50 }, () => ({ nnt: "2025TEST0001" })),
      });
    if (u.hostname === "api.openaire.eu")
      return Response.json({
        header: { numFound: 102 },
        results: Array.from({ length: 50 }, (_, i) => ({ id: i, authors: [] })),
      });
    return Response.json({
      response: {
        numFound: 102,
        docs: Array.from({ length: 50 }, (_, i) => ({ halId_s: i })),
      },
    });
  };
  try {
    for (const provider of ["hal", "openaire", "thesesfr"] as const) {
      const r = await searchProvider(provider, "test tokamak", 2, "2", {
        from: 2021,
        to: 2025,
        theses: true,
        country: "",
      });
      assert.equal(r.next, "3");
      assert.equal(r.works.length, 50);
    }
    assert.equal(urls[0].searchParams.get("start"), "50");
    assert.match(urls[0].searchParams.get("fq")!, /2021 TO 2025.*THESE/);
    assert.match(
      urls[1].searchParams.get("filter")!,
      /instance_type:Doctoral thesis\|Master thesis\|Thesis/,
    );
    assert.match(
      urls[2].searchParams.get("q")!,
      /status:soutenue AND dateSoutenance:\[2021-01-01 TO 2025-12-31\]/,
    );
    assert.equal(urls[2].searchParams.get("debut"), "50");
  } finally {
    global.fetch = original;
  }
});

test("full thesis details merge into search results without losing keywords and evidence", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    Response.json({
      nnt: "2025TEST0001",
      status: "soutenue",
      titrePrincipal: "Tokamak turbulence",
      resumes: { en: "Expanded plasma abstract" },
      directeurs: [{ prenom: "B", nom: "Advisor", ppn: "98765432X" }],
    });
  try {
    const r = await thesisDetails("2025TEST0001");
    const merged = mergeWorks([thesis(), ...r.works]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].abstract, "Expanded plasma abstract");
    assert.deepEqual(merged[0].keywords, ["gyrokinetic"]);
    assert.equal(merged[0].authors.length, 1);
  } finally {
    global.fetch = original;
  }
});
