/* ============================================================
   James – Assistent, Welt und Karriere.
   Wird vor dem Haupt-Skript geladen; alles Datenabhängige läuft erst
   über jamesInit(), das das Haupt-Skript am Ende aufruft.
   ============================================================ */
let chats = null, orte = null;
const J = { ai: null, briefBusy: false, speaking: false, chat: null, chatBusy: false, krBusy: false, krOpen: -1, krEdit: false,
  w: { tab: 'globus', q: '', res: [], searching: false, open: '', budget: '', tage: '', monat: '' } };

function jamesInit() {
  chats = mkStore('chats'); orte = mkStore('orte');
  ALL.push(chats, orte);
  try { const t = localStorage.getItem('james-welt'); if (t === 'liste' || t === 'globus') J.w.tab = t; } catch (e) {}
  setTimeout(async () => {
    try { J.ai = (await TH.call('/ai/status')).ai; } catch (e) { J.ai = null; }
    softRender();
  }, 300);
}
const jProfil = () => settings.get('profil') || {};
const jName = () => jProfil().name || 'David';
function jamesGreeting() {
  const h = new Date().getHours();
  return (h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend') + ', ' + jName();
}
const jMd = (t) => (typeof md === 'function' ? md(t) : esc(t));
const flag = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '📍');

/* ---------- Startkarte ---------- */
function jamesCard() {
  const b = reports.get('james-' + today());
  const at = b && b.at ? new Date(b.at) : null;
  return '<section class="jc"><div class="jc-top"><span class="orb' + (J.briefBusy || J.speaking ? ' busy' : '') + '"></span><div><b>James</b><small>'
    + (J.briefBusy ? 'Stellt dein Briefing zusammen …' : b ? 'Briefing · ' + pad(at.getHours()) + ':' + pad(at.getMinutes()) + ' Uhr' : 'Dein persönlicher Assistent') + '</small></div></div>'
    + '<p>' + (b ? esc(b.text) : 'Ich fasse dir deinen Tag zusammen: Wetter, Termine, To-dos, Training und was heute zählt. Frag mich auch einfach etwas.') + '</p>'
    + '<div class="row"><button class="gold" data-j="brief">' + (b ? (J.speaking ? '■ Stopp' : '▶ Vorlesen') : 'Briefing holen') + '</button>'
    + (b ? '<button data-j="briefnew">Neu erstellen</button>' : '') + '<button data-j="chat" data-v="james">Gespräch</button></div>'
    + '<form class="ask" id="jask" autocomplete="off"><input id="jaskin" placeholder="Frag James …" aria-label="Frag James" enterkeyhint="send"><button type="submit" aria-label="Senden">↑</button></form></section>';
}
async function jBriefing(fresh) {
  J.briefBusy = true; softRender();
  try { await TH.call('/briefing' + (fresh ? '?fresh=1' : '')); await TH.pull(); }
  catch (e) { toast('Briefing gerade nicht verfügbar.'); }
  J.briefBusy = false; softRender();
}
function jSpeak(text) {
  if (!('speechSynthesis' in window)) { toast('Vorlesen geht auf diesem Gerät nicht.'); return; }
  if (J.speaking) { speechSynthesis.cancel(); J.speaking = false; return softRender(); }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE'; u.rate = 1;
  const vs = speechSynthesis.getVoices().filter((v) => /^de/i.test(v.lang));
  const pick = vs.find((v) => /premium|enhanced|anna|markus|yannick|helena/i.test(v.name)) || vs[0];
  if (pick) u.voice = pick;
  u.onend = u.onerror = () => { J.speaking = false; softRender(); };
  J.speaking = true; softRender();
  speechSynthesis.speak(u);
}

