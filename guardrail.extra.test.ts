
import test from "node:test";
import assert from "node:assert/strict";
import { StreamingPIIGuardrail } from "./guardrail.js";

function processChunks(chunks: string[]): string {
  const guard = new StreamingPIIGuardrail();
  let output = "";

  for (const chunk of chunks) {
    output += guard.push(chunk);
  }

  return output + guard.flush();
}

function characterChunks(text: string): string[] {
  return [...text];
}

test("redacts email with dots in local part", () => {
  const result = processChunks(
    characterChunks("Email first.last@example.com now")
  );

  assert.equal(result, "Email [REDACTED] now");
});

test("redacts email with plus alias", () => {
  const result = processChunks(
    characterChunks("Contact alice+work@example.com today")
  );

  assert.equal(result, "Contact [REDACTED] today");
});

test("redacts hyphen-separated credit card", () => {
  const result = processChunks(
    characterChunks("Card 4111-1111-1111-1111 confirmed")
  );

  assert.equal(result, "Card [REDACTED] confirmed");
});

test("redacts contiguous credit card", () => {
  const result = processChunks(
    characterChunks("Card 4111111111111111 confirmed")
  );

  assert.equal(result, "Card [REDACTED] confirmed");
});

test("preserves ordinary text", () => {
  const result = processChunks(
    characterChunks("Hello world! This is safe.")
  );

  assert.equal(result, "Hello world! This is safe.");
});

test("handles PII at end of stream", () => {
  const result = processChunks(
    characterChunks("SSN: 123-45-6789")
  );

  assert.equal(result, "SSN: [REDACTED]");
});

test("handles multiple consecutive PII values", () => {
  const result = processChunks(
    characterChunks(
      "alice@example.com 123-45-6789 4111111111111111"
    )
  );

  assert.equal(
    result,
    "[REDACTED] [REDACTED] [REDACTED]"
  );
});

test("does not expose sensitive text in intermediate output", () => {
  const guard = new StreamingPIIGuardrail();
  const chunks = characterChunks(
    "Contact alice@example.com for help"
  );

  let output = "";

  for (const chunk of chunks) {
    output += guard.push(chunk);

    assert.equal(
      output.includes("alice@example.com"),
      false
    );
  }

  output += guard.flush();

  assert.equal(output, "Contact [REDACTED] for help");
});
