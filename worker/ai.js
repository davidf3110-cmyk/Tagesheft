// James – der KI-Teil: Chat, Karriere-Neuberechnung, Morgen-Briefing.
// Der Anthropic-API-Schlüssel liegt nur in der Tabelle `secrets` und verlässt den Server nie.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const TZ = 'Europe/Zurich';
const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const PLAN = { 0: 'run', 1: 'swim', 2: 'gym', 3: 'swim', 4: 'gym', 5: 'free', 6: 'gym' };
const TN = { gym: 'Gym', swim: 'Schwimmen', run: 'Laufen', rest: 'Ruhetag', free: 'frei' };
const HAB = [
  { k: 'gebet', n: 'Gebet', days: [0, 1, 2, 3, 4, 5, 6] },
  { k: 'bibel', n: 'Bibel', days: [0, 1, 2, 3, 4, 5, 6] },
  { k: 'spanisch', n: 'Spanisch', days: [0, 1, 3, 5] },
  { k: 'python', n: 'Python', days: [2, 4, 6] },
  { k: 'kirche', n: 'Kirche', days: [0] },
];

/* ---------- Hilfen ---------- */
const fmtLocal = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const todayLocal = () => fmtLocal.format(new Date());
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (d) => d.toISOString().slice(0, 10);
const addD = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const wd = (s) => parse(s).getUTCDay();
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const has = (v) => String(v ?? '').trim() !== '';
const list = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]);

async function all(env, c) {
  const { results } = await env.DB.prepare('SELECT id, d FROM docs WHERE c=?1 AND d IS NOT NULL').bind(c).all();
  return results.map((r) => [r.id, JSON.parse(r.d)]);
}
async function one(env, c, id) {
  const r = await env.DB.prepare('SELECT d FROM docs WHERE c=?1 AND id=?2').bind(c, id).first();
  return r && r.d ? JSON.parse(r.d) : null;
}
async function put(env, c, id, d) {
  const row = await env.DB.prepare('SELECT MAX(u) AS m FROM docs').first();
  const u = Math.max(Date.now(), (row && row.m ? row.m : 0) + 1);
  await env.DB.prepare('INSERT INTO docs (c,id,d,u) VALUES (?1,?2,?3,?4) ON CONFLICT(c,id) DO UPDATE SET d=?3,u=?4')
    .bind(c, id, JSON.stringify(d), u).run();
}

/* ---------- Schlüssel ---------- */
export async function getKey(env) {
  const r = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('anthropic').first();
  return r ? r.v : env.ANTHROPIC_API_KEY || '';
}
export async function setKey(env, v) {
  if (!v) { await env.DB.prepare('DELETE FROM secrets WHERE k=?1').bind('anthropic').run(); return { ok: true }; }
  const client = new Anthropic({ apiKey: v });
  try {
    await client.models.retrieve(MODEL);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: 'Der Schlüssel wird von Anthropic abgelehnt.' };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, error: 'Der Schlüssel hat keinen Zugriff auf das Modell.' };
    if (!(e instanceof Anthropic.NotFoundError)) return { ok: false, error: 'Anthropic war nicht erreichbar. Versuch es gleich noch einmal.' };
  }
  await env.DB.prepare('INSERT INTO secrets (k,v) VALUES (?1,?2) ON CONFLICT(k) DO UPDATE SET v=?2').bind('anthropic', v).run();
  return { ok: true };
}
async function client(env) {
  const key = await getKey(env);
  if (!key) throw Object.assign(new Error('Kein API-Schlüssel hinterlegt.'), { code: 'no_key' });
  return new Anthropic({ apiKey: key, maxRetries: 2 });
}

