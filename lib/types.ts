export const PROVIDERS = [
  "openalex",
  "crossref",
  "datacite",
  "arxiv",
  "hal",
  "openaire",
  "thesesfr",
] as const;
export type Provider = (typeof PROVIDERS)[number];
export const providerNames: Record<Provider, string> = {
  openalex: "OpenAlex",
  crossref: "Crossref",
  datacite: "DataCite",
  arxiv: "arXiv",
  hal: "HAL / TEL",
  openaire: "OpenAIRE",
  thesesfr: "theses.fr",
};
export type Institution = {
  id: string;
  name: string;
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
  url?: string;
  ror?: string;
};
export type Author = {
  name: string;
  id?: string;
  orcid?: string;
  externalId?: string;
  // Identity evidence retained when two provider records describe one work.
  previousNameKeys?: string[];
  additionalExternalIds?: string[];
  profileUrl?: string;
  institutions: Institution[];
  corresponding?: boolean;
};
export type Supervisor = Author & {
  evidenceSource: string;
  evidenceUrl: string;
};
export type SourceRecord = { name: string; url: string };
export const SUPERVISION_LEVELS = [
  "bachelor",
  "master",
  "doctoral",
  "habilitation",
  "unknown",
] as const;
export type SupervisionLevel = (typeof SUPERVISION_LEVELS)[number];
export type Work = {
  id: string;
  doi?: string;
  title: string;
  year: number;
  type: string;
  level?: SupervisionLevel;
  abstract: string;
  url: string;
  pdf?: string;
  authors: Author[];
  supervisors?: Supervisor[];
  identifiers?: string[];
  records?: SourceRecord[];
  context?: { label: string; name: string; url?: string }[];
  keywords?: string[];
  relatedTo?: { id: string; url: string; mode: string }[];
  sources: string[];
  queries: string[];
  citedBy: number;
  references: string[];
  openalexId?: string;
  discovered: string;
  retrievedAt: string;
};
export type SearchTask = {
  countries?: string[];
  provider: Provider;
  query: string;
  cursor?: string;
  page: number;
  total?: number;
  done?: boolean;
  error?: string;
};
export type SearchOptions = {
  from: number;
  to: number;
  country: string;
  institution?: Institution;
  theses: boolean;
};
export type Person = {
  officialGroup?: string;
  officialRoleSource?: string;
  key: string;
  aliases?: string[];
  mergedBy?: {
    rule: "identifier" | "name-institution" | "manual";
    detail: string;
  }[];
  possibleDuplicates?: { key: string; name: string; reason: string }[];
  name: string;
  id?: string;
  orcid?: string;
  externalId?: string;
  profileUrl?: string;
  institutions: Institution[];
  works: Work[];
  authoredWorkIds?: string[];
  supervisedWorkIds?: string[];
  score: number;
  matched: string[];
  identity: string;
  corresponding: boolean;
};
export type IdentityDecision = {
  keys: string[];
  decision: "same" | "different";
  decidedAt: string;
};
export type Saved = {
  person: Person;
  status: string;
  notes: string;
  savedAt: string;
};
