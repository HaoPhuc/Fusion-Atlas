import { z } from "zod";
import type { Recommendation } from "./matching";
import type { Institution } from "./types";
import { normalize } from "./research";
import { countries } from "./countries";
export const countryCode = z.string().regex(/^[A-Z]{2}$/);
export const citySchema = z.object({
  name: z.string().min(1).max(180),
  country: countryCode,
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type City = z.infer<typeof citySchema>;
export const regionSchema = z
  .object({
    home: citySchema,
    radius: z.number().int().min(1).max(2000),
    nearCountries: z.array(countryCode).min(1).max(100),
    destinations: z.array(countryCode).length(5),
  })
  .refine(
    (g) =>
      new Set(g.destinations).size === g.destinations.length &&
      !g.destinations.includes(g.home.country),
  );
export type Region = z.infer<typeof regionSchema>;
export const boardSchema = z.object({
  pins: z.record(z.string().max(32), z.string().max(1000)),
  skipGroups: z.array(z.string().max(600)).max(500),
  skipInstitutions: z.array(z.string().max(600)).max(500),
});
export type Board = z.infer<typeof boardSchema>;
export const blankBoard: Board = {
  pins: {},
  skipGroups: [],
  skipInstitutions: [],
};
export const countryName = (code: string) =>
  countries.find((c) => c[0] === code)?.[1] || code;
export function distance(a: City, b: City) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}
// City-level positions of the reviewed groups. Multi-campus institutions use the group's city.
const sites: Record<string, [string, string, number, number]> = {
  "Dutch Institute for Fundamental Energy Research": [
    "Eindhoven",
    "NL",
    51.45,
    5.49,
  ],
  "Technical University of Munich": ["Garching", "DE", 48.26, 11.67],
  "Australian National University": ["Canberra", "AU", -35.28, 149.12],
  "University of Wisconsin–Madison": ["Madison", "US", 43.07, -89.41],
  "The University of Tokyo": ["Kashiwa", "JP", 35.9, 139.94],
  EPFL: ["Lausanne", "CH", 46.52, 6.57],
};
export function slots(g: Region) {
  return [
    ...Array.from({ length: 3 }, (_, i) => ({
      id: "near" + i,
      type: "near",
      countries: g.nearCountries,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: "home" + i,
      type: "home",
      countries: [g.home.country],
    })),
    ...g.destinations.map((code) => ({
      id: "away" + code,
      type: "away",
      countries: [code],
    })),
  ];
}
type Slot = ReturnType<typeof slots>[number];
function location(c: Recommendation, i: Institution) {
  const site =
    c.groupSource &&
    Object.entries(sites).find(([name]) =>
      c.groupName.endsWith(" · " + name),
    )?.[1];
  if (site)
    return { name: site[0], country: site[1], lat: site[2], lon: site[3] };
  if (i.country && i.city && Number.isFinite(i.lat) && Number.isFinite(i.lon))
    return { name: i.city, country: i.country, lat: i.lat!, lon: i.lon! };
}
export type Pick = {
  c: Recommendation;
  institution: string;
  city?: string;
  country: string;
  km?: number;
  key: string;
  lead: boolean;
};
export function makeBoard(
  candidates: Recommendation[],
  g: Region,
  board: Board,
) {
  const pool: Pick[] = [];
  for (const c of candidates) {
    if (
      c.hidden ||
      c.fit === "Broad" ||
      (c.lane === "explore" && (c.fit !== "Strong" || !c.works[0]?.url))
    )
      continue;
    // Provisional leads need fusion evidence in the paper's title or indexed subject terms.
    const topicalWork = c.works.find((w) =>
      /\b(tokamaks?|stellarators?|gyrokinetic\w*|divertors?|thermonuclear|nuclear fusion|fusion (?:energy|plasmas?|reactors?|power)|plasma control|plasma facing|magnetic confinement|inertial confinement|TCV|ITER|Wendelstein|DIII-D|ASDEX)\b/i.test(
        [w.title, ...(w.keywords || [])].join(" "),
      ),
    );
    if (c.lane === "explore" && !topicalWork) continue;
    const inst =
      c.person.institutions.find(
        (i) => i.id === c.groupKey || normalize(i.name) === c.groupKey,
      ) || c.person.institutions[0];
    if (!inst) continue;
    const place = location(c, inst),
      country = place?.country || inst.country;
    const institution = c.groupSource
      ? c.groupName.split(" · ").at(-1)!
      : inst.name;
    if (
      !country ||
      board.skipGroups.includes(c.groupKey) ||
      board.skipInstitutions.includes(normalize(institution))
    )
      continue;
    pool.push({
      c:
        c.lane === "explore" && topicalWork
          ? {
              ...c,
              works: [
                topicalWork,
                ...c.works.filter((w) => w.id !== topicalWork.id),
              ],
            }
          : c,
      institution,
      city: place?.name,
      country,
      km: place ? distance(g.home, place) : undefined,
      key: c.person.key,
      lead: c.lane === "explore",
    });
  }
  const seats = slots(g);
  const result: Record<string, Pick> = {};
  const groups = new Set<string>(),
    people = new Set<string>(),
    cities = new Set<string>();
  const assigned = new Map<string, boolean>();
  const fits = (s: Slot, p: Pick) =>
    s.type === "near"
      ? p.km !== undefined && p.km <= g.radius
      : s.type === "home"
        ? p.country === g.home.country && p.km !== undefined && p.km > g.radius
        : s.countries.includes(p.country);
  const assign = (s: Slot, p: Pick) => {
    result[s.id] = p;
    assigned.set(normalize(p.institution), !!p.c.groupSource);
    groups.add(p.c.groupKey);
    people.add(p.key);
    if (s.type === "home" && p.city) cities.add(p.city);
  };
  const free = (p: Pick) =>
    !groups.has(p.c.groupKey) &&
    !people.has(p.key) &&
    (!assigned.has(normalize(p.institution)) ||
      (!!p.c.groupSource && assigned.get(normalize(p.institution)) === true));
  for (const s of seats) {
    if (!board.pins[s.id]) continue;
    const p = pool.find(
      (p) => p.key === board.pins[s.id] && fits(s, p) && free(p),
    );
    if (p) assign(s, p);
  }
  for (const s of seats) {
    if (result[s.id]) continue;
    const eligible = pool.filter((p) => fits(s, p) && free(p));
    const quality = (p: Pick) =>
      p.c.rank +
      (p.c.fit === "Strong" ? 12 : 0) +
      (p.c.lane === "contact" ? 12 : 0);
    const value = (p: Pick) =>
      quality(p) + (s.type === "near" ? 12 * (1 - p.km! / g.radius) : 0);
    eligible.sort(
      (a, b) =>
        Number(a.lead) - Number(b.lead) ||
        (s.type === "home"
          ? Number(cities.has(a.city || "")) - Number(cities.has(b.city || ""))
          : 0) ||
        value(b) - value(a) ||
        a.key.localeCompare(b.key),
    );
    if (eligible[0]) assign(s, eligible[0]);
  }
  return result;
}
