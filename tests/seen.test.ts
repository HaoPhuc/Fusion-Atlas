import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contactCandidates,
  feedbackSchema,
  matchingStateSchema,
  verificationSchema,
} from "../lib/matching";
import {
  classifySeen,
  createSeenHistory,
  emptyLedger,
  indexBaseline,
  mergeSeen,
  recordSeen,
  seenLedgerSchema,
  seenResults,
  seenStorageKey,
  type SeenLedger,
} from "../lib/seen";
import { sessionSchema } from "../lib/session";
import type { Person, Saved } from "../lib/types";

const first = "2026-10-01T09:00:00.000Z";
const last = "2026-11-24T09:00:00.000Z";
const person: Person = {
  key: "A1",
  name: "Jan Smith",
  institutions: [{ id: "I1", name: "TU Eindhoven" }],
  works: [],
  score: 0,
  matched: [],
  identity: "Provider identifier",
  corresponding: false,
};
const state = matchingStateSchema.parse({});
const previous = recordSeen(
  [{ person, groupKeys: ["I1"] }],
  "plasma",
  first,
  true,
);
const baseline = indexBaseline(previous);
const session = {
  version: 1,
  topic: "plasma",
  options: { from: 2020, to: 2026, country: "", theses: false },
  tasks: [],
  works: [],
};
function storageFixture(raw: string | null = null) {
  const data = new Map<string, string>();
  if (raw !== null) data.set(seenStorageKey, raw);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
}

test("history classifies seen and new people, and feedback from any topic takes precedence", () => {
  assert.deepEqual(classifySeen(person, baseline, state, []), {
    kind: "seen",
    firstSeenAt: first,
  });
  assert.equal(
    classifySeen(
      { ...person, key: "A2", name: "Ada Jones" },
      baseline,
      state,
      [],
    ).kind,
    "new",
  );
  const feedback = feedbackSchema.parse({
    personKey: "old",
    identity: { name: "J. Smith", institutions: ["TU Eindhoven"] },
    kind: "good",
    topic: "other topic",
    terms: [],
    updatedAt: last,
  });
  assert.equal(
    classifySeen(person, baseline, { ...state, feedback: [feedback] }, []).kind,
    "acted",
  );
});

test("shortlisting or verifying an identity counts as acting, including aliases", () => {
  const saved: Saved = {
    person: {
      ...person,
      key: "old",
      aliases: ["A1"],
      name: "Earlier spelling",
    },
    notes: "",
    status: "To investigate",
    savedAt: first,
  };
  const v = verificationSchema.parse({
    personKey: "other",
    name: "J. Smith",
    institution: "TU Eindhoven",
    checkedAt: last,
    officialDomain: "",
    status: "unavailable",
    evidence: [],
    pages: [],
    warnings: [],
  });
  assert.equal(classifySeen(person, baseline, state, [saved]).kind, "acted");
  assert.equal(
    classifySeen(person, baseline, { ...state, verifications: [v] }, []).kind,
    "acted",
  );
});

test("a current or historical alias can establish seen status across a name change", () => {
  const renamed = {
    ...person,
    key: "orcid:123",
    aliases: ["A1"],
    name: "Changed Name",
  };
  assert.equal(classifySeen(renamed, baseline, state, []).kind, "seen");
  const reverse = indexBaseline(
    recordSeen([{ person: renamed, groupKeys: [] }], "plasma", last),
  );
  assert.equal(classifySeen(person, reverse, state, []).kind, "seen");
});

test("a long alias list retains the link to an earlier ledger entry when saved", () => {
  const history = createSeenHistory();
  const storage = storageFixture(JSON.stringify(previous));
  history.refresh(storage);
  const expanded = {
    ...person,
    key: "orcid:123",
    aliases: [
      ...Array.from({ length: 25 }, (_, i) => "idhal:" + i),
      person.key,
    ],
  };
  history.add(
    recordSeen(
      [{ person: expanded, groupKeys: [] }],
      "control",
      last,
      true,
      history.ledger,
    ),
  );
  history.flush(storage);
  const [e] = history.ledger.entries;
  assert.equal(history.ledger.entries.length, 1);
  assert.equal(e.key, expanded.key);
  assert.equal(e.firstSeenAt, first);
  assert.ok(e.aliases.includes(person.key));
  assert.equal(e.aliases.length, 20);
});

test("a compatible initial and shared affiliation can establish seen status", () => {
  const abbreviated = { ...person, key: "other", name: "J. Smith" };
  assert.equal(classifySeen(abbreviated, baseline, state, []).kind, "seen");
  assert.equal(
    classifySeen({ ...abbreviated, institutions: [] }, baseline, state, [])
      .kind,
    "new",
  );
});

test("dossier and sweep writes leave the active baseline fixed until the next run", () => {
  const storage = storageFixture();
  const history = createSeenHistory();
  history.refresh(storage);
  const start = indexBaseline(history.ledger);
  history.add(recordSeen([{ person, groupKeys: [] }], "plasma", first));
  assert.equal(history.ledger.lastRunAt, undefined);
  history.add(
    recordSeen([{ person, groupKeys: ["I1"] }], "plasma", last, true),
  );
  assert.equal(storage.getItem(seenStorageKey), null);
  history.flush(storage);
  assert.equal(classifySeen(person, start, state, []).kind, "new");
  assert.ok(start.isNewGroup("I1"));
  const restored = createSeenHistory();
  restored.refresh(storage);
  assert.equal(restored.ledger.lastRunAt, last);
  assert.deepEqual(
    classifySeen(person, indexBaseline(restored.ledger), state, []),
    { kind: "seen", firstSeenAt: first },
  );
});

