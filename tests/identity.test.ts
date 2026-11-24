import { test } from "node:test";
import assert from "node:assert/strict";
import { namesCompatible, personHasKey } from "../lib/identity";
import {
  contactCandidates,
  matchingStateSchema,
  rankCandidates,
} from "../lib/matching";
import { peopleFrom, mergeWorks } from "../lib/research";
import { sessionSchema, shortlistBackupSchema } from "../lib/session";
import { blankBoard, makeBoard } from "../lib/regions";
import type { Author, Work, IdentityDecision } from "../lib/types";

const tue = {
  id: "I-TUE",
  name: "Eindhoven University of Technology",
  country: "NL",
};
const differ = { id: "I-DIFFER", name: "DIFFER", country: "NL" };
const author = (name: string, changes: Partial<Author> = {}): Author => ({
  name,
  institutions: [tue],
  ...changes,
});
const work = (id: string, ...authors: Author[]): Work => ({
  id,
  authors,
  title: "Tokamak control",
  year: 2026,
  type: "article",
  url: "https://example.org/paper",
  abstract: "",
  sources: ["Fixture"],
  queries: [],
  references: [],
  citedBy: 0,
  discovered: "query",
  retrievedAt: "2026-11-24",
});
const people = (works: Work[], decisions: IdentityDecision[] = []) =>
  peopleFrom(works, "tokamak control", "", "", true, decisions);
const decision = (
  decision: IdentityDecision["decision"],
  ...keys: string[]
): IdentityDecision => ({
  decision,
  keys,
  decidedAt: "2026-11-24",
});
const session = {
  version: 1,
  topic: "tokamak control",
  options: { from: 2020, to: 2026, country: "", theses: false },
  tasks: [],
};
const ambiguous = [
  work("1", author("J. Smith")),
  work("2", author("Jane Smith", { id: "A2" })),
  work("3", author("John Smith", { id: "A3" })),
];

test("an OpenAlex author and HAL supervisor can match by name and affiliation alone", () => {
  const thesis = {
    ...work("thesis"),
    supervisors: [
      {
        ...author("Jan Smith", { externalId: "idhal:js" }),
        evidenceUrl: "https://example.org/thesis",
        evidenceSource: "HAL",
      },
    ],
  };
  const ps = people([work("paper", author("Jan Smith", { id: "A1" })), thesis]);
  assert.equal(ps.length, 1);
  const [p] = ps;
  assert.equal(p.key, "A1");
  assert.equal(
    p.identity,
    "Merged by name and shared institution (unverified)",
  );
  assert.ok(personHasKey(p, "idhal:js"));
  assert.ok(p.aliases?.includes("A1"));
  assert.match(p.mergedBy![0].detail, /Eindhoven University of Technology/);
  assert.deepEqual(p.authoredWorkIds, ["paper"]);
  assert.deepEqual(p.supervisedWorkIds, ["thesis"]);
});

test("identifier bridges are transitive, but distinct values of the same scheme conflict", () => {
  const pair = [
    work("1", author("Jan Smith", { id: "A1" })),
    work("2", author("Jan Smith", { id: "A2", externalId: "idhal:x" })),
  ];
  assert.equal(people(pair).length, 2);
  const bridged = [
    work("1", author("Spelling One", { id: "A1" })),
    work("2", author("Spelling Two", { id: "A1", externalId: "idhal:x" })),
    work(
      "3",
      author("Spelling Three", {
        externalId: "idhal:x",
        orcid: "https://orcid.org/000X",
      }),
    ),
    work("4", author("Another Name", { id: "A2", orcid: "000x" })),
  ];
  const ps = people(bridged);
  assert.equal(ps.length, 2);
  const linked = ps.find((p) => p.works.length === 3)!;
  assert.equal(linked.identity, "Provider identifier");
  assert.ok(personHasKey(linked, "A1"));
  assert.ok(personHasKey(linked, "idhal:x"));
  assert.equal(linked.mergedBy?.length, 2);
  assert.equal(
    people([
      work("1", author("Jan Smith", { externalId: "idref:1" })),
      work("2", author("Jan Smith", { externalId: "idref:2" })),
    ]).length,
    2,
  );
});