// Eine Anfrage an Claude; setzt pausierte Server-Tool-Runden fort und gibt den Text zurück.
async function ask(env, { system, messages, effort = 'medium', tools, format, maxTokens = 8000 }) {
  const c = await client(env);
  let msgs = messages.slice();
  for (let i = 0; i < 4; i++) {
    const params = {
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: msgs,
      output_config: format ? { effort, format } : { effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    };
    if (tools) params.tools = tools;
    let r;
    try {
      r = await c.beta.messages.create(params);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('Der API-Schlüssel ist ungültig.'), { code: 'no_key' });
      if (e instanceof Anthropic.RateLimitError) throw Object.assign(new Error('Zu viele Anfragen. Versuch es in einer Minute noch einmal.'), { code: 'busy' });
      if (e instanceof Anthropic.APIError) throw Object.assign(new Error('Claude meldet einen Fehler (' + e.status + ').'), { code: 'ai_error' });
      throw e;
    }
    if (r.stop_reason === 'pause_turn') { msgs = [...msgs, { role: 'assistant', content: r.content }]; continue; }
    if (r.stop_reason === 'refusal') throw Object.assign(new Error('Dazu kann ich leider nichts sagen.'), { code: 'refusal' });
    return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  }
  throw Object.assign(new Error('Die Antwort hat zu lange gedauert.'), { code: 'ai_error' });
}

/* ---------- Kontext aus der App ---------- */
async function profile(env) {
  const p = (await one(env, 'settings', 'profil')) || {};
  return { name: p.name || 'David', ort: p.ort || 'Basel', lat: p.lat ?? 47.5596, lon: p.lon ?? 7.5886 };
}

function sessLine(k, x) {
  const t = x.type || ((x.ex || []).length ? 'gym' : num(x.laps) ? 'swim' : num(x.dist) ? 'run' : '');
  if (t === 'gym') {
    const ex = (x.ex || []).filter((e) => (e.sets || []).some((q) => has(q.w) || has(q.r)));
    if (!ex.length) return null;
    return k + ' Gym' + (x.tpl ? ' Tag ' + x.tpl : '') + ': ' + ex.map((e) => e.n + ' ' + (e.sets || []).filter((q) => has(q.w) || has(q.r)).map((q) => (q.w || '–') + '×' + (q.r || '–')).join('/')).join('; ');
  }
  if (t === 'run' && (num(x.dist) || num(x.min))) return k + ' Laufen ' + x.dist + ' km in ' + (x.min || 0) + ':' + String(x.sec || 0).padStart(2, '0');
  if (t === 'swim' && (num(x.laps) || num(x.dist))) return k + ' Schwimmen ' + (num(x.laps) ? num(x.laps) * num(x.pool || 25) : x.dist) + ' m';
  return null;
}

