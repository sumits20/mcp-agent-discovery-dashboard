import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { callTool, getServers, initMcp, reconnectServer } from "./mcp/clientManager.js";
import { runAgent } from "./agent/reactAgent.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 4000;
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const requestLog = [];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

function recordRequest({ serverId, toolName, input, output, status = "success", durationMs = null }) {
  const entry = {
    id: nanoid(),
    serverId,
    toolName,
    input,
    output,
    status,
    durationMs,
    createdAt: new Date().toISOString()
  };
  requestLog.unshift(entry);
  requestLog.splice(50);
  return entry;
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "mcp-agent-discovery-backend" });
});

// Real MCP discovery: servers + tools come from live tools/list results.
app.get("/api/mcp/servers", (_req, res) => {
  res.json({ servers: getServers() });
});

app.post("/api/mcp/servers/:serverId/reconnect", async (req, res, next) => {
  try {
    await reconnectServer(req.params.serverId);
    res.json({ servers: getServers() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/mcp/requests", (_req, res) => {
  res.json({ requests: requestLog });
});

// Generic MCP-style call: { serverId, toolName, input }
app.post("/api/mcp/tools/call", async (req, res, next) => {
  try {
    const serverId = req.body.serverId || req.body.server;
    const toolName = req.body.toolName || req.body.name || req.body.tool;
    const input = req.body.input || req.body.arguments || req.body.args || {};

    if (!serverId || !toolName) {
      res.status(400).json({ error: "serverId and toolName are required" });
      return;
    }

    const result = await callTool(serverId, toolName, input);
    const entry = recordRequest({
      serverId,
      toolName,
      input,
      output: result.output,
      status: result.isError ? "error" : "success",
      durationMs: result.durationMs
    });
    res.json({ request: entry, output: result.output, structured: result.structured });
  } catch (error) {
    next(error);
  }
});

// Manual tool test, now addressed by server AND tool.
app.post("/api/tools/:serverId/:toolName/test", async (req, res, next) => {
  try {
    const { serverId, toolName } = req.params;
    const result = await callTool(serverId, toolName, req.body);
    const entry = recordRequest({
      serverId,
      toolName,
      input: req.body,
      output: result.output,
      status: result.isError ? "error" : "success",
      durationMs: result.durationMs
    });
    res.json({ request: entry, output: result.output, structured: result.structured });
  } catch (error) {
    next(error);
  }
});

// ReAct agent chat: streams trace events over SSE.
// Body: { message, history?: [{role, content}] }
app.post("/api/chat", async (req, res) => {
  const message = String(req.body.message || "").trim();
  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  try {
    await runAgent({
      message,
      history: Array.isArray(req.body.history) ? req.body.history : [],
      onEvent: send,
      recordRequest
    });
  } catch (error) {
    send({ type: "error", message: error.message });
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({
    error: error.message || "Unexpected server error"
  });
});

console.log("[mcp] connecting to configured MCP servers...");
initMcp().then((servers) => {
  const online = servers.filter((server) => server.status === "online").length;
  console.log(`[mcp] ready: ${online}/${servers.length} servers online`);
  app.listen(port, () => {
    console.log(`MCP Agent Discovery backend listening on http://localhost:${port}`);
  });
});
