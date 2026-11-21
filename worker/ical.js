// Liest einen privaten iCal-Link (z. B. aus Google Kalender) und liefert die Termine
// in einem Zeitraum – im Format, das auch die Google-Calendar-Schnittstelle liefert.
// Unterstützt ganztägige Termine, Zeitzonen und die üblichen Wiederholungen (RRULE).

const TZ = 'Europe/Zurich';
const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = (n) => String(n).padStart(2, '0');

let cache = { url: '', at: 0, text: '' };

async function load(url) {
  if (cache.url === url && Date.now() - cache.at < 10 * 60 * 1000) return cache.text;
  const r = await fetch(url.replace(/^webcal:/, 'https:'), { headers: { 'user-agent': 'Tagesheft' } });
  if (!r.ok) throw new Error('Kalender antwortet mit ' + r.status);
  const text = await r.text();
  cache = { url, at: Date.now(), text };
  return text;
}

function lines(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function prop(line) {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const head = line.slice(0, i), value = line.slice(i + 1);
  const [name, ...ps] = head.split(';');
  const params = {};
  ps.forEach((p) => { const [k, v] = p.split('='); params[k.toUpperCase()] = (v || '').replace(/"/g, ''); });
  return { name: name.toUpperCase(), params, value };
}

const unesc = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

// UTC-Zeit → Ortszeit Zürich
const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function utcToLocal(ms) {
  const s = fmt.format(new Date(ms)).replace(' ', 'T');
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

// Wert eines DTSTART/DTEND/EXDATE → {date, time|null}
function when(p) {
  const v = p.value.trim();
  if (p.params.VALUE === 'DATE' || /^\d{8}$/.test(v)) return { date: v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8), time: null };
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  if (m[7] === 'Z') return utcToLocal(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] + ':' + m[5] };
}

const dUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (dt) => dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
const addDays = (s, n) => { const d = dUTC(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((dUTC(b) - dUTC(a)) / 864e5);
const toMin = (t) => (t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : 0);
const fromMin = (m) => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);

function nthWeekday(y, m, wd, n) {
  // n-ter Wochentag im Monat (n<0: von hinten)
  if (n > 0) {
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const day = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return day <= dim ? iso(new Date(Date.UTC(y, m, day))) : null;
  }
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m, dim)).getUTCDay();
  const day = dim - ((last - wd + 7) % 7) + (n + 1) * 7;
  return day >= 1 ? iso(new Date(Date.UTC(y, m, day))) : null;
}

// Alle Startdaten eines wiederholten Termins bis 'to' (exklusiv)
function expand(startDate, rule, to) {
  const r = {};
  rule.split(';').forEach((kv) => { const [k, v] = kv.split('='); r[k] = v; });
  const freq = r.FREQ, iv = Math.max(1, +r.INTERVAL || 1);
  const count = r.COUNT ? +r.COUNT : Infinity;
  let until = to;
  if (r.UNTIL) { const u = when({ value: r.UNTIL, params: {} }); if (u && addDays(u.date, 1) < until) until = addDays(u.date, 1); }
  const out = [];
  const push = (d) => { if (d >= startDate && d < until && out.length < count) { out.push(d); return true; } return d < until && out.length < count; };
  const sd = dUTC(startDate);
  const LIMIT = 5000;

  if (freq === 'DAILY') {
    for (let i = 0, d = startDate; i < LIMIT && d < until && out.length < count; i++, d = addDays(d, iv)) push(d);
  } else if (freq === 'WEEKLY') {
    const days = (r.BYDAY ? r.BYDAY.split(',').map((x) => WD.indexOf(x.slice(-2))) : [sd.getUTCDay()]).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    let wk = addDays(startDate, -((sd.getUTCDay() + 6) % 7)); // Montag der Startwoche
    for (let i = 0; i < LIMIT && wk < until && out.length < count; i++, wk = addDays(wk, 7 * iv)) {
      for (const wd of days) push(addDays(wk, (wd + 6) % 7));
    }
  } else if (freq === 'MONTHLY') {
    let y = sd.getUTCFullYear(), m = sd.getUTCMonth();
    for (let i = 0; i < LIMIT && out.length < count; i++) {
      const first = iso(new Date(Date.UTC(y, m, 1)));
      if (first >= until) break;
      if (r.BYDAY) {
        for (const x of r.BYDAY.split(',')) {
          const mm = x.match(/^([+-]?\d+)?([A-Z]{2})$/);
          if (!mm) continue;
          const n = mm[1] ? +mm[1] : (r.BYSETPOS ? +r.BYSETPOS : 1);
          const d = nthWeekday(y, m, WD.indexOf(mm[2]), n);
          if (d) push(d);
        }
      } else {
        const day = r.BYMONTHDAY ? +r.BYMONTHDAY : sd.getUTCDate();
        const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const real = day < 0 ? dim + day + 1 : day;
        if (real >= 1 && real <= dim) push(iso(new Date(Date.UTC(y, m, real))));
      }
      m += iv; while (m > 11) { m -= 12; y++; }
    }
  } else if (freq === 'YEARLY') {
    const mo = r.BYMONTH ? +r.BYMONTH - 1 : sd.getUTCMonth();
    for (let i = 0, y = sd.getUTCFullYear(); i < LIMIT && out.length < count; i++, y += iv) {
      if (iso(new Date(Date.UTC(y, 0, 1))) >= until) break;
      if (r.BYDAY) {
        const mm = r.BYDAY.match(/^([+-]?\d+)?([A-Z]{2})$/);
        const d = mm ? nthWeekday(y, mo, WD.indexOf(mm[2]), mm[1] ? +mm[1] : 1) : null;
        if (d) push(d);
      } else {
        const day = sd.getUTCDate(), dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
        if (day <= dim) push(iso(new Date(Date.UTC(y, mo, day))));
      }
    }
  } else {
    push(startDate);
  }
  return out;
}

export async function calendarEvents(url, from, to) {
  const text = await load(url);
  const evs = [];
  let cur = null;
  for (const l of lines(text)) {
    if (l === 'BEGIN:VEVENT') { cur = { ex: [] }; continue; }
    if (l === 'END:VEVENT') { if (cur) evs.push(cur); cur = null; continue; }
    if (!cur) continue;
    const p = prop(l);
    if (!p) continue;
    if (p.name === 'SUMMARY') cur.summary = unesc(p.value);
    else if (p.name === 'UID') cur.uid = p.value;
    else if (p.name === 'STATUS') cur.status = p.value.toLowerCase();
    else if (p.name === 'DTSTART') cur.start = when(p);
    else if (p.name === 'DTEND') cur.end = when(p);
    else if (p.name === 'DURATION') cur.dur = p.value;
    else if (p.name === 'RRULE') cur.rrule = p.value;
    else if (p.name === 'EXDATE') p.value.split(',').forEach((v) => { const w = when({ value: v, params: p.params }); if (w) cur.ex.push(w.date); });
    else if (p.name === 'RECURRENCE-ID') cur.recur = when(p);
  }

  // Einzeln geänderte Wiederholungen ersetzen den Termin der Serie an diesem Tag
  const moved = new Set(evs.filter((e) => e.recur && e.uid).map((e) => e.uid + '|' + e.recur.date));
  const out = [];

  for (const e of evs) {
    if (!e.start || e.status === 'cancelled') continue;
    const allDay = !e.start.time;
    let lenDays = 0, lenMin = 0;
    if (e.end) {
      if (allDay) lenDays = Math.max(1, diffDays(e.start.date, e.end.date));
      else lenMin = diffDays(e.start.date, e.end.date) * 1440 + toMin(e.end.time) - toMin(e.start.time);
    } else if (e.dur) {
      const m = e.dur.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
      if (m) { lenDays = (+m[1] || 0) * 7 + (+m[2] || 0); lenMin = lenDays * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0); }
    }
    if (allDay && !lenDays) lenDays = 1;

    const firstFrom = allDay ? addDays(from, -(lenDays - 1)) : addDays(from, -Math.ceil(lenMin / 1440));
    const starts = e.rrule && !e.recur ? expand(e.start.date, e.rrule, to) : [e.start.date];
    for (const d of starts) {
      if (d < firstFrom || d >= to) continue;
      if (e.ex.includes(d)) continue;
      if (!e.recur && e.uid && moved.has(e.uid + '|' + d)) continue;
      if (allDay) {
        if (addDays(d, lenDays) <= from) continue;
        out.push({ summary: e.summary || '', status: 'confirmed', start: { date: d }, end: { date: addDays(d, lenDays) }, htmlLink: '' });
      } else {
        const endMin = toMin(e.start.time) + lenMin;
        const endDate = addDays(d, Math.floor(endMin / 1440));
        if (endDate < from || (endDate === from && endMin % 1440 === 0 && d < from)) continue;
        out.push({
          summary: e.summary || '', status: 'confirmed',
          start: { dateTime: d + 'T' + e.start.time + ':00' },
          end: { dateTime: endDate + 'T' + fromMin(endMin % 1440) + ':00' },
          htmlLink: '',
        });
      }
    }
  }
  out.sort((a, b) => (a.start.dateTime || a.start.date).localeCompare(b.start.dateTime || b.start.date));
  return out;
}
