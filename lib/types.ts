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
  url?: string;
  ror?: string;
};
export type Author = {
  name: string;
  id?: string;
  orcid?: string;
  externalId?: string;
  profileUrl?: string;
  institutions: Institution[];
  corresponding?: boolean;
};
export type Supervisor = Author & {
  evidenceSource: string;
  evidenceUrl: string;
};
export type SourceRecord = { name: string; url: string };
export type Work = {
  id: string;
  doi?: string;
  title: string;
  year: number;
  type: string;
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
export type Saved = {
  person: Person;
  status: string;
  notes: string;
  savedAt: string;
};
