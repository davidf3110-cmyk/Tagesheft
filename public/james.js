/* ============================================================
   James – Assistent, Welt und Karriere.
   Wird vor dem Haupt-Skript geladen; alles Datenabhängige läuft erst
   über jamesInit(), das das Haupt-Skript am Ende aufruft.
   ============================================================ */
let chats = null, orte = null;
const J = { ai: null, briefBusy: false, speaking: false, chat: null, chatBusy: false, krBusy: false, krOpen: -1, krEdit: false,
  w: { tab: 'globus', q: '', res: [], searching: false, open: '', budget: '', tage: '', monat: '' } };

function jamesInit() {
  if (matchMedia('(min-width:1100px)').matches) setTimeout(() => menuOpen(true), 0);
  orte = mkStore('orte');
  ALL.push(orte);
  try { const t = localStorage.getItem('james-welt'); if (t === 'liste' || t === 'globus') J.w.tab = t; } catch (e) {}
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
    + (b ? '<button data-j="briefnew">Neu erstellen</button>' : '') + '<button data-j="chat" data-v="james">In Claude fragen</button></div>'
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
  if (J.speaking) { speechSynthesis.cancel(); J.speaking = false; softRender(); if (typeof refreshWecker === 'function') refreshWecker(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE'; u.rate = 1;
  const vs = speechSynthesis.getVoices().filter((v) => /^de/i.test(v.lang));
  const pick = vs.find((v) => /premium|enhanced|anna|markus|yannick|helena/i.test(v.name)) || vs[0];
  if (pick) u.voice = pick;
  u.onend = u.onerror = () => { J.speaking = false; softRender(); if (typeof refreshWecker === 'function') refreshWecker(); };
  J.speaking = true; softRender(); if (typeof refreshWecker === 'function') refreshWecker();
  speechSynthesis.speak(u);
}

/* ---------- Gespräche: in der Claude-App, mit dem James-Connector ---------- */
const CLAUDE_HINT = ' (Nutze den James-Connector für meine Daten.)';
function openClaude(scope, ask) {
  const def = { james: 'Schau in James nach, was heute bei mir ansteht, und hilf mir, den Tag zu planen.', reise: 'Wohin soll ich als Nächstes reisen? Schau dir meine Orte in James an.', karriere: 'Schau dir meinen Karriereplan in James an und hilf mir weiter.' };
  const q = 'James: ' + (ask || def[scope] || def.james) + CLAUDE_HINT;
  window.open('https://claude.ai/new?q=' + encodeURIComponent(q), '_blank');
}
const openChat = openClaude;

/* ---------- Einstellungen: James ---------- */
function jamesSettings() {
  return themeSettings() + '<section class="card"><h3>Claude-Connector</h3><p class="hint">Damit Claude in der Claude-App und in geplanten Aufgaben direkt mit James arbeitet – über dein Abo, ohne Zusatzkosten. In Claude: Einstellungen → Connectors → Eigenen Connector hinzufügen → Name „James“, diese Adresse einfügen. Die Adresse ist geheim wie ein Passwort.</p>'
    + (J.mcpUrl ? '<code class="wrap mcpurl">' + esc(J.mcpUrl) + '</code><div class="row"><button data-j="copy" data-v="' + esc(J.mcpUrl) + '">Kopieren</button></div>' : '<div class="row"><button data-j="mcpshow">Adresse anzeigen</button></div>')
    + '<label class="f">Dein Name<input id="pname" value="' + esc(jName()) + '"></label></section>';
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
    h += '<div class="globe-wrap" id="gw"><canvas id="globe" aria-label="Globus mit deinen Orten"></canvas><div class="gl-legend"><span><i style="background:#E8CF9F"></i>war ich</span><span><i style="background:#fff;opacity:.85"></i>will ich hin</span></div><div class="gl-zoom"><button data-j="gz" data-v="1.6" aria-label="Hineinzoomen">+</button><button data-j="gz" data-v="0.625" aria-label="Herauszoomen">−</button><button data-j="gz" data-v="0" aria-label="Zurücksetzen">⟲</button></div></div><p class="hint" style="text-align:center;margin-top:-6px">Ziehen zum Drehen, zwei Finger oder Doppeltippen zum Zoomen, Antippen zum Markieren.</p>';
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
  J.w.searching = true; render();
  try { J.w.res = (await TH.call('/geo?q=' + encodeURIComponent(q))).results || []; } catch (e) { J.w.res = []; toast('Suche gerade nicht möglich.'); }
  J.w.searching = false;
  render();
}

/* ---------- Globus (d3-geo, Canvas): drehen, zoomen, Namen, Orte markieren ---------- */
const G = { lib: null, world: null, countries: [], cities: [], rot: [-8, -40, 0], k: 1, vel: [0.06, 0], ptr: new Map(), drag: null, pinch: null,
  raf: 0, canvas: null, hit: [], tip: null, cKey: '', cSet: null, pick: null, pickEl: null, dpr: 1 };
const KMIN = 0.9, KMAX = 40;
async function loadGlobeLib() {
  if (G.lib) return G.lib;
  G.lib = (async () => {
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'globe-lib.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    const [w, x] = await Promise.all([fetch('world.json').then((r) => r.json()), fetch('geo-extra.json').then((r) => r.json())]);
    G.world = topojson.feature(w, w.objects.countries).features;
    let dn = null; try { dn = new Intl.DisplayNames(['de'], { type: 'region' }); } catch (e) {}
    G.countries = G.world.map((f) => {
      const cc = x.ids[String(+f.id)] || '';
      let name = f.properties.name;
      try { if (dn && cc) name = dn.of(cc) || name; } catch (e) {}
      return { f, name, c: d3.geoCentroid(f), a: d3.geoArea(f) };
    }).sort((a, b) => b.a - a.a);
    G.cities = x.cities; // [name, lat, lon, pop] nach Größe sortiert
  })();
  return G.lib;
}
function gProj(c) {
  const w = c.width, h = c.height, r = Math.min(w, h) * 0.42 * G.k;
  return d3.geoOrthographic().scale(r).translate([w / 2, h / 2]).clipAngle(90).rotate(G.rot).precision(0.4);
}
function gZoom(f) { G.k = Math.max(KMIN, Math.min(KMAX, G.k * f)); G.vel = [0, 0]; }
async function mountGlobe() {
  const c = document.getElementById('globe'); if (!c) return;
  try { await loadGlobeLib(); } catch (e) { return; }
  if (!document.contains(c)) return;
  G.canvas = c;
  const wrap = c.parentElement;
  const resize = () => { const r = wrap.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); c.width = r.width * d; c.height = r.height * d; G.dpr = d; };
  resize();
  if (!G.tip) { G.tip = document.createElement('div'); G.tip.className = 'gl-tip'; }
  G.tip.hidden = true; wrap.appendChild(G.tip);
  const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * G.dpr, (e.clientY - r.top) * G.dpr]; };
  c.onpointerdown = (e) => {
    c.setPointerCapture(e.pointerId); G.ptr.set(e.pointerId, [e.clientX, e.clientY]); G.vel = [0, 0];
    if (G.ptr.size === 2) { const [a, b] = [...G.ptr.values()]; G.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: G.k }; G.drag = null; }
    else { G.drag = { x: e.clientX, y: e.clientY, r: G.rot.slice(), t: performance.now(), moved: false }; c.style.cursor = 'grabbing'; }
  };
  c.onpointermove = (e) => {
    if (!G.ptr.has(e.pointerId)) return;
    G.ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (G.pinch && G.ptr.size === 2) { const [a, b] = [...G.ptr.values()]; G.k = Math.max(KMIN, Math.min(KMAX, G.pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / G.pinch.d)); return; }
    if (!G.drag) return;
    const s = 0.35 / G.k, dx = e.clientX - G.drag.x, dy = e.clientY - G.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) G.drag.moved = true;
    const nr = [G.drag.r[0] + dx * s, Math.max(-85, Math.min(85, G.drag.r[1] - dy * s)), 0];
    const now = performance.now(), dt = Math.max(1, now - (G.drag.lt || G.drag.t));
    G.vel = [(nr[0] - G.rot[0]) / dt * 16, (nr[1] - G.rot[1]) / dt * 16];
    G.drag.lt = now; G.rot = nr;
  };
  const up = (e) => {
    G.ptr.delete(e.pointerId);
    if (G.pinch) { if (G.ptr.size < 2) G.pinch = null; G.drag = null; return; }
    const d = G.drag; G.drag = null; c.style.cursor = 'grab';
    if (!d || d.moved || e.type === 'pointercancel') return;
    const [x, y] = pos(e);
    const now = performance.now();
    if (G.lastTap && now - G.lastTap.t < 300 && Math.hypot(x - G.lastTap.x, y - G.lastTap.y) < 30 * G.dpr) { G.lastTap = null; clearTimeout(G.tapT); gZoom(2); return; }
    G.lastTap = { t: now, x, y };
    clearTimeout(G.tapT);
    G.tapT = setTimeout(() => gTap(x, y, wrap), 260);
  };
  c.onpointerup = up; c.onpointercancel = up;
  c.onwheel = (e) => { e.preventDefault(); gZoom(Math.exp(-e.deltaY * 0.0018)); };
  window.removeEventListener('resize', G.onres); G.onres = resize; window.addEventListener('resize', resize);
  if (G.pick) gPickShow(wrap);
  cancelAnimationFrame(G.raf);
  const loop = () => {
    if (!document.contains(c)) return;
    if (!G.drag && !G.pinch) {
      G.vel[0] *= 0.95; G.vel[1] *= 0.9;
      const idle = Math.abs(G.vel[0]) < 0.05 && G.tip.hidden && !G.pick && G.k < 1.4;
      G.rot[0] += idle ? 0.05 : G.vel[0]; G.rot[1] = Math.max(-85, Math.min(85, G.rot[1] + G.vel[1]));
    }
    drawGlobe(c);
    G.raf = requestAnimationFrame(loop);
  };
  G.raf = requestAnimationFrame(loop);
}
function gTap(x, y, wrap) {
  let best = null, bd = 20 * G.dpr;
  G.hit.forEach((p) => { const dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = p; } });
  if (best) {
    G.tip.textContent = flag(best.cc) + ' ' + best.n + (best.war ? '' : ' · Wunschziel');
    G.tip.style.left = best.x / G.dpr + 'px'; G.tip.style.top = best.y / G.dpr + 'px'; G.tip.hidden = false;
    clearTimeout(G.tt); G.tt = setTimeout(() => { G.tip.hidden = true; }, 2600);
    return;
  }
  G.tip.hidden = true;
  const ll = gProj(G.canvas).invert([x, y]);
  if (!ll || d3.geoDistance(ll, [-G.rot[0], -G.rot[1]]) > Math.PI / 2) return;
  G.pick = { lon: ll[0], lat: ll[1], loading: true };
  gPickShow(wrap);
  TH.call('/geo/rev?lat=' + ll[1].toFixed(4) + '&lon=' + ll[0].toFixed(4))
    .then((r) => { if (G.pick && G.pick.lon === ll[0]) { Object.assign(G.pick, r.place || {}, { loading: false, none: !r.place }); gPickShow(); } })
    .catch(() => { if (G.pick) { G.pick.loading = false; G.pick.none = true; gPickShow(); } });
}
function gPickShow(wrap) {
  wrap = wrap || (G.canvas && G.canvas.parentElement); if (!wrap) return;
  if (!G.pickEl) { G.pickEl = document.createElement('div'); G.pickEl.className = 'gl-pick'; }
  if (!G.pick) { G.pickEl.remove(); return; }
  const p = G.pick;
  G.pickEl.innerHTML = p.loading ? '<div class="busyline"><span class="orb busy"></span>Welcher Ort ist das …</div>'
    : p.none ? '<b>Hier ist kein Ort</b><small>Tippe auf Land, um es zu markieren.</small><div class="row"><button data-j="gpx">Schließen</button></div>'
    : '<b>' + flag(p.cc) + ' ' + esc(p.n) + '</b><small>' + esc([p.region !== p.n ? p.region : '', p.land].filter(Boolean).join(', ')) + '</small><div class="row"><button class="gold" data-j="gpwar">War ich</button><button data-j="gpwill">Will ich hin</button><button data-j="gpx" aria-label="Schließen">✕</button></div>';
  wrap.appendChild(G.pickEl);
}
function gPickSave(war) {
  const p = G.pick; if (!p || !p.n) return;
  orte.put('o' + uid(), { n: p.n, region: p.region || '', land: p.land || '', cc: p.cc || '', lat: +(+p.lat).toFixed(4), lon: +(+p.lon).toFixed(4), war, besucht: '', prio: false, note: '', created: new Date().toISOString() }, 0);
  toast(p.n + (war ? ' als bereist markiert' : ' auf deine Wunschliste gesetzt'));
  G.pick = null; G.cKey = ''; gPickShow(); render();
}
function visitedCountries(places) {
  const key = places.map((p) => p.lon + ',' + p.lat).join(';');
  if (G.cKey === key && G.cSet) return G.cSet;
  const s = new Set();
  places.forEach((p) => { const f = G.world.find((f) => d3.geoContains(f, [p.lon, p.lat])); if (f) s.add(f); });
  G.cKey = key; G.cSet = s;
  return s;
}
function gLabel(ctx, boxes, text, x, y, font, color, pad) {
  ctx.font = font;
  const w = ctx.measureText(text).width, h = parseFloat(font.match(/(\d+(\.\d+)?)px/)[1]);
  const b = [x - w / 2 - pad, y - h / 2 - pad, x + w / 2 + pad, y + h / 2 + pad];
  if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) return false;
  boxes.push(b);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  return true;
}
function drawGlobe(c) {
  const ctx = c.getContext('2d'), w = c.width, h = c.height, D = G.dpr;
  const proj = gProj(c), r = proj.scale(), path = d3.geoPath(proj, ctx);
  const cx = w / 2, cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  if (r < Math.max(w, h)) {
    const glow = ctx.createRadialGradient(cx, cy, r * 0.95, cx, cy, r * 1.18);
    glow.addColorStop(0, 'rgba(120,150,220,.28)'); glow.addColorStop(1, 'rgba(120,150,220,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2); ctx.fill();
  }
  const sea = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  sea.addColorStop(0, '#22304A'); sea.addColorStop(1, '#0E1524');
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = sea; ctx.fill();
  ctx.beginPath(); path(d3.geoGraticule10()); ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = D; ctx.stroke();
  const P = orte.all().map(([, x]) => x).filter((x) => isFinite(x.lat) && isFinite(x.lon));
  const vis = visitedCountries(P.filter((x) => x.war));
  G.world.forEach((f) => {
    ctx.beginPath(); path(f);
    ctx.fillStyle = vis.has(f) ? 'rgba(217,188,134,.42)' : '#2A3346'; ctx.fill();
    ctx.strokeStyle = vis.has(f) ? 'rgba(232,207,159,.55)' : 'rgba(255,255,255,' + (G.k > 3 ? '.16' : '.07') + ')'; ctx.lineWidth = 0.7 * D; ctx.stroke();
  });
  const center = [-G.rot[0], -G.rot[1]];
  const onFront = (ll, m) => d3.geoDistance(ll, center) < Math.PI / 2 - (m || 0.02);
  const inView = (p) => p[0] > -40 * D && p[0] < w + 40 * D && p[1] > -20 * D && p[1] < h + 20 * D;
  const boxes = [];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Eigene Orte zuerst (haben Vorrang bei den Beschriftungen)
  G.hit = [];
  const showPlaceNames = G.k >= 2.6;
  P.forEach((x) => {
    if (!onFront([x.lon, x.lat])) return;
    const [px, py] = proj([x.lon, x.lat]); if (!inView([px, py])) return;
    G.hit.push({ x: px, y: py, n: x.n, cc: x.cc, war: x.war });
    if (x.war) {
      const g = ctx.createRadialGradient(px, py, 0, px, py, 9 * D);
      g.addColorStop(0, 'rgba(255,236,200,.9)'); g.addColorStop(1, 'rgba(232,207,159,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 9 * D, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F6E3BC'; ctx.beginPath(); ctx.arc(px, py, 2.6 * D, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.6 * D; ctx.beginPath(); ctx.arc(px, py, 4.2 * D, 0, Math.PI * 2); ctx.stroke();
      if (x.prio) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 1.6 * D, 0, Math.PI * 2); ctx.fill(); }
    }
  });
  if (showPlaceNames) P.forEach((x) => {
    if (!onFront([x.lon, x.lat])) return;
    const [px, py] = proj([x.lon, x.lat]); if (!inView([px, py])) return;
    gLabel(ctx, boxes, x.n, px, py - 13 * D, '600 ' + (12 * D) + 'px -apple-system,system-ui,sans-serif', x.war ? '#F6E3BC' : '#FFFFFF', 3 * D);
  });
  // Ländernamen: je weiter hineingezoomt, desto mehr
  const minPx = (G.k < 1.5 ? 5200 : G.k < 3 ? 2600 : 900) * D * D;
  for (const co of G.countries) {
    if (co.a * r * r < minPx) continue;
    if (!onFront(co.c, 0.25)) continue;
    const p = proj(co.c); if (!p || !inView(p)) continue;
    gLabel(ctx, boxes, co.name.toUpperCase(), p[0], p[1], '600 ' + ((G.k < 2 ? 9.5 : 11) * D) + 'px -apple-system,system-ui,sans-serif', 'rgba(255,255,255,.5)', 2 * D);
  }
  // Städte ab einer gewissen Zoomstufe
  if (G.k >= 2.2) {
    const minPop = G.k < 3.5 ? 6e6 : G.k < 6 ? 2e6 : G.k < 10 ? 6e5 : 0;
    let n = 0;
    for (const [name, lat, lon, pop] of G.cities) {
      if (pop < minPop) break;
      if (!onFront([lon, lat], 0.05)) continue;
      const p = proj([lon, lat]); if (!inView(p)) continue;
      if (gLabel(ctx, boxes, name, p[0] + 6 * D, p[1], '500 ' + (11 * D) + 'px -apple-system,system-ui,sans-serif', 'rgba(255,255,255,.78)', 2 * D)) {
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(p[0] - ctx.measureText(name).width / 2, p[1], 1.8 * D, 0, Math.PI * 2); ctx.fill();
        if (++n > 60) break;
      }
    }
  }
  // Markierung beim Antippen
  if (G.pick && onFront([G.pick.lon, G.pick.lat])) {
    const [px, py] = proj([G.pick.lon, G.pick.lat]);
    ctx.fillStyle = '#E8CF9F'; ctx.beginPath(); ctx.arc(px, py, 5 * D, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(232,207,159,.5)'; ctx.lineWidth = 2 * D; ctx.beginPath(); ctx.arc(px, py, 11 * D, 0, Math.PI * 2); ctx.stroke();
  }
  const shine = ctx.createRadialGradient(cx - r * 0.45, cy - r * 0.5, 0, cx - r * 0.45, cy - r * 0.5, r * 1.1);
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
    + '<div class="row"><button class="gold" data-j="krplan">' + (pl.length ? '↻ Weg neu berechnen' : 'Weg berechnen') + '</button><button data-j="chat" data-v="karriere">Mit Claude sprechen</button></div></section>';
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
const KR_FMT = 'Speichere den neuen Weg mit james_update in settings/karriere als Feld „plan“ im bestehenden Format ({zusammenfassung, stationen: [{titel, firma, land, flagge, ab_jahr, dauer, stufe, warum, fokus, alternativen: [{titel, firma, land, flagge, warum}]}], risiken, jetzt_tun, erstellt, basis}) und setze „fix“ auf [].';
function krReplan(extra) {
  if (Object.prototype.hasOwnProperty.call(settings.pend, 'karriere')) flush(settings, 'karriere');
  openClaude('karriere', 'Berechne meinen Karriereweg neu: Lies settings/karriere in James (Ziel, aktuelle Station, Profil, bisheriger Plan). ' + (extra || '') + 'Gleiche die Stationen mit echten Lebensläufen von Roche-Führungskräften ab. ' + KR_FMT);
}
const ym = () => today().slice(0, 7);

/* ---------- Ereignisse ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-j]'); if (!b) return;
  const a = b.dataset.j;
  if (a === 'brief') { const r = reports.get('james-' + today()); return r ? jSpeak(r.text) : jBriefing(false); }
  if (a === 'briefnew') return jBriefing(true);
  if (a === 'chat') return openChat(b.dataset.v);
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
  if (a === 'gz') { const v = +b.dataset.v; if (v) gZoom(v); else { G.k = 1; G.rot = [-8, -40, 0]; } return; }
  if (a === 'gpwar') return gPickSave(true);
  if (a === 'gpwill') return gPickSave(false);
  if (a === 'gpx') { G.pick = null; return gPickShow(); }
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
    return krReplan('Ich habe gerade die Station „' + s.titel + '“ erreicht. ');
  }
  if (a === 'kralt') {
    const k = settings.edit('karriere'), s = k.plan.stationen[+b.dataset.i], al = s.alternativen[+b.dataset.k];
    k.fix = [...k.plan.stationen.slice(0, +b.dataset.i).map((x) => ({ titel: x.titel, firma: x.firma, land: x.land })), { titel: al.titel, firma: al.firma, land: al.land }];
    settings.touch('karriere', 0);
    return krReplan('Ich wähle als nächsten Schritt die Alternative „' + al.titel + ' – ' + al.firma + ' – ' + al.land + '“ (steht in „fix“). ');
  }
  if (a === 'krtagdel') { const k = settings.edit('karriere'); (k[b.dataset.f] || []).splice(+b.dataset.i, 1); settings.touch('karriere', 0); J.krEdit = true; return render(); }
});
document.addEventListener('submit', (e) => {
  const id = e.target.id;
  if (id === 'jask') { e.preventDefault(); const v = document.getElementById('jaskin').value.trim(); if (v) openChat('james', v); }
  if (id === 'wform') { e.preventDefault(); const i = document.getElementById('wq'); if (i) J.w.q = i.value; wSearch(e.target.dataset.war === '1'); }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.wi) J.w[t.dataset.wi] = t.value;
  if (t.dataset.wi === 'q') { clearTimeout(J.w.tq); const war = t.closest('form') && t.closest('form').dataset.war === '1'; J.w.tq = setTimeout(() => { if (J.w.q.trim().length >= 2) wSearch(war); else { J.w.res = []; render(); } }, 450); }
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
});
document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'krprof') J.krEdit = e.target.open; }, true);
// Neue Daten vom Server (z. B. Chat auf einem anderen Gerät) auch im offenen Chat zeigen

/* ============================================================
   Darstellung (Dunkel / Hell / System)
   ============================================================ */
function jTheme() { try { return localStorage.getItem('james-theme') || 'dark'; } catch (e) { return 'dark'; } }
function jSetTheme(t) {
  try { localStorage.setItem('james-theme', t); } catch (e) {}
  if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0B0B0C' : '#F4F3EF'));
}
jSetTheme(jTheme());
function themeSettings() {
  const t = jTheme();
  return '<section class="card"><h3>Darstellung</h3><div class="chips">' + [['dark', 'Dunkel'], ['light', 'Hell'], ['system', 'Wie das iPhone']].map(([v, l]) => '<button data-j="theme" data-v="' + v + '" class="' + (t === v ? 'on' : '') + '">' + l + '</button>').join('') + '</div></section>';
}

/* ============================================================
   Start: Training eintragen
   ============================================================ */
function jamesQuick() {
  const k = today(), lg = logged(k), ty = typeOf(k), p = planT(k);
  let label, sub;
  if (lg) { label = doneLine(k).replace(/^\S+\s/, ''); sub = 'Heute erledigt ✓'; }
  else if (ty) { label = 'Training weiter eintragen'; sub = '(' + chosenLine(k).replace(/^\S+\s/, '') + ')'; }
  else if (p === 'free') { label = 'Training eintragen'; sub = '(heute frei laut Plan)'; }
  else { label = 'Training eintragen'; sub = '(heute: ' + recLine(k).replace(/^\S+\s/, '') + ')'; }
  const t = lg ? ty : (ty || (p === 'free' ? '' : p));
  return '<button class="jq' + (lg ? ' done' : '') + '" data-j="qtrain"><span class="tic ' + (t && TIC[t] ? 't-' + t : 'none') + '">' + (t && TIC[t] ? TIC[t] : '') + '</span><span><b>' + esc(label) + '</b><small>' + esc(sub) + '</small></span><span class="chev">›</span></button>';
}

/* ============================================================
   Training: Übersicht mit Ringen und letzten Einheiten
   ============================================================ */
function ring(v, max, cls, ic, lab, sub) {
  const r = 26, c = 2 * Math.PI * r, f = Math.min(1, max ? v / max : 0);
  return '<div class="rg"><svg viewBox="0 0 64 64" class="rgs"><circle cx="32" cy="32" r="' + r + '" class="rg-bg"/><circle cx="32" cy="32" r="' + r + '" class="rg-fg ' + cls + '" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg><span class="rg-ic ' + cls + '">' + ic + '</span><b>' + v + '<small>/' + max + '</small></b><span class="rg-l">' + lab + '</span>' + (sub ? '<span class="rg-s">' + sub + '</span>' : '') + '</div>';
}
function trainHero(ks) {
  const c = { gym: 0, run: 0, swim: 0 }; let km = 0, m = 0, vol = 0;
  ks.forEach((s) => { if (!isSport(s)) return; const t = typeOf(s), x = sess(s); c[t]++; if (t === 'run') km += num(x.dist); if (t === 'swim') m += swimDist(x); if (t === 'gym') vol += (x.ex || []).reduce((n, e) => n + (e.sets || []).reduce((q, z) => q + num(z.w) * num(z.r), 0), 0); });
  const tot = c.gym + c.run + c.swim, goal = 5;
  // Serie: Wochen in Folge mit mindestens 4 Einheiten
  let streak = 0; const m0 = monday(new Date());
  for (let w = 1; w < 30; w++) { let n = 0; for (let i = 0; i < 7; i++) if (isSport(iso(addD(m0, -7 * w + i)))) n++; if (n >= 4) streak++; else break; }
  return '<section class="card th"><div class="head"><h2>Diese Woche</h2><span class="hint">' + tot + ' von ' + goal + ' Einheiten' + (streak ? ' · 🔥 ' + streak + (streak === 1 ? ' Woche' : ' Wochen') + ' in Folge' : '') + '</span></div><div class="rings">'
    + ring(c.gym, 3, 't-gym', TIC.gym, 'Gym', vol ? Math.round(vol / 1000 * 10) / 10 + ' t' : '')
    + ring(c.run, 1, 't-run', TIC.run, 'Laufen', km ? dec(km) + ' km' : '')
    + ring(c.swim, 1, 't-swim', TIC.swim, 'Schwimmen', m ? Math.round(m) + ' m' : '') + '</div></section>';
}
function trainRecent() {
  const ds = sessions.ids().filter((d) => d <= today() && isSport(d)).sort().reverse().slice(0, 4);
  if (!ds.length) return '';
  return '<section class="card"><div class="lbl">Letzte Einheiten</div><div class="recent">' + ds.map((d) => {
    const t = typeOf(d), x = sess(d), g = parse(d);
    return '<button class="rc" data-day="' + d + '"><span class="tic t-' + t + '">' + TIC[t] + '</span><span><b>' + esc(doneLine(d).replace(/^\S+\s/, '')) + '</b><small>' + WDL[g.getDay()] + ', ' + fmtD(d) + (x.feel ? ' · Gefühl ' + x.feel + '/5' : '') + '</small></span></button>';
  }).join('') + '</div></section>';
}

/* ============================================================
   Wecker
   ============================================================ */
const WD7 = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
function wk() { return Object.assign({ wt: '06:30', we: '07:45', days: [1, 2, 3, 4, 5, 6, 0], song: '', sec: 30, musik: 'radio', sender: 'srf3' }, settings.get('wecker') || {}); }
function spotifyId(u) { const m = String(u || '').match(/track[/:]([A-Za-z0-9]{22})/); return m ? m[1] : ''; }
function nextAlarm(w) {
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = addD(now, i), dw = d.getDay();
    if (!w.days.includes(dw)) continue;
    const [hh, mm] = (dw === 0 || dw === 6 ? w.we : w.wt).split(':').map(Number);
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
    if (at > now) return at;
  }
  return null;
}
const MUSIK = { radio: 'Webradio', apple: 'Apple Music', datei: 'Eigene Datei' };
const SENDER = [['srf3', 'Radio SRF 3'], ['srf1', 'Radio SRF 1'], ['swisspop', 'Swiss Pop'], ['swissjazz', 'Swiss Jazz'], ['swissclassic', 'Swiss Classic'], ['swr3', 'SWR3']];
function weckerHTML() {
  const w = wk(), n = nextAlarm(w), code = J.weckCode || '';
  const bUrl = location.origin + '/api/briefing?format=text&k=' + (code || '…');
  const rUrl = location.origin + '/api/radio?k=' + (code || '…');
  const diff = n ? Math.round((n - new Date()) / 60000) : 0;
  const sn = (SENDER.find((x) => x[0] === w.sender) || SENDER[0])[1];
  let h = '<div class="ch-head"><span class="orb"></span><b>Wecker</b><button data-j="weckclose">Fertig</button></div><div class="ch-body wk">';
  h += '<section class="wk-hero"><span class="eyebrow">Nächstes Wecken</span><div class="wk-time">' + (n ? pad(n.getHours()) + ':' + pad(n.getMinutes()) : '–') + '</div><span class="wk-sub">' + (n ? WDL[n.getDay()] + ' · in ' + (diff >= 60 ? Math.floor(diff / 60) + ' h ' : '') + (diff % 60) + ' min' : 'Kein Tag aktiv') + '</span>'
    + '<div class="wk-flow"><span>🎵<small>' + w.sec + ' s ' + (w.musik === 'radio' ? esc(sn) : MUSIK[w.musik]) + '</small></span><i></i><span><span class="orb" style="width:22px;height:22px;display:inline-block"></span><small>James-Briefing</small></span></div></section>';
  h += '<section class="card wk-night"><h3>Nachttisch-Modus</h3><p class="hint">Der schönste Weg: Am Abend hier aktivieren und James am Ladekabel offen lassen. Zur Weckzeit startet leise das Radio und wird langsam lauter. Sag „Guten Morgen“ (oder tippe), dann wird die Musik leise und James spricht dein Briefing darüber. Die Weckzeit stellst du direkt hier in der App ein.</p><div class="row"><button class="pri" data-j="nightstart">🌙 Nachttisch-Modus starten</button></div></section>';
  h += '<section class="card"><h3>Weckzeiten</h3><p class="hint">Kein Weckton und kein iPhone-Wecker nötig: Zur Uhrzeit startet die Musik, danach spricht James.</p>'
    + '<div class="grid2"><label class="f">Werktags<input type="time" value="' + esc(w.wt) + '" data-wk="wt"></label><label class="f">Wochenende<input type="time" value="' + esc(w.we) + '" data-wk="we"></label></div>'
    + '<div class="chips wk-days">' + WD7.map(([d, l]) => '<button data-j="wkday" data-v="' + d + '" class="' + (w.days.includes(d) ? 'on' : '') + '">' + l + '</button>').join('') + '</div></section>';
  h += '<section class="card"><h3>Musik</h3><div class="seg2 three">' + Object.entries(MUSIK).map(([k, l]) => '<button data-j="wkmus" data-v="' + k + '" class="' + (w.musik === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>'
    + (w.musik === 'radio' ? '<div class="chips">' + SENDER.map(([k, l]) => '<button data-j="wksender" data-v="' + k + '" class="' + (w.sender === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div><p class="hint">James nimmt jeden Morgen um 6:15 Uhr die ersten ' + w.sec + ' Sekunden live vom Sender auf – das iPhone spielt sie dann sofort ab, auch gesperrt und ohne Abo.</p><div class="row"><button data-j="wkradiotest">▶ Probehören</button></div><audio id="wkaudio" preload="none"></audio>'
      : w.musik === 'apple' ? '<p class="hint">Song, Playlist oder Radiosender wählst du im Kurzbefehl aus der Musik-App. Läuft auch gesperrt.</p>'
      : '<p class="hint">Lege einen Song als MP3 oder M4A in die Dateien-App (iCloud Drive). Läuft gesperrt, ohne Abo und ohne Internet.</p>')
    + '<label class="f">Länge: ' + w.sec + ' Sekunden<input type="range" min="10" max="120" step="5" value="' + w.sec + '" data-wk="sec"></label></section>';
  h += '<section class="card"><h3>Briefing testen</h3><p class="hint">So klingt James morgen früh.</p><div class="row"><button class="pri" data-j="brief">' + (J.speaking ? '■ Stopp' : '▶ Briefing anhören') + '</button></div></section>';
  const music = {
    radio: '<li>Aktion <b>Inhalte von URL abrufen</b> → <code class="wrap">' + esc(rUrl) + '</code> ' + (code ? '<button class="sm" data-j="copy" data-v="' + esc(rUrl) + '">Kopieren</button>' : '') + '</li><li>Aktion <b>Ton wiedergeben</b> (englisch „Play Sound“) → „Inhalte von URL“.</li>',
    apple: '<li>Aktion <b>Musik wiedergeben</b> → Song, Playlist oder Radiosender auswählen.</li><li>Aktion <b>Warten</b> → ' + w.sec + ' Sekunden, dann <b>Wiedergabe/Pause</b> → „Pause“.</li>',
    datei: '<li>Aktion <b>Datei abrufen</b> → deine Musikdatei in iCloud Drive („Dokumentauswahl anzeigen“ aus).</li><li>Aktion <b>Ton wiedergeben</b> (englisch „Play Sound“) → „Datei“.</li>',
  }[w.musik];
  h += '<section class="card wk-setup"><h3>Alternative: Kurzbefehl (ohne offene App)</h3><p class="hint">Läuft auch bei gesperrtem iPhone, aber mit Siri-Stimme und ohne Musik unter der Ansage. Die Uhrzeit stellst du dabei in der Automation ein, nicht hier.</p><ol>'
    + '<li><b>Kurzbefehle</b> → <b>Automation</b> → <b>+</b> → <b>Tageszeit</b> → ' + esc(w.wt) + ', <b>Wöchentlich</b> an deinen Werktagen → <b>Sofort ausführen</b> → <b>Neuer leerer Kurzbefehl</b>.</li>'
    + '<li>Aktion <b>Lautstärke festlegen</b> → 35 %.</li>'
    + music
    + '<li>Aktion <b>Lautstärke festlegen</b> → 60 %.</li>'
    + '<li>Aktion <b>Inhalte von URL abrufen</b> → <code class="wrap">' + esc(bUrl) + '</code> ' + (code ? '<button class="sm" data-j="copy" data-v="' + esc(bUrl) + '">Kopieren</button>' : '<button class="sm" data-j="weckcode">Adressen erzeugen</button>') + '</li>'
    + '<li>Aktion <b>Text sprechen</b> → „Inhalte von URL“, Sprache Deutsch. Mit ▶ unten im Kurzbefehl einmal testen.</li>'
    + '<li>Fürs Wochenende: zweite Automation um ' + esc(w.we) + ' an Sa und So → „<b>Kurzbefehl ausführen</b>“ → denselben Kurzbefehl wählen.</li></ol>'
    + '<p class="hint">Am Anfang zur Sicherheit einen normalen Wecker 10 Minuten später stellen, bis du dem Ablauf vertraust. Musik und Ansage laufen auch bei stumm geschaltetem iPhone, im Schlafmodus solltest du in „Fokus“ die Kurzbefehle-App zulassen.</p></section>';
  return h + '</div>';
}
function weckerView() {
  if (!J.weckCode && !J.weckLoading) { J.weckLoading = true; TH.call('/wecker/code').then((r) => { J.weckCode = r.code; if (view === 'wecker') render(); }).catch(() => {}).finally(() => { J.weckLoading = false; }); }
  const html = weckerHTML(), k = html.indexOf('<div class="ch-body wk">');
  return '<div class="wk wkpage">' + html.slice(k + '<div class="ch-body wk">'.length, -'</div>'.length) + '</div>';
}
function openWecker() { setView('wecker'); }
function refreshWecker() { if (view === 'wecker') render(); }
function closeWecker() { setView('heute'); }

/* ============================================================
   Seitenmenü (aus- und einklappbar)
   ============================================================ */
const NAV = [['heute', 'James'], ['wecker', 'Wecker'], ['todos', 'To-dos'], ['training', 'Training'], ['einkauf', 'Einkauf'], ['gebet', 'Gebet'], ['orte', 'Welt'], ['jobs', 'Karriere'], ['einstellungen', 'Einstellungen']];
const NAVIC = {
  wecker: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.8M4.5 5.5l3-2.5M19.5 5.5l-3-2.5"/></svg>',
  einstellungen: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
};
function menuOpen(open) {
  let d = document.getElementById('drawer');
  if (!d) {
    d = document.createElement('div'); d.id = 'drawer';
    d.innerHTML = '<div class="dr-back" data-j="menu"></div><nav class="dr" aria-label="Menü"></nav>';
    document.body.appendChild(d);
  }
  if (open) {
    d.querySelector('.dr').innerHTML = '<div class="dr-top"><span class="orb"></span><b>James</b><button data-j="menu" aria-label="Menü schließen">✕</button></div>'
      + NAV.map(([k, l]) => (k === '-' ? '<hr>' : '<button data-j="nav" data-v="' + k + '" class="' + (view === k ? 'on' : '') + '">' + (NAVIC[k] || ICONS[k]) + '<span>' + l + '</span></button>')).join('');
  }
  d.classList.toggle('open', !!open);
  document.body.classList.toggle('lock', !!open && !matchMedia('(min-width:1100px)').matches);
  const mb = document.getElementById('menubtn'); if (mb) mb.setAttribute('aria-expanded', open ? 'true' : 'false');
}
document.addEventListener('click', (e) => {
  if (e.target.closest('#menubtn')) return menuOpen(true);
  const b = e.target.closest('[data-j="menu"],[data-j="nav"]'); if (!b) return;
  if (b.dataset.j === 'menu') return menuOpen(false);
  const wide = matchMedia('(min-width:1100px)').matches;
  menuOpen(wide); setView(b.dataset.v); if (wide) menuOpen(true);
});
// Wischen nach links schließt das Menü
let drX = null;
document.addEventListener('touchstart', (e) => { if (e.target.closest('.dr')) drX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', (e) => { if (drX != null && e.changedTouches[0].clientX - drX < -60) menuOpen(false); drX = null; }, { passive: true });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !matchMedia('(min-width:1100px)').matches) menuOpen(false); });

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-j]'); if (!b) return;
  const a = b.dataset.j;
  if (a === 'mcpshow') { TH.call('/mcp/code').then((r) => { J.mcpUrl = r.url; render(); }).catch(() => toast('Gerade nicht möglich.')); return; }
  if (a === 'theme') { jSetTheme(b.dataset.v); render(); return; }
  if (a === 'qtrain') {
    sel = today(); setView('training');
    if (!typeOf(sel) && planT(sel) !== 'free') { const p = planT(sel); setTrainType(p === 'gym' ? 'g' + nextTpl(sel) : p); }
    return;
  }
  if (a === 'wecker') return openWecker();
  if (a === 'weckclose') return closeWecker();
  if (a === 'wkday') { const w = settings.edit('wecker'); const cur = wk(); const d = +b.dataset.v; w.days = cur.days.includes(d) ? cur.days.filter((x) => x !== d) : cur.days.concat(d); settings.touch('wecker', 0); return refreshWecker(); }
  if (a === 'wksender') { const w = settings.edit('wecker'); w.sender = b.dataset.v; settings.touch('wecker', 0); refreshWecker(); setTimeout(() => TH.call('/radio/prepare', { method: 'POST' }).catch(() => {}), 1500); return; }
  if (a === 'wkradiotest') {
    const au = document.getElementById('wkaudio'); if (!au) return;
    if (!au.paused) { au.pause(); b.textContent = '▶ Probehören'; return; }
    b.textContent = 'Lade …';
    TH.call('/wecker/code').then((r) => { au.src = '/api/radio?live=1&s=' + encodeURIComponent(wk().sender) + '&sec=15&k=' + r.code; return au.play(); })
      .then(() => { b.textContent = '■ Stopp'; }).catch(() => { b.textContent = '▶ Probehören'; toast('Probehören gerade nicht möglich.'); });
    au.onended = () => { b.textContent = '▶ Probehören'; };
    return;
  }
  if (a === 'wkmus') { const w = settings.edit('wecker'); w.musik = b.dataset.v; settings.touch('wecker', 0); return refreshWecker(); }
  if (a === 'weckcode') { TH.call('/wecker/code').then((r) => { J.weckCode = r.code; refreshWecker(); }).catch(() => toast('Gerade nicht möglich.')); return; }
  if (a === 'copy') { const v = b.dataset.v; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast('Kopiert')).catch(() => { prompt('Kopieren:', v); }); return; }
});
document.addEventListener('input', (e) => {
  const t = e.target; if (!t.dataset || !t.dataset.wk) return;
  const w = settings.edit('wecker'), cur = wk();
  Object.keys(cur).forEach((k) => { if (w[k] == null) w[k] = cur[k]; });
  w[t.dataset.wk] = t.dataset.wk === 'sec' ? +t.value : t.value.trim();
  settings.touch('wecker', 700);
  if (t.dataset.wk === 'sec') { const l = t.closest('label'); if (l) l.firstChild.textContent = 'Länge: ' + t.value + ' Sekunden'; }
});
document.addEventListener('change', (e) => {
  const t = e.target; if (!t.dataset || !t.dataset.wk) return;
  const w = settings.edit('wecker'), cur = wk();
  Object.keys(cur).forEach((k) => { if (w[k] == null) w[k] = cur[k]; });
  w[t.dataset.wk] = t.dataset.wk === 'sec' ? +t.value : t.value.trim();
  settings.touch('wecker', 0);
  if (t.dataset.wk !== 'sec') refreshWecker();
});

/* ============================================================
   Herrnhuter Losung (kommt mit dem Tagesbericht: reports/tag-<Datum>.losung)
   ============================================================ */
function losungCard() {
  const r = reports.get('tag-' + today()), l = r && r.losung;
  if (!l || !l.text) return '<section class="card losung"><span class="lbl">Losung heute</span><p class="hint">Die Herrnhuter Losung kommt jeden Morgen mit dem Tagesbericht.</p></section>';
  return '<section class="card losung"><span class="lbl">Losung heute</span><blockquote>' + esc(l.text) + '<cite>' + esc(l.ref || '') + '</cite></blockquote>'
    + (l.lehr ? '<blockquote class="lt">' + esc(l.lehr) + '<cite>' + esc(l.lehrRef || '') + '</cite></blockquote>' : '')
    + '<small class="src">Herrnhuter Losungen · © Evangelische Brüder-Unität – Herrnhuter Brüdergemeine</small></section>';
}

/* ============================================================
   Nachttisch-Wecker: James bleibt über Nacht offen, weckt mit Musik,
   und auf „Guten Morgen“ wird die Musik leiser und James spricht.
   ============================================================ */
const N = { on: false, fired: false, speaking: false, done: false, ctx: null, gain: null, audio: null, lock: null, rec: null, t: 0, at: null, text: '' };
function bestVoice() {
  const vs = (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter((v) => /^de/i.test(v.lang));
  return vs.find((v) => /premium/i.test(v.name)) || vs.find((v) => /enhanced|erweitert/i.test(v.name)) || vs.find((v) => /anna|markus|helena|martin|yannick|petra/i.test(v.name)) || vs[0] || null;
}
async function nightLock() { try { if ('wakeLock' in navigator) N.lock = await navigator.wakeLock.request('screen'); } catch (e) { N.lock = null; } }
document.addEventListener('visibilitychange', () => { if (N.on && document.visibilityState === 'visible') nightLock(); });
async function nightStart() {
  const w = wk();
  if (!w.days.length) { toast('Kein Wecktag aktiv.'); return; }
  if (!J.weckCode) { try { J.weckCode = (await TH.call('/wecker/code')).code; } catch (e) { toast('Keine Verbindung.'); return; } }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  N.ctx = new Ctx(); N.gain = N.ctx.createGain(); N.gain.gain.value = 0.0001; N.gain.connect(N.ctx.destination);
  N.audio = new Audio(); N.audio.crossOrigin = 'anonymous'; N.audio.preload = 'none'; N.audio.setAttribute('playsinline', '');
  N.ctx.createMediaElementSource(N.audio).connect(N.gain);
  // iOS gibt Ton nur nach einem Tipp frei – deshalb jetzt einmal kurz „entsperren“
  const buf = N.ctx.createBuffer(1, 1, 22050), src = N.ctx.createBufferSource(); src.buffer = buf; src.connect(N.ctx.destination); src.start(0);
  try { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); } catch (e) {}
  N.on = true; N.fired = N.speaking = N.done = false; N.text = ''; N.at = nextAlarm(w);
  await nightLock();
  nightRender();
  clearInterval(N.t); N.t = setInterval(nightTick, 1000);
}
function nightTick() {
  const c = document.getElementById('nclock');
  if (c) { const d = new Date(); c.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  if (N.on && !N.fired && N.at && Date.now() >= N.at.getTime()) nightFire();
}
function ramp(v, sec) { const g = N.gain.gain, t = N.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(v, t + sec); }
function nightFire() {
  N.fired = true; N.ctx.resume();
  N.audio.src = '/api/radio/live?k=' + encodeURIComponent(J.weckCode) + '&s=' + encodeURIComponent(wk().sender || 'srf3');
  N.audio.play().catch(() => {});
  ramp(0.85, 40); // sanft lauter werden
  nightListen(); nightRender();
}
function nightListen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || !N.on || N.speaking || N.done) return;
  try {
    const r = new SR(); r.lang = 'de-DE'; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => { const txt = [...e.results].map((x) => x[0].transcript).join(' '); if (/guten morgen|morgen|james/i.test(txt)) { try { r.stop(); } catch (_) {} nightBriefing(); } };
    r.onend = () => { if (N.on && N.fired && !N.speaking && !N.done) setTimeout(nightListen, 600); };
    r.start(); N.rec = r;
  } catch (e) {}
}
async function nightBriefing() {
  if (N.speaking || N.done) return;
  N.speaking = true;
  if (!N.fired) { N.fired = true; N.ctx.resume(); }
  ramp(0.1, 1.5); // Musik leiser, sie läuft unter der Stimme weiter
  let text = 'Guten Morgen, ' + jName() + '.';
  try { text = (await TH.call('/briefing')).text || text; } catch (e) {}
  N.text = text; nightRender();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; u.rate = 0.98; u.pitch = 1;
  const v = bestVoice(); if (v) u.voice = v;
  u.onend = u.onerror = () => { N.speaking = false; N.done = true; ramp(0.5, 3); nightRender(); };
  setTimeout(() => speechSynthesis.speak(u), 1600);
}
function nightStop() {
  N.on = false; clearInterval(N.t);
  try { N.audio.pause(); N.audio.removeAttribute('src'); N.audio.load(); } catch (e) {}
  try { N.rec && N.rec.stop(); } catch (e) {}
  try { speechSynthesis.cancel(); } catch (e) {}
  try { N.lock && N.lock.release(); } catch (e) {}
  try { N.ctx && N.ctx.close(); } catch (e) {}
  const el = document.getElementById('night'); if (el) el.remove();
  document.body.classList.remove('lock');
}
function nightRender() {
  let el = document.getElementById('night');
  if (!N.on) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'night'; document.body.appendChild(el); document.body.classList.add('lock'); }
  const d = new Date(), at = N.at;
  let body;
  if (!N.fired) body = '<p class="n-sub">Wecker ' + (at ? WDL[at.getDay()] + ', ' + pad(at.getHours()) + ':' + pad(at.getMinutes()) : '–') + '</p><p class="n-hint">Lass James offen und am Ladekabel. Das Display bleibt dunkel an.' + (N.lock ? '' : ' Stell zur Sicherheit „Automatische Sperre“ auf „Nie“.') + '</p><div class="n-row"><button data-j="nighttest">Jetzt testen</button><button data-j="nightstop">Beenden</button></div>';
  else if (!N.speaking && !N.done) body = '<p class="n-sub">Guten Morgen ☀︎</p><button class="n-big" data-j="nightbrief">Sag „Guten Morgen“<small>oder tippe hier</small></button><div class="n-row"><button data-j="nightstop">Aus</button></div>';
  else body = '<div class="n-text">' + (N.text ? esc(N.text) : '<span class="busyline"><span class="orb busy"></span>Einen Moment …</span>') + '</div><div class="n-row">' + (N.done ? '<button data-j="nightmute">Musik aus</button>' : '') + '<button data-j="nightstop">Fertig</button></div>';
  el.innerHTML = '<div class="n-in"><span class="orb' + (N.speaking ? ' busy' : '') + '"></span><div id="nclock" class="n-clock">' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</div>' + body + '</div>';
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-j]'); if (!b) return;
  const a = b.dataset.j;
  if (a === 'nightstart') return nightStart();
  if (a === 'nightbrief') return nightBriefing();
  if (a === 'nighttest') return nightFire();
  if (a === 'nightstop') return nightStop();
  if (a === 'nightmute') { ramp(0.0001, 2); setTimeout(() => { try { N.audio.pause(); } catch (err) {} }, 2100); b.remove(); return; }
});
