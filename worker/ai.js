// James – Kontext für den Claude-Connector, Morgen-Briefing (ohne KI, kostenlos) und Ortssuche.

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

/* ---------- Herrnhuter Losung (losung.net, wörtlich wie im Losungsbuch) ---------- */
const ENT = { auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', quot: '"', amp: '&', apos: "'", lt: '<', gt: '>', nbsp: ' ', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»' };
const unent = (x) => x.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
export function parseLosung(html) {
  const m = html.match(/<meta name="description" content="[^"]*?\d{1,2}\.\d{1,2}\.\d{4}:\s*([^"]*?)"/);
  if (!m) return null;
  const parts = unent(m[1]).split(' -- ');
  const head = parts[0], i = head.indexOf(' - ');
  if (i < 0 || parts.length < 2) return null;
  const refs = head.slice(0, i).split(' + ');
  const text = head.slice(i + 3).trim(), lehr = parts[1].trim();
  if (!text || !refs[0]) return null;
  return { text, ref: refs[0].trim(), lehr, lehrRef: (refs[1] || '').trim() };
}
export async function losungHeute(env, t) {
  const have = await one(env, 'reports', 'losung-' + t);
  if (have && have.text) return have;
  try {
    const [j, m, d] = t.split('-').map(Number);
    const r = await fetch(`https://losung.net/?j=${j}&m=${m}&t=${d}`, { headers: { 'user-agent': 'Mozilla/5.0 (James)' } });
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    let html = ''; for (let k = 0; k < b.length; k += 8192) html += String.fromCharCode.apply(null, b.subarray(k, k + 8192));
    if (/charset=utf-8/i.test(r.headers.get('content-type') || '')) html = new TextDecoder().decode(b);
    const l = parseLosung(html);
    if (!l) return null;
    const doc = Object.assign({ type: 'losung', d: t, quelle: 'losung.net', at: new Date().toISOString() }, l);
    await put(env, 'reports', 'losung-' + t, doc);
    return doc;
  } catch (e) { return null; }
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

// Schlusssätze im Jarvis-Stil, falls der Tagesbericht keinen eigenen liefert.
const SCHLUSS = [
  'Auf geht’s, Sir. Keine Ausreden – der Tag gehört dir.',
  'Sie denken vielleicht, du schaffst das nicht. Wir beide wissen, dass du ihnen heute das Gegenteil beweist.',
  'Der zukünftige CEO steht nicht im Bett herum. Aufstehen, David.',
  'Ich habe die Zahlen gesehen. Du packst das. Jetzt los.',
  'Große Karrieren werden an gewöhnlichen Dienstagen gebaut. Und an allen anderen Tagen auch.',
  'Disziplin schlägt Talent, wenn Talent schläft. Du schläfst nicht mehr.',
  'Ich glaube an dich, Sir. Ganz ohne Ironie.',
  'Heute ist ein guter Tag, um besser zu sein als gestern. Ich zähle auf dich.',
  'Die Welt wartet nicht. Gut, dass du schneller bist.',
  'Kaffee, Fokus, Wirkung. In dieser Reihenfolge, David.',
];

// Uhrzeit so, wie man sie sagt: 9:00 → „um 9 Uhr“, 9:30 → „um 9 Uhr 30“.
const uhr = (z) => { const [h, m] = String(z).split(':').map(Number); return 'um ' + h + ' Uhr' + (m ? ' ' + m : ''); };
// Text fürs Vorlesen glätten: keine Gedankenstriche, Emojis, Abkürzungen oder Zeichen, über die die Stimme stolpert.
function sprech(x) {
  return x
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s*[–—]\s*/g, ', ').replace(/\s*\/\s*/g, ' oder ')
    .replace(/°\s*C/g, ' Grad').replace(/\bCHF\b/g, 'Franken').replace(/\bEUR\b/g, 'Euro').replace(/\s&\s/g, ' und ')
    .replace(/\bz\.\s?B\./g, 'zum Beispiel').replace(/\bbzw\./g, 'beziehungsweise').replace(/\bca\./g, 'circa').replace(/\bNr\./g, 'Nummer')
    .replace(/(\d)'(\d)/g, '$1$2').replace(/(\d)\.(\d{3})\b/g, '$1$2')
    .replace(/[„“"»«]/g, '').replace(/\(([^)]*)\)/g, ', $1,')
    .replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/,\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
}
// Gesprochenes Morgen-Briefing: Termine, To-dos, wichtige Mails, Wetter, Depot – und ein persönlicher Schluss.
export async function briefing(env, { fresh = false, events = null } = {}) {
  const t = todayLocal();
  const id = 'james-' + t;
  const rep = await one(env, 'reports', 'tag-' + t);
  if (!fresh) {
    const cached = await one(env, 'reports', id);
    const stale = rep && rep.at && cached && cached.at && Date.parse(rep.at) > Date.parse(cached.at);
    if (cached && cached.text && cached.v === 7 && !stale) return cached;
  }
  const P = await profile(env);
  const [todos, sessions] = await Promise.all(['todos', 'sessions'].map((c) => all(env, c)));
  const W = await weather(P);
  const d = parse(t);
  const S = [];
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).find((x) => x.type === 'hour').value);
  // James spricht: Ich-Form, Butler im Jarvis-Stil, kurz – nur was ansteht. Wechselnde Formulierungen je Tag.
  const day = Math.floor(Date.parse(t) / 864e5), pick = (a) => a[day % a.length];
  const gruss = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const dat = `${WDL[d.getUTCDay()]}, der ${d.getUTCDate()}. ${MON[d.getUTCMonth()]}`;
  S.push(pick([`${gruss}, ${P.name}. James hier. Es ist ${dat}, und ich habe dir den Tag schon zurechtgelegt.`,
    `${gruss}, ${P.name}. Heute ist ${dat}. Ein guter Tag, um etwas zu bewegen.`,
    `${gruss}, ${P.name}. Es ist ${dat}. Lass uns kurz durchgehen, was ansteht.`,
    `${gruss}, ${P.name}. ${dat}. Ich bin bereit, wenn du es bist.`]));

  // Wetter
  const w = W || (rep && rep.wetter);
  if (w) S.push(`Draußen erwarten dich ${w.lo} bis ${w.hi} Grad${w.t ? ' und ' + w.t : ''}${W && W.regen >= 50 ? '. Denk an einen Schirm' : ''}.`);

  // Termine: aus dem Tagesbericht (Google Kalender), sonst aus dem iCal-Link
  let tm = (rep && Array.isArray(rep.termine) ? rep.termine : null);
  if (!tm && events) tm = events.filter((e) => !/Arbeit Roche|🏋|🏃|🏊|🇪🇸|🐍|📖|⛪/.test(e.summary)).map((e) => ({ z: e.start.dateTime ? e.start.dateTime.slice(11, 16) : '', n: e.summary }));
  if (tm && tm.length) S.push(`${pick(['Auf dem Programm steht', 'In deinem Kalender steht heute', 'Für heute geplant ist'])} ${list(tm.slice(0, 4).map((x) => (x.z ? uhr(x.z) + ' ' : '') + x.n))}.`);

  // To-dos
  const open = todos.filter(([, x]) => x.st !== 'done');
  const late = open.filter(([, x]) => x.due && x.due < t), now = open.filter(([, x]) => x.due === t);
  if (now.length) S.push(`Auf deiner Liste für heute: ${list(now.slice(0, 3).map(([, x]) => x.t))}. Das schaffst du.`);
  if (late.length) S.push(`${late.length === 1 ? 'Ein To-do wartet' : late.length + ' To-dos warten'} schon etwas länger, nimm dir heute kurz Zeit dafür.`);

  // Wichtige Mails: bevorzugt die Zusammenfassung aus dem Tagesbericht (Claude liest die Mails), sonst kurz aus den Zeilen.
  const mails = ((rep && rep.mails) || []).filter((m) => m && m.w && !/newsletter/i.test(m.w) && !/info|abmelden|montag|erledigt|nichts zu tun|kein handlungsbedarf/i.test(m.a || ''));
  if (rep && typeof rep.mailtext === 'string') { if (rep.mailtext.trim()) S.push(rep.mailtext.trim()); }
  else if (mails.length) S.push(`In deinem Posteingang wartet ${list(mails.slice(0, 3).map((m) => m.w + (m.b ? ' zu ' + m.b : '')))}.`);

  // Training laut Plan
  const p = PLAN[d.getUTCDay()], done = sessions.find(([k]) => k === t);
  if (p !== 'free' && !(done && done[1].type)) S.push(pick([`Laut Plan ist heute ${TN[p]} dran. Das zahlt auf alles andere ein.`, `Sportlich steht heute ${TN[p]} an. Zieh es durch.`, `Dein Trainingsplan sagt ${TN[p]}. Dein zukünftiges Ich wird dir danken.`]));

  // Depot
  const dp = rep && rep.depot;
  if (dp && isFinite(dp.wert)) {
    const f = (v) => String(Math.round(Math.abs(v)));
    let l = `Dein Depot steht bei ${f(dp.wert)} ${dp.cur === 'EUR' ? 'Euro' : 'Franken'}`;
    if (isFinite(dp.pct) && dp.pct !== 0) l += `, ${dp.pct > 0 ? 'ein Plus' : 'ein Minus'} von ${String(Math.abs(Math.round(dp.pct * 10) / 10)).replace('.', ',')} Prozent. ${dp.pct > 0 ? 'Schön, das läuft' : 'Ruhig bleiben, wir denken langfristig'}`;
    S.push(l + '.');
  }

  // Herrnhuter Losung (nur die Losung, wie im Losungsbuch)
  const L = (await losungHeute(env, t)) || (rep && rep.losung);
  if (L && L.text) S.push('Und die Losung für heute: ' + L.text.replace(/\bHERR(N?)\b/g, 'Herr$1').replace(/[.\s]*$/, '.'));

  // Persönlicher Schluss im Jarvis-Stil
  const n = Math.floor(Date.parse(t) / 864e5);
  S.push((rep && (rep.schluss || rep.impuls)) || SCHLUSS[n % SCHLUSS.length]);
  const text = sprech(S.join(' '));
  const doc = { type: 'james', v: 7, d: t, text, wetter: W, at: new Date().toISOString() };
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
