# LLM Gateway Streaming Guardrail — PII Redaction

A lightweight, TypeScript-based LLM Gateway that proxies text generation requests to an upstream LLM provider, intercepts streaming responses, and automatically redacts Personally Identifiable Information (PII) before forwarding content to clients.

The implementation focuses on **low-latency streaming, efficient asynchronous processing, cross-chunk pattern detection, and bounded-memory buffering**.

## Key Features

- **Real-Time LLM Proxy:** Routes HTTP text generation requests to an upstream provider and streams responses using Server-Sent Events (SSE).
- **Streaming PII Redaction:** Detects email addresses, Social Security Numbers (SSNs), and credit card numbers, replacing detected values with `[REDACTED]`.
- **Cross-Chunk Detection:** Maintains incremental parsing state to detect sensitive information split across multiple streaming deltas.
- **Low-Latency Processing:** Forwards safe output incrementally without waiting for the complete LLM response.
- **Memory Management:** Uses bounded candidate buffers and limits incomplete SSE frames to 1 MB.
- **Asynchronous Backpressure:** Respects downstream writable-stream backpressure to avoid uncontrolled output buffering.
- **Error Handling:** Handles provider unavailability, interrupted streams, malformed SSE JSON, and client disconnections.
- **Automated Testing:** Includes unit tests and an end-to-end gateway integration test.
- **Performance Benchmarking:** Measures time to first output, total response time, and streamed content chunks.

## Architecture

```text
                  Client Application
                         |
                         | POST /generate
                         v
                +-------------------+
                |    LLM Gateway    |
                |    Port 4000      |
                +-------------------+
                         |
                         | Forward HTTP Request
                         v
                +-------------------+
                |   LLM Provider    |
                |    Port 4002      |
                +-------------------+
                         |
                         | SSE Response Stream
                         v
                +-------------------+
                | SSE Frame Parser  |
                | Incremental       |
                | Buffering         |
                +-------------------+
                         |
                         v
                +-------------------+
                | PII Guardrail     |
                | Email Detection   |
                | SSN Detection     |
                | Card Detection    |
                +-------------------+
                         |
                         | Safe Content
                         v
                +-------------------+
                | SSE Response      |
                | [REDACTED]        |
                +-------------------+
                         |
                         v
                  Client Application
```

## Technology Stack

| Technology | Purpose |
|---|---|
| TypeScript | Type-safe gateway implementation |
| Node.js | HTTP server and asynchronous stream processing |
| Fetch API | Upstream provider communication |
| Server-Sent Events | Incremental text generation streaming |
| Regular Expressions | Sensitive pattern detection |
| TextDecoder | Decoding streaming response bytes |
| AbortController | Request cancellation |
| TSX | Running TypeScript directly |
| Node.js Test Runner | Automated testing |

## Project Structure

```text
llm-streaming-guardrail/
├── gateway.ts
├── guardrail.ts
├── mock-provider.ts
├── guardrail.test.ts
├── guardrail.extra.test.ts
├── gateway.integration.test.ts
├── benchmark.ts
├── package.json
├── package-lock.json
├── tsconfig.json
├── .gitignore
└── README.md
```

## Installation

### Prerequisites

- Node.js 18 or newer
- npm

Clone the repository:

```bash
git clone https://github.com/ashritharao485/llm-streaming-guardrail.git
cd llm-streaming-guardrail
```

Install dependencies:

```bash
npm install
```

On Windows PowerShell, use `npm.cmd` if PowerShell execution policies prevent npm scripts from running.

## Running the Application

### 1. Start the Mock LLM Provider

Open a terminal:

```bash
npx tsx mock-provider.ts
```

Expected output:

```text
Mock LLM provider running on port 4002
```

### 2. Start the LLM Gateway

Open a second terminal:

```bash
npx tsx gateway.ts
```

Expected output:

```text
LLM streaming gateway running on port 4000
```

### 3. Send a Generation Request

Open a third terminal:

```bash
curl -N -X POST http://127.0.0.1:4000/generate \
  -H "Content-Type: application/json" \
  -d '{}'
```

For Windows PowerShell:

```powershell
curl.exe -N -X POST "http://127.0.0.1:4000/generate" -H "Content-Type: application/json" -d "{}"
```

## Example Streaming Response

The mock provider generates text containing sample email, SSN, and credit card values, split across multiple streaming chunks.

The gateway automatically redacts the sensitive values.

```text
data: {"choices":[{"delta":{"content":"Hello! Contact "}}]}

data: {"choices":[{"delta":{"content":"[REDACTED] for assistance. SSN: "}}]}

data: {"choices":[{"delta":{"content":"[REDACTED]. Card: "}}]}

data: {"choices":[{"delta":{"content":"[REDACTED]. Thank you!"}}]}

data: [DONE]
```

