// James als Connector für Claude (Model Context Protocol, Streamable HTTP, JSON-Antworten).
// Adresse: /mcp/<Connector-Code>. Der Code steht in der Tabelle `secrets` (k = 'mcpcode').
// So kann Claude über Davids Abo – in der Claude-App und in geplanten Aufgaben – James lesen und beschreiben.

import { lifeContext, todayLocal } from './ai.js';

const COLLECTIONS = ['todos', 'days', 'sessions', 'prayers', 'shop', 'orte', 'jobs', 'reports', 'settings', 'stats', 'extra', 'food', 'chats'];
const NAME = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

const ABOUT = `James ist Davids persönliche App (Gewohnheiten, To-dos, Training, Einkauf, Gebetsampel, Welt/Reisen, Karriere, Morgen-Briefing).
Daten liegen als Dokumente in Sammlungen. Wichtigste Felder:
- todos/<id>: {t, due (JJJJ-MM-TT oder leer), pr: Hoch|Mittel|Niedrig, ber, src, note, st: open|done, done (Datum), created}
- days/<JJJJ-MM-TT>: h = abgehakte Gewohnheiten {gebet, bibel, kirche, spanisch, python: true}
- sessions/<JJJJ-MM-TT>: Training {type: gym|run|swim|rest, tpl, ex: [{n, sets: [{w, r}]}], dist, laps, pool, min, sec, feel 1–5, note, kg}
- prayers/<id>: {text (privat!), date, status: open|no|part|yes|more, hist, changed}. Gebetstexte nie in Berichte, Push-Nachrichten oder andere Dienste übernehmen.
- shop/<id>: Einkaufsliste {t, done, at}
- orte/<id>: {n, region, land, cc, lat, lon, war (true = schon bereist), prio, besucht}
- jobs/<id>: gemerkte Stellen {pos, firma, ort, pass, link, found, frist, note, st}
- reports/<id>: Berichte. tag-<Datum> = Tagesbericht {type: "tag", d, title, at, text: "", notes: [..], mails: [{w, b, a}], wetter: {t, lo, hi, ort}}; james-<Datum> = Morgen-Briefing (baut der Server selbst aus dem Tagesbericht). losung-<Datum> = Herrnhuter Losung {text, ref, lehr, lehrRef} – holt der Server jeden Morgen selbst von losung.net, nicht verändern. Im Tagesbericht außerdem termine: [{z: "HH:MM", n}] (heutige Termine), woche: [{d: "JJJJ-MM-TT", z, n}] (Termine der nächsten 7 Tage, die App zeigt sie an), depot: {wert, cur, diff, pct, at} (Depotwert IBKR) mailtext (gesprochene Zusammenfassung der wichtigen Mails, 1–3 natürliche Sätze, leer wenn nichts wichtig ist) und schluss (persönlicher Schlusssatz im Jarvis-Stil) – das Morgen-Briefing liest Termine, fällige To-dos, wichtige Mails, Wetter, Depot und den Schluss vor.
- settings/<id>: regeln {text} (Plan & Regeln, zuerst lesen), karriere (Ziel, aktuelle Station, Plan), vorlagen (Gym), lernen, profil, kalender.
Heute ist ${'${TODAY}'} (Europe/Zurich). Änderungen erscheinen sofort auf Davids iPhone und iPad.`;

