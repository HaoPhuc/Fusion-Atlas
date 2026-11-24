import type { Author, Institution, Person, Work } from "./types";
import { normalize, orcidKey } from "./normalization";
import { externalIds, nameKeys, resolveIdentities } from "./identity";
import type { IdentityDecision } from "./types";
import { levelSummaryLine, supervisionLevels, verificationFor } from "./levels";
import type { Verification } from "./matching";
export { normalize, orcidKey } from "./normalization";
export const doiKey = (s?: string) =>
  s
    ?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .toLowerCase()
    .trim();
export function safeUrl(s?: string) {
  try {
    const u = new URL(s || "");
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
const vocabulary: [RegExp, string[]][] = [
  [
    /turbulen|transport|gyrokinetic/i,
    [
      "gyrokinetic turbulence",
      "anomalous plasma transport",
      "microinstabilities",
    ],
  ],
  [
    /material|tungsten|wall|divertor/i,
    [
      "plasma material interactions",
      "plasma facing components",
      "tungsten irradiation",
      "divertor heat exhaust",
    ],
  ],
  [
    /tritium|blanket|breeding|fuel/i,
    [
      "tritium breeding blanket",
      "fusion fuel cycle",
      "hydrogen isotope transport",
    ],
  ],
  [
    /magnet|superconduct|hts|rebco/i,
    ["high temperature superconducting magnets", "REBCO fusion magnets"],
  ],
  [
    /machine learning|neural|artificial intelligence|\bai\b|control/i,
    [
      "machine learning plasma control",
      "tokamak disruption prediction",
      "reinforcement learning fusion",
    ],
  ],
  [
    /laser|inertial|ignition/i,
    [
      "inertial confinement fusion",
      "laser plasma interaction",
      "fusion target design",
    ],
  ],
  [
    /stellarator|helical/i,
    ["stellarator optimization", "quasisymmetry", "neoclassical transport"],
  ],
  [
    /diagnostic|thomson|spectroscop/i,
    ["fusion plasma diagnostics", "Thomson scattering", "neutron diagnostics"],
  ],
  [
    /simulation|computational|model/i,
    [
      "fusion plasma simulation",
      "magnetohydrodynamics",
      "gyrokinetic modelling",
    ],
  ],
  [
    /tokamak/i,
    ["spherical tokamak", "magnetic confinement fusion", "tokamak stability"],
  ],
];
export function expand(topic: string) {
  const base = topic.trim() || "nuclear fusion";
  const terms = [
    base,
    ...vocabulary.filter(([rx]) => rx.test(base)).flatMap(([, v]) => v),
  ].slice(0, 6);
  return [
    ...new Set(
      terms.map((t) =>
        /fusion|tokamak|stellarator|gyrokinetic/i.test(t) ? t : `${t} fusion`,
      ),
    ),
  ];
}
export function frenchQueries(topic: string) {
  const terms = ["fusion nucléaire plasma"];
  if (/turbulen|transport|gyrokinetic/i.test(topic))
    terms.push("turbulence transport tokamak");
  if (/material|tungsten|wall|divertor/i.test(topic))
    terms.push("tungstène matériaux fusion");
  if (/tritium|blanket|breeding|fuel/i.test(topic))
    terms.push("tritium couverture tritigène");
  if (/control|learning|disruption/i.test(topic))
    terms.push("contrôle disruptions tokamak");
  if (/diagnostic|spectroscop/i.test(topic))
    terms.push("diagnostic plasma fusion");
  return terms.slice(0, 2);
}
function providerAuthorMetadata({
  previousNameKeys,
  additionalExternalIds,
  ...record
}: Author) {
  return JSON.stringify(record);
}
function mergeAuthors<T extends Author>(
  left: T[],
  right: T[],
  workId: string,
  incomingId: string,
): T[] {
  const out = left.map((a) => ({ ...a, institutions: [...a.institutions] }));
  const available = new Set(out);
  const incomingNames = new Map<string, number>();
  for (const a of right) {
    const name = normalize(a.name);
    incomingNames.set(name, (incomingNames.get(name) || 0) + 1);
  }
  for (const a of right) {
    const incomingIds = externalIds(a);
    const sharesId = (b: Author) =>
      (a.id && a.id === b.id) ||
      (a.orcid && orcidKey(a.orcid) === orcidKey(b.orcid)) ||
      incomingIds.some((id) => externalIds(b).includes(id));
    const name = normalize(a.name);
    const candidates = [...available].filter(
      (b) =>
        (name === normalize(b.name) || sharesId(b)) &&
        !(a.id && b.id && a.id !== b.id) &&
        !(a.orcid && b.orcid && orcidKey(a.orcid) !== orcidKey(b.orcid)) &&
        !incomingIds.some((id) =>
          externalIds(b).some(
            (other) => id !== other && id.split(":")[0] === other.split(":")[0],
          ),
        ),
    );
    const identified = candidates.filter(sharesId);
    // Match across provider records one-to-one. An anonymous homonym must
    // not consume another author's identified entry earlier in the loop.
    const b =
      identified.length === 1
        ? identified[0]
        : candidates.length === 1 && incomingNames.get(name) === 1
          ? candidates[0]
          : candidates.find(
              (candidate) =>
                providerAuthorMetadata(candidate) === providerAuthorMetadata(a),
            );
    if (b) {
      available.delete(b);
      const historical = new Set([
        ...nameKeys(b, workId),
        ...nameKeys(a, incomingId),
        ...(b.previousNameKeys || []),
        ...(a.previousNameKeys || []),
      ]);
      const ids = new Set([...externalIds(b), ...incomingIds]);
      b.id ||= a.id;
      b.orcid ||= a.orcid;
      b.externalId ||= a.externalId;
      b.profileUrl ||= a.profileUrl;
      b.corresponding ||= a.corresponding;
      b.institutions = uniqueInstitutions([
        ...b.institutions,
        ...a.institutions,
      ]);
      for (const key of nameKeys(b, workId)) historical.delete(key);
      if (historical.size) b.previousNameKeys = [...historical];
      if (b.externalId) ids.delete(b.externalId);
      if (ids.size) b.additionalExternalIds = [...ids];
    } else {
      const copy = { ...a, institutions: [...a.institutions] };
      if (incomingId !== workId && !a.institutions.length) {
        const historical = new Set([
          ...(a.previousNameKeys || []),
          ...nameKeys(a, incomingId),
        ]);
        if (historical.size) copy.previousNameKeys = [...historical];
      }
      out.push(copy);
    }
  }
  return out;
}
const uniqueObjects = <T>(values: T[]) => [
  ...new Map(values.map((v) => [JSON.stringify(v), v])).values(),
];
export function mergeWorks(input: Work[]): Work[] {
  const groups: Work[] = [];
  const keys = new Map<string, Work>();
  // A later identifier bridge can join groups in a different order than arrival.
  const concreteLevelOrder = new Map<Work, number>();
  const absorb = (old: Work, w: Work, order: number) => {
    if (
      w.level &&
      w.level !== "unknown" &&
      order < (concreteLevelOrder.get(old) ?? Infinity)
    ) {
      old.level = w.level;
      concreteLevelOrder.set(old, order);
    } else {
      old.level ??= w.level;
    }
    old.sources = [...new Set([...old.sources, ...w.sources])];
    old.queries = [...new Set([...old.queries, ...w.queries])];
    if (w.abstract.length > old.abstract.length) old.abstract = w.abstract;
    old.openalexId ||= w.openalexId;
    old.pdf ||= w.pdf;
    old.doi ||= w.doi;
    old.identifiers = [
      ...new Set([...(old.identifiers || []), ...(w.identifiers || [])]),
    ];
    old.keywords = [
      ...new Set([...(old.keywords || []), ...(w.keywords || [])]),
    ];
    old.records = uniqueObjects([...(old.records || []), ...(w.records || [])]);
    old.context = uniqueObjects([...(old.context || []), ...(w.context || [])]);
    old.relatedTo = uniqueObjects([
      ...(old.relatedTo || []),
      ...(w.relatedTo || []),
    ]);
    old.supervisors = mergeAuthors(
      old.supervisors || [],
      w.supervisors || [],
      old.id,
      w.id,
    );
    if (w.discovered === "query") old.discovered = "query";
    old.references = [...new Set([...old.references, ...w.references])];
    old.citedBy = Math.max(old.citedBy, w.citedBy);
    old.authors = mergeAuthors(old.authors, w.authors, old.id, w.id);
  };
  for (const [order, w] of input.entries()) {
    const fingerprints = [
      w.id,
      ...(w.doi ? ["doi:" + doiKey(w.doi)] : []),
      ...(w.openalexId ? [w.openalexId] : []),
      ...(w.identifiers || []),
    ];
    // Fuzzy title matches are deliberately NOT a deduplication key.
    const matches = [
      ...new Set(
        fingerprints.map((k) => keys.get(k)).filter((v): v is Work => !!v),
      ),
    ];
    const old = matches[0];
    if (old) {
      // A later record can bridge a DOI-only record and an identifier-only record.
      for (const other of matches.slice(1)) {
        absorb(old, other, concreteLevelOrder.get(other) ?? Infinity);
        groups.splice(groups.indexOf(other), 1);
        for (const [key, value] of keys)
          if (value === other) keys.set(key, old);
      }
      absorb(old, w, order);
      fingerprints.forEach((k) => keys.set(k, old));
    } else {
      const copy = {
        ...w,
        sources: [...w.sources],
        queries: [...w.queries],
        references: [...w.references],
        supervisors: w.supervisors?.map((a) => ({
          ...a,
          institutions: [...a.institutions],
        })),
        authors: w.authors.map((a) => ({
          ...a,
          institutions: [...a.institutions],
        })),
      };
      groups.push(copy);
      if (copy.level && copy.level !== "unknown")
        concreteLevelOrder.set(copy, order);
      fingerprints.forEach((k) => keys.set(k, copy));
    }
  }
  return groups;
}
export function uniqueInstitutions(values: Institution[]) {
  const result = new Map<string, Institution>();
  for (const i of values) {
    const key = i.id || normalize(i.name),
      old = result.get(key);
    const institution = old?.ror && !i.ror ? { ...i, ror: old.ror } : i;
    result.set(
      key,
      old?.lat !== undefined && i.lat === undefined
        ? {
            ...institution,
            city: old.city,
            lat: old.lat,
            lon: old.lon,
            country: old.country,
          }
        : institution,
    );
  }
  return [...result.values()];
}
export function peopleFrom(
  works: Work[],
  topic: string,
  country = "",
  institutionId = "",
  includeUnknown = true,
  decisions: IdentityDecision[] = [],
): Person[] {
  const tokens = normalize(topic)
    .split(" ")
    .filter(
      (x) =>
        x.length > 2 &&
        !["and", "the", "for", "with", "fusion", "research"].includes(x),
    );
  const people: Person[] = [];
  for (const { occurrences, ...identity } of resolveIdentities(
    works,
    decisions,
  )) {
    const p: Person = {
      ...identity,
      institutions: [],
      works: [],
      authoredWorkIds: [],
      supervisedWorkIds: [],
      score: 0,
      matched: [],
      corresponding: false,
    };
    // Identifiers apply to the whole cluster. Geographic filters still apply to
    // each occurrence's evidence, including papers where affiliation is unknown.
    for (const { author: a, role, work: w } of occurrences) {
      p.id ||= a.id;
      p.orcid ||= a.orcid;
      p.externalId ||= a.externalId;
      p.profileUrl ||= a.profileUrl;
      const known = a.institutions.filter((i) => i.country);
      if (
        country &&
        !a.institutions.some((i) => i.country === country) &&
        (!includeUnknown || known.length)
      )
        continue;
      if (
        institutionId &&
        !a.institutions.some((i) => i.id === institutionId) &&
        (!includeUnknown ||
          a.institutions.some((i) =>
            /^https:\/\/openalex.org\/I\d+$/.test(i.id),
          ))
      )
        continue;
      if (!p.works.some((x) => x.id === w.id)) p.works.push(w);
      const roleWorks =
        role === "author" ? p.authoredWorkIds! : p.supervisedWorkIds!;
      if (!roleWorks.includes(w.id)) roleWorks.push(w.id);
      p.institutions = uniqueInstitutions([
        ...p.institutions,
        ...a.institutions,
      ]);
      p.corresponding ||= !!a.corresponding;
    }
    if (p.works.length) people.push(p);
  }
  const searchTexts = new WeakMap<Work, string>();
  for (const p of people) {
    p.works.sort((a, b) => b.year - a.year);
    p.matched = tokens.filter((t) =>
      p.works.some((w) => {
        let text = searchTexts.get(w);
        if (text === undefined) {
          text = normalize(
            [w.title, w.abstract, ...(w.keywords || [])].join(" "),
          );
          searchTexts.set(w, text);
        }
        return text.includes(t);
      }),
    );
    // Research fit only. No citation prestige, authorship-order PI guess, or eligibility inference.
    p.score =
      p.matched.length * 8 +
      Math.min(p.works.filter((w) => w.discovered === "query").length, 10) * 2 +
      Math.min(
        p.works.filter((w) => w.year >= new Date().getFullYear() - 3).length,
        5,
      );
  }
  return people.sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
}
export const searchLink = (query: string) =>
  "https://www.google.com/search?q=" + encodeURIComponent(query);
export function csvCell(s: string) {
  const safe = /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function shortlistCsv(
  saved: SavedLike[],
  verifications: Verification[] = [],
) {
  return [
    [
      "Researcher",
      "Affiliations at publication",
      "Status",
      "Notes",
      "ORCID",
      "Identity profile",
      "Authored works",
      "Named supervisor evidence",
      "Supervision levels",
      "Evidence",
      "Saved",
    ]
      .map(csvCell)
      .join(","),
    ...saved.map((s) => {
      const levels = supervisionLevels(
        s.person,
        verificationFor(s.person, verifications),
      );
      const official = levels.officialUndergraduate;
      return [
        s.person.name,
        s.person.institutions.map((i) => i.name).join("; "),
        s.status,
        s.notes,
        s.person.orcid || "",
        s.person.profileUrl || s.person.id || "",
        s.person.works
          .filter(
            (w) =>
              s.person.authoredWorkIds?.includes(w.id) ??
              !s.person.supervisedWorkIds?.includes(w.id),
          )
          .map((w) => w.url)
          .join("; "),
        s.person.works
          .filter((w) => s.person.supervisedWorkIds?.includes(w.id))
          .map((w) => w.url)
          .join("; "),
        levelSummaryLine(levels) +
          (official
            ? ` · Official undergraduate page (checked ${official.checkedAt.slice(0, 10)}): ${official.url}`
            : ""),
        s.person.works.map((w) => w.url).join("; "),
        s.savedAt,
      ]
        .map(csvCell)
        .join(",");
    }),
  ].join("\r\n");
}
type SavedLike = {
  person: Person;
  status: string;
  notes: string;
  savedAt: string;
};
