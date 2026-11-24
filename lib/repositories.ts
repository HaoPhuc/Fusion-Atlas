import { doiKey, safeUrl } from "./research";
import type { Author, SupervisionLevel, Work } from "./types";

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const clean = (v: any): string =>
  typeof v === "string"
    ? v
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";
const first = (v: any) => clean(list(v)[0]);
const base = (source: string, id: string, query: string): Work => ({
  id,
  title: "Untitled",
  year: 0,
  type: "unknown",
  abstract: "",
  url: "",
  authors: [],
  sources: [source],
  queries: query ? [query] : [],
  citedBy: 0,
  references: [],
  discovered: "query",
  retrievedAt: new Date().toISOString(),
});

export const HAL_FIELDS = [
  "halId_s",
  "halIdSameAs_s",
  "doiId_s",
  "nntId_s",
  "uri_s",
  "fileMain_s",
  "title_s",
  "en_title_s",
  "abstract_s",
  "en_abstract_s",
  "docType_s",
  "publicationDateY_i",
  "defenseDateY_i",
  "authFullName_s",
  "authFullNameIdHal_fs",
  "director_s",
  "authorityInstitution_s",
  "keyword_s",
].join(",");

const halLevels = new Map<string, SupervisionLevel>([
  ["THESE", "doctoral"],
  ["HDR", "habilitation"],
  ["MEM", "master"],
]);

export function normalizeHal(w: any, query = ""): Work {
  const level = halLevels.get(w.docType_s);
  const url =
    safeUrl(w.uri_s) || `https://hal.science/${encodeURIComponent(w.halId_s)}`;
  const halIds = new Map<string, string>();
  for (const v of list(w.authFullNameIdHal_fs)) {
    const [name, id] = String(v).split("_FacetSep_");
    if (name && id && id !== "0") halIds.set(name, id);
  }
  return {
    ...base("HAL", `hal:${w.halId_s}`, query),
    doi: doiKey(first(w.doiId_s)) || undefined,
    identifiers: [w.halId_s, ...list(w.halIdSameAs_s)]
      .filter(Boolean)
      .map((id) => `hal:${id}`)
      .concat(w.nntId_s ? [`nnt:${String(w.nntId_s).toUpperCase()}`] : []),
    title: first(w.en_title_s) || first(w.title_s) || "Untitled",
    abstract: first(w.en_abstract_s) || first(w.abstract_s),
    year: Number(w.defenseDateY_i || w.publicationDateY_i) || 0,
    type: level ? `${level} thesis` : w.docType_s || "unknown",
    level,
    url,
    pdf: safeUrl(w.fileMain_s),
    records: [{ name: "HAL", url }],
    authors: list(w.authFullName_s).map((name): Author => {
      const id = halIds.get(name);
      return {
        name: clean(name),
        institutions: [],
        externalId: id ? `idhal:${id}` : undefined,
        profileUrl: id
          ? `https://cv.hal.science/${encodeURIComponent(id)}`
          : undefined,
      };
    }),
    supervisors: list(w.director_s)
      .filter((s) => typeof s === "string" && s.trim())
      .map((name) => ({
        name: clean(name),
        institutions: [],
        evidenceSource: "HAL · thesis director",
        evidenceUrl: url,
      })),
    context: list(w.authorityInstitution_s).map((name) => ({
      label: "Degree institution",
      name: clean(name),
    })),
    keywords: list(w.keyword_s).map(clean).filter(Boolean),
  };
}

