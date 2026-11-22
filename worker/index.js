// Tagesheft – Backend auf Cloudflare Workers
// Speichert alle Daten als Dokumente (Sammlung + ID + JSON) in D1.
// Alle /api-Aufrufe brauchen den Zugangscode (Secret APP_TOKEN) als Bearer-Token.

import { calendarEvents } from './ical.js';
import { serveStatic } from './static.js';
import { mcp } from './mcp.js';
import { briefing, geocode, reverseGeocode, todayLocal } from './ai.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const NAME = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

function authorized(req, env) {
  const h = req.headers.get('authorization') || '';
  const got = h.startsWith('Bearer ') ? h.slice(7) : '';
  const want = env.APP_TOKEN || '';
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

// Fortlaufender Zeitstempel: nie kleiner als der letzte vergebene, damit kein Sync etwas verpasst.
async function stamp(env) {
  const row = await env.DB.prepare('SELECT MAX(u) AS m FROM docs').first();
  return Math.max(Date.now(), (row && row.m ? row.m : 0) + 1);
}

async function writeDoc(env, c, id, d, u) {
  if (d == null) {
    await env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,NULL,?3) ON CONFLICT(c,id) DO UPDATE SET d=NULL,u=?3')
      .bind(c, id, u).run();
  } else {
    await env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,?3,?4) ON CONFLICT(c,id) DO UPDATE SET d=?3,u=?4')
      .bind(c, id, JSON.stringify(d), u).run();
  }
}

export async function getDoc(env, c, id) {
  const r = await env.DB.prepare('SELECT d FROM docs WHERE c=?1 AND id=?2').bind(c, id).first();
  return r && r.d ? JSON.parse(r.d) : null;
}

export async function listDocs(env, c) {
  const { results } = await env.DB.prepare('SELECT id, d FROM docs WHERE c=?1 AND d IS NOT NULL').bind(c).all();
  return results.map((r) => [r.id, JSON.parse(r.d)]);
}

