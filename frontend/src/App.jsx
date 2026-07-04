import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import { Bot, CheckCircle2, CloudSun, Globe2, Newspaper, PanelRightOpen, Play, Search } from "lucide-react";
import { getRequests, getServers, sendChat, testTool } from "./api";

const toolIcons = {
  weather: CloudSun,
  news: Newspaper,
  "web-search": Search
};

const toolSamples = {
  weather: { location: "London", unit: "celsius" },
  news: { topic: "AI agents", limit: 3 },
  "web-search": { query: "MCP server discovery", limit: 4 }
};

function StatusPill({ status }) {
  return <span className={`status ${status}`}>{status}</span>;
}

function ServerCard({ server }) {
  return (
    <article className="server-card">
      <div>
        <div className="card-title-row">
          <h3>{server.name}</h3>
          <StatusPill status={server.status} />
        </div>
        <p>{server.description}</p>
      </div>
      <div className="server-meta">
        <span>{server.endpoint}</span>
        <span>{server.latencyMs} ms</span>
        <span>v{server.version}</span>
      </div>
      <div className="tool-row">
        {server.toolDetails.map((tool) => {
          const Icon = toolIcons[tool.name] || Globe2;
          return (
            <span className="tool-chip" key={tool.name}>
              <Icon size={15} />
              {tool.label}
            </span>
          );
        })}
      </div>
    </article>
  );
}

function AgentGraph({ servers }) {
  const { nodes, edges } = useMemo(() => {
    const baseNodes = [
      {
        id: "user",
        position: { x: 0, y: 120 },
        data: { label: "Operator" },
        className: "flow-node user"
      },
      {
        id: "agent",
        position: { x: 260, y: 120 },
        data: { label: "Discovery Agent" },
        className: "flow-node agent"
      }
    ];
    const serverNodes = servers.map((server, index) => ({
      id: server.id,
      position: { x: 560, y: index * 110 + 20 },
      data: { label: server.name },
      className: `flow-node ${server.status}`
    }));

    return {
      nodes: [...baseNodes, ...serverNodes],
      edges: [
        { id: "user-agent", source: "user", target: "agent", animated: true },
        ...servers.map((server) => ({
          id: `agent-${server.id}`,
          source: "agent",
          target: server.id,
          animated: server.status === "online"
        }))
      ]
    };
  }, [servers]);

  return (
    <section className="panel graph-panel">
      <div className="section-title">
        <h2>Agent Graph</h2>
        <span>{servers.length} discovered servers</span>
      </div>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <MiniMap pannable zoomable />
        <Controls />
        <Background gap={18} />
      </ReactFlow>
    </section>
  );
}

function ManualToolTester({ onRequest }) {
  const [toolName, setToolName] = useState("weather");
  const [payload, setPayload] = useState(JSON.stringify(toolSamples.weather, null, 2));
  const [error, setError] = useState("");

  function selectTool(nextTool) {
    setToolName(nextTool);
    setPayload(JSON.stringify(toolSamples[nextTool], null, 2));
    setError("");
  }

  async function runTest() {
    try {
      setError("");
      const result = await testTool(toolName, JSON.parse(payload));
      onRequest(result.request);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <section className="panel tester-panel">
      <div className="section-title">
        <h2>Manual Tool Test</h2>
        <button className="icon-button primary" onClick={runTest} title="Run tool test">
          <Play size={17} />
        </button>
      </div>
      <div className="segmented">
        {Object.keys(toolSamples).map((name) => (
          <button className={name === toolName ? "active" : ""} key={name} onClick={() => selectTool(name)}>
            {name}
          </button>
        ))}
      </div>
      <textarea value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck="false" />
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

function ChatPanel({ onRequest }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Ask me to check weather, summarize news, or search the web demo tool." }
  ]);
  const [message, setMessage] = useState("");

  async function submitChat(event) {
    event.preventDefault();
    if (!message.trim()) return;
    const userMessage = message.trim();
    setMessages((items) => [...items, { role: "user", text: userMessage }]);
    setMessage("");
    const result = await sendChat(userMessage);
    setMessages((items) => [...items, { role: "assistant", text: result.reply }]);
    onRequest(result.request);
  }

  return (
    <section className="panel chat-panel">
      <div className="section-title">
        <h2>Chatbot</h2>
        <Bot size={19} />
      </div>
      <div className="messages">
        {messages.map((item, index) => (
          <div className={`message ${item.role}`} key={`${item.role}-${index}`}>
            {item.text}
          </div>
        ))}
      </div>
      <form onSubmit={submitChat} className="chat-form">
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Search MCP registry trends" />
        <button className="icon-button primary" title="Send message">
          <PanelRightOpen size={17} />
        </button>
      </form>
    </section>
  );
}

function DetailsDrawer({ request, onClose }) {
  if (!request) return null;

  return (
    <aside className="drawer">
      <div className="drawer-header">
        <div>
          <h2>Request Details</h2>
          <span>{request.toolName}</span>
        </div>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="drawer-status">
        <CheckCircle2 size={18} />
        <span>{request.status}</span>
        <time>{new Date(request.createdAt).toLocaleString()}</time>
      </div>
      <h3>Request</h3>
      <pre>{JSON.stringify(request.input, null, 2)}</pre>
      <h3>Response</h3>
      <pre>{JSON.stringify(request.output, null, 2)}</pre>
    </aside>
  );
}

export function App() {
  const [servers, setServers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);

  async function refreshRequests() {
    const data = await getRequests();
    setRequests(data.requests);
  }

  function handleRequest(request) {
    setSelectedRequest(request);
    refreshRequests();
  }

  useEffect(() => {
    getServers().then((data) => setServers(data.servers));
    refreshRequests();
  }, []);

  const toolCount = new Set(servers.flatMap((server) => server.tools || [])).size;

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">MCP Agent Discovery</p>
          <h1>Server registry, agent graph, and tool lab</h1>
        </div>
        <div className="metrics">
          <span>{servers.length} servers</span>
          <span>{toolCount} tools</span>
          <span>{requests.length} requests</span>
        </div>
      </header>

      <section className="server-grid">
        {servers.map((server) => (
          <ServerCard server={server} key={server.id} />
        ))}
      </section>

      <div className="workspace-grid">
        <AgentGraph servers={servers} />
        <div className="right-rail">
          <ChatPanel onRequest={handleRequest} />
          <ManualToolTester onRequest={handleRequest} />
        </div>
      </div>

      <section className="panel request-log">
        <div className="section-title">
          <h2>Recent Requests</h2>
          <span>{requests.length} captured</span>
        </div>
        <div className="request-list">
          {requests.map((request) => (
            <button key={request.id} onClick={() => setSelectedRequest(request)}>
              <span>{request.toolName}</span>
              <time>{new Date(request.createdAt).toLocaleTimeString()}</time>
            </button>
          ))}
          {!requests.length && <p>No requests yet. Run a tool or ask the chatbot.</p>}
        </div>
      </section>

      <DetailsDrawer request={selectedRequest} onClose={() => setSelectedRequest(null)} />
    </main>
  );
}
