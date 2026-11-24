import assert from "node:assert/strict";
import test from "node:test";
import { atOrBelow, levelSummaryLine, supervisionLevels } from "../lib/levels";
import {
  contactCandidates,
  matchingStateSchema,
  rankCandidates,
  type Verification,
} from "../lib/matching";
import {
  normalizeCrossref,
  normalizeDataCite,
  normalizeOpenAlex,
} from "../lib/providers";
import {
  normalizeHal,
  normalizeOpenAire,
  normalizeThesesFr,
} from "../lib/repositories";
import { mergeWorks, peopleFrom, shortlistCsv } from "../lib/research";
import { sessionSchema, shortlistBackupSchema } from "../lib/session";
import type { Person, Work } from "../lib/types";

const now = new Date("2026-11-12T12:00:00Z");
const thesis = normalizeHal({
  halId_s: "master",
  docType_s: "MEM",
  defenseDateY_i: 2026,
  title_s: "Tokamak turbulence",
  director_s: ["Alex Smith"],
});
const [supervisor] = peopleFrom([thesis], "turbulence");
const official: Verification = {
  personKey: supervisor.key,
  name: supervisor.name,
  checkedAt: now.toISOString(),
  institution: "Example University",
  officialDomain: "example.edu",
  status: "partial",
  evidence: [
    {
      kind: "undergraduate",
      url: "https://example.edu/projects",
      title: "Projects",
      text: "Undergraduate projects available.",
    },
  ],
  warnings: [],
  pages: [],
};
function dataCite(resourceTypeGeneral: string, resourceType?: string) {
  return normalizeDataCite({
    id: "10.1/fixture",
    attributes: {
      types: { resourceTypeGeneral, resourceType },
      titles: [{ title: "Doctoral thesis on tokamaks" }],
      descriptions: [
        { descriptionType: "Abstract", description: "A PhD dissertation" },
      ],
    },
  });
}

test("repository levels come from HAL document codes, theses.fr and OpenAIRE instance types", () => {
  for (const [code, level] of [
    ["THESE", "doctoral"],
    ["HDR", "habilitation"],
    ["MEM", "master"],
    ["ART", undefined],
  ]) {
    assert.equal(normalizeHal({ docType_s: code }).level, level);
  }
  assert.equal(normalizeThesesFr({ nnt: "2026TEST" }).level, "doctoral");
  for (const [type, level] of [
    ["Doctoral thesis", "doctoral"],
    ["Master thesis", "master"],
    ["Bachelor thesis", "bachelor"],
    ["Thesis", "unknown"],
    ["Article", undefined],
  ]) {
    assert.equal(
      normalizeOpenAire({ instances: [{ type }], mainTitle: "Master thesis" })
        .level,
      level,
    );
  }
  assert.equal(
    normalizeOpenAire({
      instances: [{ type: "Thesis" }, { type: "Bachelor thesis" }],
    }).level,
    "bachelor",
  );
});

test("DataCite uses only thesis resource-type text and checks degree names before dissertation", () => {
  for (const text of [
    "Bachelor's thesis",
    "BSc thesis",
    "B.Sc. dissertation",
    "Honours thesis",
  ])
    assert.equal(dataCite("Text", text).level, "bachelor", text);
  for (const text of ["Master's dissertation", "MSc thesis", "M.Sc. thesis"])
    assert.equal(dataCite("Dissertation", text).level, "master", text);
  for (const text of [
    "Ph.D.",
    "PhD",
    "Doctor of Philosophy",
    "doctoral thesis",
    "Dissertation",
  ])
    assert.equal(dataCite("Thesis", text).level, "doctoral", text);
  assert.equal(dataCite("Dissertation").level, "unknown");
  assert.equal(dataCite("Text", "Thesis").level, "unknown");
  assert.equal(dataCite("Text", "Master class").level, undefined);
});

test("OpenAlex and Crossref dissertations have unspecified level", () => {
  for (const normalize of [normalizeOpenAlex, normalizeCrossref]) {
    assert.equal(
      normalize({ type: "dissertation", title: "Bachelor thesis" }).level,
      "unknown",
    );
    assert.equal(
      normalize({ type: "article", title: "Bachelor thesis" }).level,
      undefined,
    );
  }
});