export async function lifeContext(env, scope) {
  const t = todayLocal();
  const P = await profile(env);
  const [todos, days, sessions, prayers, orte, shop, jobs] = await Promise.all(
    ['todos', 'days', 'sessions', 'prayers', 'orte', 'shop', 'jobs'].map((c) => all(env, c))
  );
  const karriere = await one(env, 'settings', 'karriere');
  const lines = [];
  lines.push(`Heute: ${WDL[wd(t)]}, ${t}. Wohnort: ${P.ort}. Name: ${P.name}.`);

  const open = todos.filter(([, x]) => x.st !== 'done').sort((a, b) => (a[1].due || '9999').localeCompare(b[1].due || '9999'));
  lines.push('\nOffene To-dos (' + open.length + '):');
  open.slice(0, 40).forEach(([, x]) => lines.push(`- ${x.t}${x.due ? ' (fällig ' + x.due + ')' : ''}${x.pr === 'Hoch' ? ' [hoch]' : ''}`));

  if (scope !== 'reise') {
    const from = addD(t, -13);
    const dmap = Object.fromEntries(days);
    lines.push('\nGewohnheiten letzte 14 Tage (erledigt/geplant):');
    HAB.forEach((h) => {
      let pl = 0, dn = 0;
      for (let k = from; k <= t; k = addD(k, 1)) if (h.days.includes(wd(k))) { pl++; if (dmap[k] && dmap[k].h && dmap[k].h[h.k]) dn++; }
      lines.push(`- ${h.n}: ${dn}/${pl}`);
    });
    lines.push('\nTraining letzte 21 Tage (Plan: So Laufen, Mo+Mi Schwimmen, Di/Do/Sa Gym, Fr frei):');
    sessions.filter(([k]) => k >= addD(t, -20)).sort().forEach(([k, x]) => { const l = sessLine(k, x); if (l) lines.push('- ' + l); });
    const kg = sessions.filter(([, x]) => has(x.kg)).sort().slice(-5).map(([k, x]) => k + ': ' + x.kg + ' kg');
    if (kg.length) lines.push('Körpergewicht: ' + kg.join(', '));
    const W = { no: 0, part: 0.5, yes: 1, more: 1.5 };
    const dec = prayers.filter(([, p]) => W[p.status] != null);
    const q = dec.length ? Math.round((dec.reduce((s, [, p]) => s + W[p.status], 0) / dec.length) * 100) : null;
    lines.push(`\nGebetsampel (nur Zahlen, Texte sind privat): ${prayers.length} Gebete, ${dec.length} entschieden, Quote ${q ?? '–'} %.`);
    const sh = shop.filter(([, x]) => !x.done).map(([, x]) => x.t);
    if (sh.length) lines.push('Einkaufsliste: ' + sh.join(', '));
  }

  const war = orte.filter(([, x]) => x.war), will = orte.filter(([, x]) => !x.war);
  lines.push('\nSchon bereist (Regionen): ' + war.map(([, x]) => x.n + (x.land ? ' (' + x.land + ')' : '')).join('; '));
  lines.push('Wunschziele: ' + will.map(([, x]) => x.n + (x.land ? ' (' + x.land + ')' : '') + (x.prio ? ' ⭐' : '')).join('; '));

  if (karriere) {
    lines.push('\nKarriere: Ziel ' + (karriere.ziel || '–') + '. Aktuell: ' + [karriere.aktuell?.rolle, karriere.aktuell?.firma, karriere.aktuell?.land].filter(Boolean).join(', ') + '.');
    if (karriere.plan?.stationen) lines.push('Geplante nächste Stationen: ' + karriere.plan.stationen.slice(0, 4).map((s) => s.titel + ' (' + s.firma + ', ' + s.land + ')').join(' → '));
  }
  const offen = jobs.filter(([, j]) => !['Verworfen', 'Absage'].includes(j.st));
  if (offen.length && scope !== 'reise') lines.push('Gemerkte Stellen: ' + offen.map(([, j]) => j.pos + ' bei ' + j.firma + (j.st ? ' [' + j.st + ']' : '')).join('; '));

  const rep = await one(env, 'reports', 'tag-' + t);
  if (rep && scope === 'james') {
    if (rep.wetter) lines.push(`\nWetter heute: ${rep.wetter.lo}–${rep.wetter.hi} °C, ${rep.wetter.t || ''}`);
    if ((rep.mails || []).length) lines.push('Mails heute: ' + rep.mails.map((m) => m.w + ': ' + m.b + ' (' + m.a + ')').join('; '));
  }
  return lines.join('\n');
}

/* ---------- Chat ---------- */
const PERSONA = `Du bist James, der persönliche Assistent von David. Du kennst sein Leben aus seiner App (Daten unten).
Sprich Deutsch, per du, knapp, klar und ehrlich – nicht bestätigend, sondern kritisch, wo es hilft. Keine langen Einleitungen.
Antworte in kurzen Absätzen oder knappen Listen, ohne Tabellen. Gebetstexte sind privat und kommen nie vor.
Du hast keinen Zugriff auf Mails, Kalender oder Konten außer dem, was unten steht. Wenn etwas fehlt, sag es.`;

const SCOPES = {
  james: 'Du hilfst beim Planen von Alltag, Training, Lernen, Gewohnheiten und Prioritäten.',
  reise: `Du bist Davids Reiseberater. Er lebt in Basel. Schlage konkrete nächste Reiseziele vor, passend zu seinem Budget und seiner Zeit,
mit groben Kosten in CHF (Anreise ab Basel/Zürich, Unterkunft, Tagesbudget), bester Reisezeit und warum es zu ihm passt.
Berücksichtige, wo er schon war (nicht noch einmal dorthin, außer es passt) und seine Wunschziele. Nutze die Websuche für aktuelle Preise und Reisezeiten, wenn nötig.`,
  karriere: `Du bist Davids Karriere-Mentor. Er will über den Vertrieb bei Roche (Pharma oder Diagnostics) bis zum CEO. Antworte konkret und realistisch,
mit Rollen, Ländern, typischen Verweildauern und dem, was er jetzt tun kann.`,
};

