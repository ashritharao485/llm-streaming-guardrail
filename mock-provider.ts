
import { createServer } from "node:http";

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/generate") {
    res.writeHead(404).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  // Deliberately split sensitive information across chunks.
  const chunks = [
    "Hello! Contact ",
    "alice@",
    "example",
    ".com",
    " for assistance. SSN: ",
    "123-",
    "45-",
    "6789",
    ". Card: ",
    "4111 ",
    "1111 ",
    "1111 ",
    "1111",
    ". Thank you!"
  ];

  for (const chunk of chunks) {
    if (res.destroyed) break;

    const event = {
      choices: [{
        delta: { content: chunk }
      }]
    };

    res.write(`data: ${JSON.stringify(event)}\n\n`);
    await sleep(100);
  }

  if (!res.destroyed) {
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

server.listen(4002, "127.0.0.1", () => {
  console.error("Mock LLM provider running on port 4002");
});
