import type { Author, Institution, Person, Work } from "./types";
export const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const orcidKey = (s?: string) =>
  s
    ?.replace(/^https?:\/\/orcid.org\//i, "")
    .replace(/\/$/, "")
    .toUpperCase();
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
function mergeAuthors<T extends Author>(left: T[], right: T[]): T[] {
  const out = left.map((a) => ({ ...a, institutions: [...a.institutions] }));
  for (const a of right) {
    const candidates = out.filter(
      (b) =>
        (normalize(b.name) === normalize(a.name) ||
          (a.orcid && orcidKey(a.orcid) === orcidKey(b.orcid)) ||
          (a.externalId && a.externalId === b.externalId)) &&
        !(a.id && b.id && a.id !== b.id) &&
        !(a.orcid && b.orcid && orcidKey(a.orcid) !== orcidKey(b.orcid)) &&
        !(
          a.externalId &&
          b.externalId &&
          a.externalId.split(":")[0] === b.externalId.split(":")[0] &&
          a.externalId !== b.externalId
        ),
    );
    if (candidates.length === 1) {
      const b = candidates[0];
      b.id ||= a.id;
      b.orcid ||= a.orcid;
      b.externalId ||= a.externalId;
      b.profileUrl ||= a.profileUrl;
      b.corresponding ||= a.corresponding;
      b.institutions = uniqueInstitutions([
        ...b.institutions,
        ...a.institutions,
      ]);
    } else if (!candidates.length)
      out.push({ ...a, institutions: [...a.institutions] });
  }
  return out;
}
const uniqueObjects = <T>(values: T[]) => [
  ...new Map(values.map((v) => [JSON.stringify(v), v])).values(),
];
export function mergeWorks(input: Work[]): Work[] {
  const groups: Work[] = [];
  const keys = new Map<string, Work>();
  const absorb = (old: Work, w: Work) => {
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
    old.supervisors = mergeAuthors(old.supervisors || [], w.supervisors || []);
    if (w.discovered === "query") old.discovered = "query";
    old.references = [...new Set([...old.references, ...w.references])];
    old.citedBy = Math.max(old.citedBy, w.citedBy);
    old.authors = mergeAuthors(old.authors, w.authors);
  };
  for (const w of input) {
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
        absorb(old, other);
        groups.splice(groups.indexOf(other), 1);
        for (const [key, value] of keys)
          if (value === other) keys.set(key, old);
      }
      absorb(old, w);
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
    result.set(
      key,
      old?.lat !== undefined && i.lat === undefined
        ? {
            ...i,
            city: old.city,
            lat: old.lat,
            lon: old.lon,
            country: old.country,
          }
        : i,
    );
  }
  return [...result.values()];
}
function personKey(a: Author, w: Work) {
  return a.orcid
    ? `orcid:${orcidKey(a.orcid)}`
    : a.id ||
        a.externalId ||
        `unverified:${normalize(a.name)}:${
          a.institutions.length
            ? a.institutions
                .map((i) => i.id || normalize(i.name))
                .sort()
                .join("|")
            : w.id
        }`;
}
export function peopleFrom(
  works: Work[],
  topic: string,
  country = "",
  institutionId = "",
  includeUnknown = true,
): Person[] {
  const tokens = normalize(topic)
    .split(" ")
    .filter(
      (x) =>
        x.length > 2 &&
        !["and", "the", "for", "with", "fusion", "research"].includes(x),
    );
  const people = new Map<string, Person>();
  // ORCID wins when a source links it to an OpenAlex ID; otherwise keep identities separate.
  const orcids = new Map<string, string>();
  works.forEach((w) =>
    [...w.authors, ...(w.supervisors || [])].forEach((a) => {
      if (a.id && a.orcid) orcids.set(a.id, a.orcid);
      if (a.externalId && a.orcid) orcids.set(a.externalId, a.orcid);
    }),
  );
  for (const w of works) {
    const participants = [
      ...w.authors.map((a) => ({ a, role: "author" })),
      ...(w.supervisors || []).map((a) => ({ a, role: "supervisor" })),
    ];
    for (const { a: original, role } of participants) {
      const a = {
        ...original,
        orcid:
          original.orcid ||
          (original.id ? orcids.get(original.id) : undefined) ||
          (original.externalId ? orcids.get(original.externalId) : undefined),
      };
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
      const key = personKey(a, w);
      let p = people.get(key);
      if (!p) {
        p = {
          key,
          name: a.name,
          id: a.id,
          orcid: a.orcid,
          externalId: a.externalId,
          profileUrl: a.profileUrl,
          institutions: [],
          works: [],
          authoredWorkIds: [],
          supervisedWorkIds: [],
          score: 0,
          matched: [],
          identity:
            a.id || a.orcid || a.externalId
              ? "Provider identifier"
              : "Unverified name / affiliation grouping",
          corresponding: false,
        };
        people.set(key, p);
      }
      p.id ||= a.id;
      p.orcid ||= a.orcid;
      p.externalId ||= a.externalId;
      p.profileUrl ||= a.profileUrl;
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
  }
  const searchTexts = new WeakMap<Work, string>();
  for (const p of people.values()) {
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
  return [...people.values()].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
}
export const searchLink = (query: string) =>
  "https://www.google.com/search?q=" + encodeURIComponent(query);
export function csvCell(s: string) {
  const safe = /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function shortlistCsv(saved: SavedLike[]) {
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
      "Evidence",
      "Saved",
    ]
      .map(csvCell)
      .join(","),
    ...saved.map((s) =>
      [
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
        s.person.works.map((w) => w.url).join("; "),
        s.savedAt,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\r\n");
}
type SavedLike = {
  person: Person;
  status: string;
  notes: string;
  savedAt: string;
};