const TOOLS = [
  { name: 'james_overview', description: 'Kompakter Überblick über Davids aktuellen Stand aus James: offene To-dos, Gewohnheiten und Training der letzten Wochen, Gebetsquote (nur Zahlen), Reisen, Karriere, Einkaufsliste, heutiges Wetter und Mails aus dem Tagesbericht. Gut als erster Schritt.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'james_list', description: 'Alle Dokumente einer Sammlung lesen (id und Inhalt). Optional nur IDs ab/bis (Datums-IDs wie 2026-11-01 lassen sich so eingrenzen).', inputSchema: { type: 'object', properties: { collection: { type: 'string', enum: COLLECTIONS }, from_id: { type: 'string', description: 'Nur IDs >= diesem Wert' }, to_id: { type: 'string', description: 'Nur IDs <= diesem Wert' } }, required: ['collection'], additionalProperties: false } },
  { name: 'james_get', description: 'Ein Dokument lesen.', inputSchema: { type: 'object', properties: { collection: { type: 'string', enum: COLLECTIONS }, id: { type: 'string' } }, required: ['collection', 'id'], additionalProperties: false } },
  { name: 'james_set', description: 'Ein Dokument anlegen oder vollständig ersetzen.', inputSchema: { type: 'object', properties: { collection: { type: 'string', enum: COLLECTIONS }, id: { type: 'string' }, data: { type: 'object' } }, required: ['collection', 'id', 'data'], additionalProperties: false } },
  { name: 'james_update', description: 'Felder eines Dokuments ändern (oberste Ebene wird zusammengeführt; ein Feld mit dem Wert null wird entfernt). Legt das Dokument an, falls es fehlt.', inputSchema: { type: 'object', properties: { collection: { type: 'string', enum: COLLECTIONS }, id: { type: 'string' }, data: { type: 'object' } }, required: ['collection', 'id', 'data'], additionalProperties: false } },
  { name: 'james_export', description: 'Kompakte Sicherung aller Daten als JSON-Text (für die wöchentliche Sicherung nach Google Drive). Tagesdaten, Berichte und erledigte To-dos der letzten <days> Tage, alles andere vollständig. Gebetstexte sind enthalten – nur für die Sicherung verwenden.', inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 7, maximum: 400, description: 'Fenster in Tagen, Standard 35' } }, additionalProperties: false } },
  { name: 'james_delete', description: 'Ein Dokument löschen. Nur auf ausdrücklichen Wunsch von David.', inputSchema: { type: 'object', properties: { collection: { type: 'string', enum: COLLECTIONS }, id: { type: 'string' } }, required: ['collection', 'id'], additionalProperties: false } },
];

async function stamp(env) {
  const row = await env.DB.prepare('SELECT MAX(u) AS m FROM docs').first();
  return Math.max(Date.now(), (row && row.m ? row.m : 0) + 1);
}
async function read(env, c, id) {
  const r = await env.DB.prepare('SELECT d FROM docs WHERE c=?1 AND id=?2').bind(c, id).first();
  return r && r.d ? JSON.parse(r.d) : null;
}
async function write(env, c, id, d) {
  const u = await stamp(env);
  if (d == null) await env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,NULL,?3) ON CONFLICT(c,id) DO UPDATE SET d=NULL,u=?3').bind(c, id, u).run();
  else await env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,?3,?4) ON CONFLICT(c,id) DO UPDATE SET d=?3,u=?4').bind(c, id, JSON.stringify(d), u).run();
}

function check(a, needId) {
  if (!a || !COLLECTIONS.includes(a.collection)) throw new Error('Unbekannte Sammlung. Erlaubt: ' + COLLECTIONS.join(', '));
  if (needId && !NAME.test(a.id || '')) throw new Error('Ungültige id (erlaubt: Buchstaben, Ziffern, - _ . ~ : @ +).');
}

