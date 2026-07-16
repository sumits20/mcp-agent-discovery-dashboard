import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import { Bot, Brain, CheckCircle2, Eye, Globe2, PanelRightOpen, Play, RefreshCw, Wrench, XCircle } from "lucide-react";
import { getRequests, getServers, reconnectServer, streamChat, testTool } from "./api";

/** Build a sample JSON payload from a tool's real JSON Schema. */
function samplePayloadFromSchema(schema = {}) {
  const properties = schema.properties || {};
  const required = schema.required || [];
  const keys = required.length ? required : Object.keys(properties).slice(0, 2);
  const sample = {};
  for (const key of keys) {
    const prop = properties[key] || {};
    if (prop.example !== undefined) sample[key] = prop.example;
    else if (prop.default !== undefined) sample[key] = prop.default;
    else if (prop.enum) sample[key] = prop.enum[0];
    else if (prop.type === "number" || prop.type === "integer") sample[key] = 0;
    else if (prop.type === "boolean") sample[key] = false;
    else if (prop.type === "array") sample[key] = [];
    else if (prop.type === "object") sample[key] = {};
    else sample[key] = "";
  }
  return sample;
}

function StatusPill({ status }) {
  return <span className={`status ${status}`}>{status}</span>;
}

function ServerCard({ server, onReconnect }) {
  const shownTools = server.toolDetails.slice(0, 5);
  const extra = server.toolDetails.length - shownTools.length;

  return (
    <article className="server-card">
      <div>
        <div className="card-title-row">
          <h3>{server.name}</h3>
          <StatusPill status={server.status} />
        </div>
        <p>{server.description}</p>
        {server.status === "offline" && server.error && <p className="error-text">{server.error}</p>}
      </div>
      <div className="server-meta">
        <span title={server.endpoint}>{server.transport}</span>
        {server.latencyMs != null && <span>{server.latencyMs} ms connect</span>}
        {server.status === "offline" && (
          <button className="icon-button" title="Retry connection" onClick={() => onReconnect(server.id)}>
            <RefreshCw size={14} />
          </button>
        )}
      </div>
      <div className="tool-row">
        {shownTools.map((tool) => (
          <span className="tool-chip" key={tool.name} title={tool.description}>
            <Globe2 size={15} />
            {tool.name}
          </span>
        ))}
        {extra > 0 && <span className="tool-chip">+{extra} more</span>}
        {!server.toolDetails.length && <span className="tool-chip">no tools discovered</span>}
      </div>
    </article>
  );
}

function AgentGraph({ servers, activeServerId }) {
  const { nodes, edges } = useMemo(() => {
    const baseNodes = [
      { id: "user", position: { x: 0, y: 120 }, data: { label: "Operator" }, className: "flow-node user" },
      { id: "agent", position: { x: 260, y: 120 }, data: { label: "Discovery Agent" }, className: "flow-node agent" }
    ];
    const serverNodes = servers.map((server, index) => ({
      id: server.id,
      position: { x: 560, y: index * 110 + 20 },
      data: { label: `${server.name} (${server.tools.length})` },
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
          animated: server.id === activeServerId,
          style:
            server.id === activeServerId
              ? { stroke: "#0e9384", strokeWidth: 3 }
              : { opacity: server.status === "online" ? 1 : 0.35 }
        }))
      ]
    };
  }, [servers, activeServerId]);

  return (
    <section className="panel graph-panel">
      <div className="section-title">
        <h2>Agent Graph</h2>
        <span>{servers.filter((server) => server.status === "online").length} online servers</span>
      </div>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <MiniMap pannable zoomable />
        <Controls />
        <Background gap={18} />
      </ReactFlow>
    </section>
  );
}

