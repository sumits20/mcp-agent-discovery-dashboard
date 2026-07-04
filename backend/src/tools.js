const weatherProfiles = {
  london: { condition: "Cloud breaks with a light breeze", tempC: 19, humidity: 67 },
  "new york": { condition: "Warm and bright", tempC: 27, humidity: 58 },
  "san francisco": { condition: "Cool coastal fog lifting", tempC: 16, humidity: 72 }
};

export async function runTool(toolName, input = {}) {
  if (toolName === "weather") {
    const location = String(input.location || "London");
    const profile = weatherProfiles[location.toLowerCase()] || {
      condition: "Mild with mixed cloud",
      tempC: 21,
      humidity: 61
    };
    const unit = input.unit === "fahrenheit" ? "fahrenheit" : "celsius";
    const temperature = unit === "fahrenheit" ? Math.round((profile.tempC * 9) / 5 + 32) : profile.tempC;

    return {
      location,
      condition: profile.condition,
      temperature,
      unit,
      humidity: profile.humidity,
      source: "demo-weather-tool"
    };
  }

  if (toolName === "news") {
    const topic = String(input.topic || "MCP agents");
    const limit = Math.min(Number(input.limit) || 3, 5);

    return {
      topic,
      articles: Array.from({ length: limit }, (_, index) => ({
        title: `${topic} briefing ${index + 1}`,
        summary: `Demo update showing how an MCP news tool can return structured context for ${topic}.`,
        source: ["Agent Daily", "Protocol Watch", "Tooling Weekly"][index % 3],
        publishedAt: new Date(Date.now() - index * 3600000).toISOString()
      })),
      source: "demo-news-tool"
    };
  }

  if (toolName === "web-search") {
    const query = String(input.query || "MCP server discovery");
    const limit = Math.min(Number(input.limit) || 4, 6);

    return {
      query,
      results: Array.from({ length: limit }, (_, index) => ({
        title: `${query} result ${index + 1}`,
        url: `https://example.com/search/${encodeURIComponent(query)}/${index + 1}`,
        snippet: `Demo search result ${index + 1} for "${query}" with a concise evidence-style snippet.`
      })),
      source: "demo-search-tool"
    };
  }

  const error = new Error(`Unknown tool: ${toolName}`);
  error.status = 404;
  throw error;
}
