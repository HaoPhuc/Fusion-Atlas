import { z } from "zod";
import { PROVIDERS } from "./types";
const str = z.string().max(30000);
// Some older exports contain provider nulls for absent metadata.
const optionalString = str.nullish().transform((v) => v ?? undefined);
const institution = z.object({
  id: str,
  name: str,
  country: optionalString,
  city: optionalString,
  url: optionalString,
  ror: optionalString,
});
const author = z.object({
  name: str,
  id: optionalString,
  orcid: optionalString,
  externalId: optionalString,
  profileUrl: optionalString,
  institutions: z.array(institution).max(300),
  corresponding: z
    .boolean()
    .nullish()
    .transform((v) => v ?? undefined),
});
const work = z.object({
  id: str,
  doi: optionalString,
  title: str,
  year: z.number(),
  type: str,
  abstract: str,
  url: str,
  pdf: optionalString,
  authors: z.array(author).max(2000),
  supervisors: z
    .array(author.extend({ evidenceSource: str, evidenceUrl: str }))
    .max(200)
    .optional(),
  identifiers: z.array(str).max(500).optional(),
  records: z
    .array(z.object({ name: str, url: str }))
    .max(500)
    .optional(),
  context: z
    .array(z.object({ label: str, name: str, url: optionalString }))
    .max(500)
    .optional(),
  keywords: z.array(str).max(1000).optional(),
  relatedTo: z
    .array(z.object({ id: str, url: str, mode: str }))
    .max(1000)
    .optional(),
  sources: z.array(str),
  queries: z.array(str),
  citedBy: z.number(),
  references: z.array(str),
  openalexId: optionalString,
  discovered: str,
  retrievedAt: str,
});
const person = z.object({
  key: str,
  name: str,
  id: optionalString,
  orcid: optionalString,
  externalId: optionalString,
  profileUrl: optionalString,
  institutions: z.array(institution),
  works: z.array(work),
  authoredWorkIds: z.array(str).optional(),
  supervisedWorkIds: z.array(str).optional(),
  score: z.number(),
  matched: z.array(str),
  identity: str,
  corresponding: z.boolean(),
});
export const shortlistSchema = z
  .array(z.object({ person, status: str, notes: str, savedAt: str }))
  .max(1000);
export const shortlistBackupSchema = z.object({
  version: z.literal(1),
  kind: z.literal("shortlist"),
  shortlist: shortlistSchema,
});
export const sessionSchema = z.object({
  version: z.literal(1),
  topic: z.string().max(250),
  options: z
    .object({
      from: z.number().int().min(1950).max(2100),
      to: z.number().int().min(1950).max(2100),
      country: z.string().regex(/^$|^[A-Z]{2}$/),
      theses: z.boolean(),
      institution: institution.optional(),
    })
    .refine((o) => o.from <= o.to),
  tasks: z
    .array(
      z.object({
        provider: z.enum(PROVIDERS),
        query: z.string().min(2).max(250),
        page: z.number().int().min(1).max(200),
        cursor: str.optional(),
        total: z.number().optional(),
        done: z.boolean().optional(),
        error: str.optional(),
      }),
    )
    .max(64),
  works: z.array(work).max(20000),
  warnings: z.array(str).optional(),
  shortlist: shortlistSchema.optional(),
});
