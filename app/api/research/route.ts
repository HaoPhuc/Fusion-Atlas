import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  findInstitutions,
  searchProvider,
  expandGraph,
  ProviderError,
  thesisDetails,
} from "@/lib/providers";
import { PROVIDERS } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 60;
const identifier = z.string().regex(/^https:\/\/openalex.org\/[IAW]\d+$/);
const schema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("thesis"),
    nnt: z.string().regex(/^[12][0-9]{3}[A-Z0-9]{8}$/),
  }),
  z.object({
    op: z.literal("institutions"),
    query: z.string().trim().min(2).max(200),
    city: z.boolean().default(false),
  }),
  z.object({
    op: z.literal("search"),
    provider: z.enum(PROVIDERS),
    query: z.string().trim().min(2).max(250),
    page: z.number().int().min(1).max(200).default(1),
    cursor: z.string().max(2048).optional(),
    options: z
      .object({
        from: z.number().int().min(1950).max(2100),
        to: z.number().int().min(1950).max(2100),
        country: z.string().regex(/^$|^[A-Z]{2}$/),
        theses: z.boolean(),
        institution: z
          .object({
            id: identifier.refine((v) => v.includes("/I")),
            name: z.string().max(300),
            country: z.string().optional(),
            city: z.string().optional(),
            url: z.string().optional(),
            ror: z.string().optional(),
          })
          .optional(),
      })
      .refine((o) => o.from <= o.to),
  }),
  z
    .object({
      op: z.literal("graph"),
      id: z.union([
        identifier,
        z
          .string()
          .max(300)
          .regex(/^doi:10\.\d{4,9}\/[^\s]+$/i),
      ]),
      mode: z.enum(["author", "citations", "references"]),
      page: z.number().int().min(1).max(200).default(1),
      cursor: z.string().max(2048).optional(),
    })
    .refine((v) =>
      v.mode === "author"
        ? /^https:\/\/openalex.org\/A\d+$/.test(v.id)
        : /^https:\/\/openalex.org\/W\d+$/.test(v.id) ||
          v.id.startsWith("doi:"),
    ),
]);
function authorized(req: NextRequest) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return true;
  const provided = req.headers.get("x-site-password") || "";
  const a = Buffer.from(expected),
    b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function GET() {
  return NextResponse.json(
    {
      openalexKey: !!process.env.OPENALEX_API_KEY,
      contactEmail: !!process.env.CONTACT_EMAIL,
      passwordRequired: !!process.env.SITE_PASSWORD,
      providers: PROVIDERS,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: NextRequest) {
  if (!authorized(req))
    return NextResponse.json(
      { error: "Enter this deployment’s access password in Connections." },
      { status: 401 },
    );
  try {
    const raw = await req.text();
    if (raw.length > 10000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request." },
        { status: 400 },
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            "Invalid search parameters. Check the query, dates, and institution ID.",
        },
        { status: 400 },
      );
    const v = parsed.data;
    let result;
    if (v.op === "thesis") result = await thesisDetails(v.nnt);
    else if (v.op === "institutions")
      result = { institutions: await findInstitutions(v.query, v.city) };
    else if (v.op === "graph")
      result = await expandGraph(v.id, v.mode, v.page, v.cursor);
    else
      result = await searchProvider(
        v.provider,
        v.query,
        v.page,
        v.cursor,
        v.options,
      );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const err =
      e instanceof ProviderError
        ? e
        : new ProviderError("The request failed. Please retry.");
    return NextResponse.json(
      { error: err.message, retryAfter: err.retryAfter },
      { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
    );
  }
}
