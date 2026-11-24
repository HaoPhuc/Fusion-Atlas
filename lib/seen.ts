import { z } from "zod";
import { personHasKey, peopleShareKey } from "./identity";
import {
  canonicalContact,
  contactIdentity,
  feedbackMatchesPerson,
  sameContact,
  type MatchingState,
  type Recommendation,
} from "./matching";
import { normalize } from "./normalization";
import type { Person, Saved } from "./types";

const limit = 5000;
const timestamp = z.iso.datetime({ offset: true });
const seenEntry = z.object({
  key: z.string().min(1),
  aliases: z.array(z.string()).max(20),
  name: z.string(),
  institutions: z.array(z.string()).max(5),
  groupKeys: z.array(z.string()).max(10),
  topics: z.array(z.string()).max(20),
  firstSeenAt: timestamp,
  lastSeenAt: timestamp,
});
export const seenLedgerSchema = z.object({
  version: z.literal(1),
  entries: z.array(seenEntry).max(limit),
  lastRunAt: timestamp.optional(),
});
export type SeenLedger = z.infer<typeof seenLedgerSchema>;
type Entry = SeenLedger["entries"][number];
export const emptyLedger: SeenLedger = { version: 1, entries: [] };
export const seenStorageKey = "fusion-atlas-seen-v1";
const unique = (values: string[], max: number) =>
  [...new Set(values)].slice(0, max);
const newestFirst = (a: Entry, b: Entry) =>
  Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);

// Reviewed listings may stand alone, or share a literature identity.
export function seenResults(people: Person[], candidates: Recommendation[]) {
  const results = new Map(
    people.map((person) => [person.key, { person, groupKeys: [] as string[] }]),
  );
  for (const candidate of candidates) {
    const person = canonicalContact(candidate);
    const prior = results.get(person.key);
    if (!prior) {
      results.set(person.key, { person, groupKeys: [candidate.groupKey] });
      continue;
    }
    prior.groupKeys.push(candidate.groupKey);
    if (candidate.literatureKey) {
      prior.person = {
        ...person,
        aliases: [
          ...new Set([
            ...(person.aliases || []),
            ...(prior.person.aliases || []),
          ]),
        ],
      };
    }
  }
  return results;
}
export function recordSeen(
  results: Iterable<{ person: Person; groupKeys: string[] }>,
  topic: string,
  at: string,
  sweep = false,
  history: SeenLedger = emptyLedger,
): SeenLedger {
  let historicalKeys: Set<string> | undefined;
  function aliasesFor(person: Person) {
    const aliases = (person.aliases || []).filter((key) => key !== person.key);
    if (aliases.length <= 20) return unique(aliases, 20);
    // Keep the link to an existing entry even when a newly resolved person
    // has more aliases than will fit in the ledger.
    const known = (historicalKeys ??= new Set(
      history.entries.flatMap((e) => [e.key, ...e.aliases]),
    ));
    return unique([...aliases.filter((key) => known.has(key)), ...aliases], 20);
  }
  return {
    version: 1,
    lastRunAt: sweep ? at : undefined,
    entries: Array.from(results, ({ person, groupKeys }) => ({
      key: person.key,
      aliases: aliasesFor(person),
      name: person.name,
      institutions: unique(
        person.institutions.map((i) => i.name),
        5,
      ),
      groupKeys: unique(groupKeys, 10),
      topics: [topic],
      firstSeenAt: at,
      lastSeenAt: at,
    })),
  };
}

