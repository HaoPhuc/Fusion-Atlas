export const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const orcidKey = (s?: string) =>
  s
    ?.replace(/^https?:\/\/orcid.org\//i, "")
    .replace(/\/$/, "")
    .toUpperCase();
