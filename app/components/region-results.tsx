"use client";
import { personHasKey } from "@/lib/identity";
import {
  countryName,
  makeBoard,
  slots,
  type Region,
  type Board,
  type Pick,
} from "@/lib/regions";
import {
  sameContact,
  contactIdentity,
  type Recommendation,
} from "@/lib/matching";
import { normalize, safeUrl } from "@/lib/research";
import { RoleEvidenceLine } from "./role-evidence";
import type { RoleOrder } from "@/lib/contact-roles";
import { countries } from "@/lib/countries";
type Props = {
  order: RoleOrder;
  candidates: Recommendation[];
  region: Region;
  board: Board;
  picks: Record<string, Pick>;
  busy: boolean;
  onBoard: (b: Board) => void;
  onContacted: (c: Recommendation) => void;
  onSearch: (countries: string[], b: Board) => void;
  onSwap: (old: string, code: string, b: Board) => void;
  onVerify: (c: Recommendation) => void;
  renderEvidence: (c: Recommendation) => React.ReactNode;
};
export function RegionResults(p: Props) {
  const { region: g, picks, board } = p;
  const seats = slots(g);
  function pinned(except?: string): Board {
    return {
      ...board,
      pins: Object.fromEntries(
        Object.entries(picks)
          .filter(([id]) => id !== except)
          .map(([id, v]) => [id, v.key]),
      ),
    };
  }
  function row(s: (typeof seats)[number]) {
    const pick = picks[s.id];
    const teammates = pick?.c.groupSource
      ? p.candidates.filter(
          (c) =>
            c.groupKey === pick.c.groupKey &&
            !personHasKey(c.person, pick.key) &&
            !c.hidden &&
            c.fit !== "Broad",
        )
      : [];
    function replace(kind: "contacted" | "group" | "institution") {
      if (!pick) return;
      const b = pinned(s.id);
      if (kind === "contacted") p.onContacted(pick.c);
      if (kind === "group")
        b.skipGroups = [...new Set([...b.skipGroups, pick.c.groupKey])].slice(
          -500,
        );
      if (kind === "institution")
        b.skipInstitutions = [
          ...new Set([...b.skipInstitutions, normalize(pick.institution)]),
        ].slice(-500);
      const remaining =
        kind === "contacted"
          ? p.candidates.filter(
              (c) =>
                !personHasKey(c.person, pick.key) &&
                !sameContact(c.person, contactIdentity(pick.c.person)),
            )
          : p.candidates;
      if (!makeBoard(remaining, g, b, p.order)[s.id])
        p.onSearch(s.countries, b);
      else p.onBoard(b);
    }
    return (
      <article key={s.id} className="geo-row" data-slot={s.id}>
        {s.type === "away" && (
          <label className="country-swap">
            Destination
            <select
              aria-label={"Change " + countryName(s.countries[0])}
              disabled={p.busy}
              value={s.countries[0]}
              onChange={(e) =>
                p.onSwap(s.countries[0], e.target.value, pinned(s.id))
              }
            >
              {countries
                .filter(
                  ([c]) =>
                    c &&
                    c !== g.home.country &&
                    (c === s.countries[0] || !g.destinations.includes(c)),
                )
                .map(([c, n]) => (
                  <option value={c} key={c}>
                    {n}
                  </option>
                ))}
            </select>
          </label>
        )}
        {pick ? (
          <>
            <small>
              {pick.lead
                ? "Institution lead · supervisor to confirm"
                : pick.c.lane === "contact"
                  ? "Published contact route"
                  : "Supervision or staff-role evidence"}{" "}
              · {pick.city ? pick.city + ", " : ""}
              {countryName(pick.country)}
              {pick.km !== undefined
                ? " · ≈" + Math.round(pick.km).toLocaleString() + " km"
                : ""}
            </small>
            <h4>{pick.lead ? pick.institution : pick.c.person.name}</h4>
            {!!pick.c.person.possibleDuplicates?.length && (
              <small>Possible duplicate</small>
            )}
            <RoleEvidenceLine c={pick.c} />
            <p>
              {pick.lead
                ? "A researcher at this institution has a strong topic match."
                : pick.c.groupName}
            </p>
            {pick.c.works[0] && (
              <p>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={safeUrl(pick.c.works[0].url)}
                >
                  {pick.c.works[0].title}
                </a>
              </p>
            )}
            {pick.c.groupSource && (
              <a
                target="_blank"
                rel="noreferrer"
                href={safeUrl(pick.c.actionUrl || pick.c.groupSource)}
              >
                {pick.c.action}
              </a>
            )}
            <div className="geo-actions">
              {!pick.lead && (
                <button disabled={p.busy} onClick={() => replace("contacted")}>
                  Already contacted
                </button>
              )}
              {pick.lead && (
                <button disabled={p.busy} onClick={() => p.onVerify(pick.c)}>
                  Check {pick.c.person.name}’s role
                </button>
              )}
              <button disabled={p.busy} onClick={() => replace("group")}>
                Replace this group
              </button>
              <button disabled={p.busy} onClick={() => replace("institution")}>
                Skip institution
              </button>
            </div>
            {!!teammates.length && (
              <details>
                <summary>
                  Other contacts in this group ({teammates.length})
                </summary>
                {teammates.map((c) => (
                  <div key={c.person.key} className="alternative-contact">
                    <strong>{c.person.name}</strong>
                    {!!c.person.possibleDuplicates?.length && (
                      <small>Possible duplicate</small>
                    )}
                    <RoleEvidenceLine c={c} />
                    <button
                      disabled={p.busy}
                      onClick={() => {
                        const b = pinned();
                        b.pins[s.id] = c.person.key;
                        p.onBoard(b);
                      }}
                    >
                      Show in this slot
                    </button>
                  </div>
                ))}
              </details>
            )}
            <details>
              <summary>Evidence and outreach options</summary>
              {p.renderEvidence(pick.c)}
            </details>
          </>
        ) : (
          <div className="vacant">
            <span>
              {p.busy
                ? "Searching for a match…"
                : "No further matching group in the retrieved evidence."}
            </span>
            <button
              disabled={p.busy}
              onClick={() => p.onSearch(s.countries, pinned(s.id))}
            >
              Search deeper{" "}
              {s.type === "near"
                ? "nearby"
                : "in " + countryName(s.countries[0])}
            </button>
          </div>
        )}
      </article>
    );
  }
  return (
    <section className="regional-results">
      <h2>Your geographic shortlist</h2>
      <p>
        {Object.keys(picks).length} of {seats.length} slots filled · distances
        from {g.home.name}. Literature leads use the indexed institution
        location.
      </p>
      {[
        ["near", "Near " + g.home.name + " · " + g.radius + " km"],
        ["home", "Elsewhere in " + countryName(g.home.country)],
        ["away", "International groups"],
      ].map(([type, title]) => (
        <section className="geo-section" key={type}>
          <h3>{title}</h3>
          {seats.filter((s) => s.type === type).map(row)}
        </section>
      ))}
      {board.skipGroups.length + board.skipInstitutions.length > 0 && (
        <button
          disabled={p.busy}
          onClick={() =>
            p.onBoard({ ...pinned(), skipGroups: [], skipInstitutions: [] })
          }
        >
          Include skipped groups and institutions again
        </button>
      )}
    </section>
  );
}
