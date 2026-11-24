"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  BookOpen,
  Users,
  Building2,
  Bookmark,
  Settings2,
  ArrowUpRight,
  ArrowRight,
  Download,
  Plus,
  X,
  Play,
  Square,
  ChevronRight,
  GitBranch,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import directory from "@/data/organizations.json";
import { RegionSettings } from "./components/region-settings";
import {
  blankBoard,
  makeBoard,
  slots,
  type Board,
  type Region,
} from "@/lib/regions";
import { ThemeSwitch } from "./components/theme-switch";
import { ProfilePanel, Recommendations } from "./components/matching-panel";
import { SeenBadge } from "./components/seen-badge";
import { useSeenHistory } from "./components/use-seen-history";
import {
  classifySeen,
  emptyLedger,
  indexBaseline,
  seenResults,
} from "@/lib/seen";
import { SupervisionEvidence } from "./components/supervision-evidence";
import { atOrBelow, supervisionLevels, verificationFor } from "@/lib/levels";
import {
  institutionGroupKey,
  personHasKey,
  peopleShareKey,
} from "@/lib/identity";
import {
  matchingStateSchema,
  verificationSchema,
  contactCandidates,
  canonicalContact,
  contactIdentity,
  recommendationGroups,
  type MatchingState,
  type Recommendation,
  type FeedbackKind,
} from "@/lib/matching";
import { readCache, writeCache, clearCache } from "@/lib/browser-cache";
import {
  expand,
  frenchQueries,
  mergeWorks,
  peopleFrom,
  safeUrl,
  searchLink,
  shortlistCsv,
  normalize,
} from "@/lib/research";
import {
  sessionSchema,
  shortlistSchema,
  shortlistBackupSchema,
} from "@/lib/session";
import { countries } from "@/lib/countries";
import { PROVIDERS, providerNames } from "@/lib/types";
import type {
  Institution,
  Person,
  Provider,
  Saved,
  SearchOptions,
  SearchTask,
  Work,
} from "@/lib/types";

