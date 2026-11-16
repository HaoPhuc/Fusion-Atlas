import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/research/route";
const request = (body: string, password = "") =>
  new NextRequest("https://example.org/api/research", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-site-password": password,
    },
    body,
  });
test("configuration reports booleans, never secret values", async () => {
  const key = process.env.OPENALEX_API_KEY;
  process.env.OPENALEX_API_KEY = "test-secret";
  try {
    const r = await GET();
    assert.equal((await r.text()).includes("test-secret"), false);
  } finally {
    if (key) process.env.OPENALEX_API_KEY = key;
    else delete process.env.OPENALEX_API_KEY;
  }
});
test("API rejects malformed JSON and invalid IDs without external requests", async () => {
  assert.equal((await POST(request("{"))).status, 400);
  assert.equal(
    (
      await POST(
        request(
          JSON.stringify({
            op: "graph",
            id: "https://attacker.example/private",
            mode: "author",
          }),
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await POST(
        request(
          JSON.stringify({
            op: "graph",
            id: "https://openalex.org/W1",
            mode: "author",
          }),
        ),
      )
    ).status,
    400,
  );
  assert.equal((await POST(request("x".repeat(10001)))).status, 413);
  assert.equal(
    (
      await POST(
        request(JSON.stringify({ op: "thesis", nnt: "../../private" })),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await POST(
        request(
          JSON.stringify({
            op: "graph",
            id: "doi:10.1234/test",
            mode: "author",
          }),
        ),
      )
    ).status,
    400,
  );
});
test("optional deployment password is enforced", async () => {
  process.env.SITE_PASSWORD = "test-only-password";
  try {
    assert.equal((await POST(request("{}"))).status, 401);
    assert.equal((await POST(request("{}", "test-only-password"))).status, 400);
  } finally {
    delete process.env.SITE_PASSWORD;
  }
});
