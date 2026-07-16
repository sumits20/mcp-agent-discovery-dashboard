import OpenAI from "openai";
import { callTool, getServers } from "../mcp/clientManager.js";

const MAX_ITERATIONS = 6;
const OBSERVATION_LIMIT = 4000;
const TOOL_NAME_SEPARATOR = "__";

const SYSTEM_PROMPT = `You are a ReAct (Reason + Act) agent inside an MCP learning dashboard.
You have access to tools discovered from live MCP servers. Tool names are formatted as serverId${TOOL_NAME_SEPARATOR}toolName.

Follow the ReAct pattern strictly:
1. THINK: before calling any tool, write ONE short sentence of reasoning as your message content explaining which tool you will use and why.
2. ACT: call exactly one tool at a time.
3. OBSERVE: read the tool result, then either think + act again, or answer.
4. When you have enough information, give a clear, concise final answer with no tool call.

Rules:
- Before choosing a tool, check its description for coverage or region limits (e.g. "US only").
- Location-based tools usually need coordinates. If a tool accepts a city name directly, prefer that; otherwise geocode first.
- If a tool returns an error, read the error message - it usually explains the correct parameters - and retry once with corrected arguments.
- Never invent data. If tools cannot answer the question, say so.`;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not set in backend/.env");
    error.status = 503;
    throw error;
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined
  });
}

/** Convert discovered MCP tools into OpenAI function-calling definitions. */
function buildToolDefinitions() {
  const definitions = [];
  for (const server of getServers()) {
    if (server.status !== "online") continue;
    for (const tool of server.toolDetails) {
      definitions.push({
        type: "function",
        function: {
          name: `${server.id}${TOOL_NAME_SEPARATOR}${tool.name}`.slice(0, 64),
          description: `[${server.name}] ${tool.description}`.slice(0, 1024),
          parameters: tool.inputSchema
        }
      });
    }
  }
  return definitions;
}


/** Server-level guidance: MCP initialize instructions + client-side agentNotes from mcp.config.json. */
function buildServerNotes() {
  const notes = getServers()
    .filter((server) => server.status === "online")
    .map((server) => {
      const parts = [server.agentNotes, server.instructions].filter(Boolean);
      return parts.length ? `- ${server.id}: ${parts.join(" | ")}` : null;
    })
    .filter(Boolean);
  return notes.length ? `\n\nServer notes:\n${notes.join("\n")}` : "";
}

function truncate(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]` : text;
}

function contentBlocksToText(blocks = []) {
  return blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * Run the ReAct loop for one user message.
 * `history` is prior conversation turns: [{ role: "user"|"assistant", content }].
 * `onEvent` receives trace events:
 *   { type: "thought", text }
 *   { type: "tool_call", serverId, toolName, args, step }
 *   { type: "tool_result", serverId, toolName, ok, durationMs, preview, request }
 *   { type: "final", text }
 *   { type: "error", message }
 * `recordRequest` is the server's request-log function.
 */
export async function runAgent({ message, history = [], onEvent, recordRequest }) {
  const client = getClient();
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const tools = buildToolDefinitions();

  const messages = [
    { role: "system", content: SYSTEM_PROMPT + buildServerNotes() },
    ...history.slice(-10),
    { role: "user", content: message }
  ];

  for (let step = 1; step <= MAX_ITERATIONS; step += 1) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? "auto" : undefined
    });

    const reply = completion.choices[0].message;
    messages.push(reply);

    // THINK: content alongside tool calls is the agent's reasoning.
    if (reply.content && reply.tool_calls?.length) {
      onEvent({ type: "thought", text: reply.content, step });
    }

    // Final answer: no tool calls means the agent is done.
    if (!reply.tool_calls?.length) {
      onEvent({ type: "final", text: reply.content || "(empty response)" });
      return;
    }

    // ACT + OBSERVE for each requested tool call.
    for (const toolCall of reply.tool_calls) {
      const [serverId, ...rest] = toolCall.function.name.split(TOOL_NAME_SEPARATOR);
      const toolName = rest.join(TOOL_NAME_SEPARATOR);
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        /* leave as empty object */
      }

      onEvent({ type: "tool_call", serverId, toolName, args, step });

      let observation;
      let ok = false;
      let durationMs = null;
      let requestEntry = null;
      try {
        const result = await callTool(serverId, toolName, args);
        ok = !result.isError;
        durationMs = result.durationMs;
        observation = truncate(contentBlocksToText(result.output) || JSON.stringify(result.output), OBSERVATION_LIMIT);
        requestEntry = recordRequest?.({
          serverId,
          toolName,
          input: args,
          output: result.output,
          status: ok ? "success" : "error",
          durationMs
        });
      } catch (error) {
        observation = `Tool call failed: ${error.message}`;
        requestEntry = recordRequest?.({
          serverId,
          toolName,
          input: args,
          output: [{ type: "text", text: observation }],
          status: "error",
          durationMs: null
        });
      }

      onEvent({
        type: "tool_result",
        serverId,
        toolName,
        ok,
        durationMs,
        preview: truncate(observation, 400),
        request: requestEntry,
        step
      });

      messages.push({ role: "tool", tool_call_id: toolCall.id, content: observation });
    }
  }

  onEvent({
    type: "final",
    text: "I reached my step limit before finishing. Here is what I found so far - try asking a more specific question."
  });
}
