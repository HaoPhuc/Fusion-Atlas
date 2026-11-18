"use client";
import { useState } from "react";
import { countries } from "@/lib/countries";
import { countryName, distance, type City, type Region } from "@/lib/regions";
import { normalize } from "@/lib/research";
type Place = City & { search: string; admin: string };
let gazetteer: Promise<Place[]> | undefined;
function cities() {
  if (!gazetteer)
    gazetteer = fetch("/cities.tsv")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.text();
      })
      .then((t) =>
        t
          .trimEnd()
          .split("\n")
          .map((row) => {
            const [name, ascii, country, admin, lat, lon] = row.split("\t");
            return {
              name,
              country,
              admin,
              lat: Number(lat),
              lon: Number(lon),
              search: normalize(ascii || name),
            };
          }),
      )
      .catch((e) => {
        gazetteer = undefined;
        throw e;
      });
  return gazetteer;
}
export function RegionSettings({
  region,
  onChange,
  busy,
}: {
  region?: Region;
  onChange: (g?: Region) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false),
    [places, setPlaces] = useState<Place[]>([]),
    [query, setQuery] = useState(""),
    [home, setHome] = useState<City>(),
    [radius, setRadius] = useState(150),
    [dest, setDest] = useState<string[]>([]),
    [message, setMessage] = useState("");
  async function configure() {
    setOpen(true);
    setHome(region?.home);
    setQuery(region?.home.name || "");
    setRadius(region?.radius || 150);
    setDest(region?.destinations || ["DE", "FR", "US", "CH", "GB"]);
    setMessage("Loading city list…");
    try {
      setPlaces(await cities());
      setMessage("");
    } catch {
      setMessage("Could not load the city list. Close and reopen to retry.");
    }
  }
  const term = normalize(query);
  const results =
    query.trim().length >= 2 && !home
      ? places
          .filter(
            (p) =>
              p.search.startsWith(term) || normalize(p.name).startsWith(term),
          )
          .sort((a, b) => Number(b.search === term) - Number(a.search === term))
          .slice(0, 10)
      : [];
  function save() {
    if (!home) return;
    const nearCountries = [
      ...new Set([
        home.country,
        ...places
          .filter((p) => distance(home, p) <= radius)
          .map((p) => p.country),
      ]),
    ].sort();
    onChange({
      home: {
        name: home.name,
        lat: home.lat,
        lon: home.lon,
        country: home.country,
      },
      radius,
      nearCountries,
      destinations: dest.filter((c) => c && c !== home.country),
    });
    setOpen(false);
  }
  return (
    <section className="region-settings">
      <div className="profile-summary">
        <div>
          <strong>Geographic shortlist</strong>
          <span className="small">
            {region
              ? region.home.name +
                " · " +
                region.radius +
                " km · " +
                region.destinations.length +
                " other countries"
              : "Three nearby groups, two elsewhere at home and five international choices."}
          </span>
        </div>
        <button
          disabled={busy}
          onClick={() => (open ? setOpen(false) : void configure())}
        >
          {open
            ? "Close locations"
            : region
              ? "Edit locations"
              : "Choose locations"}
        </button>
      </div>
      {open && (
        <fieldset disabled={busy} className="region-fields">
          <legend>Shortlist locations</legend>
          <label>
            Home city
            <input
              autoFocus
              placeholder="Search for a city"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHome(undefined);
              }}
            />
          </label>
          <p className="small" role="status">
            {message ||
              (home
                ? home.name + ", " + countryName(home.country)
                : "Select your city or the nearest listed town.")}
          </p>
          {results.map((p) => (
            <button
              key={[p.country, p.lat, p.lon].join("/")}
              onClick={() => {
                setHome(p);
                setQuery(p.name);
                setDest((d) => d.map((c) => (c === p.country ? "" : c)));
              }}
            >
              {p.name} · {countryName(p.country)} · {p.admin}
            </button>
          ))}
          {!home &&
            term.length >= 2 &&
            !results.length &&
            places.length > 0 && <p>No matching city. Try a nearby town.</p>}
          <label>
            Radius
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              {[25, 50, 100, 150, 300, 500, 1000, 2000].map((k) => (
                <option key={k} value={k}>
                  {k} km
                </option>
              ))}
            </select>
          </label>
          <div className="destination-fields">
            {Array.from({ length: 5 }, (_, i) => (
              <label key={i}>
                Country {i + 1}
                <select
                  value={dest[i] || ""}
                  onChange={(e) => {
                    const next = Array.from(
                      { length: 5 },
                      (_, j) => dest[j] || "",
                    );
                    next[i] = e.target.value;
                    setDest(next);
                  }}
                >
                  <option value="">Choose a country</option>
                  {countries
                    .filter(
                      ([c]) =>
                        c &&
                        c !== home?.country &&
                        (!dest.includes(c) || c === dest[i]),
                    )
                    .map(([c, n]) => (
                      <option key={c} value={c}>
                        {n}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
          <div className="recommendation-actions">
            <button
              className="primary"
              disabled={
                !home || !places.length || dest.filter(Boolean).length !== 5
              }
              onClick={save}
            >
              Apply ten-slot layout
            </button>
            {region && (
              <button
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              >
                Use standard results
              </button>
            )}
          </div>
          <small>
            City coordinates from{" "}
            <a href="https://www.geonames.org/">GeoNames</a>. Distances are
            approximate, measured in a straight line.
          </small>
        </fieldset>
      )}
    </section>
  );
}
