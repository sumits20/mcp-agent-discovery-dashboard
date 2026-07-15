import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { callTool, findToolByKeyword, getServers, initMcp, reconnectServer } from "./mcp/clientManager.js";

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

// Interim chat: keyword-routes to a real discovered MCP tool.
// Phase 2 replaces this with the LLM-driven ReAct agent.
app.post("/api/chat", async (req, res, next) => {
  try {
    const message = String(req.body.message || "");
    const lower = message.toLowerCase();

    const keyword = lower.includes("weather") || lower.includes("forecast") ? "weather" : null;
    if (!keyword) {
      res.json({
        reply:
          "I'm currently a simple router (Phase 1). I can answer weather questions via the real Weather MCP server - try \"weather in London\". The full ReAct reasoning agent arrives in Phase 2.",
        request: null,
        output: null
      });
      return;
    }

    const match = findToolByKeyword("weather_summary") || findToolByKeyword("weather");
    if (!match) {
      res.json({
        reply: "No online MCP server currently offers a weather tool. Check the server registry above.",
        request: null,
        output: null
      });
      return;
    }

    const location = message.match(/in ([a-z\s,]+?)(\?|$)/i)?.[1]?.trim() || "London";
    const input = { city_name: location };
    const result = await callTool(match.serverId, match.tool.name, input);
    const entry = recordRequest({
      serverId: match.serverId,
      toolName: match.tool.name,
      input,
      output: result.output,
      status: result.isError ? "error" : "success",
      durationMs: result.durationMs
    });

    const text = (result.output || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .slice(0, 1200);

    res.json({
      reply: text || `Called ${match.tool.name} on ${match.serverId}. Open the details drawer for the full response.`,
      serverId: match.serverId,
      toolName: match.tool.name,
      request: entry,
      output: result.output
    });
  } catch (error) {
    next(error);
  }
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