const starters = [
  {
    name: "Plasma control",
    detail: "Learning, prediction & feedback",
    topic: "machine learning plasma control",
  },
  {
    name: "Fusion materials",
    detail: "Tungsten, irradiation & surfaces",
    topic: "tungsten plasma facing materials",
  },
  {
    name: "Computational plasma physics",
    detail: "Turbulence, transport & modelling",
    topic: "gyrokinetic turbulence",
  },
  {
    name: "Fusion fuel cycle",
    detail: "Breeding blankets & tritium",
    topic: "tritium breeding blanket",
  },
];
type Run = {
  board?: Board;
  topic: string;
  options: SearchOptions;
  tasks: SearchTask[];
  works: Work[];
};
function Out({ href, children }: { href?: string; children: React.ReactNode }) {
  const url = safeUrl(href);
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={13} />
    </a>
  ) : (
    <span>{children}</span>
  );
}
function sameSavedEntry(entry: Saved, row: Saved) {
  return (
    entry.savedAt === row.savedAt && personHasKey(entry.person, row.person.key)
  );
}
function download(name: string, data: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function Atlas() {
  const [view, setView] = useState("discover");
  const [tab, setTab] = useState("matches");
  const [matching, setMatching] = useState<MatchingState>(() =>
    matchingStateSchema.parse({}),
  );
  const [matchingReady, setMatchingReady] = useState(false);
  const [checking, setChecking] = useState<string>();
  const [cacheHits, setCacheHits] = useState(0);
  const [cacheNotice, setCacheNotice] = useState("");
  const [autoCheck, setAutoCheck] = useState(true);
  const checkingLock = useRef(false);
  const [topic, setTopic] = useState("");
  const [queryText, setQueryText] = useState("");
  const [country, setCountry] = useState("");
  // Stable prerender defaults; refresh on the client after hydration, including across New Year.
  const [from, setFrom] = useState(2020);
  const [to, setTo] = useState(2026);
  const [theses, setTheses] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([...PROVIDERS]);
  const [institution, setInstitution] = useState<Institution>();
  const [instQuery, setInstQuery] = useState("");
  const [cityMode, setCityMode] = useState(false);
  const [instResults, setInstResults] = useState<Institution[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [run, setRun] = useState<Run>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [includeUnknown, setIncludeUnknown] = useState(true);
  const [supervisorsOnly, setSupervisorsOnly] = useState(false);
  const [levelOnly, setLevelOnly] = useState(false);
  const [limit, setLimit] = useState(40);
  const [selectedSnapshot, setSelected] = useState<Person>();
  const [saved, setSaved] = useState<Saved[]>([]);
  const history = useSeenHistory();
  const { remember } = history;
  const [baseline, setBaseline] = useState(emptyLedger);
  const completedSweep = useRef<Run>(undefined);
  const [storageReady, setStorageReady] = useState(false);
  const [config, setConfig] = useState<{
    openalexKey: boolean;
    officialSearch: boolean;
    contactEmail: boolean;
    passwordRequired: boolean;
  }>();
  const [password, setPassword] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [dirCountry, setDirCountry] = useState("");
  const [profile, setProfile] = useState<any>();
  const [graphNext, setGraphNext] = useState<{
    id: string;
    mode: string;
    cursor: string;
    page: number;
  }>();
  const stop = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectedSnapshot)
      document
        .querySelector(".dossier")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [selectedSnapshot?.key]);
  useEffect(() => {
    const year = new Date().getUTCFullYear();
    try {
      const raw = localStorage.getItem("fusion-atlas-matching-v2");
      if (raw) setMatching(matchingStateSchema.parse(JSON.parse(raw)));
      setMatchingReady(true);
    } catch {
      setError(
        "Could not read your matching profile. A session backup can restore it.",
      );
    }
    setFrom(year - 6);
    setTo(year);
    fetch("/api/research")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setError("Could not read connection settings."));
    try {
      const value = JSON.parse(
        localStorage.getItem("fusion-atlas-shortlist") || "[]",
      );
      const parsed = shortlistSchema.safeParse(value);
      if (parsed.success) {
        setSaved(parsed.data);
        setStorageReady(true);
      } else {
        setError(
          "Your saved shortlist could not be read. The original browser data has been preserved. Restore a JSON backup before continuing.",
        );
      }
    } catch {
      setError(
        "Browser storage could not be read. Use JSON backups to preserve your work.",
      );
    }
  }, []);
  useEffect(() => {
    if (storageReady)
      try {
        localStorage.setItem("fusion-atlas-shortlist", JSON.stringify(saved));
      } catch {
        setError(
          "Browser storage is full. Export your shortlist before closing.",
        );
      }
  }, [saved, storageReady]);
  useEffect(() => {
    if (!matchingReady) return;
    try {
      localStorage.setItem(
        "fusion-atlas-matching-v2",
        JSON.stringify(matching),
      );
    } catch {
      setError(
        "Browser storage is full. Save a session to keep your profile and research.",
      );
    }
  }, [matching, matchingReady]);
  const people = useMemo(
    () =>
      run
        ? peopleFrom(
            run.works,
            run.topic,
            run.options.country,
            run.options.institution?.id,
            includeUnknown,
            matching.identityDecisions,
          )
        : [],
    [run, includeUnknown, matching.identityDecisions],
  );
  const ranked = useMemo(
    () =>
      run ? contactCandidates(people, run.topic, matching, run.options) : [],
    [people, run, matching],
  );
  const results = useMemo(() => seenResults(people, ranked), [people, ranked]);
  const prior = useMemo(() => indexBaseline(baseline), [baseline]);
  const statuses = useMemo(
    () =>
      new Map(
        Array.from(results, ([key, result]) => [
          key,
          classifySeen(result.person, prior, matching, saved),
        ]),
      ),
    [results, prior, matching, saved],
  );
  const board = run?.board || blankBoard;
  const hiddenKeys = useMemo(() => {
    const hidden = new Set<string>();
    if (matching.profile.hideSeen) {
      const pins = Object.values(board.pins);
      for (const [key, { person }] of results) {
        if (
          statuses.get(key)?.kind !== "new" &&
          !pins.some((pin) => personHasKey(person, pin))
        )
          hidden.add(key);
      }
    }
    return hidden;
  }, [results, statuses, board.pins, matching.profile.hideSeen]);
  const visibleRanked = useMemo(
    () =>
      ranked.filter((c) => !hiddenKeys.has(c.literatureKey || c.person.key)),
    [ranked, hiddenKeys],
  );
  const visiblePeople = useMemo(
    () =>
      people.filter(
        (p) =>
          !hiddenKeys.has(p.key) &&
          (!supervisorsOnly || p.supervisedWorkIds?.length) &&
          (!levelOnly ||
            atOrBelow(
              supervisionLevels(p, verificationFor(p, matching.verifications))
                .lowest,
              matching.profile.studentLevel,
            )),
      ),
    [
      people,
      hiddenKeys,
      supervisorsOnly,
      levelOnly,
      matching.verifications,
      matching.profile.studentLevel,
    ],
  );
  useEffect(() => {
    if (run && completedSweep.current === run) {
      completedSweep.current = undefined;
      remember(results.values(), run.topic, true);
    }
  }, [run, results, remember]);
  const recommendationBadge = (c: Recommendation) => (
    <SeenBadge
      status={statuses.get(c.literatureKey || c.person.key)!}
      newGroup={prior.isNewGroup(c.groupKey)}
    />
  );
  const listing =
    selectedSnapshot?.officialRoleSource &&
    ranked.find(
      (c) => c.groupSource && peopleShareKey(c.person, selectedSnapshot),
    );
  const selected = listing
    ? canonicalContact(listing)
    : selectedSnapshot &&
      (people.find((p) => personHasKey(p, selectedSnapshot.key)) ||
        selectedSnapshot);
  const region =
    run && !run.options.country && !run.options.institution
      ? matching.profile.region
      : undefined;
  const picks = useMemo(
    () =>
      region
        ? makeBoard(visibleRanked, region, board, matching.profile.roleOrder)
        : {},
    [visibleRanked, region, board, matching.profile.roleOrder],
  );
  function updateRegion(g?: Region) {
    setMatchingReady(true);
    setMatching((s) => ({ ...s, profile: { ...s.profile, region: g } }));
  }
  function saveBoard(b: Board) {
    setRun((r) => (r ? { ...r, board: b } : r));
  }
  function decideIdentity(
    person: Person,
    key: string,
    decision: "same" | "different",
  ) {
    const keys = [person.key, key];
    if (keys.some((k) => k.length > 500)) {
      setError(
        "This identity key exceeds the 500-character limit for a saved decision.",
      );
      return;
    }
    const isPair = (d: MatchingState["identityDecisions"][number]) =>
      d.keys.length === 2 && keys.every((k) => d.keys.includes(k));
    if (
      matching.identityDecisions.length >= 500 &&
      !matching.identityDecisions.some(isPair)
    ) {
      setError("You have reached the limit of 500 saved identity decisions.");
      return;
    }
    setMatching((s) => ({
      ...s,
      identityDecisions: [
        ...s.identityDecisions.filter((d) => !isPair(d)),
        { keys, decision, decidedAt: new Date().toISOString() },
      ],
    }));
  }
  function feedback(c: Recommendation, kind?: FeedbackKind) {
    if (!run) return;
    setMatching((s) => ({
      ...s,
      feedback: [
        ...s.feedback.filter(
          (f) =>
            !(
              (f.kind === "contacted" ||
                normalize(f.topic) === normalize(run.topic)) &&
              (personHasKey(c.person, f.personKey) ||
                f.personKey === c.feedback?.personKey)
            ),
        ),
        ...(kind
          ? [
              {
                personKey: c.literatureKey || c.person.key,
                identity: contactIdentity(c.person),
                topic: run.topic,
                kind,
                terms: c.matched.slice(0, 20),
                updatedAt: new Date().toISOString(),
              },
            ]
          : []),
      ].slice(-1000),
    }));
  }
  async function checkContacts(
    list: Recommendation[],
    signal: AbortSignal,
    pageUrl?: string,
  ) {
    for (const candidate of list) {
      if (signal.aborted) break;
      setChecking(candidate.person.key);
      setProgress("Checking official pages for " + candidate.person.name + "…");
      const inst =
        candidate.person.institutions.find(
          (i) => institutionGroupKey(i) === candidate.groupKey,
        ) || candidate.person.institutions[0];
      try {
        const d = await api(
          {
            op: "verify",
            personKey: candidate.literatureKey || candidate.person.key,
            name: candidate.person.name,
            institutionId: inst?.id.startsWith("https://openalex.org/I")
              ? inst.id
              : undefined,
            institutionName: inst?.name,
            pageUrl,
          },
          signal,
        );
        const v = verificationSchema.parse(d.verification);
        if (!signal.aborted)
          setMatching((s) => ({
            ...s,
            verifications: [
              ...s.verifications.filter(
                (o) => !personHasKey(candidate.person, o.personKey),
              ),
              v,
            ].slice(-300),
          }));
      } catch (e) {
        if (!signal.aborted) setError((e as Error).message);
      }
    }
    setChecking(undefined);
  }
  async function verify(list: Recommendation[], url?: string) {
    if (busy || checkingLock.current) return;
    checkingLock.current = true;
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setError("");
    try {
      await checkContacts(list, operation.signal, url);
    } finally {
      setBusy(false);
      checkingLock.current = false;
      controller.current = null;
    }
  }
  const orgs = useMemo(
    () =>
      directory.filter(
        (o) =>
          (!dirCountry || o.country === dirCountry) &&
          normalize(o.organization + " " + o.country + " " + o.type).includes(
            normalize(directoryQuery),
          ),
      ),
    [dirCountry, directoryQuery],
  );
  const queries = (queryText || expand(topic).join("\n"))
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const [sweeps, setSweeps] = useState(0);
  async function api(body: unknown, signal?: AbortSignal) {
    const r = await fetch("/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-site-password": password,
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  function setTopicPlan(value: string) {
    setTopic(value);
    setQueryText(expand(value).join("\n"));
  }
  async function lookup(name = instQuery) {
    setLookupBusy(true);
    setError("");
    setInstResults([]);
    try {
      const data = await api({
        op: "institutions",
        query: name,
        city: cityMode,
      });
      setInstResults(data.institutions);
      if (!data.institutions.length)
        setError(
          "No institution IDs found. Try the parent university, a shorter name, or search globally; companies are often poorly indexed.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLookupBusy(false);
    }
  }
  async function sweep(existing?: Run, target?: string[]) {
    if (busy) return;
    const snapshot: Run = existing
      ? {
          ...existing,
          tasks: existing.tasks.map((t) => ({ ...t })),
          works: [...existing.works],
        }
      : {
          topic: topic.trim() || "nuclear fusion",
          options: { from, to, country, institution, theses },
          tasks: providers
            .filter((p) => !theses || p !== "arxiv")
            .flatMap((provider) =>
              queries.map((query) => ({ provider, query, page: 1 })),
            ),
          works: [],
        };
    const geoPlan =
      !snapshot.options.country &&
      !snapshot.options.institution &&
      matching.profile.region;
    const originalQueries = [
      ...new Set(
        snapshot.tasks.filter((t) => !t.countries).map((t) => t.query),
      ),
    ];
    const scopeKey = (codes?: string[]) => [...(codes || [])].sort().join("|");
    if (
      geoPlan &&
      (target || snapshot.tasks.some((t) => t.provider === "openalex"))
    ) {
      const scopes = target ? [target] : slots(geoPlan).map((s) => s.countries);
      for (const codes of scopes) {
        const scoped = snapshot.tasks.filter(
          (t) => t.countries && scopeKey(t.countries) === scopeKey(codes),
        );
        if (scoped.length && (!target || scoped.some((t) => !t.done))) continue;
        const q = originalQueries.find(
          (q) => !scoped.some((t) => t.query === q),
        );
        if (q && snapshot.tasks.length < 512)
          snapshot.tasks.push({
            provider: "openalex",
            countries: codes,
            query: q,
            page: 1,
          });
      }
    }
    if (
      target &&
      !snapshot.tasks.some(
        (t) => !t.done && scopeKey(t.countries) === scopeKey(target),
      )
    ) {
      setRun(snapshot);
      setError(
        "The available OpenAlex pages and query variants for this area have been checked. Widen the radius, choose another country or start with another topic.",
      );
      return;
    }
    if (!snapshot.tasks.length) {
      setError("Select at least one source compatible with this search.");
      return;
    }
    if (
      !Number.isInteger(snapshot.options.from) ||
      !Number.isInteger(snapshot.options.to) ||
      snapshot.options.from > snapshot.options.to ||
      snapshot.options.from < 1950 ||
      snapshot.options.to > 2100
    ) {
      setError("Enter a valid publication year range.");
      return;
    }
    setRun({ ...snapshot, tasks: snapshot.tasks.map((t) => ({ ...t })) });
    setAdvanced(false);
    setBusy(true);
    stop.current = false;
    setMessages([]);
    setError("");
    setSelected(undefined);
    setProfile(undefined);
    setGraphNext(undefined);
    setLimit(40);
    if (!existing) {
      setBaseline(history.snapshot());
      setSupervisorsOnly(false);
      setLevelOnly(false);
    }
    setTab("matches");
    setView("discover");
    const failures = new Set<string>();
    const shortPass = !existing && sweeps === 0;
    const operation = new AbortController();
    controller.current = operation;
    setCacheHits(0);
    const enabledTasks = snapshot.tasks
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t }) =>
          !t.done &&
          (!target || scopeKey(t.countries) === scopeKey(target)) &&
          (!t.countries ||
            target ||
            (geoPlan &&
              slots(geoPlan).some(
                (s) => scopeKey(s.countries) === scopeKey(t.countries),
              ))),
      );
    const priority = [
      "openalex",
      "thesesfr",
      "datacite",
      "hal",
      "openaire",
      "crossref",
      "arxiv",
    ];
    const starterTasks = enabledTasks
      .filter(({ t }) => !t.countries && t.query === queries[0])
      .sort(
        (a, b) =>
          priority.indexOf(a.t.provider) - priority.indexOf(b.t.provider),
      )
      .slice(0, 3);
    try {
      for (
        let round = 0;
        round < (existing || shortPass ? 1 : sweeps);
        round++
      ) {
        const queue = shortPass
          ? [...enabledTasks.filter((e) => e.t.countries), ...starterTasks]
          : [...enabledTasks];
        const worker = async () => {
          while (queue.length && !operation.signal.aborted) {
            const { t, i } = queue.shift()!;
            if (t.done || failures.has(String(i))) continue;
            setProgress(
              `${providerNames[t.provider]} · query ${i + 1}/${snapshot.tasks.length} · page ${t.page}`,
            );
            try {
              const body = {
                op: "search",
                provider: t.provider,
                countries: t.countries,
                query: t.query,
                page: t.page,
                cursor: t.cursor,
                options: snapshot.options,
              };
              const key =
                "search:v2:" +
                JSON.stringify(body) +
                ":" +
                (config?.openalexKey || false);
              const cached = await readCache(key).catch(() => undefined);
              const d = cached || (await api(body, operation.signal));
              if (operation.signal.aborted) break;
              if (cached) setCacheHits((n) => n + 1);
              else void writeCache(key, d).catch(() => {});
              snapshot.works = mergeWorks([...snapshot.works, ...d.works]);
              t.total = d.total;
              t.error = undefined;
              t.done = !d.next;
              if (d.next) {
                t.cursor = d.next;
                t.page++;
              }
              if (d.warnings?.length)
                setMessages((m) => [...new Set([...m, ...d.warnings])]);
            } catch (e) {
              if (stop.current) break;
              t.error = (e as Error).message;
              failures.add(String(i));
            }
            setRun({
              ...snapshot,
              tasks: snapshot.tasks.map((t) => ({ ...t })),
            });
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(3, queue.length) }, worker),
        );
        if (stop.current) break;
      }
      if (autoCheck && !operation.signal.aborted && (!existing || target)) {
        const candidates = contactCandidates(
          peopleFrom(
            snapshot.works,
            snapshot.topic,
            snapshot.options.country,
            snapshot.options.institution?.id,
            true,
            matching.identityDecisions,
          ),
          snapshot.topic,
          matching,
          snapshot.options,
        );
        const pool = candidates
          .filter(
            (c) =>
              (!target ||
                c.person.institutions.some((i) =>
                  target.includes(i.country || ""),
                )) &&
              c.person.institutions.length &&
              !c.hidden &&
              c.fit !== "Broad" &&
              !c.groupSource &&
              (!c.verification ||
                Date.now() - Date.parse(c.verification.checkedAt) > 86400000),
          )
          .sort((a, b) => b.rank - a.rank);
        const first = pool[0];
        const second = pool.find((c) => c.groupKey !== first?.groupKey);
        const top = [first, second].filter((c): c is Recommendation => !!c);
        await checkContacts(top, operation.signal);
      }
    } finally {
      const finished = {
        ...snapshot,
        tasks: snapshot.tasks.map((t) => ({ ...t })),
      };
      completedSweep.current = finished;
      setRun(finished);
      setBusy(false);
      setProgress(
        stop.current
          ? "Paused. Continue from the saved cursors."
          : "Sweep finished. Coverage is limited to the retrieved pages.",
      );
      controller.current = null;
    }
  }
  function cancel() {
    stop.current = true;
    controller.current?.abort();
  }
  function savePerson(person: Person) {
    setSaved((s) =>
      s.some((v) => peopleShareKey(person, v.person))
        ? s
        : [
            ...s,
            {
              person,
              status: "To investigate",
              notes: "",
              savedAt: new Date().toISOString(),
            },
          ],
    );
  }
  async function graph(id: string, mode: string, cursor?: string, page = 1) {
    if (busy) return;
    setBusy(true);
    setError("");
    setProgress(`Tracing ${mode} in OpenAlex…`);
    stop.current = false;
    controller.current = new AbortController();
    try {
      const d = await api(
        { op: "graph", id, mode, cursor, page },
        controller.current.signal,
      );
      setRun((r) =>
        r ? { ...r, works: mergeWorks([...r.works, ...d.works]) } : r,
      );
      if (d.profile) setProfile(d.profile);
      setGraphNext(
        d.next
          ? { id: d.id || id, mode, cursor: d.next, page: page + 1 }
          : undefined,
      );
      setMessages((m) => [
        ...new Set([
          ...m,
          ...(d.warnings || []),
          `${d.works.length} records added from ${mode}. These are related leads, not automatically topic matches.`,
        ]),
      ]);
      setProgress(`Added ${d.works.length} records from ${mode}.`);
    } catch (e) {
      if (!stop.current) setError((e as Error).message);
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  async function loadThesis(nnt: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setProgress("Loading full thesis metadata…");
    stop.current = false;
    controller.current = new AbortController();
    try {
      const d = await api({ op: "thesis", nnt }, controller.current.signal);
      setRun((r) =>
        r ? { ...r, works: mergeWorks([...r.works, ...d.works]) } : r,
      );
      setProgress(
        "Full thesis metadata added. Open its abstract and supervisor evidence below.",
      );
    } catch (e) {
      if (!stop.current) setError((e as Error).message);
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  async function importSession(file?: File) {
    if (!file) return;
    try {
      if (file.size > 25000000)
        throw new Error("Session file is too large (maximum 25 MB).");
      const raw = JSON.parse(await file.text());
      const backup = shortlistBackupSchema.safeParse(raw);
      if (backup.success) {
        setStorageReady(true);
        setSaved((v) => [
          ...v,
          ...backup.data.shortlist.filter(
            (s) => !v.some((x) => peopleShareKey(x.person, s.person)),
          ),
        ]);
        setView("shortlist");
        setError("");
        return;
      }
      const d = sessionSchema.parse(raw);
      if (d.seen) history.add(d.seen);
      setBaseline(history.snapshot());
      setStorageReady(true);
      setRun(d);
      if (d.matching) {
        setMatching(d.matching);
        setMatchingReady(true);
      }
      if (d.shortlist)
        setSaved((v) => [
          ...v,
          ...d.shortlist!.filter(
            (s) => !v.some((x) => peopleShareKey(x.person, s.person)),
          ),
        ]);
      setError("");
      setTab("matches");
      setLimit(40);
      setProfile(undefined);
      setGraphNext(undefined);
      setTopic(d.topic);
      setQueryText([...new Set(d.tasks.map((t) => t.query))].join("\n"));
      setCountry(d.options.country);
      setFrom(d.options.from);
      setTo(d.options.to);
      setInstitution(d.options.institution);
      setTheses(d.options.theses);
      setView("discover");
      setSelected(undefined);
      setMessages([
        ...(d.warnings || []),
        "Imported session. Continue uses the original search scope and saved cursors.",
      ]);
    } catch {
      setError(
        "Could not import this file. Use a Fusion Atlas session or shortlist backup under 25 MB.",
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }
  const selectPerson = (p: Person) => {
    if (run)
      remember([results.get(p.key) || { person: p, groupKeys: [] }], run.topic);
    setSelected(p);
    setProfile(undefined);
    setGraphNext(undefined);
  };
  const title =
    view === "discover"
      ? "Research discovery"
      : view === "organizations"
        ? "Organization directory"
        : view === "shortlist"
          ? "Internship shortlist"
          : "Connections & method";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="wordmark">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
          >
            <ellipse cx="14" cy="14" rx="12" ry="5" stroke="currentColor" />
            <ellipse
              cx="14"
              cy="14"
              rx="12"
              ry="5"
              stroke="currentColor"
              transform="rotate(60 14 14)"
            />
            <circle cx="14" cy="14" r="2" fill="currentColor" />
          </svg>
          Fusion Atlas
        </div>
        <p className="workspace">Undergraduate research</p>
        <nav aria-label="Main navigation">
          {[
            ["discover", "Discover", Search],
            ["organizations", "Organizations", Building2],
            ["shortlist", "Shortlist", Bookmark],
            ["settings", "Connections", Settings2],
          ].map(([id, label, Icon]) => {
            const I = Icon as typeof Search;
            return (
              <button
                key={String(id)}
                className={view === id ? "nav-item active" : "nav-item"}
                onClick={() => {
                  setView(String(id));
                  setSelected(undefined);
                  setLimit(40);
                }}
              >
                <I size={17} />
                {String(label)}
                {id === "shortlist" && saved.length > 0 && (
                  <span className="nav-count">{saved.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="scope-line">
            <span className="tiny-dot" />
            Undergraduate research
          </div>
          <p>Worldwide fusion research directory</p>
          <span className="small">Personal discovery workspace</span>
        </div>
      </aside>
      <main className="canvas">
        <header className="page-header">
          <div>
            <div className="breadcrumb">
              Fusion Atlas <ChevronRight size={12} />{" "}
              {view === "discover" ? "Literature → people" : title}
            </div>
            <h1>{title}</h1>
            <p>
              {view === "discover"
                ? "Find a supervisor for an undergraduate fusion research project."
                : view === "organizations"
                  ? "Explore fusion institutions and look up their researchers."
                  : view === "shortlist"
                    ? "Research fit first. Confirm supervision, eligibility, and openings separately."
                    : "Free scholarly indexes, with a visible account of what was searched."}
            </p>
          </div>
          <div className="header-actions">
            <ThemeSwitch />
            {run && (
              <button
                disabled={busy}
                onClick={() =>
                  download(
                    "fusion-atlas-session.json",
                    JSON.stringify(
                      {
                        version: 1,
                        ...run,
                        warnings: messages,
                        shortlist: saved,
                        matching,
                        seen: history.snapshot(),
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                <Download size={15} />
                Save session
              </button>
            )}
            <button disabled={busy} onClick={() => importRef.current?.click()}>
              Open session
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => importSession(e.target.files?.[0])}
            />
          </div>
        </header>
        {history.notice && (
          <div className="notice error" role="status">
            {history.notice}
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}
        {view === "discover" && (
          <>
            {matching.profile.region && (country || institution) && (
              <p className="small">
                Choose Anywhere and clear the institution filter to search all
                ten geographic slots.
              </p>
            )}
            <RegionSettings
              region={matching.profile.region}
              onChange={updateRegion}
              busy={busy}
            />
            <ProfilePanel
              profile={matching.profile}
              onChange={(profile) => {
                setMatchingReady(true);
                setMatching((s) => ({ ...s, profile }));
              }}
            />
            <section className="search-panel" aria-label="Research search">
              <div className="topic-row">
                <label className="topic-label" htmlFor="topic">
                  Topic or keywords
                </label>
                <div className="search-field">
                  <Search size={18} />
                  <input
                    id="topic"
                    disabled={busy}
                    value={topic}
                    onChange={(e) => setTopicPlan(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sweep();
                    }}
                    placeholder="e.g. plasma turbulence, tungsten, machine learning…"
                  />
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => sweep()}
                >
                  <Search size={16} />
                  Start discovery
                </button>
              </div>
              <div className="filter-row">
                <label>
                  Location
                  <select
                    value={country}
                    disabled={busy}
                    onChange={(e) => setCountry(e.target.value)}
                  >
                    {countries.map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  From
                  <input
                    type="number"
                    min="1950"
                    max="2100"
                    value={from}
                    disabled={busy}
                    onChange={(e) => setFrom(Number(e.target.value))}
                  />
                </label>
                <label>
                  Through
                  <input
                    type="number"
                    min="1950"
                    max="2100"
                    value={to}
                    disabled={busy}
                    onChange={(e) => setTo(Number(e.target.value))}
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={theses}
                    onChange={(e) => setTheses(e.target.checked)}
                  />
                  Theses only
                </label>
                <button
                  className="quiet filter-toggle"
                  onClick={() => setAdvanced(!advanced)}
                  aria-expanded={advanced}
                >
                  <SlidersHorizontal size={15} />
                  Search plan <span className="count">{queries.length}</span>
                </button>
              </div>
              {institution && (
                <div className="selected-institution">
                  <Building2 size={14} />
                  {institution.name} · {institution.city || institution.country}
                  <button
                    disabled={busy}
                    aria-label="Clear institution"
                    onClick={() => setInstitution(undefined)}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {advanced && (
                <div className="advanced-grid">
                  <div>
                    <label htmlFor="queries">
                      Queries to run{" "}
                      <span className="muted">· up to 8, one per line</span>
                    </label>
                    <textarea
                      id="queries"
                      rows={5}
                      disabled={busy}
                      value={queryText || expand(topic).join("\n")}
                      onChange={(e) => setQueryText(e.target.value)}
                    />
                    <p className="small">
                      Editable fusion vocabulary expansion. Add adjacent methods
                      and synonyms; no hidden AI rewriting.
                    </p>
                    <button
                      className="text-button"
                      disabled={busy || queries.length >= 8}
                      onClick={() =>
                        setQueryText(
                          [...new Set([...queries, ...frenchQueries(topic)])]
                            .slice(0, 8)
                            .join("\n"),
                        )
                      }
                    >
                      <Plus size={14} /> Add French thesis queries
                    </button>
                    <div className="sources-choice">
                      {(Object.keys(providerNames) as Provider[]).map((p) => (
                        <label className="check-label" key={p}>
                          <input
                            type="checkbox"
                            checked={providers.includes(p)}
                            disabled={busy}
                            onChange={(e) =>
                              setProviders((v) =>
                                e.target.checked
                                  ? [...v, p]
                                  : v.filter((x) => x !== p),
                              )
                            }
                          />
                          {providerNames[p]}
                        </label>
                      ))}
                    </div>
                    <label className="sweeps">
                      Depth per query
                      <select
                        value={sweeps}
                        disabled={busy}
                        onChange={(e) => setSweeps(Number(e.target.value))}
                      >
                        <option value={0}>
                          {matching.profile.region && !country && !institution
                            ? "Quick shortlist · geographic and general queries"
                            : "Quick shortlist · up to 3 first pages"}
                        </option>
                        <option value={1}>
                          1 page · all selected queries and sources
                        </option>
                        <option value={2}>2 pages · broad search</option>
                        <option value={4}>4 pages · deeper search</option>
                      </select>
                    </label>
                    <p className="small">
                      Quick shortlist starts with your first query. Continue
                      sweep covers the remaining sources and variants. Pages are
                      cached for a day.
                    </p>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={autoCheck}
                        onChange={(e) => setAutoCheck(e.target.checked)}
                      />
                      Check official pages for the first two institution leads
                    </label>
                  </div>
                  <div>
                    <label htmlFor="institution">Institution or city</label>
                    <div className="inline-field">
                      <input
                        id="institution"
                        value={instQuery}
                        onChange={(e) => setInstQuery(e.target.value)}
                        placeholder="Parent institution name"
                      />
                      <button
                        disabled={lookupBusy || busy || instQuery.length < 2}
                        onClick={() => lookup()}
                      >
                        {lookupBusy ? "Finding…" : "Find"}
                      </button>
                    </div>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={cityMode}
                        onChange={(e) => setCityMode(e.target.checked)}
                      />
                      Search city instead of institution name
                    </label>
                    <p className="small">
                      Select the correct identity below. A paper’s location may
                      be historical; it is not proof of a researcher’s current
                      workplace.
                    </p>
                    <div className="institution-results">
                      {instResults.map((i) => (
                        <button
                          disabled={busy}
                          key={i.id}
                          onClick={() => {
                            setInstitution(i);
                            setInstResults([]);
                          }}
                        >
                          <span>
                            {i.name}
                            <small>
                              {i.city} · {i.country}
                            </small>
                          </span>
                          <Plus size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
            {!run ? (
              <div className="first-run">
                <div className="starting-points">
                  <div className="section-heading">
                    <h2>Start with a research direction</h2>
                    <span className="small">Or search any topic above</span>
                  </div>
                  {starters.map((s) => (
                    <button
                      className="starter"
                      key={s.name}
                      onClick={() => setTopicPlan(s.topic)}
                    >
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.detail}</small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  ))}
                </div>
                <section className="method-card">
                  <h2>Follow the evidence</h2>
                  <ol className="evidence-chain">
                    <li>
                      <span>01</span>
                      <div>
                        Expand the question
                        <small>
                          Related terminology across seven scholarly indexes.
                        </small>
                      </div>
                    </li>
                    <li>
                      <span>02</span>
                      <div>
                        Read the work
                        <small>Papers, preprints and repository theses.</small>
                      </div>
                    </li>
                    <li>
                      <span>03</span>
                      <div>
                        Trace the people
                        <small>
                          Affiliations, author histories and citation neighbors.
                        </small>
                      </div>
                    </li>
                    <li>
                      <span>04</span>
                      <div>
                        Build a shortlist
                        <small>
                          Save evidence, verify the lab, then investigate
                          openings.
                        </small>
                      </div>
                    </li>
                  </ol>
                  <div className="method-footer">
                    {directory.length} organization leads loaded{" "}
                    <button
                      className="text-button"
                      onClick={() => setView("organizations")}
                    >
                      Explore directory <ArrowRight size={14} />
                    </button>
                  </div>
                </section>
              </div>
            ) : (
              <>
                <div className="run-strip">
                  <div aria-live="polite">
                    <span
                      className={busy ? "activity-dot running" : "activity-dot"}
                    />
                    {busy
                      ? progress
                      : `${run.works.length.toLocaleString()} works retrieved · ${people.length.toLocaleString()} researcher identities`}
                    <small>
                      {run.topic} · {run.options.from}–{run.options.to} ·{" "}
                      {run.options.country || "Worldwide"}
                      {run.options.institution
                        ? " · " + run.options.institution.name
                        : ""}
                      {cacheHits > 0 && ` · ${cacheHits} cached page(s)`}
                    </small>
                    {baseline.entries.length > 0 && (
                      <small>
                        {results.size} results ·{" "}
                        {
                          Array.from(statuses.values()).filter(
                            (s) => s.kind === "new",
                          ).length
                        }{" "}
                        new since{" "}
                        {baseline.lastRunAt
                          ? new Date(baseline.lastRunAt).toLocaleDateString()
                          : "previous searches"}
                      </small>
                    )}
                  </div>
                  <div>
                    {busy ? (
                      <button onClick={cancel}>
                        <Square size={13} />
                        Pause
                      </button>
                    ) : (
                      <button
                        disabled={!run.tasks.some((t) => !t.done)}
                        onClick={() => sweep(run)}
                      >
                        <Play size={14} />
                        Continue sweep
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className="results-tabs"
                  role="tablist"
                  aria-label="Search results"
                >
                  {[
                    [
                      "matches",
                      "Recommended contacts",
                      region
                        ? Object.keys(picks).length
                        : recommendationGroups(visibleRanked).length,
                    ],
                    ["people", "Researchers", people.length],
                    ["papers", "Papers & theses", run.works.length],
                    ["coverage", "Coverage", run.tasks.length],
                  ].map(([id, name, count]) => (
                    <button
                      role="tab"
                      aria-selected={tab === id}
                      className={tab === id ? "selected" : ""}
                      key={id}
                      onClick={() => {
                        setTab(String(id));
                        setLimit(40);
                      }}
                    >
                      {name}
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
                {(tab === "matches" || tab === "people") && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={matching.profile.hideSeen}
                      onChange={(e) => {
                        const hideSeen = e.target.checked;
                        setMatching((s) => ({
                          ...s,
                          profile: { ...s.profile, hideSeen },
                        }));
                        setSelected(undefined);
                        setLimit(40);
                      }}
                    />
                    Hide seen
                  </label>
                )}
                {tab === "matches" && (
                  <Recommendations
                    renderBadge={recommendationBadge}
                    regional={
                      region
                        ? {
                            region,
                            order: matching.profile.roleOrder,
                            board,
                            picks,
                            candidates: visibleRanked,
                            onBoard: saveBoard,
                            onSearch: (codes, b) =>
                              void sweep({ ...run, board: b }, codes),
                            onSwap: (old, code, b) => {
                              updateRegion({
                                ...region,
                                destinations: region.destinations.map((c) =>
                                  c === old ? code : c,
                                ),
                              });
                              void sweep({ ...run, board: b }, [code]);
                            },
                          }
                        : undefined
                    }
                    scope={run.options}
                    topic={run.topic}
                    onRoleOrder={(roleOrder) => {
                      setMatching((s) => ({
                        ...s,
                        profile: { ...s.profile, roleOrder },
                      }));
                      saveBoard({ ...board, pins: {} });
                    }}
                    studentProfile={matching.profile}
                    candidates={visibleRanked}
                    busy={busy}
                    checking={checking}
                    savedKeys={saved.flatMap((s) => [
                      s.person.key,
                      ...(s.person.aliases || []),
                    ])}
                    onSave={(c) => savePerson(canonicalContact(c))}
                    onExplore={(c) => {
                      setTab("people");
                      selectPerson(canonicalContact(c));
                    }}
                    onVerify={(c, url) => void verify([c], url)}
                    onVerifyTop={() =>
                      void verify(
                        recommendationGroups(
                          visibleRanked,
                          8,
                          matching.profile.roleOrder,
                        )
                          .slice(0, 3)
                          .map((g) => g.lead),
                      )
                    }
                    onFeedback={feedback}
                  />
                )}
                {tab === "people" && (
                  <>
                    <div className="results-tools">
                      <p className="small">
                        Sorted by topic evidence and recency. Not an
                        internship-availability score.
                      </p>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={supervisorsOnly}
                          onChange={(e) => {
                            setSupervisorsOnly(e.target.checked);
                            setLimit(40);
                            setSelected(undefined);
                          }}
                        />
                        With supervision evidence
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={levelOnly}
                          onChange={(e) => {
                            setLevelOnly(e.target.checked);
                            setLimit(40);
                            setSelected(undefined);
                          }}
                        />
                        Supervision at or below my level
                      </label>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={includeUnknown}
                          onChange={(e) => setIncludeUnknown(e.target.checked)}
                        />
                        Include unknown affiliations
                      </label>
                    </div>
                    <div
                      className={
                        "results-grid " + (selected ? "has-detail" : "")
                      }
                    >
                      <section
                        className={
                          selected ? "people-list mobile-hide" : "people-list"
                        }
                      >
                        <div className="table-head">
                          <span>Researcher / affiliation at publication</span>
                          <span>Evidence</span>
                        </div>
                        {visiblePeople.slice(0, limit).map((p) => (
                          <button
                            className={
                              "person-row " +
                              (selected && peopleShareKey(p, selected)
                                ? "chosen"
                                : "")
                            }
                            key={p.key}
                            onClick={() => selectPerson(p)}
                          >
                            <div className="initials">
                              {p.name
                                .split(" ")
                                .map((s) => s[0])
                                .slice(0, 2)
                                .join("")}
                            </div>
                            <div className="person-info">
                              <strong>
                                {p.name}{" "}
                                <SeenBadge status={statuses.get(p.key)!} />
                              </strong>
                              <span>
                                {p.institutions
                                  .map((i) => i.name)
                                  .join(" · ") ||
                                  "Affiliation not indexed — investigate"}
                              </span>
                              <small>
                                {!!p.supervisedWorkIds?.length &&
                                  `${p.supervisedWorkIds.length} supervised thesis record(s) · `}
                                {p.matched.length
                                  ? p.matched.slice(0, 4).join(" · ")
                                  : "Retrieved lead · read the evidence"}
                                {p.identity.toLowerCase().includes("unverified")
                                  ? " · identity unverified"
                                  : ""}
                                {!!p.possibleDuplicates?.length &&
                                  " · Possible duplicate"}
                              </small>
                            </div>
                            <div className="paper-count">
                              {p.works.length}
                              <small>
                                work{p.works.length !== 1 ? "s" : ""}
                              </small>
                            </div>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                        {!visiblePeople.length && (
                          <div className="empty">
                            {busy
                              ? "Searching scholarly sources…"
                              : matching.profile.hideSeen && hiddenKeys.size
                                ? "No researchers match the current filters. Turn off Hide seen to include earlier results."
                                : levelOnly
                                  ? "No matching level evidence in these results. Turn off the level filter to see other researchers."
                                  : supervisorsOnly
                                    ? "No explicit supervision records in these results. Try a thesis search with HAL, DataCite, and theses.fr, or include unknown affiliations."
                                    : "No researcher identities in this scope. Check Coverage for source errors, expand the date range, or include unknown affiliations."}
                          </div>
                        )}
                        {visiblePeople.length > limit && (
                          <button
                            className="load-more"
                            onClick={() => setLimit((v) => v + 40)}
                          >
                            Show 40 more · {limit} of {visiblePeople.length}
                          </button>
                        )}
                      </section>
                      {selected && (
                        <section className="dossier">
                          <button
                            className="text-button"
                            onClick={() => setSelected(undefined)}
                          >
                            <X size={14} />
                            Close researcher
                          </button>
                          <h2>{selected.name}</h2>
                          <p>
                            {selected.institutions
                              .map((i) => i.name)
                              .join(" · ") || "Affiliation not indexed"}
                          </p>
                          <div className="identity-note">
                            {selected.identity}.{" "}
                            {selected.supervisedWorkIds?.length
                              ? `Named supervisor on ${selected.supervisedWorkIds.length} retrieved thesis record(s). This does not establish current availability or employment.`
                              : selected.corresponding
                                ? "Corresponding-author metadata found; this does not establish supervision."
                                : "Authorship alone does not establish a supervisor role."}
                          </div>
                          <SupervisionEvidence
                            person={selected}
                            verification={verificationFor(
                              selected,
                              matching.verifications,
                            )}
                          />
                          {!!selected.mergedBy?.length && (
                            <details>
                              <summary>
                                Identity evidence ({selected.mergedBy.length})
                              </summary>
                              <ul>
                                {selected.mergedBy.map((e, i) => (
                                  <li key={i}>{e.detail}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                          {selected.possibleDuplicates?.map((d) => (
                            <div key={d.key} className="identity-note">
                              <p>
                                Possibly the same person as{" "}
                                <strong>{d.name}</strong> — {d.reason}
                              </p>
                              <div className="geo-actions">
                                <button
                                  onClick={() =>
                                    decideIdentity(selected, d.key, "same")
                                  }
                                >
                                  Same person
                                </button>
                                <button
                                  onClick={() =>
                                    decideIdentity(selected, d.key, "different")
                                  }
                                >
                                  Different people
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            className="primary"
                            onClick={() => savePerson(selected)}
                          >
                            {saved.some((s) =>
                              peopleShareKey(selected, s.person),
                            ) ? (
                              <Check size={15} />
                            ) : (
                              <Bookmark size={15} />
                            )}{" "}
                            {saved.some((s) =>
                              peopleShareKey(selected, s.person),
                            )
                              ? "On your shortlist"
                              : "Save researcher"}
                          </button>
                          <div className="dossier-links">
                            {selected.orcid && (
                              <Out
                                href={
                                  selected.orcid?.startsWith("http")
                                    ? selected.orcid
                                    : selected.orcid
                                      ? "https://orcid.org/" + selected.orcid
                                      : undefined
                                }
                              >
                                ORCID
                              </Out>
                            )}
                            {selected.id && (
                              <Out href={selected.id}>OpenAlex author</Out>
                            )}
                            {selected.profileUrl && (
                              <Out href={selected.profileUrl}>
                                {selected.officialRoleSource ===
                                selected.profileUrl
                                  ? "Official group profile"
                                  : "Repository identity profile"}
                              </Out>
                            )}
                            <Out
                              href={searchLink(
                                `"${selected.name}" "${selected.institutions[0]?.name || ""}" research group`,
                              )}
                            >
                              Find official lab
                            </Out>
                            <Out
                              href={searchLink(
                                `"${selected.name}" fusion thesis supervisor`,
                              )}
                            >
                              Find supervised theses
                            </Out>
                            <Out
                              href={searchLink(
                                `"${selected.institutions[0]?.name || selected.name}" undergraduate research summer internship fusion`,
                              )}
                            >
                              Check undergraduate opportunities
                            </Out>
                          </div>
                          <p className="small">
                            Web links open manual verification searches. No
                            vacancy or undergraduate eligibility has been
                            confirmed.
                          </p>
                          {selected.id && (
                            <button
                              disabled={busy}
                              onClick={() => graph(selected.id!, "author")}
                            >
                              <BookOpen size={15} />
                              Fetch author’s recent works
                            </button>
                          )}
                          {profile && (
                            <div className="profile-note">
                              <h3>Indexed affiliation history</h3>
                              <p>
                                Last known:{" "}
                                {profile.lastKnown.join("; ") ||
                                  "Not available"}
                                . Verify against an official current profile.
                              </p>
                              {profile.affiliations
                                .slice(0, 6)
                                .map((a: any, i: number) => (
                                  <small key={i}>
                                    {a.name} · {a.years?.join(", ")}
                                  </small>
                                ))}
                            </div>
                          )}
                          {selected.officialRoleSource && (
                            <p>
                              <Out href={selected.officialRoleSource}>
                                {selected.officialGroup} · official group
                                listing
                              </Out>
                            </p>
                          )}
                          <h3>Authored works & supervised theses</h3>
                          {selected.works.slice(0, 12).map((w) => (
                            <Paper
                              key={w.id}
                              work={w}
                              busy={busy}
                              graph={graph}
                              loadThesis={loadThesis}
                              role={
                                selected.supervisedWorkIds?.includes(w.id)
                                  ? selected.authoredWorkIds?.includes(w.id)
                                    ? "Author and named supervisor"
                                    : "Named supervisor"
                                  : "Author"
                              }
                            />
                          ))}
                          {selected.works.length > 12 && (
                            <p className="small">
                              Showing 12 of {selected.works.length} supporting
                              works. All are retained in the session export.
                            </p>
                          )}
                        </section>
                      )}
                    </div>
                  </>
                )}
                {tab === "papers" && (
                  <div className="paper-list">
                    <p className="small">
                      Includes global records and graph follow-ups. Geographic
                      filtering applies to researcher rows; missing location
                      metadata is preserved here.
                    </p>
                    {run.works.slice(0, limit).map((w) => (
                      <Paper
                        key={w.id}
                        work={w}
                        busy={busy}
                        graph={graph}
                        loadThesis={loadThesis}
                      />
                    ))}
                    {!run.works.length && (
                      <div className="empty">
                        No works retrieved yet. Inspect Coverage for source
                        responses.
                      </div>
                    )}
                    {run.works.length > limit && (
                      <button
                        className="load-more"
                        onClick={() => setLimit((v) => v + 40)}
                      >
                        Show 40 more
                      </button>
                    )}
                  </div>
                )}
                {graphNext && (
                  <button
                    disabled={busy}
                    className="load-more"
                    onClick={() =>
                      graph(
                        graphNext.id,
                        graphNext.mode,
                        graphNext.cursor,
                        graphNext.page,
                      )
                    }
                  >
                    Continue {graphNext.mode} expansion
                  </button>
                )}
                {tab === "coverage" && (
                  <section className="coverage">
                    <h2>What was actually searched</h2>
                    <p>
                      Totals are provider estimates per query, not unique
                      papers. “More available” means the search is incomplete.
                      All searches are bounded; no run establishes exhaustive
                      coverage.
                    </p>
                    <div className="coverage-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Source</th>
                            <th>Query</th>
                            <th>Pages fetched</th>
                            <th>Source estimate</th>
                            <th>State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.tasks.map((t, i) => (
                            <tr key={i}>
                              <td>{providerNames[t.provider]}</td>
                              <td>
                                {t.query}
                                {t.countries && (
                                  <small> · {t.countries.join(", ")}</small>
                                )}
                              </td>
                              <td className="num">
                                {t.done && !t.error ? t.page : t.page - 1}
                              </td>
                              <td className="num">
                                {t.total?.toLocaleString() ?? "—"}
                              </td>
                              <td>
                                {t.error ? (
                                  <span className="warning">{t.error}</span>
                                ) : t.done ? (
                                  "No further page supplied"
                                ) : (
                                  "More available / not yet fetched"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {messages.map((m) => (
                      <p className="notice" key={m}>
                        {m}
                      </p>
                    ))}
                    <p className="small">
                      Crossref and arXiv often lack affiliation or abstract
                      metadata. Dissertation indexing is incomplete. Citation
                      links establish related work, not supervisor
                      relationships. Closed theses, unindexed company work, and
                      newly established labs require institutional follow-up.
                    </p>
                  </section>
                )}
              </>
            )}
          </>
        )}
        {view === "organizations" && (
          <section className="directory">
            <div className="directory-tools">
              <label>
                Find organization
                <input
                  value={directoryQuery}
                  onChange={(e) => {
                    setDirectoryQuery(e.target.value);
                    setLimit(40);
                  }}
                  placeholder="University, lab, country…"
                />
              </label>
              <label>
                Country / scope
                <select
                  value={dirCountry}
                  onChange={(e) => {
                    setDirCountry(e.target.value);
                    setLimit(40);
                  }}
                >
                  <option value="">All locations</option>
                  {[...new Set(directory.map((o) => o.country))]
                    .sort()
                    .map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                </select>
              </label>
              <span>{orgs.length} entries</span>
            </div>
            <p className="small">
              Compiled 14 Nov 2026. Includes historical entries and broader
              university leads. Resolve a parent institution before filtering;
              companies may have no OpenAlex ID.
            </p>
            {orgs.slice(0, limit).map((o) => (
              <div className="org-row" key={o.id}>
                <div>
                  <h3>{o.organization}</h3>
                  <p>
                    {o.country} · {o.type}
                  </p>
                  <small>{o.sourceNote}</small>
                  <Out href={o.sourceUrl}>Directory evidence</Out>
                </div>
                <button
                  disabled={busy}
                  onClick={() => {
                    setInstQuery(o.organization.split(" — ")[0]);
                    setCityMode(false);
                    setAdvanced(true);
                    setView("discover");
                  }}
                >
                  Use in search <ArrowRight size={14} />
                </button>
              </div>
            ))}
            {orgs.length > limit && (
              <button
                className="load-more"
                onClick={() => setLimit((v) => v + 40)}
              >
                Show 40 more
              </button>
            )}
          </section>
        )}
        {view === "shortlist" && (
          <section>
            <div className="shortlist-toolbar">
              <span>
                {saved.length} saved researcher{saved.length !== 1 ? "s" : ""} ·
                stored in this browser
              </span>
              <div className="backup-actions">
                <button
                  disabled={!saved.length}
                  onClick={() =>
                    download(
                      "fusion-shortlist-backup.json",
                      JSON.stringify(
                        { version: 1, kind: "shortlist", shortlist: saved },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  Backup JSON
                </button>
                <button onClick={() => importRef.current?.click()}>
                  Restore backup
                </button>
                <button
                  disabled={!saved.length}
                  onClick={() =>
                    download(
                      "fusion-internship-shortlist.csv",
                      shortlistCsv(saved, matching.verifications),
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  <Download size={15} />
                  Export CSV
                </button>
              </div>
            </div>
            {!saved.length && (
              <div className="empty">
                Open a researcher from your search results and save them here
                with the papers you want to discuss.
              </div>
            )}
            {saved.map((s) => (
              <article className="shortlist-card" key={s.person.key}>
                <div className="section-heading">
                  <h2>{s.person.name}</h2>
                  <button
                    onClick={() =>
                      setSaved((v) => v.filter((x) => !sameSavedEntry(x, s)))
                    }
                  >
                    Remove
                  </button>
                </div>
                <p>
                  {s.person.institutions.map((i) => i.name).join(" · ") ||
                    "Affiliation to verify"}
                </p>
                {s.person.officialRoleSource && (
                  <p>
                    <Out href={s.person.officialRoleSource}>
                      {s.person.officialGroup} · official group listing
                    </Out>
                  </p>
                )}
                <div className="shortlist-fields">
                  <label>
                    Follow-up stage
                    <select
                      value={s.status}
                      onChange={(e) =>
                        setSaved((v) =>
                          v.map((x) =>
                            sameSavedEntry(x, s)
                              ? { ...x, status: e.target.value }
                              : x,
                          ),
                        )
                      }
                    >
                      {[
                        "To investigate",
                        "Read papers",
                        "Verify supervisor",
                        "Check undergraduate eligibility",
                        "Ready to contact",
                        "Contacted",
                        "Closed",
                      ].map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Research fit & follow-up notes
                    <textarea
                      rows={3}
                      placeholder="Relevant methods, paper questions, degree requirements, deadline, official contact URL…"
                      value={s.notes}
                      onChange={(e) =>
                        setSaved((v) =>
                          v.map((x) =>
                            sameSavedEntry(x, s)
                              ? { ...x, notes: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <div className="saved-evidence">
                  {s.person.works.slice(0, 4).map((w) => (
                    <Out key={w.id} href={w.url}>
                      {w.title} ({w.year || "year unknown"})
                    </Out>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}
        {view === "settings" && (
          <section className="settings">
            <div className="settings-row">
              <div>
                <h2>Seen history</h2>
                <p>
                  {history.ledger.entries.length} researcher entries in this
                  browser. Clearing history keeps your shortlist, feedback and
                  official-page checks.
                </p>
              </div>
              <button
                disabled={
                  busy ||
                  (!history.ledger.entries.length && !history.ledger.lastRunAt)
                }
                onClick={() => {
                  if (history.clear()) setBaseline(emptyLedger);
                }}
              >
                Clear seen history
              </button>
            </div>
            <div className="settings-row">
              <div>
                <h2>OpenAlex</h2>
                <p>
                  Author identities, paper affiliations, institutional search,
                  publication histories and citation links.
                </p>
                <Out href="https://openalex.org/settings/api">
                  Get a free API key
                </Out>
              </div>
              <div>
                <span className="connection-state">
                  {config?.openalexKey
                    ? "Key configured"
                    : "Using limited keyless access"}
                </span>
                <p>
                  Add <code>OPENALEX_API_KEY</code> in Vercel → Project Settings
                  → Environment Variables, then redeploy. Never use a
                  NEXT_PUBLIC_ variable for secrets.
                </p>
                <p className="small">
                  Free keys have quotas. Deep cursor paging needs a key;
                  exhausted budgets appear in Coverage.
                </p>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <h2>Crossref, DataCite & arXiv</h2>
                <p>No API key needed for these public metadata endpoints.</p>
              </div>
              <div>
                <p>
                  Crossref: articles and some dissertations.
                  <br />
                  DataCite: repository works and DOI-registered theses.
                  <br />
                  arXiv: preprints, often before journal publication.
                </p>
                <p className="small">
                  Optional <code>CONTACT_EMAIL</code> identifies your Crossref
                  and OpenAIRE requests. The backend paces arXiv requests and
                  retries short transient failures.
                </p>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <h2>HAL, OpenAIRE & theses.fr</h2>
                <p>
                  Public repository and thesis metadata. No additional API keys.
                </p>
              </div>
              <div>
                <p>
                  HAL / TEL adds papers, theses, and named thesis directors.
                  OpenAIRE adds international repository records, including
                  doctoral and master’s theses. theses.fr adds completed French
                  doctorates and IdRef identities for authors and supervisors.
                </p>
                <p className="small">
                  Use “With supervision evidence” to focus on explicit
                  supervisor records from HAL, theses.fr, or DataCite. Degree
                  institutions and work-level organizations are context, not
                  verified personal affiliations. Keep unknown affiliations
                  enabled to retain these leads.
                </p>
                <p className="small">
                  “Load full thesis metadata” retrieves abstracts from
                  theses.fr. References are paged in batches of 50 IDs; papers
                  with DOIs can be looked up in OpenAlex before tracing their
                  graph. Source dates may reflect repository deposits: verify
                  the original thesis date.
                </p>
                <div className="dossier-links">
                  <Out href="https://api.archives-ouvertes.fr/docs/search">
                    HAL API
                  </Out>
                  <Out href="https://graph.openaire.eu/docs/apis/graph-api-v4/">
                    OpenAIRE API
                  </Out>
                  <Out href="https://theses.fr">theses.fr</Out>
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <h2>Personal deployment access</h2>
                <p>
                  {config?.passwordRequired
                    ? "This deployment requires a shared password."
                    : "Optional: configure SITE_PASSWORD on Vercel to limit use of your API quota."}
                </p>
              </div>
              <div>
                <label>
                  Access password
                  <input
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <p className="small">
                  Kept in this page’s memory. This is a deployment password, not
                  an API key.
                </p>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <h2>Official pages and search cache</h2>
                <p>
                  Known institution sites can be checked without an extra key.
                </p>
              </div>
              <div>
                <p>
                  {config?.officialSearch
                    ? "Brave official-site discovery is enabled."
                    : "Optional BRAVE_SEARCH_API_KEY enables domain-specific search for deeper staff pages."}{" "}
                  Profile and feedback stay in this browser. Search pages are
                  reused for 24 hours.
                </p>
                <button
                  disabled={busy}
                  onClick={() => {
                    void clearCache()
                      .then(() => setCacheNotice("Search cache cleared."))
                      .then(() => setCacheHits(0))
                      .catch(() => setError("Unable to clear search cache."));
                  }}
                >
                  Clear cached searches
                </button>
                <span className="small" role="status">
                  {cacheNotice}
                </span>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <h2>How to investigate thoroughly</h2>
                <p>A repeatable literature-to-internship workflow.</p>
              </div>
              <ol>
                <li>
                  Search a topic globally with variants and multiple pages.
                </li>
                <li>
                  Repeat by country and selected institution; keep unknown
                  affiliations visible.
                </li>
                <li>
                  Run a separate thesis-only search; compare its authors and
                  acknowledgements.
                </li>
                <li>
                  Trace references and citing papers from promising works. Fetch
                  an author’s publication history.
                </li>
                <li>
                  Verify the person’s present lab, supervision role, and
                  undergraduate requirements on official pages.
                </li>
                <li>
                  Record evidence and unanswered questions in the shortlist.
                  Export a session to continue later.
                </li>
              </ol>
            </div>
            <div className="settings-row">
              <div>
                <h2>What this does not claim</h2>
              </div>
              <p>
                No citation-based prestige score, invented emails, inferred
                internship openings, or guarantee of exhaustive coverage. Text
                matching is explainable but not semantic understanding. Full
                PDFs and thesis acknowledgements are not automatically read.
                Unindexed sources still need manual verification.
              </p>
            </div>
          </section>
        )}
        <footer>
          Fusion Atlas{" "}
          <span>
            Research evidence is a starting point. Verify current affiliation
            and undergraduate eligibility.
          </span>
        </footer>
      </main>
    </div>
  );
}

function Paper({
  work: w,
  busy,
  graph,
  loadThesis,
  role,
}: {
  work: Work;
  busy: boolean;
  graph: (id: string, mode: string) => void;
  loadThesis: (nnt: string) => void;
  role?: string;
}) {
  const nnt = w.identifiers
    ?.find((v) => /^nnt:[12][0-9]{3}[A-Z0-9]{8}$/.test(v))
    ?.slice(4);
  const graphId = w.openalexId || (w.doi ? `doi:${w.doi}` : undefined);
  return (
    <article className="paper">
      <div className="paper-meta">
        <span>{w.year || "Year unknown"}</span>
        <span>{w.type}</span>
        <span>{w.sources.join(" + ")}</span>
        {role && <span className="neighbor">{role}</span>}
        {w.discovered !== "query" && (
          <span className="neighbor">{w.discovered}</span>
        )}
      </div>
      <h3>
        <Out href={w.url}>{w.title}</Out>
      </h3>
      <p className="small provenance">
        Found via: {w.queries.length ? w.queries.join(" · ") : w.discovered} ·
        retrieved {w.retrievedAt.slice(0, 10)}
      </p>
      <p className="authors">
        Authors:{" "}
        {w.authors
          .slice(0, 8)
          .map((a) => a.name)
          .join(", ")}
        {w.authors.length > 8 ? ` + ${w.authors.length - 8} authors` : ""}
      </p>
      {!!w.supervisors?.length && (
        <div className="supervision-evidence">
          <strong>Named supervisors</strong>
          {w.supervisors.map((s, i) => (
            <p className="small" key={i}>
              {s.name} · <Out href={s.evidenceUrl}>{s.evidenceSource}</Out>
            </p>
          ))}
        </div>
      )}
      {!!w.context?.length && (
        <details>
          <summary>Institutional context</summary>
          {w.context.map((c, i) => (
            <p className="small" key={i}>
              {c.label}: <Out href={c.url}>{c.name}</Out>
            </p>
          ))}
          <p className="small">
            These associations do not establish any individual’s current
            employer.
          </p>
        </details>
      )}
      {!!w.keywords?.length && (
        <details>
          <summary>Indexed keywords</summary>
          <p className="small">{w.keywords.join(" · ")}</p>
        </details>
      )}
      {!!w.records?.length && (
        <details>
          <summary>Repository records ({w.records.length})</summary>
          {w.records.map((r, i) => (
            <p className="small" key={i}>
              <Out href={r.url}>{r.name}</Out>
            </p>
          ))}
        </details>
      )}
      {!!w.relatedTo?.length && (
        <p className="small">
          Graph evidence:{" "}
          {w.relatedTo.map((r, i) => (
            <span key={i}>
              <Out href={r.url}>
                {r.mode} {r.id.split("/").pop()}
              </Out>{" "}
            </span>
          ))}
        </p>
      )}
      {w.abstract ? (
        <details>
          <summary>Read abstract</summary>
          <p>{w.abstract}</p>
        </details>
      ) : (
        <p className="small">Abstract not supplied by the index.</p>
      )}
      <div className="paper-actions">
        {w.pdf && <Out href={w.pdf}>Open PDF</Out>}
        {nnt && !w.abstract && (
          <button disabled={busy} onClick={() => loadThesis(nnt)}>
            Load full thesis metadata
          </button>
        )}
        {graphId && (
          <>
            <button
              disabled={busy}
              onClick={() => graph(graphId, "references")}
            >
              <GitBranch size={13} />
              References
            </button>
            <button disabled={busy} onClick={() => graph(graphId, "citations")}>
              Citing works
            </button>
          </>
        )}
      </div>
    </article>
  );
}
