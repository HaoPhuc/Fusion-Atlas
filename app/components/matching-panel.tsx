"use client";
import { RoleEvidenceLine } from "./role-evidence";
import { roleOptions, roleOrders, type RoleOrder } from "@/lib/contact-roles";
import { RegionResults } from "./region-results";
import { useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  RefreshCw,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { countries } from "@/lib/countries";
import { safeUrl } from "@/lib/research";
import {
  programmes,
  matchesInstitution,
  reviewedOn,
} from "@/lib/contact-routes";
import {
  concepts,
  recommendationGroups,
  type Recommendation,
  type StudentProfile,
  type FeedbackKind,
} from "@/lib/matching";

function Link({ url, children }: { url?: string; children: React.ReactNode }) {
  return safeUrl(url) ? (
    <a href={safeUrl(url)} target="_blank" rel="noopener noreferrer">
      {children} <ArrowUpRight size={13} />
    </a>
  ) : (
    <span>{children}</span>
  );
}
export function ProfilePanel({
  profile,
  onChange,
}: {
  profile: StudentProfile;
  onChange: (p: StudentProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const update = <K extends keyof StudentProfile>(
    key: K,
    value: StudentProfile[K],
  ) => onChange({ ...profile, [key]: value });
  return (
    <section className="profile-panel" aria-label="Your research profile">
      <div className="profile-summary">
        <div>
          <UserRound size={17} />
          <strong>Your research profile</strong>
          <span className="small">
            {profile.skills
              ? `${profile.degree} · ${profile.style === "any" ? "open to all methods" : profile.style} · ${profile.skills}`
              : "Add your skills and preferences to narrow the recommendations."}
          </span>
        </div>
        <button onClick={() => setOpen(!open)} aria-expanded={open}>
          <SlidersHorizontal size={14} />
          {open ? "Close profile" : "Edit profile"}
        </button>
      </div>
      {open && (
        <div className="profile-fields">
          <label>
            Degree / discipline
            <input
              value={profile.degree}
              maxLength={120}
              onChange={(e) => update("degree", e.target.value)}
              placeholder="Undergraduate physics"
            />
          </label>
          <label>
            Year of study
            <input
              value={profile.year}
              maxLength={40}
              onChange={(e) => update("year", e.target.value)}
              placeholder="Second year"
            />
          </label>
          <label className="span-two">
            Skills you can contribute
            <input
              value={profile.skills}
              maxLength={600}
              onChange={(e) => update("skills", e.target.value)}
              placeholder="Python, numerical methods, spectroscopy…"
            />
          </label>
          <label className="span-two">
            Specific research interests
            <input
              value={profile.interests}
              maxLength={600}
              onChange={(e) => update("interests", e.target.value)}
              placeholder="Disruption prediction, turbulence, superconducting magnets…"
            />
          </label>
          <label>
            Preferred work
            <select
              value={profile.style}
              onChange={(e) =>
                update("style", e.target.value as StudentProfile["style"])
              }
            >
              <option value="any">Any research approach</option>
              <option value="computational">Computational</option>
              <option value="experimental">Experimental</option>
              <option value="engineering">Engineering</option>
              <option value="theoretical">Theoretical</option>
            </select>
          </label>
          <label>
            Preferred country
            <select
              value={profile.countries[0] || ""}
              onChange={(e) =>
                update("countries", e.target.value ? [e.target.value] : [])
              }
            >
              <option value="">Anywhere</option>
              {countries
                .filter(([code]) => code)
                .map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Available from
            <input
              type="date"
              value={profile.start}
              onChange={(e) => update("start", e.target.value)}
            />
          </label>
          <label>
            Duration
            <input
              value={profile.duration}
              maxLength={80}
              onChange={(e) => update("duration", e.target.value)}
              placeholder="8–12 weeks"
            />
          </label>
          <label>
            Funding needs
            <select
              value={profile.funding}
              onChange={(e) =>
                update("funding", e.target.value as StudentProfile["funding"])
              }
            >
              <option value="unknown">Not specified</option>
              <option value="required">Funding required</option>
              <option value="preferred">Funding preferred</option>
              <option value="flexible">Flexible</option>
            </select>
          </label>
          <p className="small">
            Skills, interests and work style affect ranking. Your degree, dates
            and funding needs help you check programme eligibility. Your profile
            stays in this browser and your session backups.
          </p>
        </div>
      )}
    </section>
  );
}
const labels: Record<FeedbackKind, string> = {
  good: "Good match",
  "wrong-topic": "Wrong methods / topic",
  "too-theoretical": "Too theoretical",
  "not-eligible": "Not eligible",
  contacted: "Already contacted",
  dismissed: "Dismiss",
};
type Props = {
  onRoleOrder: (value: RoleOrder) => void;
  regional?: Omit<
    React.ComponentProps<typeof RegionResults>,
    "busy" | "renderEvidence" | "onContacted" | "onVerify"
  >;
  topic: string;
  scope: { country: string; institution?: { name: string } };
  studentProfile: StudentProfile;
  candidates: Recommendation[];
  busy: boolean;
  checking?: string;
  onVerify: (c: Recommendation, url?: string) => void;
  onVerifyTop: () => void;
  onExplore: (c: Recommendation) => void;
  onSave: (c: Recommendation) => void;
  onFeedback: (c: Recommendation, kind?: FeedbackKind) => void;
  savedKeys: string[];
};
function RecommendationRow({ c, ...p }: Props & { c: Recommendation }) {
  const [url, setUrl] = useState("");
  const v = c.verification;
  return (
    <article className="recommendation" data-person-key={c.person.key}>
      <div className="recommendation-title">
        <div>
          <span className="recommendation-stage">
            {c.lane === "contact"
              ? "Contact instructions found"
              : c.lane === "investigate"
                ? "Supervision or role evidence"
                : "Research lead · role needs checking"}
          </span>
          <h3>{c.person.name}</h3>
          <RoleEvidenceLine c={c} />
          <p>{c.groupName}</p>
        </div>
        <span className="fit-label">{c.fit} research fit</span>
      </div>
      {c.groupSource && (
        <p className="small">
          <Link url={c.groupSource}>Official group or project page</Link> ·
          reviewed {c.routeReviewed}
        </p>
      )}
      <div className="recommendation-columns">
        <div>
          <h4>Research and supervision evidence</h4>
          <ul>
            {c.reasons.slice(0, 4).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="recommended-works">
            {c.works.slice(0, 2).map((w) => (
              <p key={w.id}>
                <span className="small">
                  {w.year || "Undated"} ·{" "}
                  {c.person.supervisedWorkIds?.includes(w.id)
                    ? "Supervised thesis"
                    : "Authored work"}
                </span>
                <Link url={w.url}>{w.title}</Link>
              </p>
            ))}
          </div>
        </div>
        <div className="next-action">
          <h4>Your next step</h4>
          <p>
            {c.actionUrl ? <Link url={c.actionUrl}>{c.action}</Link> : c.action}
          </p>

          <button
            disabled={p.busy || !c.person.institutions.length}
            onClick={() => p.onVerify(c)}
          >
            <RefreshCw size={14} />
            {p.checking === c.person.key
              ? "Checking official pages…"
              : v
                ? "Refresh official evidence"
                : "Check official pages"}
          </button>
          {c.person.institutions.length > 0 && (
            <details>
              <summary>Supply a deeper official page</summary>
              <label>
                Profile or group URL
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://institution.edu/group/person"
                />
              </label>
              <button
                disabled={p.busy || !safeUrl(url)}
                onClick={() => p.onVerify(c, url)}
              >
                Read this page
              </button>
              <p className="small">
                Must be on the institution domain resolved by the app.
              </p>
            </details>
          )}
        </div>
      </div>
      {v && (
        <details
          className="verification-details"
          open={!!v.evidence.find((e) => e.kind === "role")}
        >
          <summary>
            Official-page evidence · {v.evidence.length} passages · checked{" "}
            {v.checkedAt.slice(0, 10)}
          </summary>
          <p className="small">
            Checked {v.institution}. Confirm the person’s identity and
            availability using the linked source.
          </p>
          {v.evidence.map((e, i) => (
            <div className="source-passage" key={i}>
              <span className="small">
                {e.kind === "undergraduate"
                  ? "Institution-level student route"
                  : e.kind}
              </span>
              <blockquote>{e.text}</blockquote>
              <Link url={e.url}>{e.title || new URL(e.url).hostname}</Link>
            </div>
          ))}
          {!v.evidence.length && (
            <p>
              No attributable role or contact appeared on the pages checked.
              Open the institution website to investigate further.
            </p>
          )}
          <details>
            <summary>Pages checked and coverage limits</summary>
            {v.pages.map((page) => (
              <p key={page.url}>
                <Link url={page.url}>{page.title || page.url}</Link>
              </p>
            ))}
            {v.warnings.map((w, i) => (
              <p className="small" key={i}>
                {w}
              </p>
            ))}
          </details>
        </details>
      )}
      <details>
        <summary>Still to confirm ({c.gaps.length})</summary>
        <ul>
          {c.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </details>
      <div className="recommendation-actions">
        <button onClick={() => p.onSave(c)}>
          {p.savedKeys.includes(c.person.key) ? (
            <Check size={14} />
          ) : (
            <Bookmark size={14} />
          )}
          {p.savedKeys.includes(c.person.key) ? "Saved" : "Save lead"}
        </button>
        <button onClick={() => p.onExplore(c)}>Read full dossier</button>
        <label className="feedback-select">
          Your assessment
          <select
            aria-label={`Assessment for ${c.person.name}`}
            value={c.feedback?.kind || ""}
            onChange={(e) =>
              p.onFeedback(
                c,
                e.target.value ? (e.target.value as FeedbackKind) : undefined,
              )
            }
          >
            <option value="">Choose feedback…</option>
            {Object.entries(labels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}
export function Recommendations(p: Props) {
  const [limit, setLimit] = useState(8);
  const groups = recommendationGroups(
    p.candidates,
    limit,
    p.studentProfile.roleOrder,
  );
  const terms = concepts(
    [p.topic, p.studentProfile.interests, p.studentProfile.skills].join(" "),
  );
  const routes = programmes
    .filter(
      (r) =>
        (!p.scope.country || p.scope.country === r.country) &&
        matchesInstitution(r.institution, p.scope.institution?.name),
    )
    .map((r) => ({
      r,
      count: terms.filter((term) => concepts(r.topics).includes(term)).length,
    }))
    .filter(({ count }) => !terms.length || count > 0)
    .sort(
      (a, b) =>
        Number(p.studentProfile.countries.includes(b.r.country)) -
          Number(p.studentProfile.countries.includes(a.r.country)) ||
        b.count - a.count,
    )
    .slice(0, 3);
  const hidden = p.candidates.filter((c) => c.hidden);
  const unverified = p.candidates
    .filter(
      (c) =>
        !c.hidden &&
        c.lane === "explore" &&
        c.fit === "Strong" &&
        c.person.institutions.length,
    )
    .sort((a, b) => b.rank - a.rank);
  const seen = new Set(groups.map((g) => g.lead.groupKey));
  const checks = unverified
    .filter((c) => {
      if (seen.has(c.groupKey)) return false;
      seen.add(c.groupKey);
      return true;
    })
    .slice(0, 3);
  return (
    <section className="recommendations" aria-label="Contact recommendations">
      <div className="role-sort">
        <label>
          Prioritize contacts
          <select
            value={p.studentProfile.roleOrder}
            disabled={p.busy}
            onChange={(e) => p.onRoleOrder(e.target.value as RoleOrder)}
          >
            {roleOrders.map((o) => (
              <option key={o} value={o}>
                {roleOptions[o]}
              </option>
            ))}
          </select>
        </label>
        <small>
          {p.studentProfile.roleOrder === "mentor"
            ? "Look for a named project supervisor or a record of thesis supervision. Check the student level in the linked source."
            : p.studentProfile.roleOrder === "early"
              ? "Doctoral researchers and postdocs can discuss their work and point you to the person who approves placements."
              : "Role labels link to their sources. Ask the group who would supervise you day to day and whether they have time this term."}{" "}
          Other roles remain available.
        </small>
      </div>
      {p.regional ? (
        <RegionResults
          {...p.regional}
          busy={p.busy}
          onContacted={(c) => p.onFeedback(c, "contacted")}
          onVerify={p.onVerify}
          renderEvidence={(c) => <RecommendationRow {...p} c={c} />}
        />
      ) : (
        <>
          <div className="recommendations-heading">
            <div>
              <h2>Who to contact</h2>
              <p>
                {groups.length} suggested contact
                {groups.length === 1 ? "" : "s"} from{" "}
                {p.candidates.length.toLocaleString()} researcher identities.
              </p>
            </div>
            <button disabled={p.busy || !groups.length} onClick={p.onVerifyTop}>
              {groups.length > 1
                ? "Check top " + Math.min(3, groups.length) + " contacts"
                : "Check contact"}
            </button>
          </div>
          <p className="small">
            {p.scope.country || p.scope.institution
              ? "Contacts must have a recorded affiliation in your selected location. Researchers also includes leads with unknown affiliations when enabled."
              : "Each result leads with one contact per named group or indexed institution."}
          </p>
          {!groups.length && (
            <div className="empty">
              {p.busy
                ? "Building the first candidates…"
                : "No contact with both a research match and supervision or staff-role evidence surfaced in this pass. Continue the sweep to check more sources."}
            </div>
          )}
          {groups.map(({ lead, alternatives }) => (
            <div className="recommendation-group" key={lead.groupKey}>
              <RecommendationRow {...p} c={lead} />
              {(!lead.groupSource || alternatives.length > 0) && (
                <div className="group-context">
                  <p className="small">{lead.groupNote}</p>
                  {!!alternatives.length && (
                    <details>
                      <summary>
                        {alternatives.length} other researcher
                        {alternatives.length === 1 ? "" : "s"} in this
                        institution grouping
                      </summary>
                      {alternatives.slice(0, 5).map((c) => (
                        <div className="alternative-contact" key={c.person.key}>
                          <span>
                            <strong>{c.person.name}</strong>
                            <RoleEvidenceLine c={c} />
                            <small>
                              {c.fit} fit ·{" "}
                              {c.person.supervisedWorkIds?.length
                                ? "Thesis supervision recorded"
                                : "Role not established"}
                            </small>
                          </span>
                          <button onClick={() => p.onExplore(c)}>
                            View evidence
                          </button>
                          <button
                            disabled={p.busy}
                            onClick={() => p.onVerify(c)}
                          >
                            Check role
                          </button>
                        </div>
                      ))}
                      {alternatives.length > 5 && (
                        <p className="small">
                          All alternatives remain in Explore researchers.
                        </p>
                      )}
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
          {recommendationGroups(
            p.candidates,
            limit + 1,
            p.studentProfile.roleOrder,
          ).length > limit && (
            <button
              className="load-more"
              onClick={() => setLimit((n) => n + 8)}
            >
              Explore 8 more groups
            </button>
          )}
          {!!routes.length && (
            <section className="programme-routes">
              <h3>Undergraduate application routes</h3>
              <p className="small">
                Institution-wide programmes · reviewed {reviewedOn}. Check the
                current application cycle and your eligibility.
              </p>
              {routes.map(({ r }) => (
                <div key={r.url}>
                  <strong>{r.institution}</strong>
                  <p>{r.note}</p>
                  <Link url={r.url}>{r.name}</Link>
                </div>
              ))}
            </section>
          )}
          {!!checks.length && (
            <details className="excluded-leads" open={!groups.length}>
              <summary>
                Researchers whose roles still need checking ({checks.length})
              </summary>
              <p className="small">
                These authors have a strong topic match. An official profile may
                establish who supervises students.
              </p>
              {checks.map((c) => (
                <div className="alternative-contact" key={c.person.key}>
                  <span>
                    <strong>{c.person.name}</strong>
                    <small>{c.groupName}</small>
                  </span>
                  <button disabled={p.busy} onClick={() => p.onVerify(c)}>
                    {p.checking === c.person.key
                      ? "Checking…"
                      : "Check official role"}
                  </button>
                  <button onClick={() => p.onExplore(c)}>Read evidence</button>
                  {c.verification && (
                    <small>
                      {c.verification.status} · {c.verification.pages.length}{" "}
                      pages checked
                    </small>
                  )}
                </div>
              ))}
            </details>
          )}
        </>
      )}
      {!!hidden.length && (
        <details className="excluded-leads">
          <summary>Hidden by your feedback ({hidden.length})</summary>
          {hidden.map((c) => (
            <div className="alternative-contact" key={c.person.key}>
              <span>
                {c.person.name} · {labels[c.feedback!.kind]}
              </span>
              <button onClick={() => p.onFeedback(c, undefined)}>
                Restore
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