The gateway forwards redacted content incrementally rather than waiting for the full generated response.

## Streaming PII Detection

The guardrail maintains state between successive provider deltas.

For example, an email may arrive as:

```text
Chunk 1: alice@
Chunk 2: example
Chunk 3: .com
```

The guardrail retains the incomplete candidate until it can determine whether it matches a sensitive pattern.

Detected values are replaced with:

```text
[REDACTED]
```

Supported detection includes:

- Email addresses, including common dotted and plus-alias formats.
- SSNs in the `XXX-XX-XXXX` format.
- Credit card numbers containing 13–19 digits, including common space-separated and hyphen-separated representations.

Candidate buffers are bounded to prevent unbounded accumulation of potential PII.

## Asynchronous Streaming and Memory Efficiency

The gateway uses asynchronous response reading through the Fetch API's streaming interface.

Instead of accumulating the entire LLM response:

1. Read the next available upstream chunk.
2. Decode incoming bytes incrementally.
3. Assemble complete SSE frames.
4. Extract generated text from each provider delta.
5. Process the text through the stateful PII guardrail.
6. Forward safe content to the client.
7. Continue until the provider sends `[DONE]`.

Incomplete SSE frames are buffered with a maximum size of 1 MB.

The guardrail also uses candidate-length limits and conservative handling of oversized candidates.

Downstream backpressure is handled through Node.js writable-stream events.

## Automated Testing

The project includes three test files:

- `guardrail.test.ts` — Core PII redaction and streaming tests.
- `guardrail.extra.test.ts` — Additional boundary conditions and sensitive pattern formats.
- `gateway.integration.test.ts` — End-to-end HTTP gateway and SSE redaction test.

Run all tests:

```bash
npx tsx --test guardrail.test.ts guardrail.extra.test.ts gateway.integration.test.ts
```

The integration test requires both the mock provider and gateway to be running.

### Verified Test Results

```text
tests 18
pass 18
fail 0
```

Test scenarios include:

- Emails fragmented character by character.
- SSNs split across streaming chunks.
- Credit cards with spaces and hyphens.
- Dotted email addresses and plus aliases.
- Multiple PII values in a single response.
- PII appearing at the end of a stream.
- Oversized sensitive candidates.
- Early emission of safe text.
- End-to-end SSE redaction.

TypeScript validation:

```bash
npx tsc --noEmit
```

## Performance Benchmark

Run the benchmark while the provider and gateway are running:

```bash
npx tsx benchmark.ts
```

### Local Benchmark Results

| Metric | Measured Value |
|---|---:|
| Time to first output | 46.30 ms |
| Total response time | 1548.32 ms |
| Content chunks received | 4 |

The benchmark demonstrates that the gateway begins delivering safe output before the complete provider response is available.

The mock provider introduces artificial streaming delays. These results are from a single local test and are not production latency guarantees or isolated measurements of guardrail overhead.

## Error Handling

The gateway includes handling for:

- Upstream provider unavailability, returning HTTP 502.
- Invalid provider SSE JSON.
- Interrupted provider streams.
- Oversized incomplete SSE frames.
- Client disconnections and upstream request cancellation.
- Normal SSE stream completion using `[DONE]`.

If a stream fails after response headers have already been sent, the gateway cannot change the HTTP status code and instead terminates the stream with an error event.

## Design Tradeoffs and Limitations

This implementation is a coding-assessment prototype rather than a comprehensive production DLP solution.

- Regex-based detection covers common PII formats but may produce false positives or miss uncommon representations.
- Potentially sensitive text may be buffered until a boundary is encountered, introducing limited additional latency.
- Oversized candidates are handled conservatively and may cause ordinary text to be redacted.
- The incomplete SSE frame buffer has a 1 MB limit rather than a fixed constant-memory footprint.
- The current integration test verifies PII split across provider deltas; additional network-fragmentation and load tests would be useful.
- Production deployment would require provider authentication, stricter request validation, observability, rate limiting, and additional security testing.

## Evaluation Criteria Coverage

| Evaluation Criterion | Implementation |
|---|---|
| Efficient asynchronous stream chunking | Incremental Fetch stream reading and SSE event parsing |
| Buffer state management | Stateful PII candidate buffers and bounded incomplete SSE frames |
| Pattern matching across partial streams | Regex detection with state preserved across incoming deltas |
| Memory efficiency | No full-response accumulation; bounded buffering |
| Low-latency proxying | Early forwarding of safe content and downstream backpressure handling |

## Conclusion

This project demonstrates an LLM Gateway capable of intercepting streamed text generation responses, detecting common PII patterns across chunk boundaries, and forwarding redacted SSE output with incremental processing.

The design emphasizes practical streaming architecture, responsive output, and controlled memory usage.

---


