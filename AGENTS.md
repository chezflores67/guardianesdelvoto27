# Guardianes del Voto — Base44 Dev Environment

## What this is
A single-file static HTML app (`index.html`) — "Guardianes del Voto · Chihuahua 2027".
Pure client-side: no backend, no database, no build step. Data is stored in `localStorage`.
Uses jspdf (via CDN) for PDF export.

## Running
```sh
docker compose -f docker-compose.base44.yml up -d
```
Serves `index.html` on host port 3000 via nginx:alpine.

## Editing
Edit `index.html` directly. Refresh the browser to see changes (no hot reload for static HTML).
Call `reload_preview` after edits if the preview doesn't update.

## No secrets required
No external services, no credentials needed.
