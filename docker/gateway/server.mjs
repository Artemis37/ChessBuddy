// MCP-over-HTTP front for mcp-stockfish, so the web app can reach the engine over the network
// (for example from another Azure container app). mcp-stockfish itself only speaks stdio.
//
// Requests are stateless: each POST /mcp is handled on its own and its tool call goes to one of
// ENGINE_POOL_SIZE mcp-stockfish processes. Each process answers one call at a time, so with the
// default of 2 the bot's move and a grade run side by side. Without sessions, any replica can
// answer any request, so the container app can scale out freely.
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const PORT = Number(process.env.PORT ?? 8080);
const POOL_SIZE = Math.max(1, Number(process.env.ENGINE_POOL_SIZE) || 2);
const TOKEN = process.env.ENGINE_TOKEN ?? "";
const CALL_TIMEOUT_MS = 90_000;
const MAX_BODY_BYTES = 1_000_000;

/** One mcp-stockfish process, started on first use and restarted if it exits. */
class Engine {
  #client = null;
  #connecting = null;

  async client() {
    if (this.#client) return this.#client;
    this.#connecting ??= this.#open().finally(() => {
      this.#connecting = null;
    });
    return this.#connecting;
  }

  async close() {
    await this.#client?.close();
  }

  async #open() {
    const client = new Client({ name: "chessbuddy-engine-gateway", version: "0.1.0" });
    client.onclose = () => {
      if (this.#client === client) this.#client = null;
    };
    // The child only gets a minimal environment by default; mcp-stockfish needs its MCP_STOCKFISH_* settings.
    const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined));
    await client.connect(new StdioClientTransport({ command: "mcp-stockfish", env, stderr: "inherit" }));
    this.#client = client;
    return client;
  }
}

/** Hands each task a free engine, queueing when all are busy. */
class Pool {
  #idle;
  #waiting = [];

  constructor(size) {
    this.engines = Array.from({ length: size }, () => new Engine());
    this.#idle = [...this.engines];
  }

  async run(task) {
    const engine = this.#idle.pop() ?? (await new Promise((resolve) => this.#waiting.push(resolve)));
    try {
      return await task(await engine.client());
    } finally {
      const next = this.#waiting.shift();
      if (next) next(engine);
      else this.#idle.push(engine);
    }
  }
}

const pool = new Pool(POOL_SIZE);
let tools = null;

function mcpServer() {
  const server = new Server({ name: "chessbuddy-engine", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    tools ??= await pool.run((client) => client.listTools());
    return tools;
  });
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    pool.run((client) => client.callTool(request.params, undefined, { timeout: CALL_TIMEOUT_MS })),
  );
  return server;
}

function authorized(header) {
  if (!TOKEN) return true;
  const expected = Buffer.from(`Bearer ${TOKEN}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain" }).end(message);
}

const http = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (pathname === "/health") return send(res, 200, "ok");
  if (pathname !== "/mcp") return send(res, 404, "Not found");
  if (!authorized(req.headers.authorization)) return send(res, 401, "Unauthorized");
  // Stateless: there's no session to stream to (GET) or end (DELETE).
  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "POST" }).end();
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return send(res, 400, err instanceof SyntaxError ? "Invalid JSON" : String(err.message ?? err));
  }

  const server = mcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("Request failed:", err);
    if (!res.headersSent) send(res, 500, "Engine gateway error");
  }
});

http.listen(PORT, () => {
  console.log(`Engine gateway on port ${PORT}: ${POOL_SIZE} mcp-stockfish process(es)${TOKEN ? ", token required" : ""}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    http.close();
    Promise.allSettled(pool.engines.map((e) => e.close())).finally(() => process.exit(0));
  });
}
