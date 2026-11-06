
import assert from "node:assert/strict";
import { test } from "node:test";
import { StreamingPIIGuardrail } from "./guardrail.js";

function streamText(
  text: string,
  chunkSize: number
): string[] {
  const guardrail = new StreamingPIIGuardrail();
  const output: string[] = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    const safe = guardrail.push(
      text.slice(i, i + chunkSize)
    );

    if (safe) output.push(safe);
  }

  const final = guardrail.flush();
  if (final) output.push(final);

  return output;
}

test("redacts email split character by character", () => {
  const output = streamText(
    "Contact alice@example.com for help.",
    1
  );

  assert.equal(
    output.join(""),
    "Contact [REDACTED] for help."
  );
});

test("redacts SSN split across chunks", () => {
  const output = streamText(
    "SSN: 123-45-6789. Done.",
    1
  );

  assert.equal(
    output.join(""),
    "SSN: [REDACTED]. Done."
  );
});

test("redacts credit card split across chunks", () => {
  const output = streamText(
    "Card: 4111 1111 1111 1111. Done.",
    1
  );

  assert.equal(
    output.join(""),
    "Card: [REDACTED]. Done."
  );
});

test("redacts multiple PII values", () => {
  const output = streamText(
    "Email alice@example.com, SSN 123-45-6789, card 4111 1111 1111 1111!",
    3
  );

  const result = output.join("");

  assert.equal(
    result,
    "Email [REDACTED], SSN [REDACTED], card [REDACTED]!"
  );
});

test("streams safe text before completion", () => {
  const guardrail = new StreamingPIIGuardrail();

  const first = guardrail.push("Hello! Contact ");

  assert.ok(
    first.length > 0,
    "Expected safe text before flush()"
  );
});

test("handles long inputs without leaking PII", () => {
  const input =
    "A".repeat(300) +
    " alice@example.com is private.";

  const output = streamText(input, 1).join("");

  assert.ok(!output.includes("alice@example.com"));
  assert.ok(output.includes("[REDACTED]"));
});



test("does not leak fragments of oversized emails", () => {
  const email = "a".repeat(300) + "@example.com";
  const output = streamText(
    "Contact " + email + " for help.",
    1
  ).join("");

  assert.ok(
    !output.includes("@example.com"),
    "Email domain leaked after buffer overflow"
  );
});



test("does not expose any part of an oversized email", () => {
  const email = "a".repeat(300) + "@example.com";

  const result = streamText(
    "Contact " + email + " for help.",
    1
  ).join("");

  assert.equal(
    result,
    "Contact [REDACTED] for help."
  );
});



test("preserves text after an oversized spaced candidate", () => {
  const input =
    "Start! " +
    "4111 ".repeat(60) +
    "End.";

  const result = streamText(input, 1).join("");

  assert.ok(
    result.startsWith("Start! "),
    "Safe prefix was lost"
  );

  assert.ok(
    result.endsWith("End."),
    "Safe suffix was lost"
  );
});
