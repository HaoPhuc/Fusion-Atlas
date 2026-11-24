import { levelSummaryLine, supervisionLevels } from "@/lib/levels";
import type { Verification } from "@/lib/matching";
import { safeUrl } from "@/lib/research";
import type { Person } from "@/lib/types";

export function SupervisionEvidence({
  person,
  verification,
}: {
  person: Person;
  verification?: Verification;
}) {
  const levels = supervisionLevels(person, verification);
  const official = levels.officialUndergraduate;
  return (
    <div className="supervision-evidence">
      <p>{levelSummaryLine(levels)}</p>
      {official && (
        <p>
          <a
            href={safeUrl(official.url)}
            target="_blank"
            rel="noreferrer"
            title={official.text}
          >
            Official page mentions undergraduate projects (checked{" "}
            {official.checkedAt.slice(0, 10)})
          </a>
        </p>
      )}
      <small>
        Bachelor and master theses are rarely indexed, so a missing level is not
        evidence that they won't supervise it.
      </small>
    </div>
  );
}
