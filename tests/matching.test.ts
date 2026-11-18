import { test } from "node:test";
import { sessionSchema } from "../lib/session";
import assert from "node:assert/strict";
import {
  contactCandidates,
  matchingStateSchema,
  recommendationGroups,
  rankCandidates,
  type Verification,
} from "../lib/matching";
import {
  extractPageEvidence,
  publicAddress,
  validatePageUrl,
  withinOfficialDomain,
  verifyCandidate,
} from "../lib/official-pages";
import { peopleFrom } from "../lib/research";
import type { Work } from "../lib/types";
import { listings, reviewedOn } from "../lib/contact-routes";
const now = Date.parse(reviewedOn) + 1000;
const empty = () => matchingStateSchema.parse({});
const lab = { id: "I1", name: "University Laboratory", country: "AU" };
const named = (name: string) => ({
  name,
  id: "id:" + name,
  institutions: [lab],
});
const paper: Work = {
  id: "W",
  year: 2026,
  type: "thesis",
  title: "Spectroscopy of tokamak edge turbulence",
  abstract: "Optical diagnostics",
  url: "https://example.edu/paper",
  authors: [named("Student Author")],
  supervisors: [
    {
      ...named("Supervisor One"),
      evidenceUrl: "https://example.edu/thesis",
      evidenceSource: "Thesis catalogue",
    },
  ],
  sources: ["test"],
  queries: [],
  citedBy: 0,
  references: [],
  discovered: "query",
  retrievedAt: reviewedOn,
};
const url = "https://example.edu/people";
const evidence = (html: string) =>
  extractPageEvidence(html, url, "Jane Patel").evidence;
