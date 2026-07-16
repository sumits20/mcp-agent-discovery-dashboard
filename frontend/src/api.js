const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function request(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

export function getServers() {
  return request("/api/mcp/servers");
}

export function getRequests() {
  return request("/api/mcp/requests");
}

export function testTool(serverId, toolName, input) {
  return request(`/api/tools/${encodeURIComponent(serverId)}/${encodeURIComponent(toolName)}/test`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function reconnectServer(serverId) {
  return request(`/api/mcp/servers/${encodeURIComponent(serverId)}/reconnect`, {
    method: "POST",
    body: "{}"
  });
}

/** Stream the ReAct agent's trace events. Calls onEvent for each parsed event. */
export async function streamChat(message, history, onEvent) {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history })
  });

  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (!chunk.startsWith("data: ")) continue;
      const payload = chunk.slice(6);
      if (payload === "[DONE]") return;
      try {
        onEvent(JSON.parse(payload));
      } catch {
        /* skip malformed chunk */
      }
    }
  }
}