export async function chat(env, scope, messages) {
  scope = SCOPES[scope] ? scope : 'james';
  const ctx = await lifeContext(env, scope);
  const clean = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  while (clean.length && clean[0].role !== 'user') clean.shift();
  if (!clean.length) throw Object.assign(new Error('Leere Frage.'), { code: 'invalid_argument' });
  const system = [
    { type: 'text', text: PERSONA + '\n\n' + SCOPES[scope] },
    { type: 'text', text: 'Davids Daten:\n' + ctx },
  ];
  return ask(env, {
    system, messages: clean, effort: scope === 'james' ? 'low' : 'medium',
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: scope === 'reise' ? 4 : 2, user_location: { type: 'approximate', city: 'Basel', country: 'CH', timezone: TZ } }],
  });
}

/* ---------- Karriere-Neuberechnung ---------- */
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['zusammenfassung', 'stationen', 'risiken', 'jetzt_tun'],
  properties: {
    zusammenfassung: { type: 'string' },
    stationen: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titel', 'firma', 'land', 'flagge', 'ab_jahr', 'dauer', 'stufe', 'warum', 'fokus', 'alternativen'],
        properties: {
          titel: { type: 'string' },
          firma: { type: 'string' },
          land: { type: 'string' },
          flagge: { type: 'string' },
          ab_jahr: { type: 'integer' },
          dauer: { type: 'string' },
          stufe: { type: 'string' },
          warum: { type: 'string' },
          fokus: { type: 'array', items: { type: 'string' } },
          alternativen: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['titel', 'firma', 'land', 'flagge', 'warum'],
              properties: { titel: { type: 'string' }, firma: { type: 'string' }, land: { type: 'string' }, flagge: { type: 'string' }, warum: { type: 'string' } },
            },
          },
        },
      },
    },
    risiken: { type: 'array', items: { type: 'string' } },
    jetzt_tun: { type: 'array', items: { type: 'string' } },
  },
};

export async function replanCareer(env) {
  const k = (await one(env, 'settings', 'karriere')) || {};
  const year = Number(todayLocal().slice(0, 4));
  const a = k.aktuell || {};
  const brief = [
    `Heute: ${todayLocal()}.`,
    `Endziel: ${k.ziel || 'CEO von Roche'}${k.zieljahr ? ' bis ' + k.zieljahr : ''}.`,
    `Aktuelle Station: ${[a.rolle, a.firma, a.land].filter(Boolean).join(', ') || 'unbekannt'}${a.seit ? ', seit ' + a.seit : ''}.`,
    `Bisherige Stationen: ${(k.historie || []).map((h) => [h.rolle, h.firma, h.land, h.von && h.bis ? h.von + '–' + h.bis : ''].filter(Boolean).join(', ')).join(' | ') || 'keine'}.`,
    `Ausbildung: ${k.ausbildung || 'Bachelor, MBA später berufsbegleitend geplant'}.`,
    `Sprachen: ${k.sprachen || 'Deutsch, Englisch, Spanisch im Aufbau'}.`,
    `Stärken und Skills: ${(k.skills || []).join(', ') || '–'}.`,
    `Vorbilder: ${(k.vorbilder || []).join('; ') || '–'}.`,
    `Bevorzugte Länder oder Regionen: ${(k.laender || []).join(', ') || 'offen'}.`,
    `Wünsche und Grenzen: ${k.wuensche || '–'}.`,
    k.fix && k.fix.length ? `Fest gewählte nächste Schritte (unbedingt so übernehmen, in dieser Reihenfolge, direkt nach der aktuellen Station): ${k.fix.map((f) => f.titel + ' – ' + f.firma + ' – ' + f.land).join(' → ')}.` : '',
  ].filter(Boolean).join('\n');

  const system = `Du bist ein erfahrener Executive-Karriereberater für die Pharma- und Diagnostikbranche mit genauer Kenntnis der Karrierewege bei Roche
(Roche Pharma und Roche Diagnostics, Affiliates, Regionen, globale Funktionen in Basel und South San Francisco) und typischer Wege bisheriger Roche-Führungskräfte.
Plane den realistischsten Weg von der aktuellen Station bis zum Endziel. Wichtig:
- Realistisch viele Zwischenstationen (meist 8–12 bis CEO), je 2–3 Jahre, mit echten Rollentiteln, wie Roche sie verwendet (z. B. Key Account Manager, Product Manager, Brand Manager, Customer Partner Lead, Commercial Lead, Head of Marketing, Business Unit Head, Country Manager/General Manager kleines Land, General Manager großes Land, Head of Region, Global Function Head, Division CEO, Group CEO).
- Wechsel zwischen Pharma und Diagnostics, Land und global, Linie und Strategie gezielt einsetzen, mit sinnvollen Ländern (Affiliates mit Entwicklungschancen, Lateinamerika, Asien, Nordics usw.).
- Fester Startpunkt ist die aktuelle Station; die erste Station im Plan ist die NÄCHSTE nach der aktuellen.
- Pro Station 1–2 realistische Alternativen.
- „stufe“: kurze Einordnung wie „Einstieg“, „Erste Führung“, „Ländermanagement“, „Regional“, „Global“, „Konzernleitung“.
- „flagge“: das Flaggen-Emoji des Landes (bei globalen Rollen das des Standorts).
- „ab_jahr“: Startjahr als Zahl, beginnend frühestens ${year}.
- „jetzt_tun“: 3–5 konkrete Schritte für die nächsten 6 Monate.
- Ehrlich: nenne Risiken (z. B. Bachelor ohne MBA, Mobilität, Konkurrenz).
Sprache: Deutsch.`;
  const text = await ask(env, {
    system, messages: [{ role: 'user', content: brief }], effort: 'high', maxTokens: 16000,
    format: { type: 'json_schema', schema: PLAN_SCHEMA },
  });
  const plan = JSON.parse(text);
  plan.erstellt = new Date().toISOString();
  plan.basis = [a.rolle, a.firma, a.land].filter(Boolean).join(', ');
  const cur = (await one(env, 'settings', 'karriere')) || {};
  cur.plan = plan;
  cur.fix = [];
  await put(env, 'settings', 'karriere', cur);
  return plan;
}

