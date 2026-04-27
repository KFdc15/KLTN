# WEB_IOT_BE (Backend)

## Part 0 (done)
- Express + TypeScript
- Middleware: dotenv, cors, helmet, morgan
- Healthcheck: `GET /health`

## Part 1 (done: Prisma schema + seed)
- Prisma + PostgreSQL (Supabase)
- Models: `users`, `devices`, `telemetry`
- Enums: `DeviceStatus = ONLINE|OFFLINE|WARNING`

### Seed demo account
After `npm run db:seed`, you can login with:
- Email: `admin@example.com`
- Password: `admin123`

Seed also creates devices: `LPWAN_SENSOR_01` .. `LPWAN_SENSOR_05`.

### Environment
Create `.env` (already ignored by git) from `.env.example` and fill `DATABASE_URL`.

If your `schema.prisma` uses `directUrl = env("DIRECT_URL")`, also set `DIRECT_URL`.

`.env.example` includes a placeholder format.

If you're using local PostgreSQL, make sure the username/password in `DATABASE_URL` matches your running Postgres service.

### Commands
From this folder:
- Dev server: `npm run dev`
- Build: `npm run build`
- Prisma generate: `npm run prisma:generate`
- Migrate (creates migrations + applies): `npm run prisma:migrate`
- Push schema (no migrations): `npm run db:push`
- Seed data: `npm run db:seed`
- Prisma Studio: `npm run prisma:studio`

If you keep your Supabase connection strings in `.env.local` (instead of `.env`):
- Push schema: `npm run db:push:local`
- Seed data: `npm run db:seed:local`
- Prisma Studio: `npm run prisma:studio:local`

### Device Simulator (MQTT)
- Set `MQTT_URL` in `.env` (example: `mqtt://localhost:1883`)
- Run: `npm run sim:mqtt`
- Payloads are published to: `iot/<uid>/telemetry`

Part 7 env (NodeJS simulator):
- `DEVICE_COUNT` (default: 3)
- `DEVICE_UID` (optional: publish 1 specific device UID, e.g. `demo-hieu01`)
- `DEVICE_UIDS` (optional: comma-separated list, e.g. `demo-hieu01,demo-hieu02`)
- `INTERVAL` (default: `5000` ms; bonus normalize: if `< 1000` it is treated as seconds, so `5` -> `5000` ms)
- `MQTT_URL` (required)

Notes:
- The simulator publishes to UIDs like `LPWAN_SENSOR_01`, `LPWAN_SENSOR_02`, ... (seeded up to `_05`) unless you override with `SIM_DEVICE_UIDS`.
- UID override priority: `SIM_DEVICE_UIDS` -> `DEVICE_UIDS` -> `DEVICE_UID` -> default seeded UIDs.
- Backend only saves telemetry for devices that already exist in DB (same `uid`). Create devices first (via FE or `POST /devices`).

Example (normal user demo):
- Create a device in FE with UID `demo-hieu01`
- Run simulator with that UID (PowerShell):
	- `$env:MQTT_URL='mqtt://localhost:1883'; $env:DEVICE_UID='demo-hieu01'; npm run sim:mqtt`

### Telemetry query (time range)
For charting you can query telemetry points by time range:
- `GET /devices/:id/telemetry?from=<ISO>&to=<ISO>&limit=<n>`
- `from` / `to` are optional ISO timestamps
- `limit` defaults to 30, max 500

### MQTT End-to-end demo (Docker)
Prereqs: Docker Desktop (Windows).

## Run (FE + BE + MQTT) — clean workflow

Open 3 terminals.

Terminal 1 — Broker (Mosquitto):
```powershell
docker rm -f mosquitto 2>$null
docker run --rm -d --name mosquitto -p 1883:1883 eclipse-mosquitto
```

Terminal 2 — Backend:
```powershell
cd .\WEB_IOT_BE
npm install
npm run db:push
npm run db:seed
npm run dev
```

Terminal 3 — Simulator (Part 7):
```powershell
cd .\WEB_IOT_BE
npm run sim:mqtt
```

Terminal 4 — Frontend:
```powershell
cd .\WEB_IOT_FE
npm install
npm run dev
```

Open: `http://localhost:5173`

Login for demo:
- `admin@example.com`
- `admin123`

If `npm run dev` fails with port errors:
- Backend uses port `3000` by default; make sure you don't start it twice.

1) Start a broker (Mosquitto):
```
docker run --rm -it -p 1883:1883 eclipse-mosquitto
```

2) Set backend env:
- `MQTT_URL=mqtt://localhost:1883`
- Ensure `CORS_ORIGIN` allows your frontend (default `http://localhost:5173`).

3) Run backend:
```
npm run dev
```

4) Run simulator (publishes to `iot/<uid>/telemetry`):
```
npm run sim:mqtt
```

Recommended demo flow (no mismatch, no manual device creation):
- Run `npm run db:seed`
- Login in FE using the seeded account (`admin@example.com` / `admin123`)
- Start simulator with `DEVICE_COUNT=3` or `DEVICE_COUNT=5` and `INTERVAL=5000`

5) Open frontend and login:
- Start FE: `npm run dev` (in `WEB_IOT_FE`)
- Login -> Dashboard / Devices will update in realtime.

Notes:
- WARNING rule (MVP): `temperatureC > 35`.
- OFFLINE rule (MVP): no telemetry for `DEVICE_OFFLINE_MINUTES` (default 1 minute).

### Notes
- Prisma is pinned to v6.x for now; Prisma v7 changes datasource configuration and breaks the classic `schema.prisma` `url = env("DATABASE_URL")` pattern.