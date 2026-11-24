import { matchesInstitution } from "./contact-routes";
import { normalize, orcidKey } from "./normalization";
import type {
  Author,
  IdentityDecision,
  Institution,
  Person,
  Work,
} from "./types";

type PersonKey = Pick<Person, "key" | "aliases">;
export function personHasKey(p: PersonKey, key: string) {
  return p.key === key || !!p.aliases?.includes(key);
}

export function peopleShareKey(a: PersonKey, b: PersonKey) {
  return personHasKey(a, b.key) || !!b.aliases?.some((k) => personHasKey(a, k));
}

function parseName(name: string) {
  const normalized = normalize(name);
  const tokens = normalized.split(" ");
  const nonLatin = [...normalized].some(
    (c) => /\p{L}/u.test(c) && !/\p{Script=Latin}/u.test(c),
  );
  const first = tokens[0];
  const bucket = nonLatin
    ? normalized
    : tokens.length >= 2
      ? [
          first[0],
          ...tokens.slice(1, -1).filter((t) => t.length > 1),
          tokens.at(-1),
        ].join("|")
      : "";
  return { bucket, first };
}

function compatible(
  a: ReturnType<typeof parseName>,
  b: ReturnType<typeof parseName>,
) {
  return (
    !!a.bucket &&
    a.bucket === b.bucket &&
    (a.first === b.first || a.first.length === 1 || b.first.length === 1)
  );
}

export function namesCompatible(a: string, b: string) {
  return compatible(parseName(a), parseName(b));
}

export function institutionGroupKey(i: Institution) {
  return i.ror ? `ror:${i.ror}` : i.id || normalize(i.name);
}

function sharedInstitution(a: Institution, b: Institution) {
  return (
    (a.id && a.id === b.id) ||
    (a.ror && a.ror === b.ror) ||
    (a.name && b.name && matchesInstitution(a.name, b.name))
  );
}

export function nameKeys(a: Author, workId: string) {
  if (a.id || a.orcid || a.externalId) return [];
  const affiliations = a.institutions
    .map((i) => i.id || normalize(i.name))
    .sort();
  const prefix = "unverified:" + normalize(a.name) + ":";
  return [
    prefix + (affiliations[0] || workId),
    prefix + (affiliations.length ? affiliations.join("|") : workId),
  ];
}

export function externalIds(a: Author) {
  return [
    ...(a.externalId ? [a.externalId] : []),
    ...(a.additionalExternalIds || []),
  ];
}

type Occurrence = { author: Author; work: Work; role: "author" | "supervisor" };
type Explanation = NonNullable<Person["mergedBy"]>[number];
type Cluster = {
  parent?: Cluster;
  best: { rank: number; value: string; key: string };
  key: string;
  anchor: string;
  name: string;
  names: Map<string, ReturnType<typeof parseName>>;
  ids: Map<string, string>;
  aliases: Set<string>;
  institutions: Set<Institution>;
  works: Set<string>;
  occurrences: Occurrence[];
  mergedBy: Explanation[];
  manuallyMerged: boolean;
  possibleDuplicates: NonNullable<Person["possibleDuplicates"]>;
};

function singleton(occurrence: Occurrence, position: number): Cluster {
  const { author: a, work } = occurrence;
  const ids = new Map<string, string>();
  if (a.orcid) ids.set("orcid", "orcid:" + orcidKey(a.orcid));
  if (a.id) ids.set("openalex", a.id);
  for (const id of externalIds(a).sort())
    ids.set("external:" + id.split(":")[0], id);
  const affiliations = a.institutions
    .map((i) => i.id || normalize(i.name))
    .filter(Boolean)
    .sort();
  const prefix = "unverified:" + normalize(a.name) + ":";
  const value = ids.values().next().value || affiliations[0] || work.id;
  const key = ids.size ? value : prefix + value;
  const rank = a.orcid
    ? 0
    : a.id
      ? 1
      : a.externalId
        ? 2
        : affiliations.length
          ? 3
          : 4;
  const aliases = new Set([
    key,
    ...ids.values(),
    ...nameKeys(a, work.id),
    ...(a.previousNameKeys || []),
  ]);
  return {
    best: { rank, value, key },
    key,
    anchor: encodeURIComponent(work.id) + ":" + position,
    aliases,
    ids,
    name: a.name,
    names: new Map([[a.name, parseName(a.name)]]),
    works: new Set([work.id]),
    institutions: new Set(a.institutions),
    occurrences: [occurrence],
    mergedBy: [],
    manuallyMerged: false,
    possibleDuplicates: [],
  };
}

