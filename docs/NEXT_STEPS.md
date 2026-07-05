# Next Steps

This project is deployment-ready as an MVP when the static frontend and Node.js
backend are hosted separately and the frontend points at the backend API.

## Deployment readiness

- Deploy the backend first and verify `/api/health`.
- Set `CORS_ORIGIN` to the exact deployed frontend origin.
- Deploy the frontend with `VITE_API_BASE_URL` set to the deployed backend URL.
- Run a manual smoke test for the server registry, chatbot, and manual tool test
  workflows after each deploy.
- Keep live provider keys in backend environment variables only.

## Near-term product improvements

- Add persistent storage for request history so traces survive backend restarts.
- Add real provider integrations behind the existing demo tool interfaces.
- Add authentication before exposing non-demo provider data.
- Add automated API tests for health, server discovery, tool test, and chat
  endpoints.
- Add frontend checks for loading, empty, and error states.

## Operational notes

- The backend currently serves `frontend/dist` when it exists, which supports
  single-service hosting if needed.
- Split hosting is still preferred for the MVP because static frontend platforms
  handle caching and previews cleanly.
- The frontend should never receive secret provider keys; route real provider
  calls through the backend.