async function callTool(env, name, a) {
  a = a || {};
  if (name === 'james_overview') return 'Heute: ' + todayLocal() + '\n\n' + (await lifeContext(env, 'james'));
  if (name === 'james_list') {
    check(a);
    let q = 'SELECT id, d FROM docs WHERE c=?1 AND d IS NOT NULL', b = [a.collection];
    if (a.from_id) { q += ' AND id >= ?' + (b.length + 1); b.push(a.from_id); }
    if (a.to_id) { q += ' AND id <= ?' + (b.length + 1); b.push(a.to_id); }
    const { results } = await env.DB.prepare(q + ' ORDER BY id').bind(...b).all();
    return JSON.stringify({ collection: a.collection, count: results.length, docs: results.map((r) => ({ id: r.id, data: JSON.parse(r.d) })) });
  }
  if (name === 'james_get') { check(a, true); const d = await read(env, a.collection, a.id); return JSON.stringify({ id: a.id, exists: !!d, data: d }); }
  if (name === 'james_set') {
    check(a, true);
    if (!a.data || typeof a.data !== 'object' || Array.isArray(a.data)) throw new Error('data muss ein Objekt sein.');
    await write(env, a.collection, a.id, a.data);
    return JSON.stringify({ ok: true, id: a.id });
  }
  if (name === 'james_update') {
    check(a, true);
    if (!a.data || typeof a.data !== 'object' || Array.isArray(a.data)) throw new Error('data muss ein Objekt sein.');
    const cur = (await read(env, a.collection, a.id)) || {};
    for (const [k, v] of Object.entries(a.data)) { if (v === null) delete cur[k]; else cur[k] = v; }
    await write(env, a.collection, a.id, cur);
    return JSON.stringify({ ok: true, id: a.id, data: cur });
  }
  if (name === 'james_export') {
    const days = Math.max(7, Math.min(400, Number(a.days) || 35));
    const t = todayLocal(), d0 = new Date(Date.parse(t + 'T00:00:00Z') - days * 864e5).toISOString().slice(0, 10);
    const { results } = await env.DB.prepare('SELECT c, id, d FROM docs WHERE d IS NOT NULL').all();
    const out = {};
    for (const r of results) {
      const x = JSON.parse(r.d);
      let keep = true;
      if (['days', 'sessions', 'food'].includes(r.c)) keep = r.id >= d0;
      else if (r.c === 'prayers') keep = (x.date || '') >= d0 || (x.changed || '') >= d0;
      else if (r.c === 'todos') keep = x.st !== 'done' || (x.done || '') >= d0 || String(x.created || '').slice(0, 10) >= d0;
      else if (r.c === 'reports') { const m = r.id.match(/\d{4}-\d{2}(-\d{2})?/); keep = !m || m[0] >= d0.slice(0, m[0].length); }
      else if (r.c === 'chats') keep = false;
      if (keep) (out[r.c] = out[r.c] || {})[r.id] = x;
    }
    return JSON.stringify({ app: 'James', url: 'https://tagesheft.davidf3110.workers.dev', stand: new Date().toISOString(), fenster: days + ' Tage',
      hinweis: 'Wöchentliche Sicherung. Tagesdaten, Berichte und erledigte To-dos der letzten ' + days + ' Tage, alles andere vollständig. Zum Wiederherstellen die Dateien von alt nach neu einspielen.', daten: out });
  }
  if (name === 'james_delete') { check(a, true); await write(env, a.collection, a.id, null); return JSON.stringify({ ok: true }); }
  throw new Error('Unbekanntes Werkzeug: ' + name);
}

async function handle(env, msg) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return err(-32600, 'Invalid Request');
  if (id === undefined) return null; // Benachrichtigung
  switch (method) {
    case 'initialize': {
      const asked = params && params.protocolVersion;
      const ver = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'].includes(asked) ? asked : '2025-06-18';
      return ok({ protocolVersion: ver, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'james', title: 'James', version: '1.0.0' }, instructions: ABOUT.replace('${TODAY}', todayLocal()) });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call':
      try {
        const text = await callTool(env, params && params.name, params && params.arguments);
        return ok({ content: [{ type: 'text', text }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: 'Fehler: ' + (e && e.message || e) }], isError: true });
      }
    case 'resources/list': return ok({ resources: [] });
    case 'prompts/list': return ok({ prompts: [] });
    default: return err(-32601, 'Method not found');
  }
}

export async function mcp(req, env, code) {
  const row = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('mcpcode').first();
  if (!row || !code || row.v.length !== code.length || row.v !== code) return new Response('Not found', { status: 404 });
  if (req.method === 'GET' || req.method === 'DELETE') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  let body;
  try { body = await req.json(); } catch (e) { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
  const many = Array.isArray(body);
  const out = (await Promise.all((many ? body : [body]).map((m) => handle(env, m)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(many ? out : out[0], { headers: { 'cache-control': 'no-store' } });
}
