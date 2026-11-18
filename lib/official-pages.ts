import https from "node:https";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";
import { load } from "cheerio";
import { normalize, safeUrl } from "./research";
import { institutionWebsite, ProviderError } from "./providers";
import type { Verification } from "./matching";

const UA = "FusionAtlasBot/2.0";
const MAX_BYTES = 900_000;
const pageCache = new Map<string, { value: Page; expires: number }>();
const robotsCache = new Map<string, { text: string; expires: number }>();
type Page = { url: string; html: string; title: string };
type Candidate = {
  personKey: string;
  name: string;
  institutionId?: string;
  institutionName?: string;
  pageUrl?: string;
};

// Discovery anchors only. Programme availability and personal roles are always read live.
const anchors = [
  {
    rx: /australian national university/i,
    name: "Australian National University",
    root: "https://anu.edu.au/",
    paths: [
      "https://physics.anu.edu.au/study/projects/project.php?ProjectID=14",
    ],
  },
  {
    rx: /university of wisconsin[– -]+madison/i,
    name: "University of Wisconsin–Madison",
    root: "https://wisc.edu/",
    paths: [
      "https://engineering.wisc.edu/departments/nuclear-engineering-engineering-physics/research/experimental-plasma-physics/",
    ],
  },
  {
    rx: /university of tokyo/i,
    name: "The University of Tokyo",
    root: "https://u-tokyo.ac.jp/",
    paths: ["https://www.mgs.k.u-tokyo.ac.jp/fusion-pro/en/lab/"],
  },
  {
    rx: /massachusetts institute of technology|\bmit\b/i,
    name: "MIT Plasma Science and Fusion Center",
    root: "https://psfc.mit.edu/",
    paths: [
      "https://www.psfc.mit.edu/people/",
      "https://www.psfc.mit.edu/undergrad-education/urop/",
    ],
  },
  {
    rx: /princeton plasma physics|\bpppl\b/i,
    name: "Princeton Plasma Physics Laboratory",
    root: "https://pppl.gov/",
    paths: [
      "https://www.pppl.gov/people",
      "https://www.pppl.gov/science-undergraduate-laboratory-internships-suli",
    ],
  },
  {
    rx: /dutch institute for fundamental energy|\bdiffer\b/i,
    name: "DIFFER",
    root: "https://www.differ.nl/",
    paths: [
      "https://www.differ.nl/research/fusion",
      "https://www.differ.nl/working-at/internships-and-thesis-projects",
    ],
  },
  {
    rx: /technical university of munich|technische universität münchen/i,
    name: "Technical University of Munich",
    root: "https://tum.de/",
    paths: [
      "https://www.math.cit.tum.de/en/math/research/groups/numerical-methods-plasma-physics/",
    ],
  },
  {
    rx: /max planck institute for plasma|institut fur plasmaphysik/i,
    name: "Max Planck Institute for Plasma Physics",
    root: "https://ipp.mpg.de/",
    paths: [],
  },
  {
    rx: /united kingdom atomic energy|\bukaea\b|culham centre/i,
    name: "UK Atomic Energy Authority",
    root: "https://ukaea.uk/",
    paths: [
      "https://careers.ukaea.uk/early-careers/placements-and-work-experience/",
    ],
  },
];
export function publicAddress(address: string) {
  try {
    const a = ipaddr.process(address);
    return a.range() === "unicast";
  } catch {
    return false;
  }
}
export function validatePageUrl(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    !u.hostname.includes(".") ||
    /\.(localhost|local|internal|test|invalid)$/i.test(u.hostname) ||
    u.hostname === "localhost"
  )
    throw new Error("Use a public HTTPS institution page.");
  if (ipaddr.isValid(u.hostname.replace(/^\[|\]$/g, "")))
    throw new Error("IP-address URLs are not supported.");
  u.hash = "";
  return u;
}
export function withinOfficialDomain(url: string, root: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const base = new URL(root).hostname.toLowerCase().replace(/^www\./, "");
    return host === base || host.endsWith("." + base);
  } catch {
    return false;
  }
}
async function rawPage(
  value: string,
  root: string,
  deadline: number,
): Promise<{
  url: string;
  body: string;
  status: number;
  type: string;
  redirect?: string;
}> {
  const u = validatePageUrl(value);
  if (!withinOfficialDomain(u.href, root))
    throw new Error("Page is outside the institution's official domain.");
  if (Date.now() >= deadline) throw new Error("Official page check timed out.");
  const addresses = await Promise.race([
    lookup(u.hostname, { all: true }),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("DNS lookup timed out.")),
        Math.min(4000, deadline - Date.now()),
      );
      timer.unref();
    }),
  ]);
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("This address is not a public website.");
  // Pin the validated DNS answer to the socket, including every redirect, to prevent rebinding.
  const address = addresses.find((a) => a.family === 4) || addresses[0];
  const result = await new Promise<{
    status: number;
    headers: Record<string, any>;
    body: string;
  }>((resolve, reject) => {
    const req = https.get(
      u,
      {
        agent: false,
        family: address.family,
        headers: {
          "User-Agent": UA,
          Accept: "text/html,text/plain",
          "Accept-Encoding": "identity",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(new Error("Page exceeds the reading limit."));
          } else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", reject);
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("Official page timed out.")),
      Math.max(1, Math.min(5000, deadline - Date.now())),
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
  if (
    [301, 302, 303, 307, 308].includes(result.status) &&
    result.headers.location
  ) {
    return {
      url: u.href,
      body: "",
      status: result.status,
      type: "",
      redirect: new URL(result.headers.location, u).href,
    };
  }
  return {
    url: u.href,
    body: result.body,
    status: result.status,
    type: String(result.headers["content-type"] || ""),
  };
}
async function readPage(
  url: string,
  root: string,
  deadline: number,
  redirects = 0,
): Promise<Page> {
  validatePageUrl(url);
  if (!withinOfficialDomain(url, root))
    throw new Error("Redirect left the official institution domain.");
  const old = pageCache.get(url);
  if (old && old.expires > Date.now()) return old.value;
  const robotsUrl = new URL("/robots.txt", url).href;
  let rules = robotsCache.get(robotsUrl);
  if (!rules || rules.expires < Date.now()) {
    let response = await rawPage(robotsUrl, root, deadline);
    for (let hops = 0; response.redirect && hops < 2; hops++)
      response = await rawPage(response.redirect, root, deadline);
    if (![200, 404, 410].includes(response.status))
      throw new Error("Could not establish this site's crawler rules.");
    rules = {
      text: response.status === 200 ? response.body : "",
      expires: Date.now() + 86400000,
    };
    if (robotsCache.size >= 100)
      robotsCache.delete(robotsCache.keys().next().value!);
    robotsCache.set(robotsUrl, rules);
  }
  if (robotsParser(robotsUrl, rules.text).isAllowed(url, UA) === false)
    throw new Error("This site disallows automated reading of this page.");
  const r = await rawPage(url, root, deadline);
  if (r.redirect) {
    if (redirects >= 2) throw new Error("Too many website redirects.");
    return readPage(r.redirect, root, deadline, redirects + 1);
  }
  if (r.status !== 200)
    throw new Error(`Official page returned HTTP ${r.status}.`);
  if (!r.type.includes("text/html"))
    throw new Error("Only HTML pages are read automatically.");
  const $ = load(r.body);
  const page = {
    url: r.url,
    html: r.body,
    title: $("title").text().trim().slice(0, 300),
  };
  if (pageCache.size >= 100) pageCache.delete(pageCache.keys().next().value!);
  pageCache.set(url, { value: page, expires: Date.now() + 3600000 });
  return page;
}
const roleRx =
  /\b(professor|principal (?:research )?(?:scientist|investigator)|(?:research |group |project |team )leader|head of|research scientist|staff scientist|senior scientist|research fellow|chercheur|directeur de recherche)\b/i;
const pastRx =
  /\b(former|retired|emeritus|alumni|alumnus|in memoriam|past members)\b/i;
export function extractPageEvidence(
  html: string,
  url: string,
  name: string,
): {
  evidence: Verification["evidence"];
  links: { url: string; label: string; score: number }[];
  title: string;
} {
  const $ = load(html);
  $(
    "script,style,noscript,svg,nav,header,footer,[role=navigation],.breadcrumb,.breadcrumbs,.menu",
  ).remove();
  const title = $("title").text().trim().slice(0, 300);
  const person = normalize(name);
  const parts = person.split(" ");
  const names = [person, [parts.at(-1), ...parts.slice(0, -1)].join(" ")];
  const fullName = (t: string) =>
    parts.length >= 2 &&
    names.some((n) => (" " + normalize(t) + " ").includes(" " + n + " "));
  const headingName = (t: string) =>
    names.includes(
      normalize(t).replace(/^(?:(?:dr|prof|professor|mr|ms) )+/, ""),
    );
  const textOf = (el: ReturnType<typeof $>) =>
    el.text().replace(/\s+/g, " ").trim();
  // Omit former-member lists following a historical section heading.
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    if (!pastRx.test(textOf($(el)))) return;
    const level = Number(el.tagName.slice(1));
    const boundaries = Array.from(
      { length: level },
      (_, i) => "h" + (i + 1),
    ).join(",");
    $(el).nextUntil(boundaries).remove();
    $(el).remove();
  });
  const evidence: Verification["evidence"] = [];
  const add = (
    kind: Verification["evidence"][number]["kind"],
    text: string,
  ) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (
      cleaned &&
      !evidence.some((e) => e.kind === kind && e.text === cleaned.slice(0, 650))
    )
      evidence.push({ kind, text: cleaned.slice(0, 650), url, title });
  };
  const headings = $("h1").toArray();
  const personal =
    headings.length === 1 &&
    headingName(textOf($(headings[0]))) &&
    !pastRx.test(title);
  const blocks = $("p,li,tr,article,section,div,dt,dd")
    .toArray()
    .map((el) => textOf($(el)))
    .filter((t) => t.length > 4 && t.length < 650);
  const named = blocks.filter(fullName).sort((a, b) => a.length - b.length);
  if (personal || named.length) add("name", named[0] || name);
  // Labeled fields are common in project listings even when the named supervisor has no staff profile.
  for (const t of named) {
    if (pastRx.test(t) || t.length > 360) continue;
    const label = t.match(
      /\b(group leader|principal investigator|project supervisor|thesis supervisor)\s*:\s*(.+?)\s*$/i,
    );
    if (label && headingName(label[2])) add("role", label[0]);
  }
  $("h2,h3,h4,dt").each((_, el) => {
    const heading = textOf($(el));
    if (
      !/^(?:contact supervisor|project supervisor|group leader|principal investigator)$/i.test(
        heading,
      )
    )
      return;
    const field = $(el).next();
    if (
      headingName(textOf(field)) ||
      (field.find("a").length === 1 &&
        headingName(textOf(field.find("a"))) &&
        textOf(field).length < 120)
    ) {
      add("role", heading + " — " + name);
      if (/^contact supervisor$/i.test(heading))
        add("contact", heading + " — " + name);
    }
  });
  // Require an explicit name/role statement within an individual text field.
  for (const el of $("p,li,td,dd,[itemprop=jobTitle]").toArray()) {
    const t = textOf($(el));
    if (
      !fullName(t) ||
      t.length > 160 ||
      pastRx.test(t) ||
      $(el).find("p,li,dd,h1,h2,h3,h4,br").length
    )
      continue;
    const line = normalize(t);
    for (const n of names) {
      const at = line.indexOf(n);
      if (at < 0) continue;
      const before = line.slice(0, at).trim(),
        after = line.slice(at + n.length).trim();
      const next = after.replace(/^(?:is |serves as )?(?:a |an |the )?/, "");
      if (
        (roleRx.exec(next)?.index === 0 &&
          /^(?:dr|prof|prof dr)?$/.test(before)) ||
        (roleRx.test(before) &&
          !after &&
          /(?:leader|professor|investigator|scientist|fellow|head)(?: dr)?$/.test(
            before,
          ))
      )
        add("role", t);
    }
  }
  if (personal) {
    const heading = $(headings[0]);
    const job = heading
      .next()
      .toArray()
      .map((e) => textOf($(e)))
      .find(
        (t) => t.length < 120 && roleRx.exec(t)?.index === 0 && !pastRx.test(t),
      );
    if (job) add("role", name + " — " + job);
    const surname = parts.at(-1) || "";
    const compact = (s: string) => normalize(s).replaceAll(" ", "");
    const individualEmails = new Set(
      [
        parts[0] + "." + surname,
        parts[0][0] + surname,
        person,
        parts
          .map((p) => p[0])
          .slice(0, -1)
          .join("") + surname,
        surname + "." + parts[0],
      ].map(compact),
    );
    for (const el of $("a[href^='mailto:']").toArray()) {
      const email = ($(el).attr("href") || "").slice(7).split("?")[0];
      if (
        /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email) &&
        individualEmails.has(compact(email.split("@")[0]))
      ) {
        add("contact", "Published profile contact for " + name + " — " + email);
        break;
      }
    }
  }
  // Opportunity/eligibility passages are institution-level context, never personal availability.
  for (const text of blocks) {
    if (
      /undergraduate|bachelor|summer (?:internship|placement)|UROP/i.test(
        text,
      ) &&
      /\bapply\b|application|placements?|internships?|student projects?|research projects? for|eligib|vacation scholar/i.test(
        text,
      )
    )
      add("undergraduate", text);
    if (
      /undergraduate|UROP|internship|placement/i.test(text) &&
      /only|eligib|must |require|citizen|enrolled|funding|stipend/i.test(text)
    )
      add("requirements", text);
  }
  const links = $("a[href]")
    .toArray()
    .flatMap((el) => {
      const a = $(el);
      const href = a.attr("href") || "";
      const label = a.text().replace(/\s+/g, " ").trim();
      let target: URL;
      try {
        target = new URL(href, url);
      } catch {
        return [];
      }
      if (
        target.protocol !== "https:" ||
        /\.(pdf|zip|jpg|png|docx?)$/i.test(target.pathname)
      )
        return [];
      target.hash = "";
      const words = label + " " + target.pathname;
      if (
        /^(?:news|events)\./.test(target.hostname) ||
        /\/(?:news|events|press-releases)\//.test(target.pathname)
      )
        return [];
      const score =
        (fullName(words) ? 100 : 0) +
        (/people|staff|team|members|directory/i.test(words) ? 15 : 0) +
        (/plasma|fusion|research|group/i.test(words) ? 8 : 0) +
        (/undergraduate|internship|placement|student/i.test(words) ? 10 : 0);
      return score ? [{ url: target.href, label, score }] : [];
    })
    .sort((a, b) => b.score - a.score);
  return {
    evidence: evidence
      .sort((a, b) => a.text.length - b.text.length)
      .filter((e, i, all) => all.findIndex((s) => s.kind === e.kind) === i),
    links,
    title,
  };
}
async function searchOfficial(name: string, root: string) {
  if (!process.env.BRAVE_SEARCH_API_KEY) return [];
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set(
    "q",
    `site:${new URL(root).hostname.replace(/^www\./, "")} "${name.replace(/["\\]/g, "")}"`,
  );
  url.searchParams.set("count", "5");
  url.searchParams.set("text_decorations", "false");
  const r = await fetch(url, {
    headers: {
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  if (!r.ok)
    throw new Error(`Official-page discovery returned HTTP ${r.status}.`);
  const d = await r.json();
  return (d.web?.results || [])
    .map((r: any) => safeUrl(r.url))
    .filter((u: string) => u && withinOfficialDomain(u, root))
    .slice(0, 3) as string[];
}
export async function verifyCandidate(c: Candidate): Promise<Verification> {
  const deadline = Date.now() + 25000;
  const result: Verification = {
    personKey: c.personKey,
    name: c.name,
    checkedAt: new Date().toISOString(),
    institution: c.institutionName || "Unresolved institution",
    affiliation: c.institutionName,
    officialDomain: "",
    status: "not-found",
    evidence: [],
    pages: [],
    warnings: [],
  };
  const anchor = anchors.find((a) => a.rx.test(c.institutionName || ""));
  let root = anchor?.root;
  if (anchor) result.institution = anchor.name;
  if (!root && c.institutionId) {
    const inst = await institutionWebsite(c.institutionId);
    root = inst.url;
    result.institution = inst.name;
  }
  if (!root) {
    result.warnings.push(
      "No trusted institution website could be resolved from this person's indexed affiliation. Try a candidate with an institution ID; thesis degree institutions do not establish employment.",
    );
    return result;
  }
  root = root.replace(/^http:/, "https:");
  result.officialDomain = new URL(root).hostname;
  if (c.pageUrl && !withinOfficialDomain(c.pageUrl, root))
    throw new ProviderError(
      "Use a page on " + result.officialDomain + " for this institution.",
      400,
    );
  const queue = [...(anchor?.paths || []), root].filter(Boolean) as string[];
  try {
    queue.unshift(...(await searchOfficial(c.name, root)));
  } catch (e) {
    result.warnings.push((e as Error).message);
  }
  if (c.pageUrl) queue.unshift(c.pageUrl);
  const visited = new Set<string>();
  while (queue.length && visited.size < 5 && Date.now() < deadline) {
    const url = queue.shift()!;
    if (visited.has(url) || !withinOfficialDomain(url, root)) continue;
    visited.add(url);
    try {
      const p = await readPage(url, root, deadline);
      const extracted = extractPageEvidence(p.html, p.url, c.name);
      result.pages.push({ url: p.url, title: extracted.title });
      for (const e of extracted.evidence)
        if (
          !result.evidence.some(
            (old) => old.kind === e.kind && old.text === e.text,
          )
        )
          result.evidence.push(e);
      const next = extracted.links.filter(
        (l) => !visited.has(l.url) && withinOfficialDomain(l.url, root),
      );
      queue.unshift(...next.filter((l) => l.score >= 100).map((l) => l.url));
      queue.push(
        ...next
          .filter((l) => l.score < 100)
          .slice(0, 8)
          .map((l) => l.url),
      );
      if (
        result.evidence.some((e) => e.kind === "role") &&
        result.evidence.some((e) => e.kind === "contact")
      )
        break;
    } catch (e) {
      result.warnings.push(`${new URL(url).hostname}: ${(e as Error).message}`);
    }
  }
  result.evidence = result.evidence.slice(0, 25);
  result.warnings = [...new Set(result.warnings)].slice(0, 20);
  result.status = result.evidence.some((e) => e.kind === "role")
    ? "evidence-found"
    : result.evidence.some((e) => e.kind === "name")
      ? "partial"
      : result.pages.length
        ? "not-found"
        : "unavailable";
  if (!process.env.BRAVE_SEARCH_API_KEY)
    result.warnings.push(
      "Used a bounded website crawl. Optional Brave Search API access can locate deeper official profiles; manual page URLs also work.",
    );
  result.warnings.push(
    "Name/role matches are automated evidence, not independently confirmed identity or internship availability. Institution-level opportunities may have separate eligibility rules.",
  );
  return result;
}
