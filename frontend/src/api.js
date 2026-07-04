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

export function testTool(toolName, input) {
  return request(`/api/tools/${toolName}/test`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function sendChat(message) {
  return request("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message })
  });
}
