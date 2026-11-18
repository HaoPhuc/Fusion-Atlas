import { normalize } from "./research";
export const roleOrders = [
  "all",
  "mentor",
  "early",
  "staff",
  "leader",
] as const;
export type RoleOrder = (typeof roleOrders)[number];
export const roleOptions: Record<RoleOrder, string> = {
  all: "All roles · research fit",
  mentor: "Student / project supervisors first",
  early: "Doctoral and postdoctoral researchers first",
  staff: "Research staff and group contacts first",
  leader: "Group leaders and faculty first",
};
export type RoleEvidence = {
  kind: Exclude<RoleOrder, "all">;
  label: string;
  url: string;
  date?: string;
};
const titles: [RoleEvidence["kind"], RegExp, string][] = [
  [
    "mentor",
    /^(daily|day to day|project|student|undergraduate|thesis|contact) (supervisor|mentor)\b/,
    "Project supervision",
  ],
  [
    "early",
    /^(ph ?d|doctoral) (candidate|student|researcher)\b/,
    "Doctoral researcher",
  ],
  ["early", /^post ?doc(?:toral)?\b/, "Postdoctoral researcher"],
  [
    "leader",
    /^(?:(?:group|research group|lab|team|department) (?:leader|head|director)|head of|principal (?:research )?investigator)\b/,
    "Research leader",
  ],
  ["leader", /^(?:(?:assistant|associate|full) )?professor\b/, "Faculty"],
  [
    "staff",
    /^(?:(?:research|staff|senior|principal) (?:scientist|engineer|fellow)|scientist|a listed group contact)\b/,
    "Research staff / group contact",
  ],
];
export function roleEvidence(
  text: string,
  name: string,
  url: string,
  date?: string,
): RoleEvidence | undefined {
  const line = normalize(text),
    person = normalize(name);
  const start = line.indexOf(person);
  const title =
    start === 0
      ? line
          .slice(person.length)
          .trim()
          .replace(/^(?:is |serves as )?(?:an? |the )?/, "")
      : start > 0
        ? line.slice(0, start).trim()
        : line;
  const rule = titles.find(([, pattern]) => pattern.test(title));
  return rule ? { kind: rule[0], label: rule[2], url, date } : undefined;
}
export function rolePriority(
  c: { roles?: RoleEvidence[] },
  order: RoleOrder = "all",
) {
  return order === "all"
    ? 0
    : Number(c.roles?.some((r) => r.kind === order) ?? false);
}