function idrefPerson(p: any): Author {
  const ppn = /^[0-9]{8}[0-9X]$/i.test(p.ppn || "")
    ? String(p.ppn).toUpperCase()
    : undefined;
  return {
    name: [clean(p.prenom), clean(p.nom)].filter(Boolean).join(" "),
    externalId: ppn ? `idref:${ppn}` : undefined,
    profileUrl: ppn ? `https://www.idref.fr/${ppn}` : undefined,
    institutions: [],
  };
}
export function normalizeThesesFr(w: any, query = ""): Work {
  const nnt = String(w.nnt || w.id || "").toUpperCase();
  const url = `https://theses.fr/${encodeURIComponent(nnt)}`;
  const org = w.etabSoutenance || {
    nom: w.etabSoutenanceN,
    ppn: w.etabSoutenancePpn,
  };
  const organizations = [org, ...list(w.etabCotutelle)].filter((i) => i?.nom);
  return {
    ...base("theses.fr", `nnt:${nnt}`, query),
    identifiers: [`nnt:${nnt}`],
    doi: doiKey(w.doi) || undefined,
    title: clean(w.titreEN || w.titres?.en || w.titrePrincipal) || "Untitled",
    year:
      Number(String(w.dateSoutenance || "").match(/\b(?:19|20)\d{2}\b/)?.[0]) ||
      0,
    type: "doctoral thesis",
    level: "doctoral",
    abstract: clean(w.resumes?.en || w.resumes?.fr),
    url,
    records: [{ name: "theses.fr", url }],
    authors: list(w.auteurs)
      .map(idrefPerson)
      .filter((p) => p.name),
    supervisors: list(w.directeurs)
      .map((p) => ({
        ...idrefPerson(p),
        evidenceSource: "theses.fr · thesis director",
        evidenceUrl: url,
      }))
      .filter((p) => p.name),
    context: organizations.map((i) => ({
      label: "Degree institution",
      name: clean(i.nom),
      url: /^[0-9]{8}[0-9X]$/i.test(i.ppn || "")
        ? `https://www.idref.fr/${i.ppn}`
        : undefined,
    })),
    keywords: list(w.sujets)
      .map((s) => clean(s.libelle))
      .filter(Boolean),
  };
}

const openAireLevels = new Map<string, SupervisionLevel>([
  ["Doctoral thesis", "doctoral"],
  ["Master thesis", "master"],
  ["Bachelor thesis", "bachelor"],
  ["Thesis", "unknown"],
]);

export function normalizeOpenAire(w: any, query = ""): Work {
  const instances = list(w.instances);
  const levels = instances.map((i) => openAireLevels.get(i.type));
  const pids = [...list(w.pids), ...instances.flatMap((i) => list(i.pids))];
  const doi = doiKey(
    pids.find((p) => String(p.scheme).toLowerCase() === "doi")?.value,
  );
  const records = instances
    .flatMap((i) =>
      list(i.urls).map((url) => ({
        name: i.hostedBy?.value || "Repository",
        url: safeUrl(url) || "",
      })),
    )
    .filter((r) => r.url);
  const url =
    records[0]?.url ||
    (doi
      ? `https://doi.org/${doi}`
      : `https://explore.openaire.eu/search/publication?pid=${encodeURIComponent(w.id)}`);
  return {
    ...base("OpenAIRE", `openaire:${w.id}`, query),
    doi,
    url,
    title: clean(w.mainTitle) || "Untitled",
    year: Number(String(w.publicationDate || "").slice(0, 4)) || 0,
    level:
      levels.find((level) => level && level !== "unknown") ??
      levels.find((level) => level === "unknown"),
    type:
      instances.find((i) => /thesis/i.test(i.type))?.type ||
      instances[0]?.type ||
      w.type ||
      "unknown",
    abstract: list(w.descriptions).map(clean).filter(Boolean).join("\n\n"),
    records,
    identifiers: pids
      .filter((p) =>
        ["handle", "hal", "nnt"].includes(String(p.scheme).toLowerCase()),
      )
      .map(
        (p) =>
          `${String(p.scheme).toLowerCase()}:${p.scheme.toLowerCase() === "nnt" ? p.value.toUpperCase() : p.value}`,
      ),
    citedBy: Number(w.indicators?.citationImpact?.citationCount) || 0,
    authors: list(w.authors)
      .map((a): Author => ({
        name:
          [clean(a.name), clean(a.surname)].filter(Boolean).join(" ") ||
          clean(a.fullName),
        // OpenAIRE's "orcid_pending" is inferred, not a verified identity link.
        orcid:
          a.pid?.id?.scheme === "orcid"
            ? clean(a.pid.id.value) || undefined
            : undefined,
        institutions: [],
      }))
      .filter((a) => a.name),
    // These are work-level associations; they cannot establish any individual's employer.
    context: list(w.organizations)
      .map((o) => ({
        label: "Organization linked to work",
        name: clean(o.legalName),
        url: safeUrl(o.websiteurl),
      }))
      .filter((o) => o.name),
    keywords: list(w.subjects)
      .filter((s) => s.subject?.scheme === "keyword")
      .map((s) => clean(s.subject.value))
      .filter(Boolean),
  };
}
