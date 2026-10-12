const port = Number(process.env.PORT ?? 8787);
  import { randomUUID } from "node:crypto";
  import cors from "cors";
  import express from "express";
  import type { Request, Response } from "express";
  import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
  import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
  import { homeStore } from "./domain/state.js";
  import { policy } from "./domain/triage.js";
  import { createMcpServer } from "./mcp/registry.js";

    /**
   * Stateful Streamable HTTP sessions: one McpServer per MCP session, keyed by the
   * Mcp-Session-Id header. The household state itself is process-wide (see
   * HomeStore) so the browser demo, the CLI probes, and the tests all observe the
   * same triage decisions.
   */
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

  export function createApp() {
    const app = express();
  app.use(
    cors({
      origin: true,
      exposedHeaders: ["Mcp-Session-Id", "MCP-Session-Id", "Last-Event-Id"]
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static("public"));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "hush-alexa-plus",
      mcp: "/mcp",
      protocol: "2025-06-18",
      transport: "streamable-http",
      activeSessions: sessions.size,
      policy: policy.thresholds
    });
  });

  app.get("/api/state", (_req, res) => {
    res.json(homeStore.snapshot());
  });

  function hasSession(req: Request): boolean {
    const header = req.headers["mcp-session-id"];
    return typeof header === "string" && sessions.has(header);
  }

  app.all("/mcp", async (req: Request, res: Response) => {
    try {
      if (hasSession(req)) {
        const header = req.headers["mcp-session-id"] as string;
        await sessions.get(header)!.transport.handleRequest(req, res, req.body);
        return;
      }

      if (req.method === "POST" && req.body?.method === "initialize") {
        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (sessionId) => {
            sessions.set(sessionId, { server, transport });
          }
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Hush MCP requires an initialized session. POST initialize first, then send a Mcp-Session-Id header."
        },
        id: null
      });
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: error instanceof Error ? error.message : "Unexpected MCP transport failure" },
          id: null
        });
      }
    }
  });

  return app;
}