test("large repository descriptions round-trip and unknown affiliations stay out of location-specific contacts", () => {
  const thesis = {
    ...paper,
    abstract: "Full repository metadata. ".repeat(2400),
    supervisors: paper.supervisors!.map((s) => ({ ...s, institutions: [] })),
  };
  const session = {
    version: 1,
    topic: "spectroscopy",
    options: { country: "AU", from: 2020, to: 2026, theses: true },
    tasks: [],
    works: [thesis],
  };
  const parsed = sessionSchema.parse(session);
  const people = peopleFrom(parsed.works, session.topic, "AU");
  assert.ok(people.some((p) => p.supervisedWorkIds?.length));
  const contacts = contactCandidates(
    people,
    session.topic,
    empty(),
    session.options,
    now,
  );
  assert.ok(
    contacts.every((c) =>
      c.person.institutions.some((i) => i.country === "AU"),
    ),
  );
  assert.equal(parsed.works[0].abstract, thesis.abstract);
});
test("a large author list cannot create supervisor recommendations", () => {
  const authors = Array.from({ length: 40 }, (_, i) => named("Author " + i));
  const all = rankCandidates(
    peopleFrom([{ ...paper, authors }], "turbulence"),
    "turbulence",
    empty(),
    now,
  );
  assert.equal(all.length, 41);
  assert.deepEqual(
    recommendationGroups(all).map((g) => g.lead.person.name),
    ["Supervisor One"],
  );
  assert.equal(recommendationGroups(all)[0].lead.works[0].id, "W");
});
test("same-institution supervisors share one lead, eight groups are initially visible", () => {
  const works = Array.from({ length: 10 }, (_, i) => ({
    ...paper,
    id: "W" + i,
    authors: [],
    supervisors: ["First", "Second"].map((s) => ({
      ...paper.supervisors![0],
      id: s + i,
      name: s + i,
      institutions: [{ ...lab, id: "I" + i }],
    })),
  }));
  const groups = recommendationGroups(
    rankCandidates(
      peopleFrom(works, "spectroscopy"),
      "spectroscopy",
      empty(),
      now,
    ),
  );
  assert.equal(groups.length, 8);
  assert.equal(groups[0].alternatives.length, 1);
});
test("preference keywords cannot make unrelated research an actionable match", () => {
  const state = empty();
  state.profile.skills = "optical diagnostics";
  state.profile.interests = "spectroscopy";
  state.profile.style = "experimental";
  const candidates = contactCandidates(
    peopleFrom([paper], "quantum computing"),
    "quantum computing",
    state,
    { country: "" },
    now,
  );
  assert.equal(recommendationGroups(candidates).length, 0);
  const outside = {
    ...paper,
    title: "Sensor fusion using optical spectroscopy",
    abstract: "Digital image analysis",
  };
  assert.equal(
    recommendationGroups(
      rankCandidates(
        peopleFrom([outside], "spectroscopy"),
        "spectroscopy",
        empty(),
        now,
      ),
    ).length,
    0,
  );
});
test("a dated official student project works without indexed publications and respects search scope", () => {
  const result = contactCandidates(
    [],
    "spectroscopy",
    empty(),
    { country: "AU" },
    now,
  );
  assert.deepEqual(
    result.map((c) => c.person.name),
    ["Cormac Corr"],
  );
  assert.ok(result[0].reasons.some((r) => r.includes("vacation scholars")));
  assert.equal(result[0].works.length, 0);
  assert.equal(result[0].lane, "contact");
  assert.equal(
    contactCandidates([], "tungsten", empty(), { country: "NZ" }, now).length,
    0,
  );
  assert.equal(
    contactCandidates(
      [],
      "spectroscopy",
      empty(),
      { country: "AU", institution: { name: "Different university" } },
      now,
    ).length,
    0,
  );
  assert.equal(
    contactCandidates(
      [],
      "spectroscopy",
      empty(),
      { country: "AU" },
      now + 31 * 86400000,
    )[0].lane,
    "investigate",
  );
});
test("curated identity survives literature enrichment and prior contact stays hidden across topics", () => {
  const l = listings.find((l) => l.name === "Cormac Corr")!;
  const c = contactCandidates(
    [],
    "spectroscopy",
    empty(),
    { country: "AU" },
    now,
  )[0];
  const state = empty();
  state.feedback.push({
    personKey: c.person.key,
    topic: "diagnostics",
    kind: "contacted",
    terms: [],
    updatedAt: reviewedOn,
  });
  const merged = contactCandidates(
    peopleFrom(
      [
        {
          ...paper,
          authors: [
            {
              ...named(l.name),
              institutions: [{ ...lab, name: l.institution }],
            },
          ],
          supervisors: [],
        },
      ],
      "spectroscopy",
    ),
    "spectroscopy",
    state,
    { country: "AU" },
    now,
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].person.key, c.person.key);
  assert.equal(merged[0].hidden, true);
  assert.equal(merged[0].works.length, 1);
  state.feedback = [];
  assert.equal(
    contactCandidates([], "spectroscopy", state, { country: "AU" }, now)[0]
      .hidden,
    false,
  );
});
test("same-name authors without an institutional match stay separate", () => {
  const results = contactCandidates(
    peopleFrom(
      [{ ...paper, authors: [named("Cormac Corr")], supervisors: [] }],
      "spectroscopy",
    ),
    "spectroscopy",
    empty(),
    { country: "AU" },
    now,
  );
  assert.equal(results.length, 2);
  assert.equal(results.find((c) => c.groupSource)?.works.length, 0);
});
test("office or student programme evidence alone does not establish an individual's contact role", () => {
  const people = peopleFrom([{ ...paper, supervisors: [] }], "turbulence");
  const v: Verification = {
    personKey: people[0].key,
    name: people[0].name,
    institution: lab.name,
    officialDomain: "example.edu",
    pages: [],
    warnings: [],
    status: "partial",
    checkedAt: reviewedOn,
    evidence: [
      {
        kind: "undergraduate",
        url,
        title: "Placements",
        text: "Undergraduates may apply.",
      },
    ],
  };
  const state = empty();
  state.verifications = [v];
  assert.equal(
    recommendationGroups(rankCandidates(people, "turbulence", state, now))
      .length,
    0,
  );
  v.evidence.push(
    { kind: "role", text: "Professor", url, title: "Profile" },
    { kind: "contact", text: "Profile contact", url, title: "Profile" },
  );
  assert.equal(
    rankCandidates(people, "turbulence", state, now)[0].lane,
    "contact",
  );
  assert.equal(
    rankCandidates(people, "turbulence", state, now + 31 * 86400000)[0].lane,
    "explore",
  );
});
test("directory neighbours, former members and generic mailboxes never supply personal contact evidence", () => {
  const mixed = evidence(
    "<h1>People</h1><div><h2>Jane Patel</h2><p>PhD candidate</p><h2>John Jones</h2><p>Professor</p><a href='mailto:john.jones@example.edu'>Email</a></div>",
  );
  assert.ok(!mixed.some((e) => e.kind === "role" || e.kind === "contact"));
  const former = evidence(
    "<h1>People</h1><h2>Former members</h2><p>Jane Patel, Professor</p><h2>Staff</h2><p>John Jones, Professor</p>",
  );
  assert.ok(!former.some((e) => e.kind === "role"));
  const profile = evidence(
    "<h1>Jane Patel</h1><p>Professor of Physics</p><a href='mailto:office@example.edu'>Administration</a><a href='mailto:j.patel@example.edu'>Email</a>",
  );
  assert.ok(profile.some((e) => e.kind === "role"));
  assert.match(profile.find((e) => e.kind === "contact")!.text, /j\.patel@/);
});
test("official page reader restricts destinations and handles absent affiliation without a lookup", async () => {
  assert.equal(publicAddress("127.0.0.1"), false);
  assert.equal(publicAddress("::ffff:192.168.1.1"), false);
  assert.throws(() => validatePageUrl("http://example.edu/"));
  assert.equal(
    withinOfficialDomain(
      "https://school.example.edu/x",
      "https://www.example.edu",
    ),
    true,
  );
  assert.equal(
    withinOfficialDomain(
      "https://example.edu.other.org/x",
      "https://www.example.edu",
    ),
    false,
  );
  const r = await verifyCandidate({ personKey: "fixture", name: "Jane Patel" });
  assert.equal(r.pages.length, 0);
  assert.ok(r.warnings.length);
});