test("initials match when unambiguous, and both possible full names stay separate", () => {
  assert.equal(
    people([ambiguous[0], work("2", author("Jan Smith"))]).length,
    1,
  );
  const ps = people(ambiguous);
  assert.equal(ps.length, 3);
  const j = ps.find((p) => p.name === "J. Smith")!;
  assert.deepEqual(j.possibleDuplicates?.map((d) => d.key).sort(), [
    "A2",
    "A3",
  ]);
  for (const p of ps.filter((p) => p !== j))
    assert.ok(p.possibleDuplicates?.some((d) => d.key === j.key));
  const dismissed = people(ambiguous, [decision("different", j.key, "A2")]);
  assert.ok(dismissed.every((p) => !p.possibleDuplicates?.length));
  const same = people(ambiguous, [decision("same", j.key, "A2")]);
  assert.equal(same.length, 2);
  assert.equal(same.find((p) => p.key === "A2")?.works.length, 2);
});

test("partial affiliation overlap chooses one institution and retains legacy set keys", () => {
  const [p, ...rest] = people([
    work("1", author("Jan Smith")),
    work("2", author("Jan Smith", { institutions: [tue, differ] })),
  ]);
  assert.equal(rest.length, 0);
  assert.equal(p.key, "unverified:jan smith:I-DIFFER");
  assert.ok(personHasKey(p, "unverified:jan smith:I-DIFFER|I-TUE"));
  assert.ok(personHasKey(p, "unverified:jan smith:I-TUE"));
});

test("work-scoped names stay separate and non-Latin names require exact normalization", () => {
  for (const name of ["Jan Smith", "王明"]) {
    const a = author(name, { institutions: [] });
    assert.equal(people([work("1", a), work("2", a)]).length, 2);
  }
  assert.ok(namesCompatible("王明", "王明"));
  assert.equal(namesCompatible("王 明", "王明"), false);
  assert.equal(namesCompatible("И. Петров", "Иван Петров"), false);
  assert.equal(namesCompatible("Jan Peter Smith", "J. Paul Smith"), false);
  assert.ok(namesCompatible("J. P. Smith", "Jan Smith"));
});

test("same-paper homonyms have distinct selectable keys even after deduplicating work records", () => {
  const w = work("W", author("Jan Smith"), author("Jan Smith"));
  const merged = mergeWorks([work("W"), w]);
  const incoming = {
    ...work(
      "incoming",
      author("Jan Smith", { institutions: [] }),
      author("Jan Smith", { institutions: [] }),
    ),
    doi: "10.1/homonyms",
  };
  const first = mergeWorks([{ ...work("first"), doi: incoming.doi }, incoming]);
  assert.equal(mergeWorks([...first, incoming])[0].authors.length, 2);
  const identified = author("Jan Smith", { id: "A1" });
  const enriched = mergeWorks([
    work("W", identified),
    work("W", author("Jan Smith"), identified),
  ]);
  assert.deepEqual(
    enriched[0].authors.map((a) => a.id),
    ["A1", undefined],
  );
  for (const works of [[w], merged]) {
    const ps = people(works);
    assert.equal(ps.length, 2);
    assert.notEqual(ps[0].key, ps[1].key);
    assert.ok(!personHasKey(ps[0], ps[1].key));
    assert.ok(!ps[0].possibleDuplicates?.length);
    assert.equal(
      people(works, [decision("same", ps[0].key, ps[1].key)]).length,
      2,
    );
  }
});

test("two distinct resolved coauthors support a suggestion across institutions", () => {
  const lee = author("Lee Moss", { id: "A4" }),
    kim = author("Kim Ford", { id: "A5" });
  const w1 = work("1", author("J. Smith"), lee, kim);
  const w2 = work(
    "2",
    author("Jan Smith", { institutions: [differ] }),
    lee,
    kim,
  );
  const ps = people([w1, w2]).filter((p) => p.name.endsWith("Smith"));
  assert.equal(ps.length, 2);
  assert.equal(ps[0].possibleDuplicates?.[0].key, ps[1].key);
  assert.match(ps[1].possibleDuplicates![0].reason, /2 shared coauthors/);
  assert.ok(
    people([w1, { ...w2, authors: w2.authors.slice(0, 2) }]).every(
      (p) => !p.possibleDuplicates?.length,
    ),
  );
  assert.ok(
    people([w1, w2], [decision("different", ps[0].key, ps[1].key)]).every(
      (p) => !p.possibleDuplicates?.length,
    ),
  );
});

