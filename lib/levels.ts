import { personHasKey } from "./identity";
import type { StudentProfile, Verification } from "./matching";
import {
  SUPERVISION_LEVELS,
  type Person,
  type SupervisionLevel,
} from "./types";

export type LevelSummary = {
  counts: Record<SupervisionLevel, number>;
  recent: Record<SupervisionLevel, number>;
  lowest?: Exclude<SupervisionLevel, "unknown">;
  officialUndergraduate?: { url: string; checkedAt: string; text: string };
};

export function verificationFor(person: Person, verifications: Verification[]) {
  return verifications.findLast((v) => personHasKey(person, v.personKey));
}

export function supervisionLevels(
  person: Person,
  verification?: Verification,
  now = new Date(),
): LevelSummary {
  const counts = {
    bachelor: 0,
    master: 0,
    doctoral: 0,
    habilitation: 0,
    unknown: 0,
  };
  const recent = { ...counts };
  const ids = new Set(person.supervisedWorkIds);
  const since = now.getUTCFullYear() - 5;
  for (const work of person.works) {
    if (!ids.delete(work.id)) continue;
    const level = work.level ?? "unknown";
    counts[level]++;
    if (work.year >= since) recent[level]++;
  }
  const passage = verification?.evidence.find(
    (e) => e.kind === "undergraduate",
  );
  const officialUndergraduate =
    passage && verification
      ? {
          url: passage.url,
          checkedAt: verification.checkedAt,
          text: passage.text,
        }
      : undefined;
  const lowest = officialUndergraduate
    ? "bachelor"
    : SUPERVISION_LEVELS.find(
        (level): level is NonNullable<LevelSummary["lowest"]> =>
          level !== "unknown" && counts[level] > 0,
      );
  return { counts, recent, lowest, officialUndergraduate };
}

export function atOrBelow(
  level: SupervisionLevel | undefined,
  target: StudentProfile["studentLevel"],
) {
  return (
    !!level &&
    level !== "unknown" &&
    SUPERVISION_LEVELS.indexOf(level) <= SUPERVISION_LEVELS.indexOf(target)
  );
}

const labels = {
  bachelor: "BSc",
  master: "MSc",
  doctoral: "PhD",
  habilitation: "habilitation",
  unknown: "unspecified",
};

export function levelSummaryLine({ recent, lowest }: LevelSummary) {
  const order: SupervisionLevel[] = [
    "doctoral",
    "master",
    "bachelor",
    "habilitation",
    "unknown",
  ];
  const parts = order
    .filter((level) => level !== "habilitation" || recent.habilitation)
    .map((level) => `${recent[level]} ${labels[level]}`);
  return `Supervised (last 5 yrs): ${parts.join(" · ")} — lowest level seen: ${lowest ? labels[lowest] : "unspecified"}`;
}
