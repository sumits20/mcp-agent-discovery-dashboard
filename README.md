# MCP Agent Discovery Dashboard

MVP for discovering MCP-style servers, testing demo tools, reviewing request and response payloads, and sketching agent workflows.

## What is included

- React + Vite frontend in `frontend`
- Node.js + Express backend in `backend`
- Demo MCP-style tools for weather, news, and web search
- MCP server discovery dashboard
- Chatbot panel that can call demo tools
- React Flow agent graph
- Request/response details drawer
- Manual tool test area

## Local setup

Use Node.js 20 or newer.

```bash
pnpm install:all
pnpm dev
```

The app runs on `http://localhost:4000`. The backend also exposes the API under `/api`.

You can also run each app separately:

```bash
pnpm dev:backend
pnpm dev:frontend
```

When running the frontend separately, open `http://localhost:5173` and keep `VITE_API_BASE_URL=http://localhost:4000`.

## Environment

Copy the examples before running locally:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The MVP works with seeded demo data. Optional API keys can be added later for real weather, news, or search providers.

## Backend API

- `GET /api/health`
- `GET /api/mcp/servers`
- `GET /api/mcp/requests`
- `POST /api/tools/:toolName/test`
- `POST /api/chat`

Tool names are `weather`, `news`, and `web-search`.

## Deployment

### Frontend

Deploy `frontend` to Vercel, Netlify, or any static host:

```bash
pnpm --dir frontend install
pnpm --dir frontend build
```

Set `VITE_API_BASE_URL` to your deployed backend URL.

### Backend

Deploy `backend` to Render, Railway, Fly.io, or any Node.js host:

```bash
pnpm --dir backend install
pnpm --dir backend start
```

Set these environment variables:

- `PORT`
- `CORS_ORIGIN`

For production, set `CORS_ORIGIN` to the frontend URL.
