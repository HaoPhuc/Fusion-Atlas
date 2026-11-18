import type { Recommendation } from "@/lib/matching";
import { safeUrl } from "@/lib/research";
export function RoleEvidenceLine({ c }: { c: Recommendation }) {
  const seen = new Set<string>();
  const roles = (c.roles || []).filter((r) => {
    if (seen.has(r.label)) return false;
    seen.add(r.label);
    return true;
  });
  return (
    <div className="contact-roles">
      {roles.length ? (
        roles.map((r) => (
          <a
            key={r.label}
            href={safeUrl(r.url)}
            target="_blank"
            rel="noreferrer"
            title={"View role evidence" + (r.date ? " · " + r.date : "")}
          >
            {r.label}
            {r.date && <small> · {r.date}</small>}
          </a>
        ))
      ) : (
        <small>Role unconfirmed</small>
      )}
    </div>
  );
}