/* ---------- Chat ---------- */
const SUGG = {
  james: ['Was ist heute am wichtigsten?', 'Wie lief mein Training die letzten Wochen?', 'Plane mir die Woche', 'Was sollte ich einkaufen für gesundes Essen?'],
  reise: ['Wohin als Nächstes – 5 Tage, 1500 CHF?', 'Ein Wochenende ab Basel im Dezember', 'Was passt im Frühling aus meiner Wunschliste?'],
  karriere: ['Was soll ich in den nächsten 6 Monaten tun?', 'Brauche ich einen MBA – und wann?', 'Welche Länder sind für Roche-Karrieren gut?'],
};
const SCOPE_T = { james: 'James', reise: 'James · Reisen', karriere: 'James · Karriere' };
function chatDoc(scope) { return chats.get(scope) || { m: [] }; }
function openChat(scope, ask) {
  J.chat = scope;
  let el = document.getElementById('chat');
  if (!el) { el = document.createElement('div'); el.id = 'chat'; document.body.appendChild(el); }
  document.body.classList.add('lock');
  renderChat();
  if (ask) sendChat(ask); else setTimeout(() => { const i = document.getElementById('chin'); if (i) i.focus(); }, 80);
}
function closeChat() { J.chat = null; const el = document.getElementById('chat'); if (el) el.remove(); document.body.classList.remove('lock'); softRender(); }
function renderChat() {
  const el = document.getElementById('chat'); if (!el || !J.chat) return;
  const s = J.chat, m = chatDoc(s).m || [];
  const keep = document.getElementById('chin'), draft = keep ? keep.value : '';
  let h = '<div class="ch-head"><span class="orb' + (J.chatBusy ? ' busy' : '') + '"></span><b>' + SCOPE_T[s] + '</b>'
    + (m.length ? '<button data-j="chatclear">Neu</button>' : '') + '<button data-j="chatclose">Fertig</button></div><div class="ch-body" id="chbody">';
  if (!m.length) h += '<div class="msg-a">' + (s === 'reise' ? 'Wohin soll es gehen? Sag mir Budget, Zeitraum und worauf du Lust hast – ich kenne deine Liste.' : s === 'karriere' ? 'Woran arbeitest du gerade beruflich? Ich kenne deinen Plan und deine Ziele.' : 'Ich bin da. Was kann ich für dich tun?') + '</div><div class="ch-sugg">' + SUGG[s].map((q) => '<button data-j="sugg" data-v="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>';
  m.forEach((x) => { h += x.role === 'user' ? '<div class="msg-u">' + esc(x.content) + '</div>' : '<div class="msg-a' + (x.err ? ' err' : '') + '">' + jMd(x.content) + '</div>'; });
  if (J.chatBusy) h += '<div class="msg-a"><span class="typing"><i></i><i></i><i></i></span></div>';
  h += '</div><div class="ch-foot"><form id="chform" autocomplete="off"><input id="chin" placeholder="Nachricht an James" value="' + esc(draft) + '" enterkeyhint="send" aria-label="Nachricht"><button type="submit" aria-label="Senden"' + (J.chatBusy ? ' disabled' : '') + '>↑</button></form></div>';
  el.innerHTML = h;
  const b = document.getElementById('chbody'); if (b) b.scrollTop = b.scrollHeight;
}
async function sendChat(text) {
  const s = J.chat; text = String(text || '').trim();
  if (!s || !text || J.chatBusy) return;
  const x = chats.edit(s); x.m = x.m || [];
  x.m.push({ role: 'user', content: text, at: new Date().toISOString() });
  if (x.m.length > 60) x.m = x.m.slice(-60);
  chats.touch(s, 0);
  J.chatBusy = true;
  const inp = document.getElementById('chin'); if (inp) inp.value = '';
  renderChat();
  let reply = '', err = false;
  try {
    const r = await TH.call('/ai/chat', { method: 'POST', body: JSON.stringify({ scope: s, messages: x.m.filter((q) => !q.err).map((q) => ({ role: q.role, content: q.content })) }) });
    reply = r.text || '…';
  } catch (e) {
    err = true;
    reply = e.code === 'no_key' ? 'Mir fehlt noch dein Claude-API-Schlüssel. Tippe auf der Startseite oben rechts aufs Zahnrad und trag ihn unter „James“ ein.' : e.message || 'Ich bin gerade nicht erreichbar. Versuch es gleich noch einmal.';
  }
  const y = chats.edit(s); y.m = y.m || [];
  y.m.push({ role: 'assistant', content: reply, at: new Date().toISOString(), err });
  chats.touch(s, 0);
  J.chatBusy = false;
  renderChat();
}

/* ---------- Einstellungen: James ---------- */
function jamesSettings() {
  return '<section class="card"><h3>James</h3><p class="hint">' + (J.ai ? '✓ Verbunden mit Claude. James beantwortet Fragen, plant deine Karriere und formuliert das Briefing.' : 'Für Gespräche, Karriereplanung und das formulierte Briefing braucht James einen Claude-API-Schlüssel. Den bekommst du auf console.anthropic.com → API Keys (geht auch am iPhone). Das einfache Briefing funktioniert auch ohne.') + '</p>'
    + '<input id="aikey" type="password" autocomplete="off" placeholder="' + (J.ai ? 'Neuen Schlüssel eintragen (sk-ant-…)' : 'sk-ant-…') + '" aria-label="Claude-API-Schlüssel"><div class="row"><button class="pri" data-j="aikey">Speichern</button>' + (J.ai ? '<button class="danger" data-j="aikeydel">Entfernen</button>' : '') + '</div>'
    + '<label class="f">Dein Name<input id="pname" value="' + esc(jName()) + '"></label></section>'
    + '<section class="card"><h3>Wecker mit Briefing</h3><p class="hint">Das Briefing gibt es auch zum Vorlesen per iPhone-Kurzbefehl. Adresse: <b>' + esc(location.origin) + '/api/briefing?format=text</b> mit dem Header „Authorization: Bearer &lt;dein Zugangscode&gt;“. Die Anleitung bekommst du von Claude im Chat.</p></section>';
}

/* ============================================================
   Welt
   ============================================================ */
const CONT = { DE: 'Europa', CH: 'Europa', AT: 'Europa', IT: 'Europa', FR: 'Europa', ES: 'Europa', GB: 'Europa', NL: 'Europa', SE: 'Europa', NO: 'Europa', PL: 'Europa', IS: 'Europa', DK: 'Europa', BE: 'Europa', PT: 'Europa', GR: 'Europa', HR: 'Europa', CZ: 'Europa', HU: 'Europa', IE: 'Europa', FI: 'Europa', MC: 'Europa', LU: 'Europa', SI: 'Europa', TH: 'Asien', JP: 'Asien', CN: 'Asien', SG: 'Asien', VN: 'Asien', ID: 'Asien', KR: 'Asien', IN: 'Asien', AE: 'Asien', MY: 'Asien', PH: 'Asien', LK: 'Asien', TR: 'Asien', US: 'Nordamerika', CA: 'Nordamerika', MX: 'Nordamerika', CR: 'Nordamerika', CU: 'Nordamerika', BR: 'Südamerika', AR: 'Südamerika', PE: 'Südamerika', CL: 'Südamerika', CO: 'Südamerika', AU: 'Ozeanien', NZ: 'Ozeanien', ZA: 'Afrika', MA: 'Afrika', EG: 'Afrika', KE: 'Afrika', TZ: 'Afrika', NA: 'Afrika' };
function weltView() {
  const all = orte.all(), war = all.filter(([, x]) => x.war), will = all.filter(([, x]) => !x.war);
  const lands = [...new Set(war.map(([, x]) => x.land).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const conts = new Set(war.map(([, x]) => CONT[(x.cc || '').toUpperCase()]).filter(Boolean));
  const tab = J.w.tab;
  let h = '<div class="seg2" role="tablist"><button data-j="wtab" data-v="globus" class="' + (tab === 'globus' ? 'on' : '') + '" aria-selected="' + (tab === 'globus') + '">Wo ich war</button><button data-j="wtab" data-v="liste" class="' + (tab === 'liste' ? 'on' : '') + '" aria-selected="' + (tab === 'liste') + '">Wohin als Nächstes</button></div>';
  if (tab === 'globus') {
    h += '<div class="globe-wrap" id="gw"><canvas id="globe" aria-label="Globus mit deinen Orten"></canvas><div class="gl-legend"><span><i style="background:#E8CF9F"></i>war ich</span><span><i style="background:#fff;opacity:.85"></i>will ich hin</span></div></div>';
    h += '<div class="wstats"><div class="wstat"><b>' + lands.length + '</b><small>Länder</small></div><div class="wstat"><b>' + war.length + '</b><small>Regionen</small></div><div class="wstat"><b>' + conts.size + '</b><small>Kontinente</small></div></div>';
    h += '<section class="card"><div class="head"><h2>Länder</h2></div><div class="ctry">' + lands.map((l) => { const c = war.find(([, x]) => x.land === l)[1].cc; return '<span>' + flag(c) + ' ' + esc(l) + '</span>'; }).join('') + '</div></section>';
    h += addPlaceCard(true);
    h += '<details class="card more" id="wwar"><summary>Alle Regionen (' + war.length + ')</summary><div>' + war.sort((a, b) => (a[1].land || '').localeCompare(b[1].land || '', 'de') || a[1].n.localeCompare(b[1].n, 'de')).map(placeRow).join('') + '</div></details>';
    setTimeout(mountGlobe, 0);
  } else {
    h += '<section class="jc"><div class="jc-top"><span class="orb"></span><div><b>Wohin als Nächstes?</b><small>James kennt deine Liste und wo du schon warst</small></div></div>'
      + '<div class="grid2"><input id="wbud" inputmode="numeric" placeholder="Budget CHF" value="' + esc(J.w.budget) + '" data-wi="budget" style="background:rgba(255,255,255,.08);color:#F3F1EC"><input id="wtage" inputmode="numeric" placeholder="Tage" value="' + esc(J.w.tage) + '" data-wi="tage" style="background:rgba(255,255,255,.08);color:#F3F1EC"></div>'
      + '<input id="wmon" placeholder="Wann? z. B. März oder Ostern" value="' + esc(J.w.monat) + '" data-wi="monat" style="background:rgba(255,255,255,.08);color:#F3F1EC">'
      + '<div class="row"><button class="gold" data-j="reise">Vorschläge holen</button><button data-j="chat" data-v="reise">Gespräch</button></div></section>';
    const srt = will.sort((a, b) => ((b[1].prio ? 1 : 0) - (a[1].prio ? 1 : 0)) || a[1].n.localeCompare(b[1].n, 'de'));
    h += '<section class="card"><div class="head"><h2>Meine Liste</h2><span class="hint">' + will.length + ' Ziele</span></div>' + (srt.length ? '<div>' + srt.map(placeRow).join('') + '</div>' : '<p class="hint">Noch leer.</p>') + '</section>';
    h += addPlaceCard(false);
  }
  return h;
}
function placeRow([id, x]) {
  const sub = [x.region && x.region !== x.n ? x.region : '', x.land, x.war && x.besucht ? 'seit ' + fmtDate(x.besucht) : ''].filter(Boolean).join(' · ');
  const open = J.w.open === id;
  return '<div class="place"><span class="fl">' + flag(x.cc) + '</span><span><b>' + (x.prio ? '⭐ ' : '') + esc(x.n) + '</b><small>' + esc(sub) + '</small>'
    + (open ? '<span class="row" style="margin-top:8px">' + (!x.war ? '<button data-j="pwar" data-id="' + id + '">✓ War dort</button><button data-j="pstar" data-id="' + id + '">' + (x.prio ? 'Kein Favorit' : '⭐ Favorit') + '</button>' : '<button data-j="pwill" data-id="' + id + '">Doch noch nicht</button>') + '<button class="danger" data-j="pdel" data-id="' + id + '">Löschen</button></span>' : '')
    + '</span><span class="pact"><button data-j="popen" data-id="' + id + '" aria-label="Optionen">' + (open ? '✕' : '•••') + '</button></span></div>';
}
function addPlaceCard(war) {
  let h = '<section class="card"><h3>' + (war ? 'Region hinzufügen, in der ich war' : 'Neues Ziel') + '</h3><form class="add" id="wform" data-war="' + (war ? 1 : 0) + '" autocomplete="off"><input id="wq" placeholder="' + (war ? 'z. B. Lissabon' : 'z. B. Lofoten') + '" value="' + esc(J.w.q) + '" data-wi="q" aria-label="Ort suchen"><button class="pri plus" type="submit" aria-label="Suchen">⌕</button></form>';
  if (J.w.searching) h += '<p class="hint">Suche …</p>';
  else if (J.w.res.length) h += '<div class="sug">' + J.w.res.map((r, i) => '<button data-j="padd" data-i="' + i + '" data-war="' + (war ? 1 : 0) + '">' + flag(r.cc) + ' ' + esc(r.n) + '<small>' + esc([r.region, r.land].filter(Boolean).join(', ')) + '</small></button>').join('') + '</div>';
  return h + '</section>';
}
async function wSearch(war) {
  const q = J.w.q.trim(); if (!q) return;
  J.w.searching = true; J.w.res = []; render();
  try { J.w.res = (await TH.call('/geo?q=' + encodeURIComponent(q))).results || []; } catch (e) { J.w.res = []; toast('Suche gerade nicht möglich.'); }
  J.w.searching = false;
  if (!J.w.res.length) toast('Nichts gefunden.');
  render();
}

/* ---------- Globus (d3-geo, Canvas) ---------- */
const G = { lib: null, world: null, rot: [-8, -40, 0], vel: [0.06, 0], drag: null, raf: 0, canvas: null, hit: [], tip: null, last: 0, cKey: '', cSet: null };
async function loadGlobeLib() {
  if (G.lib) return G.lib;
  G.lib = (async () => {
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'globe-lib.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    const w = await (await fetch('world.json')).json();
    G.world = topojson.feature(w, w.objects.countries).features;
  })();
  return G.lib;
}
async function mountGlobe() {
  const c = document.getElementById('globe'); if (!c) return;
  try { await loadGlobeLib(); } catch (e) { return; }
  if (!document.contains(c)) return;
  G.canvas = c;
  const wrap = c.parentElement;
  const resize = () => { const r = wrap.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); c.width = r.width * d; c.height = r.height * d; G.dpr = d; };
  resize();
  if (!G.tip) { G.tip = document.createElement('div'); G.tip.className = 'gl-tip'; G.tip.hidden = true; }
  wrap.appendChild(G.tip); G.tip.hidden = true;
  c.onpointerdown = (e) => { c.setPointerCapture(e.pointerId); G.drag = { x: e.clientX, y: e.clientY, r: G.rot.slice(), t: performance.now(), moved: false }; G.vel = [0, 0]; c.style.cursor = 'grabbing'; };
  c.onpointermove = (e) => {
    if (!G.drag) return;
    const k = 0.35, dx = e.clientX - G.drag.x, dy = e.clientY - G.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) G.drag.moved = true;
    const nr = [G.drag.r[0] + dx * k, Math.max(-75, Math.min(75, G.drag.r[1] - dy * k)), 0];
    const now = performance.now(), dt = Math.max(1, now - (G.drag.lt || G.drag.t));
    G.vel = [(nr[0] - G.rot[0]) / dt * 16, (nr[1] - G.rot[1]) / dt * 16];
    G.drag.lt = now; G.rot = nr;
  };
  c.onpointerup = (e) => {
    const d = G.drag; G.drag = null; c.style.cursor = 'grab';
    if (d && !d.moved) { // Antippen: Ort zeigen
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) * G.dpr, y = (e.clientY - r.top) * G.dpr;
      let best = null, bd = 22 * G.dpr;
      G.hit.forEach((p) => { const dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = p; } });
      if (best) { G.tip.textContent = flag(best.cc) + ' ' + best.n + (best.war ? '' : ' · Wunschziel'); G.tip.style.left = best.x / G.dpr + 'px'; G.tip.style.top = best.y / G.dpr + 'px'; G.tip.hidden = false; G.vel = [0, 0]; clearTimeout(G.tt); G.tt = setTimeout(() => { G.tip.hidden = true; }, 2600); }
      else G.tip.hidden = true;
    }
  };
  window.removeEventListener('resize', G.onres); G.onres = resize; window.addEventListener('resize', resize);
  cancelAnimationFrame(G.raf);
  const loop = (t) => {
    if (!document.contains(c)) return;
    if (!G.drag) {
      G.vel[0] *= 0.96; G.vel[1] *= 0.92;
      const idle = Math.abs(G.vel[0]) < 0.05 && G.tip.hidden;
      G.rot[0] += idle ? 0.05 : G.vel[0]; G.rot[1] = Math.max(-75, Math.min(75, G.rot[1] + G.vel[1]));
    }
    drawGlobe(c);
    G.raf = requestAnimationFrame(loop);
  };
  G.raf = requestAnimationFrame(loop);
}
function visitedCountries(places) {
  const key = places.map((p) => p.lon + ',' + p.lat).join(';');
  if (G.cKey === key && G.cSet) return G.cSet;
  const s = new Set();
  places.forEach((p) => { const f = G.world.find((f) => d3.geoContains(f, [p.lon, p.lat])); if (f) s.add(f); });
  G.cKey = key; G.cSet = s;
  return s;
}
function drawGlobe(c) {
  const ctx = c.getContext('2d'), w = c.width, h = c.height, r = Math.min(w, h) * 0.42;
  const proj = d3.geoOrthographic().scale(r).translate([w / 2, h / 2]).clipAngle(90).rotate(G.rot);
  const path = d3.geoPath(proj, ctx);
  ctx.clearRect(0, 0, w, h);
  // Atmosphäre
  const glow = ctx.createRadialGradient(w / 2, h / 2, r * 0.95, w / 2, h / 2, r * 1.18);
  glow.addColorStop(0, 'rgba(120,150,220,.28)'); glow.addColorStop(1, 'rgba(120,150,220,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(w / 2, h / 2, r * 1.18, 0, Math.PI * 2); ctx.fill();
  // Meer
  const sea = ctx.createRadialGradient(w / 2 - r * 0.35, h / 2 - r * 0.4, r * 0.1, w / 2, h / 2, r);
  sea.addColorStop(0, '#22304A'); sea.addColorStop(1, '#0E1524');
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = sea; ctx.fill();
  ctx.beginPath(); path(d3.geoGraticule10()); ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1 * G.dpr; ctx.stroke();
  const P = orte.all().map(([, x]) => x).filter((x) => isFinite(x.lat) && isFinite(x.lon));
  const vis = visitedCountries(P.filter((x) => x.war));
  // Land
  G.world.forEach((f) => {
    ctx.beginPath(); path(f);
    ctx.fillStyle = vis.has(f) ? 'rgba(217,188,134,.42)' : '#2A3346'; ctx.fill();
    ctx.strokeStyle = vis.has(f) ? 'rgba(232,207,159,.55)' : 'rgba(255,255,255,.07)'; ctx.lineWidth = 0.6 * G.dpr; ctx.stroke();
  });
  // Punkte
  const center = [-G.rot[0], -G.rot[1]];
  G.hit = [];
  P.forEach((x) => {
    if (d3.geoDistance([x.lon, x.lat], center) > Math.PI / 2 - 0.02) return;
    const [px, py] = proj([x.lon, x.lat]);
    G.hit.push({ x: px, y: py, n: x.n, cc: x.cc, war: x.war });
    if (x.war) {
      const g = ctx.createRadialGradient(px, py, 0, px, py, 9 * G.dpr);
      g.addColorStop(0, 'rgba(255,236,200,.9)'); g.addColorStop(1, 'rgba(232,207,159,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 9 * G.dpr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F6E3BC'; ctx.beginPath(); ctx.arc(px, py, 2.6 * G.dpr, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.6 * G.dpr; ctx.beginPath(); ctx.arc(px, py, 4 * G.dpr, 0, Math.PI * 2); ctx.stroke();
      if (x.prio) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(px, py, 1.6 * G.dpr, 0, Math.PI * 2); ctx.fill(); }
    }
  });
  // Glanz
  const shine = ctx.createRadialGradient(w / 2 - r * 0.45, h / 2 - r * 0.5, 0, w / 2 - r * 0.45, h / 2 - r * 0.5, r * 1.1);
  shine.addColorStop(0, 'rgba(255,255,255,.10)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = shine; ctx.fill();
}

/* ============================================================
   Karriere
   ============================================================ */
const K = () => settings.get('karriere') || {};
function karriereView() {
  const k = K(), a = k.aktuell || {}, pl = (k.plan && k.plan.stationen) || [], hist = k.historie || [];
  const total = hist.length + 1 + pl.length, done = hist.length + 1;
  const last = pl[pl.length - 1];
  let h = '<section class="kr-hero"><span class="eyebrow">Mein Ziel</span><h2>' + esc(k.ziel || 'Ziel festlegen') + '</h2>'
    + (pl.length ? '<div class="kr-prog"><i style="width:' + Math.round(done / total * 100) + '%"></i></div><div class="split"><span>Station <b>' + done + '</b> von ' + total + '</span><span>' + (last ? 'Ziel ca. <b>' + (last.ab_jahr || '') + '</b>' : '') + '</span></div>' : '')
    + '<div class="row"><button class="gold" data-j="krplan"' + (J.krBusy ? ' disabled' : '') + '>' + (pl.length ? '↻ Weg neu berechnen' : 'Weg berechnen') + '</button><button data-j="chat" data-v="karriere">Mit James sprechen</button></div></section>';
  if (J.krBusy) h += '<div class="busyline"><span class="orb busy"></span>James plant deinen Weg neu. Das dauert etwa eine Minute …</div>';
  if (J.ai === false) h += '<p class="hint">Für die automatische Planung braucht James deinen Claude-API-Schlüssel (Start → Zahnrad).</p>';
  // Pfad
  h += '<div class="path2">';
  hist.forEach((s) => { h += '<div class="st2 done"><span class="node">' + (s.flagge || '✓') + '</span><div class="bx"><span class="meta">' + esc([s.von, s.bis].filter(Boolean).join(' – ')) + '</span><b>' + esc(s.rolle || '') + '</b><span class="co">' + esc([s.firma, s.land].filter(Boolean).join(' · ')) + '</span></div></div>'; });
  h += '<div class="st2 now"><span class="node">' + (a.flagge || '📍') + '</span><button class="bx" data-j="kredit"><span class="meta"><span class="pill now">Jetzt</span>' + (a.seit ? 'seit ' + esc(a.seit) : '') + '</span><b>' + esc(a.rolle || 'Aktuelle Station eintragen') + '</b><span class="co">' + esc([a.firma, a.land].filter(Boolean).join(' · ')) + '</span></button></div>';
  pl.forEach((s, i) => {
    const open = J.krOpen === i, isLast = i === pl.length - 1;
    h += '<div class="st2' + (isLast ? ' goal' : '') + '"><span class="node">' + esc(s.flagge || '•') + '</span><div class="bx"><button class="bx" style="box-shadow:none;padding:0;background:none" data-j="kropen" data-i="' + i + '"><span class="meta">' + (i === 0 ? '<span class="pill gold">Als Nächstes</span>' : '') + '<span>ab ' + esc(s.ab_jahr) + ' · ' + esc(s.dauer) + '</span><span>' + esc(s.stufe) + '</span></span><b>' + esc(s.titel) + '</b><span class="co">' + esc(s.firma + ' · ' + s.land) + '</span></button>';
    if (open) {
      h += '<div class="more"><p>' + esc(s.warum) + '</p>' + ((s.fokus || []).length ? '<div class="fokus">' + s.fokus.map((f) => '<span>' + esc(f) + '</span>').join('') + '</div>' : '');
      if ((s.alternativen || []).length) h += '<div class="lbl">Alternativen</div><div class="alt">' + s.alternativen.map((al, j) => '<button data-j="kralt" data-i="' + i + '" data-k="' + j + '">' + esc((al.flagge || '') + ' ' + al.titel) + '<small>' + esc(al.firma + ' · ' + al.land + ' – ' + al.warum) + '</small></button>').join('') + '</div><p class="hint">Tippe eine Alternative an, um den Weg darüber neu berechnen zu lassen.</p>';
      if (i === 0) h += '<button class="pri" data-j="krreach">✓ Hier bin ich angekommen</button>';
      h += '</div>';
    }
    h += '</div></div>';
  });
  h += '</div>';
  if (!pl.length && !J.krBusy) h += '<p class="hint">Noch kein Weg berechnet. Prüfe dein Profil unten und tippe auf „Weg berechnen“.</p>';
  if (k.plan) {
    if ((k.plan.jetzt_tun || []).length) h += '<section class="card"><div class="lbl">Jetzt tun</div><ul style="margin:0;padding-left:20px;display:grid;gap:6px">' + k.plan.jetzt_tun.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></section>';
    if (k.plan.zusammenfassung || (k.plan.risiken || []).length) h += '<details class="card more"><summary>Einschätzung und Risiken</summary><div style="display:grid;gap:8px"><p style="margin:0">' + esc(k.plan.zusammenfassung || '') + '</p><ul style="margin:0;padding-left:20px;display:grid;gap:4px">' + (k.plan.risiken || []).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul><p class="hint">Berechnet am ' + fmtDate((k.plan.erstellt || '').slice(0, 10)) + (k.plan.basis ? ' ab „' + esc(k.plan.basis) + '“' : '') + '.</p></div></details>';
  }
  h += krProfile(k);
  h += krJobs();
  return h;
}
function krField(label, f, v, ph, type) { return '<label class="f">' + label + '<input data-kf="' + f + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '"' + (type ? ' type="' + type + '"' : '') + '></label>'; }
function krTags(label, f, arr, ph) {
  return '<div class="f">' + label + '<div class="tagin">' + (arr || []).map((t, i) => '<span>' + esc(t) + '<button data-j="krtagdel" data-f="' + f + '" data-i="' + i + '" aria-label="' + esc(t) + ' entfernen">✕</button></span>').join('')
    + '<input data-kt="' + f + '" placeholder="' + esc(ph) + ' + Enter" enterkeyhint="done"></div></div>';
}
function krProfile(k) {
  const a = k.aktuell || {};
  return '<details class="card more" id="krprof"' + (J.krEdit ? ' open' : '') + '><summary>Mein Profil für die Planung</summary><div style="display:grid;gap:12px">'
    + krField('Endziel', 'ziel', k.ziel, 'z. B. CEO von Roche') + krField('Bis wann?', 'zieljahr', k.zieljahr, 'z. B. 2046', 'number')
    + '<div class="lbl">Aktuelle Station</div><div class="grid2">' + krField('Rolle', 'a.rolle', a.rolle, 'z. B. Account Manager Diagnostics') + krField('Firma / Bereich', 'a.firma', a.firma, 'z. B. Roche Diagnostics') + '</div>'
    + '<div class="grid2">' + krField('Land', 'a.land', a.land, 'z. B. Deutschland') + krField('Seit', 'a.seit', a.seit, 'z. B. 2027-10') + '</div>'
    + krField('Ausbildung', 'ausbildung', k.ausbildung, 'z. B. Bachelor, MBA geplant') + krField('Sprachen', 'sprachen', k.sprachen, 'z. B. Deutsch, Englisch, Spanisch A2')
    + krTags('Stärken und Skills', 'skills', k.skills, 'Skill') + krTags('Vorbilder', 'vorbilder', k.vorbilder, 'Name') + krTags('Wunschländer', 'laender', k.laender, 'Land')
    + '<label class="f">Wünsche und Grenzen<textarea data-kf="wuensche" rows="3" placeholder="z. B. Familie ab 35, nicht länger als 3 Jahre in Asien">' + esc(k.wuensche || '') + '</textarea></label>'
    + '<p class="hint">Änderungen werden gespeichert. Tippe danach oben auf „Weg neu berechnen“.</p></div></details>';
}
function krJobs() {
  const J2 = jobs.all().filter(([, j]) => !['Verworfen', 'Absage'].includes(j.st));
  if (!J2.length) return '';
  return '<section class="card"><div class="head"><h2>Gemerkte Stellen</h2><span class="hint">' + J2.length + '</span></div><div>' + J2.map(([id, j]) => {
    const meta = [j.firma, j.ort, j.frist ? 'Frist ' + fmtD(j.frist) : ''].filter(Boolean).map(esc).join(' · ');
    return '<div class="job"><div class="jh"><b>' + (j.link ? '<a href="' + esc(j.link) + '" target="_blank" rel="noopener">' + esc(j.pos) + '</a>' : esc(j.pos)) + '</b></div>' + (meta ? '<small>' + meta + '</small>' : '')
      + '<div class="chips">' + ['Interessant', 'Beworben', 'Verworfen'].map((st) => '<button data-a="jobst" data-id="' + id + '" data-v="' + st + '" class="' + (j.st === st ? 'on' : '') + '">' + st + '</button>').join('') + '</div></div>';
  }).join('') + '</div></section>';
}
async function krReplan() {
  if (J.krBusy) return;
  if (J.ai === false) { toast('Erst den Claude-API-Schlüssel eintragen (Start → Zahnrad).'); return; }
  J.krBusy = true; J.krOpen = -1; render();
  try {
    if (Object.prototype.hasOwnProperty.call(settings.pend, 'karriere')) await flush(settings, 'karriere');
    await TH.call('/ai/karriere', { method: 'POST' });
    await TH.pull();
    toast('Neuer Weg berechnet');
  } catch (e) { toast(e.code === 'no_key' ? 'Der Claude-API-Schlüssel fehlt.' : (e.message || 'Neuberechnung fehlgeschlagen.')); }
  J.krBusy = false; render();
}
const ym = () => today().slice(0, 7);

/* ---------- Ereignisse ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-j]'); if (!b) return;
  const a = b.dataset.j;
  if (a === 'brief') { const r = reports.get('james-' + today()); return r ? jSpeak(r.text) : jBriefing(false); }
  if (a === 'briefnew') return jBriefing(true);
  if (a === 'chat') return openChat(b.dataset.v);
  if (a === 'chatclose') return closeChat();
  if (a === 'chatclear') { chats.put(J.chat, { m: [] }, 0); return renderChat(); }
  if (a === 'sugg') return sendChat(b.dataset.v);
  if (a === 'aikey' || a === 'aikeydel') {
    const v = a === 'aikeydel' ? '' : (document.getElementById('aikey').value || '').trim();
    if (a === 'aikey' && !v) return;
    b.disabled = true;
    TH.call('/ai/key', { method: 'POST', body: JSON.stringify({ key: v }) })
      .then(() => { J.ai = !!v; toast(v ? 'James ist verbunden' : 'Schlüssel entfernt'); const s = document.getElementById('setsheet'); if (s) s.innerHTML = setHTML(); })
      .catch((err) => { b.disabled = false; toast(err.message || 'Der Schlüssel funktioniert nicht.'); });
    return;
  }
  // Welt
  if (a === 'wtab') { J.w.tab = b.dataset.v; J.w.res = []; J.w.open = ''; try { localStorage.setItem('james-welt', J.w.tab); } catch (err) {} return render(); }
  if (a === 'popen') { J.w.open = J.w.open === b.dataset.id ? '' : b.dataset.id; return render(); }
  if (a === 'pwar') { const x = orte.edit(b.dataset.id); x.war = true; x.besucht = today(); orte.touch(b.dataset.id, 0); J.w.open = ''; toast('🎉 ' + x.n + ' – auf dem Globus markiert'); return render(); }
  if (a === 'pwill') { const x = orte.edit(b.dataset.id); x.war = false; x.besucht = ''; orte.touch(b.dataset.id, 0); J.w.open = ''; return render(); }
  if (a === 'pstar') { const x = orte.edit(b.dataset.id); x.prio = !x.prio; orte.touch(b.dataset.id, 0); return render(); }
  if (a === 'pdel') { const id = b.dataset.id, x = clone(orte.get(id)); orte.del(id); J.w.open = ''; toast(x.n + ' gelöscht', () => { orte.put(id, x, 0); render(); }); return render(); }
  if (a === 'padd') {
    const r = J.w.res[+b.dataset.i]; if (!r) return;
    const war = b.dataset.war === '1';
    orte.put('o' + uid(), { n: r.n, region: r.region, land: r.land, cc: r.cc, lat: r.lat, lon: r.lon, war, besucht: '', prio: false, note: '', created: new Date().toISOString() }, 0);
    J.w.q = ''; J.w.res = []; toast(r.n + (war ? ' auf dem Globus markiert' : ' steht auf deiner Liste')); return render();
  }
  if (a === 'reise') {
    const q = 'Wohin soll ich als Nächstes reisen?' + (J.w.budget ? ' Budget: ' + J.w.budget + ' CHF.' : '') + (J.w.tage ? ' Zeit: ' + J.w.tage + ' Tage.' : '') + (J.w.monat ? ' Wann: ' + J.w.monat + '.' : '') + ' Gib mir 3 konkrete Vorschläge mit groben Kosten.';
    return openChat('reise', q);
  }
  // Karriere
  if (a === 'krplan') return krReplan();
  if (a === 'kropen') { J.krOpen = J.krOpen === +b.dataset.i ? -1 : +b.dataset.i; return render(); }
  if (a === 'kredit') { J.krEdit = true; render(); const d = document.getElementById('krprof'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (a === 'krreach') {
    const k = settings.edit('karriere'), s = k.plan.stationen[0];
    if (!confirm('Bist du jetzt „' + s.titel + '“? Dann rechne ich den Weg ab hier neu.')) return;
    k.historie = k.historie || [];
    if (k.aktuell && k.aktuell.rolle) k.historie.push({ ...k.aktuell, von: k.aktuell.seit || '', bis: ym() });
    k.aktuell = { rolle: s.titel, firma: s.firma, land: s.land, flagge: s.flagge, seit: ym() };
    k.plan.stationen.shift();
    settings.touch('karriere', 0); render();
    return krReplan();
  }
  if (a === 'kralt') {
    const k = settings.edit('karriere'), s = k.plan.stationen[+b.dataset.i], al = s.alternativen[+b.dataset.k];
    k.fix = [...k.plan.stationen.slice(0, +b.dataset.i).map((x) => ({ titel: x.titel, firma: x.firma, land: x.land })), { titel: al.titel, firma: al.firma, land: al.land }];
    settings.touch('karriere', 0);
    return krReplan();
  }
  if (a === 'krtagdel') { const k = settings.edit('karriere'); (k[b.dataset.f] || []).splice(+b.dataset.i, 1); settings.touch('karriere', 0); J.krEdit = true; return render(); }
});
document.addEventListener('submit', (e) => {
  const id = e.target.id;
  if (id === 'jask') { e.preventDefault(); const v = document.getElementById('jaskin').value.trim(); if (v) openChat('james', v); }
  if (id === 'chform') { e.preventDefault(); sendChat(document.getElementById('chin').value); }
  if (id === 'wform') { e.preventDefault(); const i = document.getElementById('wq'); if (i) J.w.q = i.value; wSearch(e.target.dataset.war === '1'); }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.wi) J.w[t.dataset.wi] = t.value;
  if (t.dataset.kf) {
    const k = settings.edit('karriere'), f = t.dataset.kf;
    if (f.startsWith('a.')) { k.aktuell = k.aktuell || {}; k.aktuell[f.slice(2)] = t.value; } else k[f] = t.value;
    settings.touch('karriere', 900); J.krEdit = true;
  }
  if (t.id === 'pname') { const p = settings.edit('profil'); p.name = t.value.trim(); settings.touch('profil', 900); }
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key === 'Enter' && t.dataset && t.dataset.kt) {
    e.preventDefault(); const v = t.value.trim(); if (!v) return;
    const k = settings.edit('karriere'); k[t.dataset.kt] = (k[t.dataset.kt] || []).concat(v); settings.touch('karriere', 0); J.krEdit = true; render();
    const n = document.querySelector('[data-kt="' + t.dataset.kt + '"]'); if (n) n.focus();
  }
  if (e.key === 'Escape' && J.chat) closeChat();
});
document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'krprof') J.krEdit = e.target.open; }, true);
// Neue Daten vom Server (z. B. Chat auf einem anderen Gerät) auch im offenen Chat zeigen
window.addEventListener('th-synced', () => { if (J.chat && !J.chatBusy) renderChat(); });
