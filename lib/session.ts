import { boardSchema, countryCode } from "./regions";
import { z } from "zod";
import { PROVIDERS, SUPERVISION_LEVELS } from "./types";
import { matchingStateSchema } from "./matching";
import { seenLedgerSchema } from "./seen";
const str = z.string().max(30000);
// Some older exports contain provider nulls for absent metadata.
const optionalString = str.nullish().transform((v) => v ?? undefined);
const institution = z.object({
  id: str,
  name: str,
  country: optionalString,
  city: optionalString,
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  url: optionalString,
  ror: optionalString,
});
const author = z.object({
  name: str,
  id: optionalString,
  orcid: optionalString,
  externalId: optionalString,
  previousNameKeys: z.array(str).max(2000).optional(),
  additionalExternalIds: z.array(str).max(500).optional(),
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
  level: z.enum(SUPERVISION_LEVELS).optional(),
  // Repository descriptions can exceed 30,000 characters. Imports already cap the whole file at 25 MB.
  abstract: z.string().max(25_000_000),
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
  officialGroup: optionalString,
  officialRoleSource: optionalString,
  key: str,
  aliases: z.array(str).max(50000).optional(),
  mergedBy: z
    .array(
      z.object({
        rule: z.enum(["identifier", "name-institution", "manual"]),
        detail: str,
      }),
    )
    .max(50000)
    .optional(),
  possibleDuplicates: z
    .array(z.object({ key: str, name: str, reason: str }))
    .max(5)
    .optional(),
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
  seen: seenLedgerSchema.optional(),
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
  board: boardSchema.optional(),
  tasks: z
    .array(
      z.object({
        provider: z.enum(PROVIDERS),
        countries: z.array(countryCode).min(1).max(100).optional(),
        query: z.string().min(2).max(250),
        page: z.number().int().min(1).max(200),
        cursor: str.optional(),
        total: z.number().optional(),
        done: z.boolean().optional(),
        error: str.optional(),
      }),
    )
    .max(512),
  works: z.array(work).max(20000),
  warnings: z.array(str).optional(),
  shortlist: shortlistSchema.optional(),
  matching: matchingStateSchema.optional(),
});