test("eviction keeps the 5000 most recently seen identities including revisits", () => {
  const entries = Array.from({ length: 5000 }, (_, i) => ({
    ...previous.entries[0],
    key: String(i),
    lastSeenAt: new Date(Date.parse(first) + i).toISOString(),
  })).reverse();
  const incoming = ["new", "0"].map((key) => ({
    ...previous.entries[0],
    key,
    lastSeenAt: last,
  }));
  const merged = mergeSeen(
    { ...previous, entries },
    { ...previous, entries: incoming },
  );
  assert.equal(merged.entries.length, 5000);
  assert.ok(merged.entries.some((e) => e.key === "0"));
  assert.ok(merged.entries.some((e) => e.key === "new"));
  assert.ok(!merged.entries.some((e) => e.key === "1"));
});

test("group classification uses every baseline group key independently of the person", () => {
  const prior = indexBaseline({
    ...previous,
    entries: [{ ...previous.entries[0], groupKeys: ["ror:1", "listed:team"] }],
  });
  assert.equal(prior.isNewGroup("listed:team"), false);
  assert.equal(prior.isNewGroup("ror:1"), false);
  assert.equal(prior.isNewGroup("listed:other"), true);
});

test("session import bridges key and alias matches and keeps the oldest and newest evidence", () => {
  const local: SeenLedger = {
    ...previous,
    entries: [
      previous.entries[0],
      {
        ...previous.entries[0],
        key: "idhal:jan",
        topics: ["lasers"],
        groupKeys: ["g2"],
      },
    ],
  };
  const now = recordSeen(
    [
      {
        person: { ...person, key: "orcid:1", aliases: ["A1", "idhal:jan"] },
        groupKeys: ["g3"],
      },
    ],
    "control",
    last,
    true,
  );
  const imported = sessionSchema.parse(
    JSON.parse(JSON.stringify({ ...session, seen: now })),
  );
  const history = createSeenHistory();
  history.add(local);
  history.add(imported.seen!);
  const [e] = history.ledger.entries;
  assert.equal(history.ledger.entries.length, 1);
  assert.equal(history.ledger.lastRunAt, last);
  assert.equal(e.firstSeenAt, first);
  assert.equal(e.lastSeenAt, last);
  assert.equal(e.key, "orcid:1");
  assert.deepEqual(new Set(e.aliases), new Set(["A1", "idhal:jan"]));
  assert.deepEqual(new Set(e.groupKeys), new Set(["I1", "g2", "g3"]));
  assert.deepEqual(new Set(e.topics), new Set(["control", "plasma", "lasers"]));
  assert.equal(e.topics[0], "control");
  assert.deepEqual(mergeSeen(history.ledger, now), history.ledger);
});

test("invalid JSON and invalid ledger data survive both reads and pending writes", () => {
  for (const raw of [
    "",
    "{",
    JSON.stringify({
      ...previous,
      entries: [{ ...previous.entries[0], firstSeenAt: "invalid" }],
    }),
  ]) {
    const storage = storageFixture(raw);
    const history = createSeenHistory();
    assert.throws(() => history.refresh(storage));
    history.add(previous);
    assert.throws(() => history.flush(storage));
    assert.equal(storage.getItem(seenStorageKey), raw);
    assert.deepEqual(history.ledger, previous);
  }
});

test("older sessions open with no seen history and the Hide seen preference off", () => {
  const d = sessionSchema.parse({ ...session, matching: { profile: {} } });
  assert.equal(d.seen, undefined);
  assert.equal(d.matching?.profile.hideSeen, false);
});

test("a flush includes another tab's observations and clear discards pending writes", () => {
  const storage = storageFixture();
  const history = createSeenHistory();
  history.add(previous);
  storage.setItem(
    seenStorageKey,
    JSON.stringify({
      ...previous,
      entries: [{ ...previous.entries[0], key: "B2" }],
    }),
  );
  history.flush(storage);
  assert.equal(history.ledger.entries.length, 2);
  history.add(previous);
  history.clear(storage);
  history.flush(storage);
  assert.equal(storage.getItem(seenStorageKey), null);
  assert.deepEqual(history.ledger, emptyLedger);
});

test("merged observations respect field bounds and keep recent topics first", () => {
  let ledger = emptyLedger;
  for (let i = 0; i < 25; i++) {
    const at = new Date(Date.parse(first) + i).toISOString();
    ledger = mergeSeen(
      ledger,
      recordSeen(
        [
          {
            person: {
              ...person,
              aliases: ["alias" + i],
              institutions: [{ id: String(i), name: "University " + i }],
            },
            groupKeys: ["g" + i],
          },
        ],
        "topic" + i,
        at,
      ),
    );
  }
  const e = seenLedgerSchema.parse(ledger).entries[0];
  assert.deepEqual(
    [
      e.aliases.length,
      e.institutions.length,
      e.groupKeys.length,
      e.topics.length,
    ],
    [20, 5, 10, 20],
  );
  assert.equal(e.topics[0], "topic24");
  assert.equal(e.topics.at(-1), "topic5");
});

test("reviewed contacts share a ledger entry with literature matches and can also stand alone", () => {
  const listed = contactCandidates([], "plasma control", state, {
    country: "",
  });
  assert.ok(listed.length);
  const literature = { ...listed[0].person, key: "A1" };
  const candidates = contactCandidates([literature], "plasma control", state, {
    country: "",
  });
  const results = seenResults([literature], candidates);
  assert.equal(results.size, listed.length);
  assert.ok(results.get("A1")?.person.aliases?.includes(listed[0].person.key));
  assert.ok(results.get("A1")?.groupKeys.includes(listed[0].groupKey));
});