test("manual decisions respect aliases, same-scheme conflicts and same-work boundaries", () => {
  const works = [
    work("1", author("Jan Smith", { id: "A1", externalId: "idhal:jan" })),
    work("2", author("J. Smith", { institutions: [differ] })),
  ];
  const key = "unverified:j smith:I-DIFFER";
  const [merged, ...rest] = people(works, [decision("same", "idhal:jan", key)]);
  assert.equal(rest.length, 0);
  assert.ok(personHasKey(merged, key));
  assert.equal(merged.mergedBy?.at(-1)?.rule, "manual");
  const atTue = [
    works[0],
    work("2", author("J. Smith", { externalId: "idref:2" })),
  ];
  assert.equal(
    people(atTue, [decision("different", "idhal:jan", "idref:2")]).length,
    2,
  );
  const conflicts = ["1111", "2222"].map((id) =>
    work(id, author("Jan Smith", { orcid: id })),
  );
  const blocked = people(conflicts, [
    decision("same", "orcid:1111", "orcid:2222"),
  ]);
  assert.equal(blocked.length, 2);
  for (const p of blocked)
    assert.match(p.mergedBy![0].detail, /ignored.*conflicting ORCID/);
});

test("work arrival order does not change clusters, keys, explanations or suggestions", () => {
  assert.deepEqual(
    people(ambiguous),
    people([ambiguous[2], ambiguous[0], ambiguous[1]]),
  );
  const works = [
    ...ambiguous,
    work("0", author("Jean Borel", { id: "A5" })),
    work("9", author("J. Borel", { externalId: "idhal:jb" })),
  ];
  assert.deepEqual(people(works), people([...works].reverse()));
});

test("a legacy shortlist key, feedback and scoped verification still identify a merged person", () => {
  const old = "unverified:jan smith:I-DIFFER|I-TUE";
  const works = [
    work("1", author("Jan Smith", { institutions: [tue, differ] })),
    work("2", author("Jan Smith", { id: "A1" })),
  ];
  const [p] = people(works);
  const backup = shortlistBackupSchema.parse({
    version: 1,
    kind: "shortlist",
    shortlist: [
      {
        person: { ...p, key: old, aliases: undefined },
        savedAt: "2025",
        notes: "Ask about a project",
        status: "To investigate",
      },
    ],
  });
  assert.ok(personHasKey(p, backup.shortlist[0].person.key));
  const state = matchingStateSchema.parse({
    feedback: [
      {
        personKey: old,
        topic: session.topic,
        kind: "dismissed",
        terms: [],
        updatedAt: "2025",
      },
    ],
    verifications: [
      {
        personKey: old,
        name: p.name,
        checkedAt: "2026-11-24",
        institution: tue.name,
        officialDomain: "example.org",
        status: "partial",
        evidence: [],
        pages: [],
        warnings: [],
      },
    ],
  });
  const c = contactCandidates([p], session.topic, state, {
    country: "NL",
  }).find((c) => personHasKey(c.person, p.key))!;
  assert.equal(c.feedback?.personKey, old);
  assert.equal(c.verification?.personKey, old);
  assert.equal(c.hidden, true);
});

