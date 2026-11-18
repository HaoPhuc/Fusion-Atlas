import { regionSchema } from "./regions";
import {
  roleOrders,
  roleEvidence,
  rolePriority,
  type RoleOrder,
  type RoleEvidence,
} from "./contact-roles";
import { z } from "zod";
import { normalize, safeUrl } from "./research";
import type { Person, Work } from "./types";
import {
  listedPerson,
  listings,
  matchesInstitution,
  programmes,
  reviewedOn,
} from "./contact-routes";

export const studentProfileSchema = z.object({
  region: regionSchema.optional(),
  roleOrder: z.enum(roleOrders).default("all"),
  degree: z.string().max(120).default("Undergraduate"),
  year: z.string().max(40).default(""),
  skills: z.string().max(600).default(""),
  interests: z.string().max(600).default(""),
  style: z
    .enum([
      "any",
      "computational",
      "experimental",
      "engineering",
      "theoretical",
    ])
    .default("any"),
  countries: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .max(20)
    .default([]),
  start: z.string().max(10).default(""),
  duration: z.string().max(80).default(""),
  funding: z
    .enum(["unknown", "required", "preferred", "flexible"])
    .default("unknown"),
});
export type StudentProfile = z.infer<typeof studentProfileSchema>;
export const defaultProfile = studentProfileSchema.parse({});
export const evidenceSchema = z.object({
  kind: z.enum(["role", "contact", "undergraduate", "requirements", "name"]),
  text: z.string().max(700),
  url: z.string().url().max(2048),
  title: z.string().max(300),
});
export const verificationSchema = z.object({
  personKey: z.string().max(500),
  name: z.string().max(200),
  checkedAt: z.string(),
  institution: z.string().max(300),
  affiliation: z.string().max(300).optional(),
  officialDomain: z.string().max(300),
  status: z.enum(["evidence-found", "partial", "not-found", "unavailable"]),
  evidence: z.array(evidenceSchema).max(25),
  pages: z
    .array(z.object({ url: z.string().max(2048), title: z.string().max(300) }))
    .max(10),
  warnings: z.array(z.string().max(1000)).max(20),
});
export type Verification = z.infer<typeof verificationSchema>;
export const feedbackKinds = [
  "good",
  "wrong-topic",
  "too-theoretical",
  "not-eligible",
  "contacted",
  "dismissed",
] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];
export const feedbackSchema = z.object({
  personKey: z.string().max(500),
  identity: z
    .object({
      name: z.string().max(300),
      institutions: z.array(z.string().max(500)).max(100),
      id: z.string().optional(),
      orcid: z.string().optional(),
    })
    .optional(),
  topic: z.string().max(250),
  kind: z.enum(feedbackKinds),
  terms: z.array(z.string().max(80)).max(20),
  updatedAt: z.string(),
});
export type Feedback = z.infer<typeof feedbackSchema>;
export function contactIdentity(p: Person) {
  return {
    name: p.name.slice(0, 300),
    institutions: p.institutions.slice(0, 100).map((i) => i.name.slice(0, 500)),
    id: p.id,
    orcid: p.orcid,
  };
}
export function sameContact(
  p: Person,
  identity:
    ReturnType<typeof contactIdentity> | NonNullable<Feedback["identity"]>,
) {
  const orcid = (s: string) =>
    s.replace(/^https?:\/\/orcid\.org\//i, "").toLowerCase();
  if (p.orcid && identity.orcid)
    return orcid(p.orcid) === orcid(identity.orcid);
  if (p.id && identity.id) return p.id === identity.id;
  if (
    !p.institutions.some((i) =>
      identity.institutions.some((n) => matchesInstitution(i.name, n)),
    )
  )
    return false;
  const a = normalize(p.name).split(" "),
    b = normalize(identity.name).split(" ");
  if (a.length < 2 || b.length < 2 || a[0][0] !== b[0][0]) return false;
  if (a[0] !== b[0] && a[0].length > 1 && b[0].length > 1) return false;
  return (
    a
      .slice(1)
      .filter((s) => s.length > 1)
      .join(" ") ===
      b
        .slice(1)
        .filter((s) => s.length > 1)
        .join(" ") && a.at(-1) === b.at(-1)
  );
}
const listedIdentities = new Map(
  listings.map((l) => {
    const p = listedPerson(l);
    return [p.key, contactIdentity(p)];
  }),
);
export const matchingStateSchema = z.object({
  profile: studentProfileSchema.default(defaultProfile),
  verifications: z.array(verificationSchema).max(300).default([]),
  feedback: z.array(feedbackSchema).max(1000).default([]),
});
export type MatchingState = z.infer<typeof matchingStateSchema>;
const aliases: [RegExp, string][] = [
  [
    /\b(ml|machine learning|neural networks?|deep learning)\b/g,
    "machinelearning",
  ],
  [/\b(mhd|magnetohydrodynamics?)\b/g, "magnetohydrodynamic"],
  [/\b(cfd|computational fluid dynamics)\b/g, "fluiddynamics"],
  [/\b(fem|finite element methods?)\b/g, "finiteelement"],
  [/\b(plasma facing|plasma material interactions?)\b/g, "plasmamaterial"],
  [/\b(modeling|modelling|models?|simulations?)\b/g, "simulation"],
  [/\b(optimisation|optimization|optimizing|optimising)\b/g, "optimization"],
  [/\b(tungsten|tungstene)\b/g, "tungsten"],
  [/\b(controls?|controle)\b/g, "control"],
];
const stopwords = new Set([
  "and",
  "the",
  "for",
  "with",
  "research",
  "nuclear",
  "fusion",
  "plasma",
  "interested",
  "interest",
  "using",
  "undergraduate",
  "internship",
  "physics",
  "study",
  "studies",
  "work",
  "from",
  "into",
  "would",
  "like",
]);
export function concepts(value: string) {
  let text = normalize(value);
  for (const [rx, replacement] of aliases) text = text.replace(rx, replacement);
  return [
    ...new Set(
      text.split(" ").filter((s) => s.length > 2 && !stopwords.has(s)),
    ),
  ];
}
const styleTerms = {
  any: [],
  computational: [
    "simulation",
    "computational",
    "numerical",
    "gyrokinetic",
    "machinelearning",
    "python",
    "algorithm",
  ],
  experimental: [
    "experimental",
    "diagnostic",
    "spectroscopy",
    "measurement",
    "experiment",
    "thomson",
  ],
  engineering: [
    "engineering",
    "design",
    "manufacturing",
    "cryogenic",
    "magnet",
    "blanket",
    "divertor",
  ],
  theoretical: [
    "theoretical",
    "theory",
    "analytical",
    "kinetic",
    "mathematical",
  ],
};
const vocab = new WeakMap<Work, string[]>();
function corpus(w: Work) {
  let value = vocab.get(w);
  if (!value) {
    value = concepts([w.title, w.abstract, ...(w.keywords || [])].join(" "));
    vocab.set(w, value);
  }
  return value;
}
const hits = (wanted: string[], actual: string[]) =>
  wanted.filter((s) => actual.includes(s));
const commonMethods = new Set([
  "engineering",
  "computing",
  "computational",
  "simulation",
  "theoretical",
  "experimental",
  "methods",
  "systems",
  "numerical",
  "design",
  "analysis",
  "energy",
]);
function hasTopicMatch(terms: string[], matched: string[]) {
  const specific = terms.filter((t) => !commonMethods.has(t));
  return (
    !terms.length ||
    hits(specific.length ? specific : terms, matched).length > 0
  );
}
export type Recommendation = {
  person: Person;
  rank: number;
  fit: "Strong" | "Related" | "Broad";
  reasons: string[];
  gaps: string[];
  matched: string[];
  works: Work[];
  groupKey: string;
  groupName: string;
  groupNote: string;
  lane: "contact" | "investigate" | "explore";
  action: string;
  actionUrl?: string;
  verification?: Verification;
  feedback?: Feedback;
  hidden: boolean;
  groupSource?: string;
  routeReviewed?: string;
  roleLabel?: string;
  roles?: RoleEvidence[];
};
export function rankCandidates(
  people: Person[],
  topic: string,
  state: MatchingState,
  now = Date.now(),
): Recommendation[] {
  const searchTerms = concepts(topic);
  const wanted = concepts(topic + " " + state.profile.interests);
  const skills = concepts(state.profile.skills);
  const styles = styleTerms[state.profile.style];
  const focus =
    /\b(?:nuclear fusion|fusion (?:energy|reactors?|plasmas?|power)|thermonuclear|tokamaks?|stellarators?|gyrokinetic\w*|divertors?|inertial confinement|magnetic confinement|plasma[- ]facing|deuterium[-– ]tritium|iter|w7[- ]x|jet tokamak|ignition (?:facility|target))\b/i;
  const feedback = state.feedback.filter(
    (f) => normalize(f.topic) === normalize(topic),
  );
  const contacted = state.feedback.filter((f) => f.kind === "contacted");
  const latest = new Map(state.verifications.map((v) => [v.personKey, v]));
  return people
    .map((p): Recommendation => {
      const scored = p.works
        .map((w) => {
          const c = corpus(w);
          const matched = hits(wanted, c);
          const skillHits = hits(skills, c);
          const styleHits = hits(styles, c);
          const inField =
            focus.test(
              [w.title, w.abstract, ...(w.keywords || [])].join(" "),
            ) ||
            p.institutions.some((i) =>
              /plasma physics|fusion (?:research|science|energy)|atomic energy authority|fundamental energy research/i.test(
                i.name,
              ),
            );
          const match = wanted.length
            ? matched.length / wanted.length
            : /fusion|tokamak|stellarator|gyrokinetic|tritium/i.test(
                  w.title + " " + w.abstract,
                )
              ? 0.6
              : 0;
          return {
            w,
            matched,
            skillHits,
            styleHits,
            inField,
            score: inField
              ? match * 60 +
                Math.min(skillHits.length, 3) * 6 +
                (styleHits.length ? 10 : 0) +
                (w.year >= new Date(now).getUTCFullYear() - 3 ? 4 : 0)
              : 0,
          };
        })
        .sort((a, b) => b.score - a.score || b.w.year - a.w.year);
      const best = scored[0];
      const v = latest.get(p.key);
      const fresh =
        !!v &&
        now - Date.parse(v.checkedAt) >= 0 &&
        now - Date.parse(v.checkedAt) < 30 * 86400000;
      const role = fresh && v?.evidence.find((e) => e.kind === "role");
      const route = fresh && v?.evidence.find((e) => e.kind === "contact");
      const undergraduate =
        fresh && v?.evidence.find((e) => e.kind === "undergraduate");
      const own =
        contacted.find((f) => {
          if (f.personKey === p.key) return true;
          const identity = f.identity || listedIdentities.get(f.personKey);
          return !!identity && sameContact(p, identity);
        }) || feedback.find((f) => f.personKey === p.key);
      const supervised = (p.supervisedWorkIds?.length || 0) > 0;
      const preferredLocation =
        !state.profile.countries.length ||
        p.institutions.some(
          (i) => i.country && state.profile.countries.includes(i.country),
        );
      const reasons = [];
      if (best?.matched.length)
        reasons.push(
          `Research methods/topics: ${best.matched.slice(0, 4).join(", ")}.`,
        );
      if (best?.skillHits.length)
        reasons.push(
          `Your skills appear in the evidence: ${best.skillHits.join(", ")}.`,
        );
      if (best?.styleHits.length)
        reasons.push(
          `Evidence of ${state.profile.style} work: ${best.styleHits.slice(0, 3).join(", ")}.`,
        );
      if (supervised)
        reasons.push(
          "Explicit thesis supervision recorded; undergraduate availability remains unconfirmed.",
        );
      if (role)
        reasons.push(`Official-page role evidence: ${role.text.slice(0, 150)}`);
      const gaps = [];
      if (!role)
        gaps.push(
          "Current lab role has not been established from an official page.",
        );
      if (!route)
        gaps.push(
          "A personal contact or application route still needs checking.",
        );
      if (!undergraduate)
        gaps.push("Ask whether the group hosts undergraduate students.");
      if (
        state.profile.year ||
        (state.profile.degree && state.profile.degree !== "Undergraduate")
      )
        gaps.push(
          "Check eligibility for " +
            [state.profile.degree, state.profile.year]
              .filter(Boolean)
              .join(", ") +
            ".",
        );
      if (!preferredLocation)
        gaps.push(
          "Preferred location is not established by the indexed personal affiliations.",
        );
      if (state.profile.start || state.profile.duration)
        gaps.push(
          `Confirm timing: ${[state.profile.start, state.profile.duration].filter(Boolean).join(" · ")}.`,
        );
      if (
        state.profile.funding !== "unknown" &&
        state.profile.funding !== "flexible"
      )
        gaps.push(
          `Funding ${state.profile.funding}; not established by publication metadata.`,
        );
      if (v && !fresh)
        gaps.push(
          "Official-page check is over 30 days old or has an invalid date; refresh before contact.",
        );
      const matchingFeedback = feedback.filter(
        (f) =>
          f.kind === "good" &&
          f.personKey !== p.key &&
          hits(f.terms, best ? corpus(best.w) : []).length >= 2,
      ).length;
      const theoreticalPenalty =
        own?.kind === "too-theoretical"
          ? 12
          : feedback.some((f) => f.kind === "too-theoretical") &&
              scored.some(
                (s) => hits(styleTerms.theoretical, corpus(s.w)).length,
              )
            ? 8
            : 0;
      const rank =
        (best?.score || 0) +
        (supervised ? 12 : 0) +
        (role ? 15 : 0) +
        (route ? 5 : 0) +
        (preferredLocation && state.profile.countries.length ? 4 : 0) +
        (own?.kind === "good" ? 10 : 0) +
        Math.min(matchingFeedback * 2, 6) -
        theoreticalPenalty;
      const relevant = hasTopicMatch(searchTerms, best?.matched || []);
      const fit = !relevant
        ? "Broad"
        : (best?.matched.length || !wanted.length) && (best?.score || 0) >= 40
          ? "Strong"
          : (best?.score || 0) >= 18
            ? "Related"
            : "Broad";
      // Publication volume and author order never establish seniority or a supervisor role.
      const lane =
        fit !== "Broad" && role && route
          ? "contact"
          : fit !== "Broad" && (supervised || role)
            ? "investigate"
            : "explore";
      const thesis = scored.find((s) =>
        p.supervisedWorkIds?.includes(s.w.id),
      )?.w;
      const works =
        best && thesis && best.w.id !== thesis.id
          ? [
              best.w,
              thesis,
              ...scored
                .filter((s) => s.w !== thesis && s !== best)
                .map((s) => s.w),
            ].slice(0, 3)
          : scored.slice(0, 3).map((s) => s.w);
      const roles: RoleEvidence[] =
        fresh && v
          ? v.evidence
              .filter((e) => e.kind === "role")
              .flatMap(
                (e) =>
                  roleEvidence(
                    e.text,
                    p.name,
                    e.url,
                    v.checkedAt.slice(0, 10),
                  ) || [],
              )
          : [];
      if (thesis) {
        const record = thesis.supervisors?.find(
          (s) => normalize(s.name) === normalize(p.name),
        );
        const url = safeUrl(record?.evidenceUrl || thesis.url);
        if (url)
          roles.push({
            kind: "mentor",
            label: "Recorded thesis supervisor",
            url,
            date: thesis.year ? String(thesis.year) : undefined,
          });
      }
      const primary =
        p.institutions.find((i) =>
          state.profile.countries.includes(i.country || ""),
        ) || p.institutions[0];
      return {
        person: p,
        roles,
        rank,
        fit,
        reasons: reasons.length
          ? reasons
          : ["A broad literature lead; read the evidence before prioritizing."],
        gaps,
        matched: best?.matched || [],
        works,
        verification: v,
        groupKey: primary
          ? primary.id || normalize(primary.name)
          : `unknown:${p.key}`,
        groupName: primary?.name || "Affiliation not established",
        groupNote: primary
          ? "Grouped by indexed institution; a shared research group is not assumed."
          : "Kept separate because personal affiliation is unknown.",
        lane,
        action:
          lane === "contact"
            ? "Open the published contact page"
            : !primary && thesis
              ? "Open the thesis record to trace the supervisor’s group"
              : "Check the current role and contact route on the institution website.",
        actionUrl: route
          ? safeUrl(route.url)
          : !primary && thesis
            ? safeUrl(thesis.url)
            : undefined,
        feedback: own,
        hidden:
          !!own &&
          ["wrong-topic", "not-eligible", "contacted", "dismissed"].includes(
            own.kind,
          ),
      };
    })
    .sort(
      (a, b) => b.rank - a.rank || a.person.name.localeCompare(b.person.name),
    );
}
export function recommendationGroups(
  candidates: Recommendation[],
  limit = 8,
  order: RoleOrder = "all",
) {
  const groups = new Map<
    string,
    { lead: Recommendation; alternatives: Recommendation[] }
  >();
  const priority = { contact: 0, investigate: 1, explore: 2 };
  const sorted = candidates
    .filter((c) => !c.hidden && c.fit !== "Broad" && c.lane !== "explore")
    .sort(
      (a, b) =>
        rolePriority(b, order) - rolePriority(a, order) ||
        priority[a.lane] - priority[b.lane] ||
        b.rank - a.rank,
    );
  for (const c of sorted) {
    const found = groups.get(c.groupKey);
    if (found) found.alternatives.push(c);
    else groups.set(c.groupKey, { lead: c, alternatives: [] });
  }
  return [...groups.values()].slice(0, limit);
}
export function contactCandidates(
  people: Person[],
  topic: string,
  state: MatchingState,
  scope: { country: string; institution?: { name: string; id?: string } },
  now = Date.now(),
) {
  const terms = concepts([topic, state.profile.interests].join(" "));
  const listed = listings.filter(
    (l) =>
      (!scope.country || scope.country === l.country) &&
      matchesInstitution(l.institution, scope.institution?.name),
  );
  const inScope = (i: Person["institutions"][number]) =>
    (!scope.country || i.country === scope.country) &&
    (!scope.institution ||
      (scope.institution.id && i.id === scope.institution.id) ||
      matchesInstitution(i.name, scope.institution.name));
  const scoped =
    scope.country || scope.institution
      ? people.filter((p) => p.institutions.some(inScope))
      : people;
  const verifiedInScope = new Map(
    scoped.map((p) => [p.key, p.institutions.filter(inScope)]),
  );
  const scopedState =
    scope.country || scope.institution
      ? {
          ...state,
          verifications: state.verifications.filter((v) =>
            verifiedInScope
              .get(v.personKey)
              ?.some((i) =>
                matchesInstitution(i.name, v.affiliation || v.institution),
              ),
          ),
        }
      : state;
  const literature = rankCandidates(scoped, topic, scopedState, now).map(
    (c) => {
      const affiliation =
        scope.country || scope.institution
          ? c.person.institutions.find(inScope)
          : undefined;
      if (
        affiliation &&
        c.groupKey !== (affiliation.id || normalize(affiliation.name))
      ) {
        c.groupKey = affiliation.id || normalize(affiliation.name);
        c.groupName = affiliation.name;
      }
      const programme = programmes.find((r) =>
        matchesInstitution(r.institution, c.groupName),
      );
      if (programme && c.lane !== "explore") {
        c.action = "Read the " + programme.name + " application instructions";
        c.actionUrl = programme.url;
        c.reasons.push(programme.note);
      }
      return c;
    },
  );
  const contacts: Recommendation[] = [];
  const merged = new Set<string>();
  for (const l of listed) {
    const vocabulary = concepts(l.topics);
    const overlap = hits(terms, vocabulary);
    if (
      (terms.length && !overlap.length) ||
      !hasTopicMatch(concepts(topic), vocabulary)
    )
      continue;
    const matches = literature.filter(
      (c) =>
        normalize(c.person.name) === normalize(l.name) &&
        c.person.institutions.some((i) =>
          matchesInstitution(l.institution, i.name),
        ),
    );
    const listedProfile = listedPerson(l);
    const p =
      matches.length === 1
        ? { ...matches[0].person, key: listedProfile.key }
        : listedProfile;
    if (matches.length === 1) merged.add(matches[0].person.key);
    const entry = rankCandidates([p], topic, state, now)[0];
    const skill = hits(concepts(state.profile.skills), vocabulary);
    const reasons = [
      `The institution names ${l.name} as ${l.role || "group leader"}.`,
      ...(l.studentEvidence ? [l.studentEvidence] : []),
      ...(overlap.length
        ? [`Group research covers ${overlap.join(", ")}.`]
        : []),
      ...(skill.some((t) => !overlap.includes(t))
        ? [
            `Additional skills that match the group’s work include ${skill.filter((t) => !overlap.includes(t)).join(", ")}.`,
          ]
        : []),
    ];
    const age = now - Date.parse(reviewedOn);
    const fresh =
      (age >= 0 && age < 30 * 86400000) ||
      (!!entry.verification &&
        now - Date.parse(entry.verification.checkedAt) >= 0 &&
        now - Date.parse(entry.verification.checkedAt) < 30 * 86400000 &&
        entry.verification.evidence.some(
          (e) => e.kind === "role" && e.url === l.source,
        ));
    contacts.push({
      ...entry,
      person: { ...p, officialGroup: l.group, officialRoleSource: l.source },
      groupName: l.group + " · " + l.institution,
      groupKey: "listed:" + normalize(l.group),
      groupNote:
        "The linked institution page names this person and their role.",
      groupSource: l.source,
      routeReviewed: reviewedOn,
      roleLabel: l.role || "Listed group leader",
      roles: [
        ...[
          roleEvidence(l.role || "group leader", l.name, l.source, reviewedOn),
        ].filter((r): r is RoleEvidence => !!r),
        ...(entry.roles || []),
      ],
      rank:
        Math.max(
          entry.rank,
          44 +
            overlap.length * 8 +
            skill.length * 5 +
            (l.studentEvidence ? 7 : 0) +
            Math.min(
              6,
              hits(styleTerms[state.profile.style], vocabulary).length * 3,
            ) +
            (entry.feedback?.kind === "good" ? 10 : 0) -
            (entry.feedback?.kind === "too-theoretical" ? 10 : 0),
        ) + (state.profile.countries.includes(l.country) ? 8 : 0),
      matched: overlap,
      fit:
        terms.length && overlap.length / terms.length >= 0.5
          ? "Strong"
          : "Related",
      reasons,
      lane: fresh && l.role !== "PhD candidate" ? "contact" : "investigate",
      action: fresh
        ? l.instruction
        : "Recheck the dated group listing and its contact instructions.",
      actionUrl: l.route,
      gaps: [
        "Confirm that the group can host you for an undergraduate project.",
        ...entry.gaps.filter(
          (g) =>
            g.startsWith("Confirm timing") ||
            g.startsWith("Funding") ||
            g.startsWith("Check eligibility"),
        ),
      ],
    });
  }
  return [...contacts, ...literature.filter((c) => !merged.has(c.person.key))];
}
