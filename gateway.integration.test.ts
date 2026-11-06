
import test from "node:test";
import assert from "node:assert/strict";

test("gateway redacts fragmented upstream PII", async () => {
  const response = await fetch(
    "http://127.0.0.1:4000/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }
  );

  assert.equal(response.status, 200);

  const body = await response.text();

  assert.ok(body.includes("[REDACTED]"));
  assert.ok(body.includes("data: [DONE]"));

  assert.equal(body.includes("alice@example.com"), false);
  assert.equal(body.includes("123-45-6789"), false);
  assert.equal(body.includes("4111 1111 1111 1111"), false);

  const events = body
    .split(/\r?\n\r?\n/)
    .filter(event => event.startsWith("data: "));

  assert.ok(events.length >= 2);
});
