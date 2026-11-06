
import { performance } from "node:perf_hooks";

const URL = "http://127.0.0.1:4000/generate";

async function benchmark() {
  const start = performance.now();

  const response = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!response.ok || !response.body) {
    throw new Error(`Gateway returned HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let firstTokenTime: number | null = null;
  let chunks = 0;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary: number;

    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      if (!event.startsWith("data: ")) continue;

      const data = event.slice(6);

      if (data === "[DONE]") continue;

      const parsed = JSON.parse(data);
      const content = parsed.choices?.[0]?.delta?.content;

      if (typeof content === "string" && content.length > 0) {
        if (firstTokenTime === null) {
          firstTokenTime = performance.now() - start;
        }

        chunks++;
      }
    }
  }

  const totalTime = performance.now() - start;

  console.log("\nLLM Gateway Streaming Benchmark");
  console.log("--------------------------------");
  console.log(`Time to first output: ${firstTokenTime?.toFixed(2)} ms`);
  console.log(`Total response time: ${totalTime.toFixed(2)} ms`);
  console.log(`Content chunks received: ${chunks}`);
}

benchmark().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