test("merges prefer a specific level and retain the first concrete level across identifier bridges", () => {
  const alex = normalizeOpenAlex({
    id: "W1",
    type: "dissertation",
    doi: "10.1/example",
  });
  const hal = normalizeHal({
    halId_s: "record",
    docType_s: "MEM",
    doiId_s: "10.1/example",
  });
  const doctoral = normalizeThesesFr({ nnt: "another", doi: alex.doi });
  assert.deepEqual(
    mergeWorks([alex, hal, doctoral]).map((w) => w.level),
    ["master"],
  );
  assert.deepEqual(
    mergeWorks([doctoral, hal, alex]).map((w) => w.level),
    ["doctoral"],
  );
  assert.deepEqual(
    mergeWorks([
      { ...hal, doi: undefined },
      doctoral,
      { ...alex, identifiers: [hal.id] },
    ]).map((w) => w.level),
    ["master"],
  );
});

test("counts only explicitly supervised works and includes the five-year boundary", () => {
  const works: Work[] = [
    {
      ...thesis,
      id: "own",
      level: "doctoral",
      authors: [{ name: "Alex Smith", id: "A1", institutions: [] }],
      supervisors: [],
    },
    ...[
      thesis,
      { ...thesis, id: "older", year: 2020 },
      { ...thesis, id: "legacy", level: undefined, year: 2021 },
    ].map((w) => ({
      ...w,
      supervisors: w.supervisors?.map((s) => ({ ...s, id: "A1" })),
    })),
  ];
  const [person] = peopleFrom(works, "turbulence");
  const levels = supervisionLevels(person, undefined, now);
  assert.deepEqual(levels.counts, {
    master: 2,
    bachelor: 0,
    doctoral: 0,
    habilitation: 0,
    unknown: 1,
  });
  assert.deepEqual(levels.recent, { ...levels.counts, master: 1 });
  assert.equal(levels.lowest, "master");
  assert.equal(atOrBelow(levels.lowest, "bachelor"), false);
  assert.equal(atOrBelow(levels.lowest, "doctoral"), true);
});

test("official undergraduate evidence sets the lowest level without adding a supervised thesis", () => {
  const p = {
    ...supervisor,
    works: [{ ...thesis, level: "doctoral" as const }],
  };
  const levels = supervisionLevels(p, official, now);
  assert.equal(levels.lowest, "bachelor");
  assert.equal(levels.counts.bachelor, 0);
  assert.equal(levels.counts.doctoral, 1);
  assert.deepEqual(levels.officialUndergraduate, {
    url: official.evidence[0].url,
    text: official.evidence[0].text,
    checkedAt: official.checkedAt,
  });
});

test("recent appropriate supervision adds six points, higher levels prompt a question, and missing evidence leaves baseline fit intact", () => {
  const state = matchingStateSchema.parse({
    profile: { studentLevel: "master" },
  });
  const phd: Person = {
    ...supervisor,
    key: "phd",
    works: [{ ...thesis, level: "doctoral" }],
  };
  const author = { ...supervisor, key: "author", supervisedWorkIds: [] };
  const [msc, higher, none] = rankCandidates(
    [phd, author, supervisor],
    "turbulence",
    state,
    now.getTime(),
  );
  assert.equal(msc.person.key, supervisor.key);
  assert.equal(higher.person.key, phd.key);
  assert.equal(msc.rank, higher.rank + 6);
  assert.equal(higher.rank, 64 + 12);
  assert.ok(
    higher.gaps.includes(
      "Recorded supervision is at doctoral level only; ask whether they take master students.",
    ),
  );
  assert.equal(none.person.key, author.key);
  assert.equal(none.rank, 64);
  assert.deepEqual(msc.gaps, none.gaps);
  const old = { ...supervisor, works: [{ ...thesis, year: 2020 }] };
  assert.equal(
    rankCandidates([old], "turbulence", state, now.getTime())[0].rank,
    60 + 12,
  );
});

