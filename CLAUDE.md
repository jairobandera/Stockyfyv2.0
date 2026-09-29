# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Stockify 2.0 is a multi-company inventory / stock-counting system. It is a rewrite of the original
Spring Boot + Angular "Stockify" (still intact in the sibling folder `../Stockify`) onto a
**zero-framework** stack. The rewrite deliberately preserves the original's API shape, endpoint
paths, and DTO field names for functional compatibility — when adding or changing endpoints, match
the Java backend's conventions.

- **Backend**: raw Node.js (native `http` module, no Express) + `ws` for WebSocket + `mysql2` for
  MySQL/MariaDB + `bcryptjs`. ES modules (`"type": "module"`). These three are the *only* runtime deps.
- **Frontend**: plain HTML/CSS/JS SPA (no framework, no build step). ES modules loaded directly by the
  browser. Bootstrap, Chart.js, SweetAlert2, XLSX, jsPDF come from CDNs (see `frontend/index.html`).
- The backend serves both the API and the static frontend from the same origin/port.

Comments and identifiers are in Spanish; keep that convention.

## Commands

All backend commands run from `backend/`:

```bash
cd backend
npm install          # install the 3 deps
cp .env.example .env # then edit DB_USER / DB_PASS (a default .env already exists)
npm run db:init      # create database + tables + seed data (scripts/init-db.js, sql/schema.sql)
npm start            # run server (serves API + WebSocket + frontend) on http://localhost:8080/
npm run dev          # same, with node --watch for auto-restart
```

There is **no test suite, no linter, and no build step** — the frontend is served as-is.

Test users (password `12345`): `superadmin` (SUPERADMINISTRADOR), `admin` (ADMINISTRADOR),
`empleado` (EMPLEADO).

## Backend architecture

Entry: `server.js` → `src/app.js` (`handleRequest`) handles CORS, auth extraction, routing, and static
files. `src/routes.js` mounts every module's router under `/<resource>` beneath the API base
(`API_BASE`, default `/Stockify/api/v1`).

**Two module styles** live under `src/modules/<domain>/`:

1. **Simple CRUD** — a single `<domain>.module.js` calls `createCrud()` from `src/core/crud.js`,
   passing `{ table, entityLabel, fields }`. The factory generates repository + service + routes
   (list active, list all `/all`, get `/:id`, create, update, soft-delete). All entities use
   **soft-delete via an `activo` column** — DELETE sets `activo = 0`, it does not remove rows.
   Examples: empresa, sucursal, categoria, proveedor, lote, reporte.
   To extend a CRUD entity with custom routes, pass an `extend` callback to `buildRoutes()` — it runs
   *before* the `/:id` route so custom literal paths don't collide with the `:id` param.

2. **Custom logic** — split into `<domain>.repository.js` (raw SQL) → `<domain>.service.js`
   (business logic) → `<domain>.routes.js` (HTTP), following the original's 3-layer pattern.
   Examples: usuario, producto, conteo (count), conteoProducto, conteoUsuario, estadistica, seguridad.

**Core helpers** (`src/core/`):
- `router.js` — minimal `/resource/:id` matcher; `.use(prefix, subRouter)` mounts one router under
  another. Segment count must match exactly (no wildcards).
- `crud.js` — the generic CRUD factory described above.
- `jwt.js` — hand-rolled HS256 JWT (native `crypto`, no library). `generateToken`, `verifyToken`
  (uses `timingSafeEqual`), `extractBearer`.
- `password.js` — bcrypt hashing/verify.
- `http.js` — `sendJson`, `sendText`, `sendNoContent`, `readJsonBody`, `applyCors`.
- `httpError.js` — `HttpError` + helpers (`notFound`, `badRequest`, `unauthorized`, `forbidden`).
  Throw these in services/routes; `app.js` maps them to status codes (and `ER_DUP_ENTRY` → 400).
- `sql.js` — `buildSet` (dynamic UPDATE clauses), `toBool`.
- `static.js` — serves the frontend directory.
- `ws.js` — see real-time below.

**Auth is currently permissive at the transport layer**: `app.js` decodes a valid Bearer token into
`ctx.user` if present but does **not** reject requests without one — routes/services are responsible
for any authorization checks. Role authorization is primarily enforced on the frontend router.

**Database access** (`src/config/db.js`): a shared `mysql2/promise` pool. Use `query(sql, params)`
for single statements and `transaction(async (conn) => {...})` (auto commit/rollback) for
multi-statement operations — see `conteo.module.js` for the transaction pattern. The pool uses
`dateStrings: true` (DATE/DATETIME come back as strings to avoid timezone drift) and
`namedPlaceholders: true`.

**Config** comes from `src/config/env.js`, read from `.env`. Key vars: `PORT`, `API_BASE`,
`CORS_ORIGIN`, `DB_*`, `JWT_SECRET`, `JWT_EXPIRATION_HOURS`, `SERVE_FRONTEND`.

## Real-time (WebSocket)

`src/core/ws.js` replaces the original Spring STOMP broker. Clients connect to `/ws` and receive
`{ topic, payload }` JSON messages; the frontend filters by `topic`. **Clients only listen, never
publish.** Backend code calls `publish(topic, payload)` (e.g. from the conteo module). The three
topics, kept identical to the original: `conteo-activo`, `conteo-finalizado`,
`conteo-producto-actualizado`. Frontend subscribes in `frontend/assets/js/core/ws.js`.

## Frontend architecture

No build — `index.html` loads `assets/js/app.js` as an ES module, which imports everything else.

- `app.js` — registers every route with `router.add(path, handler, { role })` and starts the router.
  Roles: `SUPERADMINISTRADOR`, `ADMINISTRADOR`, `EMPLEADO`.
- `core/router.js` — **hash-based** router (`#/path/:param`) with per-route role guards. Unauthorized
  or wrong-role access redirects to login or the role's home dashboard (`auth.homeRoute()`).
- `core/auth.js` — token stored in `localStorage` (`stockify_token`); decodes JWT client-side to read
  `rol`, `sucursalId`, `sub`, `exp`.
- `core/api.js` — fetch wrapper; attaches the Bearer token, unwraps errors; on 401/403 with an expired
  token, logs out.
- `core/config.js` — derives `apiBase` and `wsUrl` from `window.location.origin` (same-origin as backend).
- `core/lifecycle.js` — `runCleanups()` runs teardown for the previous page (WS unsubscribes, timers)
  on every navigation; `app.js` wraps each page handler with it.
- Other core: `layout.js`, `ui.js` (SweetAlert wrappers), `dom.js`.
- `components/` — reusable building blocks: `crudPage.js` (generic CRUD page over `dataTable` +
  `formModal`), `dataTable.js`, `formModal.js`, `excel.js`, `cards.js`, `badges.js`, `page.js`.
- `pages/` — organized by role: `superadmin/`, `admin/`, `empleado/`, plus `shared/` (e.g.
  `conteoView.js`, `session.js`) and `login.js`.

## API resources

Base `/<API_BASE>` (default `/Stockify/api/v1`): `/seguridad/login`, `/usuarios`, `/empresas`,
`/sucursales`, `/categorias`, `/proveedores`, `/productos`, `/lotes`, `/conteos`, `/conteoproducto`,
`/conteo-usuarios`, `/sucursal-proveedor`, `/reportes`, `/estadisticas`.
