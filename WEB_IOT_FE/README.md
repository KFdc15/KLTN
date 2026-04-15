# WEB_IOT

Starter project: Vue 3 + Vite + TypeScript + Pinia + TailwindCSS.

## Run

- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## Backend connection

- Backend default: `http://localhost:3000`
- Frontend default: `http://localhost:5173`
- API base URL can be overridden with `VITE_API_URL` (default is `http://localhost:3000`).

Recommended order:
1) Start backend (`WEB_IOT_BE`) and seed database
2) Start MQTT broker + simulator (optional, for realtime telemetry demo)
3) Start frontend (`WEB_IOT_FE`) and login

## Notes

- Pinia store example: `src/stores/counter.ts`
- Pinia registration: `src/main.ts`
- Tailwind entry CSS: `src/style.css`
- Tailwind config: `tailwind.config.cjs` + PostCSS: `postcss.config.cjs`
