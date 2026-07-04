import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { servers, toolDefinitions } from "./data.js";
import { runTool } from "./tools.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 4000;
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const requestLog = [];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

function recordRequest({ toolName, input, output, status = "success" }) {
  const entry = {
    id: nanoid(),
    toolName,
    input,
    output,
    status,
    createdAt: new Date().toISOString()
  };
  requestLog.unshift(entry);
  requestLog.splice(25);
  return entry;
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "mcp-agent-discovery-backend" });
});

app.get("/api/mcp/servers", (_req, res) => {
  res.json({
    servers: servers.map((server) => ({
      ...server,
      toolDetails: server.tools.map((toolName) => toolDefinitions[toolName])
    }))
  });
});

app.get("/api/mcp/requests", (_req, res) => {
  res.json({ requests: requestLog });
});

app.post("/api/tools/:toolName/test", async (req, res, next) => {
  try {
    const output = await runTool(req.params.toolName, req.body);
    const entry = recordRequest({ toolName: req.params.toolName, input: req.body, output });
    res.json({ request: entry, output });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const message = String(req.body.message || "");
    const lowerMessage = message.toLowerCase();
    const toolName = lowerMessage.includes("weather")
      ? "weather"
      : lowerMessage.includes("news")
        ? "news"
        : "web-search";
    const input =
      toolName === "weather"
        ? { location: message.match(/in ([a-z\s]+)/i)?.[1]?.trim() || "London" }
        : toolName === "news"
          ? { topic: message.replace(/news|about/gi, "").trim() || "AI agents" }
          : { query: message || "MCP server discovery" };
    const output = await runTool(toolName, input);
    const entry = recordRequest({ toolName, input, output });

    res.json({
      reply: `I used the ${toolName} tool and found structured demo results. Open the details drawer to inspect the request and response.`,
      toolName,
      request: entry,
      output
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

app.listen(port, () => {
  console.log(`MCP Agent Discovery backend listening on http://localhost:${port}`);
});