test("old version-one sessions load and new identity evidence and decisions round-trip", () => {
  const works = ambiguous;
  const [p] = people(works);
  const { aliases, possibleDuplicates, mergedBy, ...legacy } = p;
  const saved = {
    person: legacy,
    savedAt: "2025",
    notes: "old note",
    status: "To investigate",
  };
  const previous = sessionSchema.parse({
    ...session,
    works,
    matching: {},
    shortlist: [saved],
  });
  assert.deepEqual(previous.matching?.identityDecisions, []);
  assert.equal(previous.shortlist?.[0].person.aliases, undefined);
  const d = decision("same", "A2", "unverified:j smith:I-TUE");
  const current = sessionSchema.parse({
    ...previous,
    matching: { identityDecisions: [d] },
    shortlist: [{ ...saved, person: p }],
  });
  const restored = sessionSchema.parse(JSON.parse(JSON.stringify(current)));
  assert.deepEqual(
    restored.shortlist?.[0].person.possibleDuplicates,
    possibleDuplicates,
  );
  assert.deepEqual(restored.shortlist?.[0].person.mergedBy, mergedBy);
  assert.deepEqual(restored.shortlist?.[0].person.aliases, aliases);
  assert.deepEqual(
    people(restored.works, restored.matching?.identityDecisions),
    people(works, [d]),
  );
});

test("ROR groups institution variants and matches names across indexed affiliation records", () => {
  const ror = "https://ror.org/example";
  const a = { ...tue, ror },
    b = { ...tue, id: "I2", name: "TU/e", ror };
  const works = [
    work("1", author("Jan Smith", { institutions: [a] })),
    work("2", author("J. Smith", { institutions: [b] })),
    work("3", author("Lee Ford", { institutions: [b] })),
  ];
  const ps = people(works);
  assert.equal(ps.length, 2);
  const state = matchingStateSchema.parse({});
  for (const results of [
    rankCandidates(ps, session.topic, state),
    contactCandidates(ps, session.topic, state, { country: "NL" }),
  ])
    assert.deepEqual(
      new Set(results.filter((c) => !c.groupSource).map((c) => c.groupKey)),
      new Set(["ror:" + ror]),
    );
});

test("the dossier offers at most five compatible identities", () => {
  const works = [
    work("initial", author("J. Smith")),
    ...["Jan", "Jane", "John", "Joan", "Jill", "Jack"].map((name) =>
      work(name, author(name + " Smith")),
    ),
  ];
  assert.equal(
    people(works).find((p) => p.name === "J. Smith")?.possibleDuplicates
      ?.length,
    5,
  );
});

test("work deduplication preserves earlier name keys and both repository schemes across an export", () => {
  const records = [
    work("crossref", author("Jan Smith", { institutions: [] })),
    work("hal", author("Jan Smith", { externalId: "idhal:jan" })),
    work("thesesfr", author("Jan Smith", { externalId: "idref:jan" })),
  ].map((w) => ({ ...w, doi: "10.1/example" }));
  const works = mergeWorks([
    ...records,
    work("another", author("Another Spelling", { externalId: "idref:jan" })),
  ]);
  const restored = sessionSchema.parse(
    JSON.parse(JSON.stringify({ ...session, works })),
  );
  const [p, ...rest] = people(restored.works);
  assert.equal(rest.length, 0);
  assert.equal(p.works.length, 2);
  assert.equal(p.key, "idhal:jan");
  for (const key of ["unverified:jan smith:crossref", "idhal:jan", "idref:jan"])
    assert.ok(personHasKey(p, key));
  const different = work(
    "other",
    author("Jan Smith", { externalId: "idref:different" }),
  );
  assert.equal(people([...restored.works, different]).length, 2);
});

test("a regional pin under an old key still selects the right researcher", () => {
  const inst = { ...tue, city: "Eindhoven", lat: 51.45, lon: 5.48 };
  const ps = people([
    work("1", author("Jan Smith", { institutions: [inst] })),
    work("2", author("Jan Smith", { id: "A1", institutions: [inst] })),
    work("3", author("Aaron Smith", { id: "A0", institutions: [inst] })),
  ]);
  const candidates = rankCandidates(
    ps,
    session.topic,
    matchingStateSchema.parse({}),
  );
  const region = {
    home: { name: "Eindhoven", country: "NL", lat: 51.45, lon: 5.48 },
    radius: 100,
    nearCountries: ["NL"],
    destinations: ["DE", "FR", "US", "CH", "GB"],
  };
  assert.equal(makeBoard(candidates, region, blankBoard).near0.key, "A0");
  assert.equal(
    makeBoard(candidates, region, {
      ...blankBoard,
      pins: { near0: "unverified:jan smith:I-TUE" },
    }).near0.key,
    "A1",
  );
});