/* ---------- Morgen-Briefing ---------- */
const WMO = (c) => (c === 0 ? 'klar' : c <= 2 ? 'leicht bewölkt' : c === 3 ? 'bedeckt' : c <= 48 ? 'neblig' : c <= 57 ? 'Nieselregen' : c <= 67 ? 'Regen' : c <= 77 ? 'Schnee' : c <= 82 ? 'Regenschauer' : c <= 86 ? 'Schneeschauer' : 'Gewitter');

async function weather(P) {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${P.lat}&longitude=${P.lon}&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code&timezone=${encodeURIComponent(TZ)}&forecast_days=1`;
    const r = await fetch(u);
    if (!r.ok) return null;
    const j = await r.json();
    const d = j.daily;
    return { lo: Math.round(d.temperature_2m_min[0]), hi: Math.round(d.temperature_2m_max[0]), regen: d.precipitation_probability_max[0], t: WMO(d.weather_code[0]) };
  } catch (e) {
    return null;
  }
}

export async function briefing(env, { useAi = true, fresh = false, events = null } = {}) {
  const t = todayLocal();
  const id = 'james-' + t;
  if (!fresh) {
    const cached = await one(env, 'reports', id);
    if (cached && cached.text && (cached.ai || !useAi || !(await getKey(env)))) return cached;
  }
  const P = await profile(env);
  const [todos, sessions, days] = await Promise.all(['todos', 'sessions', 'days'].map((c) => all(env, c)));
  const W = await weather(P);
  const d = parse(t);
  const S = [];
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).find((x) => x.type === 'hour').value);
  S.push(`${hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend'}, ${P.name}. Heute ist ${WDL[d.getUTCDay()]}, der ${d.getUTCDate()}. ${MON[d.getUTCMonth()]}.`);
  if (W) S.push(`In ${P.ort} ${W.lo} bis ${W.hi} Grad, ${W.t}${W.regen >= 40 ? ', Regenwahrscheinlichkeit ' + W.regen + ' Prozent – nimm einen Schirm mit' : ''}.`);
  if (events && events.length) {
    const ev = events.filter((e) => !/Arbeit Roche|🏋|🏃|🏊|🇪🇸|🐍|📖|⛪/.test(e.summary));
    if (ev.length) S.push('Termine: ' + list(ev.slice(0, 4).map((e) => (e.start.dateTime ? e.start.dateTime.slice(11, 16) + ' ' : '') + e.summary)) + '.');
  }
  const open = todos.filter(([, x]) => x.st !== 'done');
  const late = open.filter(([, x]) => x.due && x.due < t), now = open.filter(([, x]) => x.due === t);
  if (now.length) S.push(`Heute fällig: ${list(now.slice(0, 4).map(([, x]) => x.t))}.`);
  if (late.length) S.push(`${late.length === 1 ? 'Ein To-do ist' : late.length + ' To-dos sind'} überfällig${late.length <= 2 ? ': ' + list(late.map(([, x]) => x.t)) : ''}.`);
  if (!now.length && !late.length) S.push('Heute ist kein To-do fällig.');
  const p = PLAN[d.getUTCDay()];
  const done = sessions.find(([k]) => k === t);
  if (p !== 'free' && !(done && done[1].type)) S.push(`Training laut Plan: ${TN[p]}.`);
  const y = addD(t, -1), ys = sessions.find(([k]) => k === y);
  if (ys && sessLine(y, ys[1])) S.push(`Gestern: ${TN[ys[1].type || 'gym'] || 'Training'} erledigt – stark.`);
  const dmap = Object.fromEntries(days), mon = addD(t, -((d.getUTCDay() + 6) % 7));
  let g = 0, n = 0;
  for (let k = mon; k < t; k = addD(k, 1)) { n++; if (dmap[k] && dmap[k].h && dmap[k].h.gebet) g++; }
  if (n) S.push(`Gebetet an ${g} von ${n} Tagen dieser Woche.`);
  const rep = await one(env, 'reports', 'tag-' + t);
  if (rep && rep.losung && rep.losung.text) S.push('Die Losung für heute: ' + rep.losung.text + (rep.losung.ref ? ' – ' + rep.losung.ref + '.' : ''));
  S.push('Ich wünsch dir einen guten Tag.');
  let text = S.join(' ');
  let ai = false;

  if (useAi && (await getKey(env))) {
    try {
      const ctx = await lifeContext(env, 'james');
      text = await ask(env, {
        system: [{ type: 'text', text: PERSONA }, { type: 'text', text: 'Davids Daten:\n' + ctx }],
        messages: [{ role: 'user', content: 'Formuliere aus diesen Fakten mein gesprochenes Morgen-Briefing, wie ein persönlicher Butler: warm, ruhig, auf den Punkt, höchstens 110 Wörter, ganze Sätze ohne Listen, Aufzählungszeichen oder Emojis (es wird vorgelesen). Nenne nur, was heute wirklich zählt. Steht eine Losung in den Fakten, gib sie wörtlich mit Bibelstelle wieder. Schließe mit einem kurzen, konkreten Impuls für den Tag.\n\nFakten:\n' + S.join('\n') }],
        effort: 'low', maxTokens: 2000,
      });
      ai = true;
    } catch (e) { /* bei Fehlern bleibt die einfache Fassung */ }
  }
  const doc = { type: 'james', d: t, text, ai, wetter: W, at: new Date().toISOString() };
  await put(env, 'reports', id, doc);
  return doc;
}

/* ---------- Ortssuche ---------- */
export async function geocode(q) {
  const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=de&format=json&name=' + encodeURIComponent(q));
  if (!r.ok) return [];
  const j = await r.json();
  return (j.results || []).map((x) => ({ n: x.name, region: x.admin1 || '', land: x.country || '', cc: x.country_code || '', lat: x.latitude, lon: x.longitude }));
}

// Ort an einer Koordinate (für das Markieren auf dem Globus). OpenStreetMap Nominatim, sparsam genutzt.
export async function reverseGeocode(lat, lon) {
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=de&lat=${lat}&lon=${lon}`, {
    headers: { 'user-agent': 'James-Planer/1.0 (persoenliche App)' },
  });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || j.error || !j.address) return null;
  const a = j.address;
  const n = a.city || a.town || a.village || a.municipality || a.county || a.state_district || a.state || a.region || j.name;
  if (!n) return null;
  return { n, region: a.state || a.region || '', land: a.country || '', cc: (a.country_code || '').toUpperCase(), lat: +j.lat, lon: +j.lon };
}
