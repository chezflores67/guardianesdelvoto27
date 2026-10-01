# AGENTS.md — Base44 Dev Notes

## Project Overview
Single-file static HTML app: **Guardianes del Voto · Chihuahua 2027**.
The entire app is `index.html` (~1326 lines) with embedded CSS and vanilla JavaScript.
No build step, no framework, no backend. Data is stored in `localStorage`.
External CDN deps: Google Fonts, jsPDF (via cdnjs).

## Why the original commit failed to start
The repo contained only `README.md` and `index.html` — no server config, no `package.json`,
no `docker-compose` file. Base44 needs a compose setup to run the app. The fix was adding
a Vite dev server (`package.json` + `docker-compose.base44.yml`) to serve the static file
with live reload on port 3000.

## Dev Environment
- **Runtime**: `node:22-slim` via `docker-compose.base44.yml`
- **Dev server**: Vite (`npx vite --host 0.0.0.0 --port 3000`) — serves `index.html` with HMR
- **Dependencies**: installed on container startup (`npm install`); stored in a named volume
- **Healthcheck**: `fetch('http://localhost:3000/')` via inline node script
- **No secrets required** — purely static front-end with localStorage

## Verify the app works
```bash
docker compose -f docker-compose.base44.yml up -d --build
curl -s http://localhost:3000/ | head -5   # should show the HTML with Vite client injected
```
The page should load with the hero screen active (`#s-hero` with `display:flex`), no console errors.
