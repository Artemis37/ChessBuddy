import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { EngineLine } from "../../shared/types";
import type { Analyzer } from "../analysis/grade";
import { parseBestMove, parseLines } from "./uci";

interface ToolPayload {
  status: string;
  response?: string[];
  error?: string;
}

/**
 * Talks to Stockfish through the mcp-stockfish MCP server running in Docker.
 *
 * The server starts a fresh Stockfish process for every tool call and only stops reading
 * output at `bestmove`, so each call sends all of its UCI commands at once, newline
 * separated, ending with a `go` command.
 */
export class McpStockfishEngine implements Analyzer {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(
    private readonly image: string,
    private readonly threads = 2,
  ) {}

  async analyze(fen: string, { multipv, depth }: { multipv: number; depth: number }): Promise<EngineLine[]> {
    const output = await this.run([
      `setoption name Threads value ${this.threads}`,
      "setoption name Hash value 64",
      `setoption name MultiPV value ${multipv}`,
      `position fen ${fen}`,
      `go depth ${depth}`,
    ]);
    return parseLines(output);
  }

  /** Full-strength move after searching for `movetimeMs`. */
  async bestMove(fen: string, movetimeMs: number): Promise<string | null> {
    const output = await this.run([
      `setoption name Threads value ${this.threads}`,
      "setoption name Hash value 64",
      `position fen ${fen}`,
      `go movetime ${movetimeMs}`,
    ]);
    return parseBestMove(output);
  }

  /** Starts the server if needed and runs a tiny search so the first real request is fast. */
  async warmUp(): Promise<void> {
    await this.run(["position startpos", "go depth 1"]);
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
  }

  private async run(commands: string[]): Promise<string[]> {
    const client = await this.connect();
    const result = await client.callTool(
      { name: "chess_engine", arguments: { command: commands.join("\n") } },
      undefined,
      { timeout: 60_000 },
    );
    const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const text = content.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("The engine returned no output");
    if (result.isError) throw new Error(text);

    const payload = JSON.parse(text) as ToolPayload;
    if (payload.status !== "success") throw new Error(payload.error ?? "Engine command failed");
    return payload.response ?? [];
  }

  private connect(): Promise<Client> {
    if (this.client) return Promise.resolve(this.client);
    this.connecting ??= this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async open(): Promise<Client> {
    const transport = new StdioClientTransport({
      command: "docker",
      args: ["run", "-i", "--rm", this.image],
      stderr: "ignore",
    });
    const client = new Client({ name: "chessbuddy", version: "0.1.0" });
    client.onclose = () => {
      if (this.client === client) this.client = null;
    };
    await client.connect(transport);
    this.client = client;
    return client;
  }
}
