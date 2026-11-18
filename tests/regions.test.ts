import test from "node:test";
import assert from "node:assert/strict";
import {
  blankBoard,
  makeBoard,
  distance,
  regionSchema,
  type Region,
} from "../lib/regions";
import {
  contactCandidates,
  sameContact,
  contactIdentity,
  matchingStateSchema,
  type Recommendation,
} from "../lib/matching";
import { searchRegionalPage } from "../lib/providers";
import { uniqueInstitutions } from "../lib/research";
const g: Region = {
  home: { name: "Origin", country: "NL", lat: 52, lon: 5 },
  radius: 100,
  nearCountries: ["NL", "BE", "DE"],
  destinations: ["DE", "FR", "US", "CH", "GB"],
};
function candidate(
  key: string,
  country: string,
  lat?: number,
  city = key,
  score = 70,
): Recommendation {
  const inst = { id: key, name: key, country, lat, lon: 5, city };
  return {
    person: {
      key,
      name: key,
      institutions: [inst],
      works: [],
      score,
      matched: [],
      identity: "fixture",
      corresponding: false,
    },
    rank: score,
    fit: "Strong",
    reasons: [],
    gaps: [],
    matched: [],
    works: [],
    groupKey: key,
    groupName: key,
    groupNote: "",
    lane: "investigate",
    action: "Inspect evidence",
    hidden: false,
  };
}
const data = [
  candidate("border", "BE", 52.1),
  candidate("near", "NL", 52.2),
  candidate("near2", "NL", 52.25),
  candidate("near3", "NL", 52.3),
  candidate("distant", "NL", 54),
  candidate("distant2", "NL", 54.1),
  ...g.destinations.map((c) => candidate("abroad" + c, c, 45)),
];
test("ten slots, cross-border radius, distance tie-break, distinct people and groups", () => {
  const r = makeBoard(data, g, blankBoard);
  assert.equal(Object.keys(r).length, 10);
  assert.equal(r.near0.key, "border");
  assert.ok(r.home0.km! > 100);
  assert.notEqual(r.home0.city, r.home1.city);
  assert.equal(r.awayDE.country, "DE");
  assert.equal(new Set(Object.values(r).map((p) => p.key)).size, 10);
  assert.equal(distance(g.home, g.home), 0);
});
test("replacing one group, contacting a person and swapping one country preserve other occupied slots", () => {
  const initial = makeBoard(data, g, blankBoard),
    pins = Object.fromEntries(
      Object.entries(initial).map(([s, p]) => [s, p.key]),
    );
  const next = makeBoard(data, g, {
    ...blankBoard,
    pins,
    skipGroups: [initial.near1.c.groupKey],
  });
  assert.notEqual(next.near1.key, initial.near1.key);
  for (const [id, p] of Object.entries(initial))
    if (id !== "near1") assert.equal(next[id]?.key, p.key);
  const swapped = makeBoard(
    [...data, candidate("Japan", "JP", 35)],
    { ...g, destinations: ["DE", "FR", "JP", "CH", "GB"] },
    { ...blankBoard, pins },
  );
  assert.equal(swapped.awayJP.key, "Japan");
  assert.equal(swapped.near2.key, initial.near2.key);
  const contacted = makeBoard(
    data.map((p) => ({ ...p, hidden: p.person.key === initial.near0.key })),
    g,
    { ...blankBoard, pins },
  );
  assert.ok(!Object.values(contacted).some((p) => p.key === initial.near0.key));
});
test("missing coordinates never establish local or domestic distance; weak work never fills a slot", () => {
  const r = makeBoard(
    [
      candidate("unknown", "NL"),
      candidate("usa", "US"),
      { ...candidate("weak", "DE", 52), fit: "Broad" },
    ],
    g,
    blankBoard,
  );
  assert.deepEqual(Object.keys(r), ["awayUS"]);
  assert.equal(r.awayUS.km, undefined);
  assert.equal(
    regionSchema.safeParse({ ...g, destinations: ["DE", "DE"] }).success,
    false,
  );
});
test("group campus locations and official contacts work before metadata pages arrive", () => {
  const contacts = contactCandidates(
    [],
    "machine learning plasma control",
    matchingStateSchema.parse({}),
    { country: "" },
    Date.parse("2026-11-18"),
  );
  const r = makeBoard(contacts, g, blankBoard);
  assert.equal(r.near0.city, "Eindhoven");
  assert.equal(r.awayCH.city, "Lausanne");
  const old = r.near0.c.person.institutions[0];
  assert.equal(
    uniqueInstitutions([{ ...old, lat: 51, lon: 5, city: "Eindhoven" }, old])[0]
      .lat,
    51,
  );
});
test("contacted group leader also hides institutional initials without merging different full names", () => {
  const state = matchingStateSchema.parse({});
  const lead = contactCandidates([], "plasma control", state, {
    country: "NL",
  })[0];
  state.feedback = [
    {
      personKey: lead.person.key,
      kind: "contacted",
      terms: [],
      topic: "previous search",
      updatedAt: "2026-11-18",
    },
  ];
  const alias = {
    ...lead.person,
    key: "publication-author",
    name: "M. van Berkel",
  };
  const prior = contactCandidates([alias], "plasma control", state, {
    country: "NL",
  });
  assert.ok(prior.find((c) => c.person.key === "publication-author")?.hidden);
  assert.equal(
    sameContact(
      { ...alias, name: "Mark van Berkel" },
      contactIdentity(lead.person),
    ),
    false,
  );
  assert.equal(
    sameContact({ ...alias, institutions: [] }, contactIdentity(lead.person)),
    false,
  );
});
test("geographic queries send OR-country filters and enrich exact personal affiliations", async () => {
  const old = global.fetch;
  const requests: URL[] = [];
  global.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const id = "https://openalex.org/I123";
    return Response.json(
      url.pathname === "/works"
        ? {
            results: [
              {
                id: "W",
                title: "tokamak",
                authorships: [
                  {
                    author: { display_name: "A" },
                    institutions: [
                      { id, country_code: "DE", display_name: "Inst" },
                    ],
                  },
                ],
              },
            ],
            meta: { count: 1 },
          }
        : {
            results: [
              {
                id,
                country_code: "DE",
                geo: { city: "Berlin", latitude: 52.5, longitude: 13.4 },
              },
            ],
          },
    );
  };
  try {
    const r = await searchRegionalPage(
      "tokamak fixture",
      1,
      undefined,
      ["DE", "NL"],
      { from: 2020, to: 2026, theses: false, country: "" },
    );
    assert.ok(
      requests[0].searchParams
        .get("filter")
        ?.includes("institutions.country_code:DE|NL"),
    );
    assert.equal(r.works[0].authors[0].institutions[0].city, "Berlin");
  } finally {
    global.fetch = old;
  }
});
