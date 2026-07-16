import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../../mcp.config.json");
const CONNECT_TIMEOUT_MS = 30000;

/**
 * Holds one entry per configured server:
 * { config, client, status: "online" | "offline" | "disabled", latencyMs, tools, error }
 */
const registry = new Map();

function loadConfig() {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return parsed.servers || [];
}

/** Substitute ${VAR} placeholders in configured env values with real process.env values. */
function resolveEnv(envTemplate = {}) {
  const resolved = {};
  for (const [key, value] of Object.entries(envTemplate)) {
    resolved[key] = String(value).replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || "");
  }
  return resolved;
}

function buildTransport(config) {
  if (config.transport === "http") {
    return new StreamableHTTPClientTransport(new URL(config.url));
  }

  // stdio: spawn the server as a child process.
  // On Windows, `npx` is `npx.cmd`, which spawn() can't execute directly -
  // route through cmd /c so the same config works cross-platform.
  let command = config.command;
  let args = config.args || [];
  if (process.platform === "win32" && !command.endsWith(".exe")) {
    args = ["/c", command, ...args];
    command = "cmd";
  }

  return new StdioClientTransport({
    command,
    args,
    env: { ...process.env, ...resolveEnv(config.env) },
    stderr: "ignore"
  });
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function connectServer(config) {
  const entry = {
    config,
    client: null,
    status: "connecting",
    latencyMs: null,
    tools: [],
    instructions: null,
    error: null
  };
  registry.set(config.id, entry);

  if (config.enabled === false) {
    entry.status = "disabled";
    return entry;
  }

  const client = new Client({ name: "mcp-agent-discovery-dashboard", version: "0.2.0" });
  const startedAt = Date.now();

  try {
    await withTimeout(client.connect(buildTransport(config)), CONNECT_TIMEOUT_MS, `connect ${config.id}`);
    const { tools } = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, `tools/list ${config.id}`);

    entry.client = client;
    entry.status = "online";
    entry.instructions = client.getInstructions?.() || null;
    entry.latencyMs = Date.now() - startedAt;
    entry.tools = tools.map((tool) => ({
      name: tool.name,
      label: tool.title || tool.name,
      description: tool.description || "",
      inputSchema: tool.inputSchema || { type: "object", properties: {} }
    }));
    console.log(`[mcp] ${config.id}: online, ${entry.tools.length} tools discovered in ${entry.latencyMs}ms`);
  } catch (error) {
    entry.status = "offline";
    entry.error = error.message;
    console.error(`[mcp] ${config.id}: connection failed - ${error.message}`);
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }

  return entry;
}

/** Connect to every configured server in parallel. Called once at startup. */
export async function initMcp() {
  const configs = loadConfig();
  await Promise.all(configs.map((config) => connectServer(config)));
  return getServers();
}

/** Reconnect a single server by id (used for retry after failures). */
export async function reconnectServer(serverId) {
  const entry = registry.get(serverId);
  if (!entry) {
    const error = new Error(`Unknown server: ${serverId}`);
    error.status = 404;
    throw error;
  }
  if (entry.client) {
    try {
      await entry.client.close();
    } catch {
      /* ignore */
    }
  }
  return connectServer(entry.config);
}

/** Snapshot of all servers with their discovered tools, shaped for the frontend. */
export function getServers() {
  return Array.from(registry.values()).map((entry) => ({
    id: entry.config.id,
    name: entry.config.name,
    description: entry.config.description || "",
    endpoint:
      entry.config.transport === "http"
        ? entry.config.url
        : `stdio://${entry.config.command} ${(entry.config.args || []).join(" ")}`,
    transport: entry.config.transport,
    status: entry.status,
    latencyMs: entry.latencyMs,
    agentNotes: entry.config.agentNotes || "",
    instructions: entry.instructions,
    error: entry.error,
    tools: entry.tools.map((tool) => tool.name),
    toolDetails: entry.tools
  }));
}

/** Call a tool on a specific server. Returns { output, isError, durationMs }. */
export async function callTool(serverId, toolName, input = {}) {
  const entry = registry.get(serverId);
  if (!entry) {
    const error = new Error(`Unknown server: ${serverId}`);
    error.status = 404;
    throw error;
  }
  if (entry.status !== "online" || !entry.client) {
    const error = new Error(`Server ${serverId} is ${entry.status}${entry.error ? `: ${entry.error}` : ""}`);
    error.status = 503;
    throw error;
  }
  if (!entry.tools.some((tool) => tool.name === toolName)) {
    const error = new Error(`Server ${serverId} has no tool named ${toolName}`);
    error.status = 404;
    throw error;
  }

  const startedAt = Date.now();
  const result = await entry.client.callTool({ name: toolName, arguments: input });
  return {
    output: result.content,
    structured: result.structuredContent ?? null,
    isError: Boolean(result.isError),
    durationMs: Date.now() - startedAt
  };
}

/** Find the first online server that offers a tool whose name contains the given keyword. */
export function findToolByKeyword(keyword) {
  for (const entry of registry.values()) {
    if (entry.status !== "online") continue;
    const tool = entry.tools.find((candidate) =>
      candidate.name.toLowerCase().includes(keyword.toLowerCase())
    );
    if (tool) {
      return { serverId: entry.config.id, tool };
    }
  }
  return null;
}