async function api(req, env, url) {
  const p = url.pathname;

  if (p === '/api/ping') return json({ ok: true });
  // Der Wecker-Kurzbefehl darf nur das Briefing abrufen, mit eigenem Code (?k=).
  let weck = false;
  const wkKey = url.searchParams.get('k');
  if ((p === '/api/briefing' || p === '/api/radio' || p === '/api/radio/live' || p === '/api/wecker/jetzt') && wkKey) {
    const r = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('weckcode').first();
    weck = !!(r && r.v && r.v.length === wkKey.length && r.v === wkKey);
  }
  if (!weck && !authorized(req, env)) return json({ error: 'unauthorized' }, 401);

  if (p === '/api/mcp/code' && req.method === 'GET') {
    if (weck) return json({ error: 'unauthorized' }, 401);
    let r = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('mcpcode').first();
    if (!r) {
      const a = 'abcdefghjkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(32));
      const v = Array.from(b, (x) => a[x % a.length]).join('');
      await env.DB.prepare('INSERT INTO secrets (k,v) VALUES (?1,?2)').bind('mcpcode', v).run();
      r = { v };
    }
    return json({ url: url.origin + '/mcp/' + r.v });
  }

  if (p === '/api/wecker/code' && req.method === 'GET') {
    let r = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('weckcode').first();
    if (!r) {
      const a = 'abcdefghjkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(24));
      const v = Array.from(b, (x) => a[x % a.length]).join('');
      await env.DB.prepare('INSERT INTO secrets (k,v) VALUES (?1,?2)').bind('weckcode', v).run();
      r = { v };
    }
    return json({ code: r.v });
  }

  // Alle Änderungen seit einem Zeitpunkt (ms). since=0 liefert alles.
  if (p === '/api/sync' && req.method === 'GET') {
    const since = Number(url.searchParams.get('since') || 0) || 0;
    const { results } = await env.DB.prepare('SELECT c, id, d, u FROM docs WHERE u > ?1 ORDER BY u').bind(since).all();
    const max = results.reduce((m, r) => Math.max(m, r.u), since);
    return json({
      cursor: max,
      docs: results.map((r) => ({ c: r.c, id: r.id, d: r.d == null ? null : JSON.parse(r.d), u: r.u })),
    });
  }

  // Ein Dokument schreiben (d = null löscht es).
  if (p === '/api/doc' && req.method === 'POST') {
    const b = await req.json().catch(() => null);
    if (!b || !NAME.test(b.c || '') || !NAME.test(b.id || '')) return json({ error: 'invalid_argument' }, 400);
    if (b.d != null && (typeof b.d !== 'object' || Array.isArray(b.d))) return json({ error: 'invalid_argument' }, 400);
    const body = b.d == null ? null : JSON.stringify(b.d);
    if (body && body.length > 900_000) return json({ error: 'quota_exceeded' }, 413);
    const u = await stamp(env);
    await writeDoc(env, b.c, b.id, b.d, u);
    return json({ ok: true, u });
  }

  // Viele Dokumente auf einmal (Import, Automationen).
  if (p === '/api/batch' && req.method === 'POST') {
    const b = await req.json().catch(() => null);
    if (!b || !Array.isArray(b.docs)) return json({ error: 'invalid_argument' }, 400);
    let u = await stamp(env);
    const stmts = [];
    for (const x of b.docs) {
      if (!NAME.test(x.c || '') || !NAME.test(x.id || '')) return json({ error: 'invalid_argument', doc: x.id }, 400);
      stmts.push(
        x.d == null
          ? env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,NULL,?3) ON CONFLICT(c,id) DO UPDATE SET d=NULL,u=?3').bind(x.c, x.id, u++)
          : env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,?3,?4) ON CONFLICT(c,id) DO UPDATE SET d=?3,u=?4').bind(x.c, x.id, JSON.stringify(x.d), u++)
      );
    }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return json({ ok: true, n: stmts.length });
  }

  // Ein Dokument lesen (für Automationen).
  if (p === '/api/doc' && req.method === 'GET') {
    const c = url.searchParams.get('c'), id = url.searchParams.get('id');
    if (!NAME.test(c || '') || !NAME.test(id || '')) return json({ error: 'invalid_argument' }, 400);
    return json({ d: await getDoc(env, c, id) });
  }

  // Termine aus dem privaten iCal-Link (settings/kalender.ics).
  if (p === '/api/cal' && req.method === 'GET') {
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) return json({ error: 'invalid_argument' }, 400);
    const cfg = await getDoc(env, 'settings', 'kalender');
    const ics = (cfg && cfg.ics) || env.CAL_ICS;
    if (!ics) return json({ error: 'no_calendar' }, 404);
    try {
      const events = await calendarEvents(ics, from, to);
      return json({ events });
    } catch (e) {
      return json({ error: 'calendar_failed', message: String(e && e.message || e).slice(0, 200) }, 502);
    }
  }

  // Morgen-Briefing. format=text liefert reinen Text (für den Kurzbefehl zum Vorlesen).
  if (p === '/api/briefing' && req.method === 'GET') {
    const events = await todaysEvents(env);
    const doc = await briefing(env, { fresh: url.searchParams.get('fresh') === '1', events });
    if (url.searchParams.get('format') === 'text') return new Response(doc.text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    return json(doc);
  }

  // Durchgehender Radio-Stream (gleiche Adresse wie die App, damit die App die Lautstärke regeln kann).
  if (p === '/api/radio/live' && req.method === 'GET') {
    const cfg = (await getDoc(env, 'settings', 'wecker')) || {};
    const key = url.searchParams.get('s') || cfg.sender || 'srf3';
    const src = RADIO[key] ? RADIO[key].url : RADIO.srf3.url;
    const r = await fetch(src, { headers: { 'user-agent': 'James-Wecker/1.0' } });
    if (!r.ok || !r.body) return json({ error: 'radio_failed' }, 502);
    return new Response(r.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
  }

  // Für die Kurzbefehle-Automationen im Viertelstunden-Takt: „ja“ genau einmal pro Tag zur Weckzeit aus der App.
  if (p === '/api/wecker/jetzt' && req.method === 'GET') {
    const cfg = Object.assign({ wt: '06:30', we: '07:45', days: [0, 1, 2, 3, 4, 5, 6], aktiv: true }, (await getDoc(env, 'settings', 'wecker')) || {});
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    const now = +parts.hour * 60 + +parts.minute;
    const target = String((wd === 0 || wd === 6) ? cfg.we : cfg.wt).split(':').map(Number);
    const diff = now - (target[0] * 60 + target[1]);
    let ja = cfg.aktiv !== false && cfg.days.includes(wd) && diff >= -3 && diff < 13;
    const key = 'weck-' + todayLocal();
    if (ja && url.searchParams.get('test') !== '1') {
      if (await env.KV.get(key)) ja = false; else await env.KV.put(key, '1', { expirationTtl: 60 * 60 * 30 });
    }
    return new Response(ja ? 'ja' : 'nein', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }

  if (p === '/api/radio/prepare' && req.method === 'POST') {
    if (weck) return json({ error: 'unauthorized' }, 401);
    await prepareRadio(env, true);
    return json({ ok: true });
  }

  // Webradio-Ausschnitt für den Wecker. Morgens vorab aufgenommen, sonst live.
  if (p === '/api/radio' && req.method === 'GET') {
    const cfg = (await getDoc(env, 'settings', 'wecker')) || {};
    const sec = Math.max(5, Math.min(180, Number(url.searchParams.get('sec')) || cfg.sec || 30));
    const key = url.searchParams.get('s') || cfg.sender || 'srf3';
    const live = url.searchParams.get('live') === '1';
    const t = todayLocal();
    if (!live) {
      const { value, metadata: m } = await env.KV.getWithMetadata('radio', 'arrayBuffer');
      if (value && m && m.s === key && m.sec === sec) return new Response(value, { headers: AUDIO });
    }
    const clip = await radioClip(key, sec);
    if (!clip) return json({ error: 'radio_failed' }, 502);
    return new Response(clip, { headers: AUDIO });
  }

  if (p === '/api/geo/rev' && req.method === 'GET') {
    const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'invalid_argument' }, 400);
    return json({ place: await reverseGeocode(lat, lon).catch(() => null) });
  }

  if (p === '/api/geo' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (!q) return json({ results: [] });
    return json({ results: await geocode(q) });
  }

  return json({ error: 'not_found' }, 404);
}