function root(c: Cluster): Cluster {
  if (c.parent) c.parent = root(c.parent);
  return c.parent || c;
}

function conflict(a: Cluster, b: Cluster) {
  for (const [scheme, id] of a.ids)
    if (b.ids.has(scheme) && b.ids.get(scheme) !== id)
      return (
        "conflicting " +
        (scheme === "openalex"
          ? "OpenAlex"
          : scheme === "orcid"
            ? "ORCID"
            : scheme.slice(9)) +
        " identifiers"
      );
  const [small, large] = a.works.size <= b.works.size ? [a, b] : [b, a];
  for (const id of small.works)
    if (large.works.has(id)) return "separate entries on the same work";
}

function join(a: Cluster, b: Cluster, evidence: Explanation) {
  if (a.occurrences.length < b.occurrences.length) [a, b] = [b, a];
  b.parent = a;
  if (
    b.best.rank < a.best.rank ||
    (b.best.rank === a.best.rank &&
      (b.best.value < a.best.value ||
        (b.best.value === a.best.value && b.best.key < a.best.key)))
  ) {
    a.best = b.best;
    a.name = b.name;
    a.anchor = b.anchor;
  }
  a.key = a.best.key;
  for (const key of b.aliases) a.aliases.add(key);
  for (const [name, parsed] of b.names) a.names.set(name, parsed);
  for (const [scheme, id] of b.ids) a.ids.set(scheme, id);
  for (const i of b.institutions) a.institutions.add(i);
  for (const w of b.works) a.works.add(w);
  for (const o of b.occurrences) a.occurrences.push(o);
  a.mergedBy.push(...b.mergedBy, evidence);
  a.manuallyMerged ||= b.manuallyMerged || evidence.rule === "manual";
  return a;
}

function addToIndex<K, V>(index: Map<K, Set<V>>, key: K, value: V) {
  let set = index.get(key);
  if (!set) index.set(key, (set = new Set()));
  set.add(value);
}

// A single legacy key can describe two distinct entries on one paper. Give
// each a reproducible address and only expose aliases with one surviving owner.
function addressClusters(clusters: Cluster[]) {
  const owners = new Map<string, Set<Cluster>>();
  for (const c of clusters) for (const k of c.aliases) addToIndex(owners, k, c);
  for (const c of clusters) {
    c.key = c.best.key;
    if (owners.get(c.key)!.size > 1) {
      c.key += "#" + c.anchor;
      c.aliases.add(c.key);
      addToIndex(owners, c.key, c);
    }
  }
  return owners;
}

function* namePairs(clusters: Cluster[]) {
  const byName = new Map<string, Set<Cluster>>();
  for (const a of clusters) {
    if (!a.institutions.size) continue;
    const seen = new Set<Cluster>();
    for (const [name, parsed] of a.names) {
      if (!parsed.bucket) continue;
      for (const b of byName.get(parsed.bucket) || []) {
        if (a === b || seen.has(b)) continue;
        const other = [...b.names].find(([, n]) => compatible(parsed, n));
        if (other) {
          seen.add(b);
          yield { a, b, name, other: other[0] };
        }
      }
      addToIndex(byName, parsed.bucket, a);
    }
  }
}

function overlap(a: Cluster, b: Cluster) {
  for (const i of a.institutions)
    for (const j of b.institutions) if (sharedInstitution(i, j)) return i;
}

