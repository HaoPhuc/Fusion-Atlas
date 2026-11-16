import { XMLParser } from "fast-xml-parser";
import type {
  Author,
  Institution,
  Provider,
  SearchOptions,
  Work,
} from "./types";
import { safeUrl, doiKey } from "./research";
import {
  HAL_FIELDS,
  normalizeHal,
  normalizeThesesFr,
  normalizeOpenAire,
} from "./repositories";

const array = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v: any): string =>
  typeof v === "string"
    ? v
    : typeof v?.["#text"] === "string"
      ? v["#text"]
      : "";
const clean = (s: any) =>
  text(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function abstractFromIndex(index: any): string {
  if (!index || typeof index !== "object") return "";
  const positions: string[] = [];
  for (const [word, spots] of Object.entries(index)) {
    for (const i of array(spots))
      if (Number.isInteger(i) && i >= 0 && i < 25000) positions[i] = word;
  }
  return positions.join(" ");
}
function workBase(provider: string, w: any, query: string): Work {
  return {
    id: `${provider}:${w.id}`,
    title: "",
    year: 0,
    type: "",
    abstract: "",
    url: "",
    authors: [],
    sources: [provider],
    queries: query ? [query] : [],
    citedBy: 0,
    references: [],
    discovered: "query",
    retrievedAt: new Date().toISOString(),
  };
}
export function normalizeOpenAlex(w: any, query = ""): Work {
  return {
    ...workBase("OpenAlex", w, query),
    id: w.id,
    openalexId: w.id,
    doi: doiKey(w.doi),
    title: w.display_name || w.title || "Untitled",
    year: w.publication_year || 0,
    type: w.type || "unknown",
    abstract: abstractFromIndex(w.abstract_inverted_index),
    url:
      safeUrl(w.doi) || safeUrl(w.primary_location?.landing_page_url) || w.id,
    pdf:
      safeUrl(w.best_oa_location?.pdf_url) ||
      safeUrl(w.primary_location?.pdf_url),
    citedBy: w.cited_by_count || 0,
    references: w.referenced_works || [],
    authors: array(w.authorships).map((a) => ({
      name: a.author?.display_name || "Unnamed author",
      id: a.author?.id || undefined,
      orcid: a.author?.orcid || undefined,
      corresponding: a.is_corresponding ?? undefined,
      institutions: array(a.institutions).map((i) => ({
        id: i.id || i.ror || i.display_name || "",
        name: i.display_name || "Unknown affiliation",
        country: i.country_code || undefined,
        ror: i.ror || undefined,
      })),
    })),
  };
}
export function normalizeCrossref(w: any, query = ""): Work {
  return {
    ...workBase("Crossref", { id: w.DOI }, query),
    doi: doiKey(w.DOI),
    title: clean(array(w.title)[0]) || "Untitled",
    year:
      w.published?.["date-parts"]?.[0]?.[0] ||
      w.created?.["date-parts"]?.[0]?.[0] ||
      0,
    type: w.type || "unknown",
    abstract: clean(w.abstract),
    url: safeUrl(w.URL) || `https://doi.org/${encodeURI(w.DOI)}`,
    citedBy: w["is-referenced-by-count"] || 0,
    authors: array(w.author).map((a) => ({
      name:
        [a.given, a.family].filter(Boolean).join(" ") ||
        a.name ||
        "Unnamed author",
      orcid: a.ORCID || undefined,
      institutions: array(a.affiliation).map((i) => ({
        id: i.name || "",
        name: i.name || "Unknown affiliation",
      })),
    })),
  };
}
export function normalizeDataCite(w: any, query = ""): Work {
  const a = w.attributes || {};
  const url = safeUrl(a.url) || `https://doi.org/${encodeURI(w.id)}`;
  return {
    ...workBase("DataCite", w, query),
    doi: doiKey(a.doi || w.id),
    title: clean(a.titles?.[0]?.title) || "Untitled",
    year: a.publicationYear || 0,
    type: a.types?.resourceTypeGeneral || a.types?.resourceType || "unknown",
    abstract: clean(
      array(a.descriptions).find((d) => d.descriptionType === "Abstract")
        ?.description,
    ),
    url,
    records: [
      {
        name: "DataCite",
        url: `https://commons.datacite.org/doi.org/${encodeURI(a.doi || w.id)}`,
      },
    ],
    supervisors: array(a.contributors)
      .filter(
        (c) =>
          /dissertation|thesis/i.test(
            `${a.types?.resourceTypeGeneral} ${a.types?.resourceType}`,
          ) && c.contributorType === "Supervisor",
      )
      .map((c) => ({
        name:
          [c.givenName, c.familyName].filter(Boolean).join(" ") || c.name || "",
        orcid:
          array(c.nameIdentifiers).find(
            (i) => i.nameIdentifierScheme === "ORCID",
          )?.nameIdentifier || undefined,
        institutions: array(c.affiliation).map((i) =>
          typeof i === "string"
            ? { id: i, name: i }
            : {
                id: i.affiliationIdentifier || i.name || "",
                name: i.name || "Unknown affiliation",
              },
        ),
        evidenceSource: "DataCite · Supervisor contributor",
        evidenceUrl: `https://commons.datacite.org/doi.org/${encodeURI(a.doi || w.id)}`,
      }))
      .filter((c) => c.name),
    authors: array(a.creators)
      .map((c) => ({
        name: c.name || [c.givenName, c.familyName].filter(Boolean).join(" "),
        orcid:
          array(c.nameIdentifiers).find(
            (i) => i.nameIdentifierScheme === "ORCID",
          )?.nameIdentifier || undefined,
        institutions: array(c.affiliation).map((i) =>
          typeof i === "string"
            ? { id: i, name: i }
            : {
                id: i.affiliationIdentifier || i.name || "",
                name: i.name || "Unknown affiliation",
              },
        ),
      }))
      .filter((a) => a.name),
  };
}
export function parseArxiv(xml: string, query = "") {
  const feed =
    new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      processEntities: false,
    }).parse(xml)?.feed || {};
  return {
    total: Number(feed.totalResults) || 0,
    works: array(feed.entry).map((e: any): Work => ({
      ...workBase("arXiv", { id: e.id }, query),
      id: e.id,
      title: clean(e.title),
      year: Number(String(e.published).slice(0, 4)) || 0,
      type: "preprint",
      abstract: clean(e.summary),
      doi: doiKey(text(e.doi)),
      url: safeUrl(e.id) || "",
      pdf: safeUrl(
        array(e.link).find((l) => l["@_title"] === "pdf")?.["@_href"],
      ),
      authors: array(e.author).map((a) => ({
        name: clean(a.name),
        institutions: array(a.affiliation).map((i) => ({
          id: clean(i),
          name: clean(i),
        })),
      })),
    })),
  };
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
const cache = new Map<string, { value: any; expires: number }>();
let arxivNext = 0;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function request(
  provider: Provider,
  path: string,
  params: Record<string, string | number>,
  xml = false,
) {
  const roots = {
    openalex: "https://api.openalex.org",
    crossref: "https://api.crossref.org",
    datacite: "https://api.datacite.org",
    arxiv: "https://export.arxiv.org",
    hal: "https://api.archives-ouvertes.fr",
    openaire: "https://api.openaire.eu",
    thesesfr: "https://theses.fr",
  };
  const u = new URL(path, roots[provider]);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "") u.searchParams.set(k, String(v));
  });
  if (provider === "openalex" && process.env.OPENALEX_API_KEY)
    u.searchParams.set("api_key", process.env.OPENALEX_API_KEY);
  if (
    (provider === "crossref" || provider === "openaire") &&
    process.env.CONTACT_EMAIL
  )
    u.searchParams.set("mailto", process.env.CONTACT_EMAIL);
  const cacheKey = u.href;
  const old = cache.get(cacheKey);
  if (old && old.expires > Date.now()) return old.value;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (provider === "arxiv") {
      const start = Math.max(Date.now(), arxivNext);
      arxivNext = start + 3100;
      await delay(start - Date.now());
    }
    let response: Response;
    try {
      response = await fetch(u, {
        headers: {
          "User-Agent": "FusionAtlas/1.0 (research discovery)",
          Accept: xml ? "application/atom+xml" : "application/json",
        },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
    } catch {
      if (!attempt) {
        await delay(700);
        continue;
      }
      throw new ProviderError(
        `${provider} could not be reached. Retry this source later.`,
      );
    }
    if (!response.ok) {
      const seconds = Number(response.headers.get("retry-after")) || 0;
      if (
        (response.status === 429 || response.status >= 500) &&
        !attempt &&
        seconds <= 3
      ) {
        await delay(Math.max(1000, seconds * 1000));
        continue;
      }
      throw new ProviderError(
        `${provider} returned HTTP ${response.status}. ${response.status === 429 ? "Rate limit or daily budget reached." : response.status === 401 || response.status === 403 ? "Check API access/key or source restrictions." : "The source may be temporarily unavailable."}`,
        response.status,
        seconds,
      );
    }
    const value = xml ? await response.text() : await response.json();
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { value, expires: Date.now() + 300000 });
    return value;
  }
  throw new ProviderError("Request failed");
}
export async function searchProvider(
  provider: Provider,
  query: string,
  page: number,
  cursor: string | undefined,
  options: SearchOptions,
) {
  const size = 50;
  let works: Work[] = [],
    total = 0,
    next: string | undefined;
  const warnings: string[] = [];
  if (provider === "openalex") {
    const filters = [
      `from_publication_date:${options.from}-01-01`,
      `to_publication_date:${options.to}-12-31`,
    ];
    if (options.country)
      filters.push(`institutions.country_code:${options.country}`);
    if (options.institution)
      filters.push(
        `institutions.id:${options.institution.id.split("/").pop()}`,
      );
    if (options.theses) filters.push("type:dissertation");
    const d = await request(provider, "/works", {
      search: query,
      filter: filters.join(","),
      per_page: size,
      cursor: cursor || "*",
    });
    works = array(d.results).map((w) => normalizeOpenAlex(w, query));
    total = d.meta?.count || 0;
    if (works.length && d.meta?.next_cursor && page * size < total) {
      if (process.env.OPENALEX_API_KEY) next = d.meta.next_cursor;
      else
        warnings.push(
          "OpenAlex paging stopped: add a free OPENALEX_API_KEY to continue beyond the first page.",
        );
    }
  } else if (provider === "crossref") {
    const filter = [
      `from-pub-date:${options.from}-01-01`,
      `until-pub-date:${options.to}-12-31`,
      ...(options.theses ? ["type:dissertation"] : []),
    ].join(",");
    const d = await request(provider, "/works", {
      "query.bibliographic": query,
      filter,
      rows: size,
      offset: (page - 1) * size,
    });
    works = array(d.message?.items).map((w) => normalizeCrossref(w, query));
    total = d.message?.["total-results"] || 0;
    if (works.length === size && page * size < Math.min(total, 10000))
      next = String(page + 1);
  } else if (provider === "datacite") {
    const tokens = query.match(/[\p{L}\p{N}]+/gu) || [];
    const lucene =
      tokens.map((t) => `"${t}"`).join(" AND ") +
      ` AND publicationYear:[${options.from} TO ${options.to}]` +
      (options.theses ? " AND types.resourceTypeGeneral:Dissertation" : "");
    const d = await request(provider, "/dois", {
      query: lucene,
      "page[size]": size,
      "page[number]": page,
      affiliation: "true",
    });
    works = array(d.data).map((w) => normalizeDataCite(w, query));
    total = d.meta?.total || 0;
    if (works.length === size && page * size < total) next = String(page + 1);
  } else if (provider === "hal") {
    const tokens = query.match(/[\p{L}\p{N}]+/gu) || [];
    const d = await request(provider, "/search/", {
      q: tokens.map((t) => `"${t}"`).join(" AND "),
      fq:
        `publicationDateY_i:[${options.from} TO ${options.to}]` +
        (options.theses ? " AND docType_s:(THESE OR HDR OR MEM)" : ""),
      fl: HAL_FIELDS,
      rows: size,
      start: (page - 1) * size,
      wt: "json",
      sort: "score desc,docid asc",
    });
    works = array(d.response?.docs).map((w) => normalizeHal(w, query));
    total = d.response?.numFound || 0;
    if (works.length === size && page * size < total) next = String(page + 1);
  } else if (provider === "openaire") {
    const d = await request(provider, "/graph/v4/research-products", {
      search: query,
      filter:
        `type:publication,from_publication_year:${options.from},to_publication_year:${options.to}` +
        (options.theses
          ? ",instance_type:Doctoral thesis|Master thesis|Thesis"
          : ""),
      page,
      page_size: size,
      sort: "relevance:desc",
    });
    works = array(d.results).map((w) => normalizeOpenAire(w, query));
    total = d.header?.numFound || 0;
    if (works.length === size && page * size < Math.min(total, 10000))
      next = String(page + 1);
  } else if (provider === "thesesfr") {
    const tokens = query.match(/[\p{L}\p{N}]+/gu) || [];
    const d = await request(provider, "/api/v1/theses/recherche/", {
      q:
        tokens.map((t) => `"${t}"`).join(" AND ") +
        ` AND status:soutenue AND dateSoutenance:[${options.from}-01-01 TO ${options.to}-12-31]`,
      debut: (page - 1) * size,
      nombre: size,
    });
    works = array(d.theses).map((w) => normalizeThesesFr(w, query));
    total = d.totalHits || 0;
    if (works.length === size && page * size < Math.min(total, 10000))
      next = String(page + 1);
  } else {
    if (options.theses)
      return {
        works: [],
        total: 0,
        warnings: [
          "arXiv skipped: it is a preprint index, not a thesis catalogue.",
        ],
      };
    const tokens = query.match(/[\p{L}\p{N}]+/gu) || [];
    const expression =
      tokens.map((t) => `all:"${t}"`).join(" AND ") +
      ` AND submittedDate:[${options.from}01010000 TO ${options.to}12312359]`;
    const xml = await request(
      provider,
      "/api/query",
      {
        search_query: expression,
        start: (page - 1) * size,
        max_results: size,
        sortBy: "relevance",
        sortOrder: "descending",
      },
      true,
    );
    const d = parseArxiv(xml, query);
    works = d.works;
    total = d.total;
    if (works.length === size && page * size < total) next = String(page + 1);
  }
  if (page >= 200 && next) {
    next = undefined;
    warnings.push(
      `${provider}: stopped at this app's 200-page limit. Narrow the query or date range for further coverage.`,
    );
  }
  if (provider !== "openalex" && (options.country || options.institution))
    warnings.push(
      `${provider} searches globally; records without resolvable affiliation metadata remain in the unknown-location pool. Only OpenAlex enforces the institution/country filter upstream.`,
    );
  return { works, total, next, warnings };
}
export async function thesisDetails(nnt: string) {
  const d = await request(
    "thesesfr",
    `/api/v1/theses/these/${encodeURIComponent(nnt)}`,
    {},
  );
  if (!d.nnt || d.status === "enCours")
    throw new ProviderError(
      "No completed thesis metadata found for this identifier.",
      404,
    );
  return { works: [normalizeThesesFr(d)] };
}
export async function findInstitutions(query: string, city = false) {
  const d = await request(
    "openalex",
    "/institutions",
    city
      ? { filter: `geo.city:${query}`, per_page: 20 }
      : { search: query, per_page: 20 },
  );
  return array(d.results).map((i: any): Institution => ({
    id: i.id,
    name: i.display_name,
    country: i.country_code,
    city: i.geo?.city,
    url: safeUrl(i.homepage_url),
    ror: i.ror,
  }));
}
export async function expandGraph(
  id: string,
  mode: "author" | "citations" | "references",
  page: number,
  cursor?: string,
) {
  let resolved: Work | undefined;
  if (id.startsWith("doi:")) {
    const seed = await request(
      "openalex",
      `/works/https://doi.org/${encodeURIComponent(id.slice(4))}`,
      {},
    );
    if (!/^https:\/\/openalex.org\/W\d+$/.test(seed.id || ""))
      throw new ProviderError("No OpenAlex work found for this DOI.", 404);
    id = seed.id;
    resolved = { ...normalizeOpenAlex(seed), discovered: "DOI lookup" };
  }
  const short = id.split("/").pop()!;
  if (mode === "author") {
    const profile = await request("openalex", `/authors/${short}`, {});
    const d = await request("openalex", "/works", {
      filter: `author.id:${short}`,
      sort: "publication_date:desc",
      per_page: 50,
      cursor: cursor || "*",
    });
    return {
      works: array(d.results).map((w) => ({
        ...normalizeOpenAlex(w),
        discovered: "author bibliography",
      })),
      profile: {
        name: profile.display_name,
        orcid: profile.orcid,
        affiliations: array(profile.affiliations).map((a) => ({
          name: a.institution?.display_name,
          years: a.years,
        })),
        lastKnown: array(profile.last_known_institutions).map(
          (i) => i.display_name,
        ),
      },
      total: d.meta?.count || 0,
      next:
        process.env.OPENALEX_API_KEY &&
        page < 200 &&
        array(d.results).length &&
        page * 50 < (d.meta?.count || 0)
          ? d.meta?.next_cursor
          : undefined,
      warnings: process.env.OPENALEX_API_KEY
        ? []
        : ["Free OpenAlex key needed for deeper paging."],
    };
  }
  if (mode === "references") {
    const seed = resolved
      ? { referenced_works: resolved.references }
      : await request("openalex", `/works/${short}`, {});
    const all = [
      ...new Set(
        array(seed.referenced_works).filter((v) =>
          /^https:\/\/openalex.org\/W\d+$/.test(v),
        ),
      ),
    ];
    const refs = all
      .slice((page - 1) * 50, page * 50)
      .map((v: string) => v.split("/").pop());
    const d = refs.length
      ? await request("openalex", "/works", {
          filter: `openalex_id:${refs.join("|")}`,
          per_page: 50,
        })
      : { results: [] };
    return {
      id,
      works: [
        ...(resolved ? [resolved] : []),
        ...array(d.results).map((w) => ({
          ...normalizeOpenAlex(w),
          discovered: "reference neighbor",
          relatedTo: [{ id, url: id, mode: "reference of" }],
        })),
      ],
      total: all.length,
      next: page < 200 && page * 50 < all.length ? String(page + 1) : undefined,
      warnings:
        page >= 200 && page * 50 < all.length
          ? ["Stopped at 10,000 reference IDs for this seed."]
          : [],
    };
  }
  const d = await request("openalex", "/works", {
    filter: `cites:${short}`,
    per_page: 50,
    cursor: cursor || "*",
  });
  return {
    id,
    works: [
      ...(resolved ? [resolved] : []),
      ...array(d.results).map((w) => ({
        ...normalizeOpenAlex(w),
        discovered: "citation neighbor",
        relatedTo: [{ id, url: id, mode: "cites" }],
      })),
    ],
    total: d.meta?.count || 0,
    next:
      process.env.OPENALEX_API_KEY &&
      page < 200 &&
      page * 50 < (d.meta?.count || 0)
        ? d.meta?.next_cursor
        : undefined,
    warnings: [
      ...(!process.env.OPENALEX_API_KEY
        ? ["Free OpenAlex key needed for deeper paging."]
        : []),
    ],
  };
}