test("the official bachelor bonus is ten, does not stack and cannot promote an unrelated topic", () => {
  const p: Person = {
    ...supervisor,
    works: [{ ...thesis, level: "bachelor" }],
  };
  const state = matchingStateSchema.parse({
    verifications: [
      {
        ...official,
        evidence: [
          ...official.evidence,
          { ...official.evidence[0], kind: "contact" },
          { ...official.evidence[0], kind: "role" },
        ],
      },
    ],
  });
  const [withPage] = rankCandidates([p], "turbulence", state, now.getTime());
  const [withoutLevel] = rankCandidates(
    [{ ...p, works: [{ ...thesis, level: "unknown" }] }],
    "turbulence",
    {
      ...state,
      verifications: state.verifications.map((v) => ({
        ...v,
        evidence: v.evidence.filter((e) => e.kind !== "undergraduate"),
      })),
    },
    now.getTime(),
  );
  assert.equal(withPage.rank, withoutLevel.rank + 10);
  assert.equal(withPage.lane, "contact");
  const [unrelated] = rankCandidates([p], "cryogenics", state, now.getTime());
  assert.equal(unrelated.fit, "Broad");
  assert.equal(unrelated.lane, "explore");
});

test("reviewed group contacts retain the level bonus and the question about higher-level supervision", () => {
  const state = matchingStateSchema.parse({
    profile: { studentLevel: "master" },
  });
  const candidate = (level: Work["level"]) => {
    const person = {
      ...supervisor,
      name: "Cormac Corr",
      institutions: [
        { id: "ANU", name: "Australian National University", country: "AU" },
      ],
      works: [{ ...thesis, level }],
    };
    return contactCandidates(
      [person],
      "spectroscopy",
      state,
      { country: "AU" },
      now.getTime(),
    ).find((c) => c.groupSource && c.person.name === person.name)!;
  };
  const higher = candidate("doctoral");
  assert.ok(
    higher.gaps.includes(
      "Recorded supervision is at doctoral level only; ask whether they take master students.",
    ),
  );
  assert.equal(candidate("master").rank, higher.rank + 6);
});

test("old stored profiles default to bachelor and version-one sessions and shortlist backups preserve levels", () => {
  const matching = { profile: { degree: "Applied physics" } };
  const state = matchingStateSchema.parse(JSON.parse(JSON.stringify(matching)));
  assert.equal(state.profile.studentLevel, "bachelor");
  assert.equal(state.profile.degree, "Applied physics");
  const session = {
    version: 1,
    topic: "turbulence",
    options: { from: 2020, to: 2026, country: "", theses: true },
    tasks: [],
    works: [{ ...thesis, level: undefined }, thesis],
    matching: {
      ...state,
      profile: { ...state.profile, studentLevel: "master" },
    },
  };
  const parsed = sessionSchema.parse(JSON.parse(JSON.stringify(session)));
  assert.deepEqual(
    parsed.works.map((w) => w.level),
    [undefined, "master"],
  );
  assert.equal(parsed.matching?.profile.studentLevel, "master");
  const saved = {
    person: supervisor,
    status: "New",
    notes: "",
    savedAt: now.toISOString(),
  };
  assert.equal(
    shortlistBackupSchema.parse({
      version: 1,
      kind: "shortlist",
      shortlist: [saved],
    }).shortlist[0].person.works[0].level,
    "master",
  );
});

test("CSV exports the shared summary and attributes official evidence saved under an alias", () => {
  const person = {
    ...supervisor,
    aliases: ["old-key"],
    works: [{ ...thesis, year: new Date().getUTCFullYear() }],
  };
  const csv = shortlistCsv(
    [{ person, status: "New", notes: "=unsafe", savedAt: now.toISOString() }],
    [{ ...official, personKey: "old-key" }],
  );
  assert.ok(csv.includes('"Supervision levels"'));
  assert.ok(
    csv.includes(levelSummaryLine(supervisionLevels(person, official))),
  );
  assert.ok(csv.includes(official.evidence[0].url));
  assert.ok(csv.includes('"\'=unsafe"'));
});
