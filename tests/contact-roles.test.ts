import test from "node:test";
import assert from "node:assert/strict";
import {
  contactCandidates,
  matchingStateSchema,
  recommendationGroups,
  type Recommendation,
} from "../lib/matching";
import { roleEvidence } from "../lib/contact-roles";
import { makeBoard, blankBoard, type Region } from "../lib/regions";
import { extractPageEvidence } from "../lib/official-pages";
const url = "https://university.example/people/test";
test("official personal titles distinguish a postdoc, doctoral student and faculty without guessing from a biography", () => {
  for (const [title, kind] of [
    ["Postdoctoral researcher", "early"],
    ["PhD candidate", "early"],
    ["Research scientist", "staff"],
    ["Associate Professor", "leader"],
    ["Project supervisor", "mentor"],
  ]) {
    const e = extractPageEvidence(
      "<h1>Jane Patel</h1><p>" + title + "</p>",
      url,
      "Jane Patel",
    ).evidence.find((e) => e.kind === "role");
    assert.ok(e, title);
    assert.equal(roleEvidence(e.text, "Jane Patel", e.url)?.kind, kind);
  }
  assert.equal(roleEvidence("Jane Patel, PhD", "Jane Patel", url), undefined);
  assert.equal(
    roleEvidence(
      "Jane Patel, researcher working with Professor Smith",
      "Jane Patel",
      url,
    ),
    undefined,
  );
});
const now = Date.parse("2026-11-18T12:00:00Z");
const g: Region = {
  home: { name: "Eindhoven", country: "NL", lat: 51.45, lon: 5.49 },
  radius: 100,
  nearCountries: ["NL", "BE"],
  destinations: ["FR", "DE", "CH", "US", "GB"],
};
test("a role preference selects a different member in the same group in both layouts", () => {
  const state = matchingStateSchema.parse({ profile: { skills: "control" } });
  assert.equal(state.profile.roleOrder, "all");
  const candidates = contactCandidates(
    [],
    "plasma control",
    state,
    { country: "NL" },
    now,
  );
  const lead = (order: "early" | "leader") =>
    recommendationGroups(candidates, 8, order).find((g) =>
      g.lead.groupName.startsWith("Energy Systems and Control"),
    )!;
  assert.equal(lead("early").lead.person.name, "Loes Jansen");
  assert.ok(
    lead("early").alternatives.some(
      (c) => c.person.name === "Matthijs van Berkel",
    ),
  );
  assert.equal(lead("leader").lead.person.name, "Matthijs van Berkel");
  assert.equal(
    makeBoard(candidates, g, blankBoard, "early").near0.key,
    lead("early").lead.person.key,
  );
  assert.ok(
    makeBoard(candidates, g, blankBoard, "mentor").near0.c.roles?.some(
      (r) => r.kind === "mentor",
    ),
  );
  const skipped = { ...lead("early").lead, hidden: true };
  assert.ok(
    !Object.values(
      makeBoard(
        [
          skipped,
          ...candidates.filter((c) => c.person.key !== skipped.person.key),
        ],
        g,
        blankBoard,
        "early",
      ),
    ).some((p) => p.key === skipped.person.key),
  );
});
test("unknown roles remain eligible when a role is prioritized", () => {
  const state = matchingStateSchema.parse({});
  const [known] = contactCandidates(
    [],
    "plasma control",
    state,
    { country: "NL" },
    now,
  );
  const unknown: Recommendation = {
    ...known,
    roles: [],
    groupKey: "other",
    rank: 1,
  };
  assert.equal(recommendationGroups([unknown], 8, "early")[0].lead, unknown);
});