export const RADIO = {
  srf3: { n: 'Radio SRF 3', url: 'https://stream.srg-ssr.ch/m/drs3/mp3_128' },
  srf1: { n: 'Radio SRF 1', url: 'https://stream.srg-ssr.ch/m/drs1/mp3_128' },
  swisspop: { n: 'Radio Swiss Pop', url: 'https://stream.srg-ssr.ch/m/rsp/mp3_128' },
  swissjazz: { n: 'Radio Swiss Jazz', url: 'https://stream.srg-ssr.ch/m/rsj/mp3_128' },
  swissclassic: { n: 'Radio Swiss Classic', url: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128' },
  swr3: { n: 'SWR3', url: 'https://liveradio.swr.de/sw282p3/swr3/play.mp3' },
};

const AUDIO = { 'content-type': 'audio/mpeg', 'content-disposition': 'inline; filename="radio.mp3"', 'cache-control': 'no-store' };
async function radioClip(key, sec) {
  const src = RADIO[key] ? RADIO[key].url : /^https:\/\//.test(key) ? key : RADIO.srf3.url;
  try {
    const r = await fetch(src, { headers: { 'user-agent': 'James-Wecker/1.0' } });
    if (!r.ok || !r.body) return null;
    const kbps = Number(r.headers.get('icy-br')) || 128;
    const want = Math.round(sec * kbps * 1000 / 8);
    const reader = r.body.getReader(), parts = [];
    let got = 0;
    while (got < want) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; }
    reader.cancel().catch(() => {});
    const out = new Uint8Array(got); let o = 0;
    for (const v of parts) { out.set(v, o); o += v.length; }
    return out;
  } catch (e) { return null; }
}
async function prepareRadio(env, force) {
  const cfg = (await getDoc(env, 'settings', 'wecker')) || {};
  if (!force && (cfg.musik || 'radio') !== 'radio') return;
  const key = cfg.sender || 'srf3', sec = cfg.sec || 30;
  const clip = await radioClip(key, sec);
  if (!clip) return;
  await env.KV.put('radio', clip, { metadata: { d: todayLocal(), s: key, sec }, expirationTtl: 60 * 60 * 30 });
}

async function todaysEvents(env) {
  try {
    const cfg = await getDoc(env, 'settings', 'kalender');
    const ics = (cfg && cfg.ics) || env.CAL_ICS;
    if (!ics) return null;
    const t = todayLocal();
    const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
    return await calendarEvents(ics, t, d.toISOString().slice(0, 10));
  } catch (e) { return null; }
}

export default {
  // Jeden Morgen um 5:15 Uhr (UTC) das Briefing vorbereiten, damit es beim Wecken sofort da ist.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(todaysEvents(env).then((events) => briefing(env, { fresh: true, events })).catch(() => {}));
    ctx.waitUntil(prepareRadio(env).catch(() => {}));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/mcp/')) {
      try { return await mcp(req, env, url.pathname.slice(5).replace(/\/$/, '')); }
      catch (e) { return json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Interner Fehler' } }, 500); }
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url);
      } catch (e) {
        return json({ error: 'internal', message: String(e && e.message || e).slice(0, 300) }, 500);
      }
    }
    return serveStatic(url);
  },
};
