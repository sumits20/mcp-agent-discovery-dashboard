export const servers = [
  {
    id: "local-demo",
    name: "Local Demo MCP Server",
    status: "online",
    endpoint: "stdio://demo-local",
    latencyMs: 42,
    version: "0.1.0",
    description: "Seeded tools for weather, news, and web search demos.",
    tools: ["weather", "news", "web-search"]
  },
  {
    id: "research-hub",
    name: "Research Hub",
    status: "online",
    endpoint: "https://mcp.example.test/research",
    latencyMs: 118,
    version: "0.2.4",
    description: "Example remote server profile for discovery workflows.",
    tools: ["news", "web-search"]
  },
  {
    id: "ops-weather",
    name: "Ops Weather",
    status: "degraded",
    endpoint: "https://mcp.example.test/weather",
    latencyMs: 286,
    version: "0.1.8",
    description: "Example operational weather tool server.",
    tools: ["weather"]
  }
];

export const toolDefinitions = {
  weather: {
    name: "weather",
    label: "Weather",
    description: "Returns current demo weather conditions for a city.",
    inputSchema: {
      type: "object",
      required: ["location"],
      properties: {
        location: { type: "string", example: "London" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"], example: "celsius" }
      }
    }
  },
  news: {
    name: "news",
    label: "News",
    description: "Returns a short demo news briefing for a topic.",
    inputSchema: {
      type: "object",
      required: ["topic"],
      properties: {
        topic: { type: "string", example: "AI agents" },
        limit: { type: "number", example: 3 }
      }
    }
  },
  "web-search": {
    name: "web-search",
    label: "Web Search",
    description: "Returns demo search results for a query.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", example: "MCP server registry" },
        limit: { type: "number", example: 5 }
      }
    }
  }
};