export function resolveIdentities(
  works: Work[],
  decisions: IdentityDecision[] = [],
) {
  const all: Cluster[] = [];
  const byToken = new Map<string, Set<Cluster>>();
  const authorsByWork = new Map<string, Cluster[]>();
  for (const work of [...works].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    const authors: Cluster[] = [];
    authorsByWork.set(work.id, authors);
    function add(author: Author, role: Occurrence["role"], index: number) {
      const c = singleton({ author, role, work }, index);
      all.push(c);
      if (role === "author") authors.push(c);
      for (const token of [...c.ids.values()]) {
        let current = root(c);
        const previous = new Set([...(byToken.get(token) || [])].map(root));
        const eligible = [...previous].filter(
          (other) => current !== other && !conflict(current, other),
        );
        if (eligible.length === 1)
          current = join(current, eligible[0], {
            rule: "identifier",
            detail: "Shared identifier " + token,
          });
        byToken.set(token, new Set([...previous].map(root).concat(current)));
      }
    }
    work.authors.forEach((a, i) => add(a, "author", i));
    work.supervisors?.forEach((s, i) =>
      add(s, "supervisor", work.authors.length + i),
    );
  }
  const roots = () => [...new Set(all.map(root))];
  const identified = roots();
  addressClusters(identified);

  const separate = decisions.filter((d) => d.decision === "different");
  const keptApart = (a: Cluster, b: Cluster) =>
    separate.some((d) =>
      d.keys.some(
        (k) =>
          a.aliases.has(k) && d.keys.some((j) => j !== k && b.aliases.has(j)),
      ),
    );

  // Inspect all identifier clusters before accepting any name match. A
  // unique match in one direction can still have two candidates in reverse.
  type Match = { a: Cluster; b: Cluster; detail: string; institution: string };
  const neighbors = new Map<Cluster, Match[]>();
  function remember(c: Cluster, match: Match) {
    const existing = neighbors.get(c);
    if (!existing) neighbors.set(c, [match]);
    else if (existing.length < 5) existing.push(match);
  }
  for (const { a, b, name, other } of namePairs(identified)) {
    if (conflict(a, b) || keptApart(a, b)) continue;
    const institution = overlap(a, b);
    if (!institution) continue;
    const place = institution.name || institution.id;
    const match = {
      a,
      b,
      institution: place,
      detail: `${name} at ${place} matched ${other}`,
    };
    remember(a, match);
    remember(b, match);
  }
  const ambiguous = new Set<Match>();
  for (const matches of neighbors.values()) {
    for (const match of matches) {
      const { a, b, detail } = match;
      if (neighbors.get(a)!.length > 1 || neighbors.get(b)!.length > 1)
        ambiguous.add(match);
      else if (root(a) !== root(b))
        join(a, b, { rule: "name-institution", detail });
    }
  }
  const owners = addressClusters(roots());
  for (const d of decisions.filter((d) => d.decision === "same")) {
    const matches = new Set<Cluster>();
    for (const k of d.keys) {
      const found = new Set([...(owners.get(k) || [])].map(root));
      if (found.size === 1) matches.add([...found][0]);
    }
    const group = [...matches];
    let blocked: string | undefined;
    for (const [i, a] of group.entries())
      for (const b of group.slice(i + 1))
        blocked ||=
          conflict(a, b) ||
          (keptApart(a, b) ? "a different-people decision" : undefined);
    if (blocked) {
      for (const c of group)
        c.mergedBy.push({
          rule: "manual",
          detail: "Same-person decision ignored due to " + blocked + ".",
        });
    } else if (group.length > 1) {
      let a = group[0];
      for (const b of group.slice(1))
        a = join(a, b, {
          rule: "manual",
          detail: `You marked ${a.name} and ${b.name} as the same person.`,
        });
    }
  }

  const final = roots();
  const finalOwners = addressClusters(final);
  function suggest(a: Cluster, b: Cluster, reason: string) {
    if (a === b || conflict(a, b) || keptApart(a, b)) return;
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      if (
        from.possibleDuplicates.length < 5 &&
        !from.possibleDuplicates.some((d) => d.key === to.key)
      )
        from.possibleDuplicates.push({ key: to.key, name: to.name, reason });
    }
  }
  for (const { a, b, institution } of ambiguous)
    suggest(
      root(a),
      root(b),
      `More than one compatible name is affiliated with ${institution}.`,
    );

  const coauthors = new Map<Cluster, Set<Cluster>>();
  function collaborators(c: Cluster) {
    let result = coauthors.get(c);
    if (!result) {
      result = new Set();
      for (const { role, work } of c.occurrences)
        if (role === "author")
          for (const other of authorsByWork.get(work.id) || [])
            result.add(root(other));
      result.delete(c);
      coauthors.set(c, result);
    }
    return result;
  }
  for (const { a, b } of namePairs(final)) {
    if (conflict(a, b) || keptApart(a, b) || overlap(a, b)) continue;
    const left = collaborators(a),
      right = collaborators(b);
    let shared = 0;
    for (const c of left) if (right.has(c)) shared++;
    if (shared >= 2)
      suggest(
        a,
        b,
        `Compatible names at different institutions with ${shared} shared coauthors.`,
      );
  }
  return final.map((c) => ({
    key: c.key,
    name: c.name,
    aliases: [...c.aliases]
      .filter((k) => finalOwners.get(k)?.size === 1)
      .sort(),
    mergedBy: c.mergedBy,
    possibleDuplicates: c.possibleDuplicates,
    occurrences: c.occurrences,
    identity: c.mergedBy.some((e) => e.rule === "name-institution")
      ? "Merged by name and shared institution (unverified)"
      : c.ids.size && !c.manuallyMerged
        ? "Provider identifier"
        : "Unverified name / affiliation grouping",
  }));
}