function ManualToolTester({ servers, onRequest }) {
  const onlineServers = servers.filter((server) => server.status === "online" && server.toolDetails.length);
  const [serverId, setServerId] = useState("");
  const [toolName, setToolName] = useState("");
  const [payload, setPayload] = useState("{}");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const activeServer = onlineServers.find((server) => server.id === serverId) || onlineServers[0];
  const activeTools = activeServer ? activeServer.toolDetails : [];
  const activeTool = activeTools.find((tool) => tool.name === toolName) || activeTools[0];

  // When discovery data arrives or selection changes, sync selection + sample payload.
  useEffect(() => {
    if (!activeServer) return;
    if (serverId !== activeServer.id) setServerId(activeServer.id);
    if (activeTool && toolName !== activeTool.name) {
      setToolName(activeTool.name);
      setPayload(JSON.stringify(samplePayloadFromSchema(activeTool.inputSchema), null, 2));
    }
  }, [activeServer, activeTool, serverId, toolName]);

  function selectServer(nextServerId) {
    const server = onlineServers.find((candidate) => candidate.id === nextServerId);
    setServerId(nextServerId);
    const firstTool = server?.toolDetails[0];
    setToolName(firstTool ? firstTool.name : "");
    setPayload(firstTool ? JSON.stringify(samplePayloadFromSchema(firstTool.inputSchema), null, 2) : "{}");
    setError("");
  }

  function selectTool(nextToolName) {
    const tool = activeTools.find((candidate) => candidate.name === nextToolName);
    setToolName(nextToolName);
    if (tool) setPayload(JSON.stringify(samplePayloadFromSchema(tool.inputSchema), null, 2));
    setError("");
  }

  async function runTest() {
    if (!activeServer || !activeTool) return;
    try {
      setError("");
      setBusy(true);
      const result = await testTool(activeServer.id, activeTool.name, JSON.parse(payload));
      onRequest(result.request);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel tester-panel">
      <div className="section-title">
        <h2>Manual Tool Test</h2>
        <button className="icon-button primary" onClick={runTest} disabled={busy || !activeTool} title="Run tool test">
          <Play size={17} />
        </button>
      </div>
      {!onlineServers.length && <p>No online servers with tools yet.</p>}
      {onlineServers.length > 0 && (
        <>
          <div className="segmented">
            {onlineServers.map((server) => (
              <button
                className={activeServer && server.id === activeServer.id ? "active" : ""}
                key={server.id}
                onClick={() => selectServer(server.id)}
              >
                {server.name}
              </button>
            ))}
          </div>
          <select className="tool-select" value={activeTool ? activeTool.name : ""} onChange={(event) => selectTool(event.target.value)}>
            {activeTools.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.name}
              </option>
            ))}
          </select>
          {activeTool && <p className="tool-description">{activeTool.description.slice(0, 160)}</p>}
          <textarea value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck="false" />
        </>
      )}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

function TraceStep({ event, onOpenRequest }) {
  if (event.type === "thought") {
    return (
      <div className="trace-step thought">
        <Brain size={14} />
        <span>{event.text}</span>
      </div>
    );
  }
  if (event.type === "tool_call") {
    return (
      <div className="trace-step action">
        <Wrench size={14} />
        <span>
          <strong>
            {event.serverId}/{event.toolName}
          </strong>{" "}
          {JSON.stringify(event.args)}
        </span>
      </div>
    );
  }
  if (event.type === "tool_result") {
    return (
      <button
        className={`trace-step observation ${event.ok ? "" : "failed"}`}
        onClick={() => event.request && onOpenRequest(event.request)}
        title="Open request details"
      >
        <Eye size={14} />
        <span>
          {event.durationMs != null ? `${event.durationMs} ms - ` : ""}
          {event.preview}
        </span>
      </button>
    );
  }
  return null;
}

