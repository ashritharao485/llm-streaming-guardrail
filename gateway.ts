
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import { StreamingPIIGuardrail } from "./guardrail.js";

const PROVIDER_URL =
  process.env.LLM_PROVIDER_URL ??
  "http://127.0.0.1:4002/generate";

const MAX_SSE_FRAME_BYTES = 1024 * 1024;

type ProviderDelta = {
  choices?: Array<{
    delta?: { content?: unknown };
  }>;
};

async function writeEvent(
  res: ServerResponse,
  data: string
): Promise<void> {
  if (res.destroyed || res.writableEnded) {
    throw new Error("Client disconnected");
  }

  if (!res.write(`data: ${data}\n\n`)) {
    await Promise.race([
      once(res, "drain"),
      once(res, "close").then(() => {
        throw new Error("Client disconnected");
      })
    ]);
  }
}

async function writeContent(
  res: ServerResponse,
  text: string
): Promise<void> {
  if (!text) return;

  await writeEvent(
    res,
    JSON.stringify({
      choices: [{ delta: { content: text } }]
    })
  );
}

function extractFrame(
  buffer: string
): { frame: string; rest: string } | null {
  const match = /\r?\n\r?\n/.exec(buffer);

  if (!match) return null;

  return {
    frame: buffer.slice(0, match.index),
    rest: buffer.slice(match.index + match[0].length)
  };
}

function getFrameData(frame: string): string | null {
  const lines = frame
    .split(/\r?\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => {
      const value = line.slice(5);
      return value.startsWith(" ")
        ? value.slice(1)
        : value;
    });

  return lines.length ? lines.join("\n") : null;
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/generate") {
    res.writeHead(404).end("Not found");
    return;
  }

  const controller = new AbortController();

  req.on("close", () => {
    if (!req.complete) controller.abort();
  });

  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  let reader:
    | ReadableStreamDefaultReader<Uint8Array>
    | undefined;

  try {
    const upstream = await fetch(PROVIDER_URL, {
      method: "POST",
      headers: {
        "Content-Type":
          req.headers["content-type"] ??
          "application/json"
      },
      body: req as unknown as ReadableStream,
      duplex: "half",
      signal: controller.signal
    } as RequestInit & { duplex: "half" });

    if (!upstream.ok || !upstream.body) {
      res.writeHead(502).end("LLM provider unavailable");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });

    reader = upstream.body.getReader();

    const decoder = new TextDecoder();
    const guardrail = new StreamingPIIGuardrail();

    let buffer = "";
    let completed = false;

    async function handleFrame(frame: string): Promise<void> {
      const data = getFrameData(frame);

      if (data === null) return;

      if (data === "[DONE]") {
        await writeContent(res, guardrail.flush());
        await writeEvent(res, "[DONE]");
        completed = true;
        return;
      }

      let parsed: ProviderDelta;

      try {
        parsed = JSON.parse(data) as ProviderDelta;
      } catch {
        throw new Error("Invalid provider SSE JSON");
      }

      const content = parsed.choices?.[0]?.delta?.content;

      if (typeof content === "string") {
        await writeContent(res, guardrail.push(content));
      }
    }

    while (!completed) {
      const result = await reader.read();

      if (result.done) break;

      buffer += decoder.decode(result.value, {
        stream: true
      });

      let extracted: ReturnType<typeof extractFrame>;

      while ((extracted = extractFrame(buffer)) !== null) {
        buffer = extracted.rest;

        await handleFrame(extracted.frame);

        if (completed) break;
      }

      if (
        !completed &&
        Buffer.byteLength(buffer, "utf8") >
          MAX_SSE_FRAME_BYTES
      ) {
        throw new Error("Provider SSE frame too large");
      }
    }

    if (!completed) {
      throw new Error(
        "Provider stream ended without [DONE]"
      );
    }

    res.end();
  } catch (error) {
    console.error("Gateway streaming error:", error);

    if (!res.headersSent) {
      if (!res.destroyed) {
        res.writeHead(502).end("Streaming gateway error");
      }
    } else if (!res.destroyed && !res.writableEnded) {
      try {
        await writeEvent(
          res,
          JSON.stringify({
            error: {
              message: "Upstream stream interrupted"
            }
          })
        );
      } catch {
        // Client may already have disconnected.
      }

      res.end();
    }
  } finally {
    controller.abort();

    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // Upstream may already be closed.
      }
    }
  }
});

server.listen(4000, "127.0.0.1", () => {
  console.error(
    "LLM streaming gateway running on port 4000"
  );
});