export function mergeSeen(local: SeenLedger, incoming: SeenLedger): SeenLedger {
  // Link all intersecting keys before trimming aliases. An import can bridge
  // several earlier records, even when they occur far apart in the backup.
  const entries = [...incoming.entries, ...local.entries];
  const owners = new Map<string, Entry[]>();
  const clusters = new Set<Entry[]>();
  for (const entry of entries) {
    const keys = [entry.key, ...entry.aliases];
    const matches = new Set(
      keys
        .map((key) => owners.get(key))
        .filter((cluster) => cluster !== undefined),
    );
    const cluster = matches.values().next().value ?? [];
    for (const other of matches) {
      if (other === cluster) continue;
      for (const member of other) {
        cluster.push(member);
        for (const key of [member.key, ...member.aliases])
          owners.set(key, cluster);
      }
      clusters.delete(other);
    }
    cluster.push(entry);
    clusters.add(cluster);
    for (const key of keys) owners.set(key, cluster);
  }
  const merged = Array.from(clusters, (cluster) => {
    if (cluster.length === 1) return cluster[0];
    cluster.sort(newestFirst);
    const latest = cluster[0];
    return {
      ...latest,
      aliases: unique(
        [
          ...cluster.map((e) => e.key),
          ...cluster.flatMap((e) => e.aliases),
        ].filter((key) => key !== latest.key),
        20,
      ),
      topics: unique(
        cluster.flatMap((e) => e.topics),
        20,
      ),
      institutions: unique(
        cluster.flatMap((e) => e.institutions),
        5,
      ),
      groupKeys: unique(
        cluster.flatMap((e) => e.groupKeys),
        10,
      ),
      firstSeenAt: cluster.reduce(
        (first, e) =>
          Date.parse(e.firstSeenAt) < Date.parse(first) ? e.firstSeenAt : first,
        latest.firstSeenAt,
      ),
    };
  });
  const lastRunAt = [incoming.lastRunAt, local.lastRunAt]
    .filter((at) => at !== undefined)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  return {
    version: 1,
    entries: merged.sort(newestFirst).slice(0, limit),
    lastRunAt,
  };
}

export type SeenStatus =
  { kind: "new" | "acted" } | { kind: "seen"; firstSeenAt: string };
export function indexBaseline(baseline: SeenLedger) {
  const keys = new Map<string, Entry>();
  const names = new Map<string, Entry[]>();
  const groups = new Set<string>();
  // Compatible names share a surname. Only run sameContact on that bucket.
  const surname = (name: string) => normalize(name).split(" ").at(-1)!;
  for (const entry of baseline.entries) {
    for (const key of [entry.key, ...entry.aliases]) keys.set(key, entry);
    const last = surname(entry.name);
    const bucket = names.get(last) || [];
    bucket.push(entry);
    names.set(last, bucket);
    for (const group of entry.groupKeys) groups.add(group);
  }
  return {
    isNewGroup: (key: string) => !groups.has(key),
    find(person: Person) {
      const exact =
        keys.get(person.key) ||
        person.aliases?.map((key) => keys.get(key)).find(Boolean);
      return (
        exact ||
        names.get(surname(person.name))?.find((e) => sameContact(person, e))
      );
    },
  };
}
export function classifySeen(
  person: Person,
  baseline: ReturnType<typeof indexBaseline>,
  matching: Pick<MatchingState, "feedback" | "verifications">,
  saved: Saved[],
): SeenStatus {
  if (
    matching.feedback.some((f) => feedbackMatchesPerson(person, f)) ||
    saved.some(
      (s) =>
        peopleShareKey(person, s.person) ||
        sameContact(person, contactIdentity(s.person)),
    ) ||
    matching.verifications.some(
      (v) =>
        personHasKey(person, v.personKey) ||
        sameContact(person, {
          name: v.name,
          institutions: [v.affiliation || v.institution],
        }),
    )
  )
    return { kind: "acted" };
  const entry = baseline.find(person);
  return entry
    ? { kind: "seen", firstSeenAt: entry.firstSeenAt }
    : { kind: "new" };
}

type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function readSeen(storage: StorageAccess): SeenLedger {
  const raw = storage.getItem(seenStorageKey);
  return raw === null ? emptyLedger : seenLedgerSchema.parse(JSON.parse(raw));
}

// Keep pending observations separate so a flush can include changes made by
// another tab. A failed read or write leaves the pending session exportable.
export function createSeenHistory() {
  let ledger = emptyLedger;
  let pending: SeenLedger | undefined;
  return {
    get ledger() {
      return ledger;
    },
    refresh(storage: StorageAccess) {
      const stored = readSeen(storage);
      ledger = pending ? mergeSeen(stored, pending) : stored;
    },
    add(delta: SeenLedger) {
      pending = mergeSeen(pending || emptyLedger, delta);
      ledger = mergeSeen(ledger, delta);
    },
    flush(storage: StorageAccess) {
      if (!pending) return;
      this.refresh(storage);
      storage.setItem(seenStorageKey, JSON.stringify(ledger));
      pending = undefined;
    },
    clear(storage: StorageAccess) {
      storage.removeItem(seenStorageKey);
      pending = undefined;
      ledger = emptyLedger;
    },
  };
}