function ChatPanel({ onRequest, onTraceEvent }) {
  const [turns, setTurns] = useState([
    { role: "assistant", trace: [], text: "I'm a real ReAct agent now. Ask me anything the discovered MCP tools can answer - try \"Is it warmer in Slough or in Bolpur right now?\"" }
  ]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitChat(event) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    const userMessage = message.trim();

    // History for the agent: prior user text + assistant final answers.
    const history = turns
      .filter((turn) => turn.text)
      .map((turn) => ({ role: turn.role, content: turn.text }));

    setTurns((items) => [...items, { role: "user", trace: [], text: userMessage }, { role: "assistant", trace: [], text: "" }]);
    setMessage("");
    setBusy(true);

    try {
      await streamChat(userMessage, history.slice(-8), (traceEvent) => {
        onTraceEvent(traceEvent);
        setTurns((items) => {
          const next = [...items];
          const current = { ...next[next.length - 1] };
          if (traceEvent.type === "final") {
            current.text = traceEvent.text;
          } else if (traceEvent.type === "error") {
            current.text = `Error: ${traceEvent.message}`;
          } else {
            current.trace = [...current.trace, traceEvent];
          }
          if (traceEvent.type === "tool_result" && traceEvent.request) {
            onRequest(traceEvent.request);
          }
          next[next.length - 1] = current;
          return next;
        });
      });
    } catch (chatError) {
      setTurns((items) => {
        const next = [...items];
        next[next.length - 1] = { ...next[next.length - 1], text: `Error: ${chatError.message}` };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel chat-panel">
      <div className="section-title">
        <h2>ReAct Agent</h2>
        <Bot size={19} />
      </div>
      <div className="messages">
        {turns.map((turn, index) => (
          <div key={`turn-${index}`}>
            {turn.trace.map((traceEvent, traceIndex) => (
              <TraceStep event={traceEvent} key={`trace-${index}-${traceIndex}`} onOpenRequest={onRequest} />
            ))}
            {turn.text && <div className={`message ${turn.role}`}>{turn.text}</div>}
          </div>
        ))}
        {busy && <div className="message assistant">Reasoning...</div>}
      </div>
      <form onSubmit={submitChat} className="chat-form">
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask the agent..." />
        <button className="icon-button primary" title="Send message" disabled={busy}>
          <PanelRightOpen size={17} />
        </button>
      </form>
    </section>
  );
}

function DetailsDrawer({ request, onClose }) {
  if (!request) return null;
  const ok = request.status === "success";

  return (
    <aside className="drawer">
      <div className="drawer-header">
        <div>
          <h2>Request Details</h2>
          <span>
            {request.serverId ? `${request.serverId} / ` : ""}
            {request.toolName}
          </span>
        </div>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="drawer-status">
        {ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
        <span>{request.status}</span>
        {request.durationMs != null && <span>{request.durationMs} ms</span>}
        <time>{new Date(request.createdAt).toLocaleString()}</time>
      </div>
      <h3>Request (tools/call arguments)</h3>
      <pre>{JSON.stringify(request.input, null, 2)}</pre>
      <h3>Response (MCP content blocks)</h3>
      <pre>{JSON.stringify(request.output, null, 2)}</pre>
    </aside>
  );
}

export function App() {
  const [servers, setServers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [activeServerId, setActiveServerId] = useState(null);
  const [loadError, setLoadError] = useState("");

  async function refreshServers() {
    try {
      const data = await getServers();
      setServers(data.servers);
      setLoadError("");
    } catch (error) {
      setLoadError(`Cannot reach backend: ${error.message}`);
    }
  }

  async function refreshRequests() {
    try {
      const data = await getRequests();
      setRequests(data.requests);
    } catch {
      /* surfaced via loadError already */
    }
  }

  async function handleReconnect(serverId) {
    try {
      const data = await reconnectServer(serverId);
      setServers(data.servers);
    } catch (error) {
      setLoadError(error.message);
    }
  }

  function handleRequest(request) {
    setSelectedRequest(request);
    refreshRequests();
  }

  function handleTraceEvent(event) {
    if (event.type === "tool_call") setActiveServerId(event.serverId);
    if (event.type === "final" || event.type === "error") setActiveServerId(null);
  }

  useEffect(() => {
    refreshServers();
    refreshRequests();
  }, []);

  // Poll while the backend is starting up or MCP servers are still connecting.
  useEffect(() => {
    const settling =
      loadError || !servers.length || servers.some((server) => server.status === "connecting");
    if (!settling) return undefined;
    const timer = setInterval(refreshServers, 3000);
    return () => clearInterval(timer);
  }, [loadError, servers]);

  const toolCount = servers.reduce((sum, server) => sum + server.tools.length, 0);

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

      {loadError && <p className="error-text">{loadError} - retrying...</p>}

      <section className="server-grid">
        {servers.map((server) => (
          <ServerCard server={server} key={server.id} onReconnect={handleReconnect} />
        ))}
      </section>

      <div className="workspace-grid">
        <AgentGraph servers={servers} activeServerId={activeServerId} />
        <div className="right-rail">
          <ChatPanel onRequest={handleRequest} onTraceEvent={handleTraceEvent} />
          <ManualToolTester servers={servers} onRequest={handleRequest} />
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
              <span>
                {request.serverId ? `${request.serverId}/` : ""}
                {request.toolName}
              </span>
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
