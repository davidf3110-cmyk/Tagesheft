# Tagesheft

Persönliche App für den Alltag: Gewohnheiten, Training, Einkauf, Gebetsampel, Geld und Karriere.
Läuft als installierbare Web-App auf iPhone und iPad und synchronisiert über einen eigenen Server.

- **App:** https://tagesheft.davidf3110.workers.dev (Zugangscode nötig)
- **Frontend:** `public/` – `index.html` (die App), `sync.js` (Verbindung zum Server, offline-fähig), `sw.js` (Offline-Cache)
- **Backend:** `worker/` – Cloudflare Worker mit D1-Datenbank
  - `GET /api/sync?since=<ms>` – alle Änderungen seit einem Zeitpunkt
  - `POST /api/doc` `{c, id, d}` – Dokument schreiben (`d: null` löscht)
  - `POST /api/batch` `{docs: [{c, id, d}]}` – viele auf einmal
  - `GET /api/doc?c=&id=` – ein Dokument lesen
  - `GET /api/cal?from=&to=` – Termine aus dem privaten iCal-Link (`settings/kalender`)
  - Alle Aufrufe außer `/api/ping` brauchen `Authorization: Bearer <Zugangscode>` (Secret `APP_TOKEN`)

## Veröffentlichen

```bash
npm install
npx wrangler deploy
```

Datenbank-Schema: `schema.sql` (`npx wrangler d1 execute tagesheft --remote --file schema.sql`).
