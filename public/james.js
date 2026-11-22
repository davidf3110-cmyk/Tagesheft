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
  stLoad();
  const b = reports.get('james-' + today()), w = b && b.wetter;
  const wx = w && w.lo != null ? w.lo + '–' + w.hi + ' °C' + (w.t ? ' · ' + w.t : '') : '';
  const open = !!J.briefOpen;
  const sub = J.briefBusy ? 'Stellt dein Briefing zusammen …' : open ? 'Briefing zuklappen' : 'Antippen für dein Briefing';
  return '<section class="jc"><button class="jc-top jc-btn" data-j="briefopen" aria-expanded="' + open + '"><span class="orb' + (J.briefBusy ? ' busy' : '') + '"></span><div><b>' + esc(jamesGreeting()) + '</b><small>' + sub + '</small></div><span class="jc-chev" aria-hidden="true">' + (open ? '⌃' : '⌄') + '</span></button>'
    + (open && b ? '<p>' + esc(b.text) + '</p>' : '')
    + '<form class="ask" id="jask" autocomplete="off"><input id="jaskin" placeholder="Frag James …" aria-label="Frag James" enterkeyhint="send"><button type="submit" aria-label="Senden">↑</button></form></section>';
}
function wxIcon(w) { const t = String(w.t || '').toLowerCase(); return /gewitter/.test(t) ? '⛈️' : /schnee/.test(t) ? '🌨️' : /regen|schauer|niesel/.test(t) ? '🌧️' : /nebel/.test(t) ? '🌫️' : /bewölkt|wolkig|bedeckt/.test(t) ? '☁️' : /sonn|klar|heiter/.test(t) ? '☀️' : '🌤️'; }
async function jBriefing(fresh) {
  J.briefBusy = true; softRender();
  try { await TH.call('/briefing' + (fresh ? '?fresh=1' : '')); await TH.pull(); }
  catch (e) { toast('Briefing gerade nicht verfügbar.'); }
  J.briefBusy = false; softRender();
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
function stLoad() {
  if (J.stLoaded || J.stLoad) return; J.stLoad = true;
  Promise.all([TH.call('/wecker/code'), TH.call('/stimme')]).then(([c, st]) => { J.weckCode = c.code; J.st = st; J.stLoaded = true; softRender(); }).catch(() => {}).finally(() => { J.stLoad = false; });
}
// Morgen-Briefing nach dem Uhr-App-Wecker: Kurzbefehl spielt die Microsoft-Stimme ab (oder liest mit Siri vor).
function briefSetup() {
  stLoad();
  const st = J.st || {}, on = !!st.aktiv, code = J.weckCode || '…';
  const u = location.origin + (on ? '/api/briefing.mp3?k=' : '/api/briefing?format=text&k=') + code;
  const cur = (settings.get('stimme') || {}).voice || st.voice || 'de-DE-ConradNeural';
  let h = '<section class="card wk-setup"><h3>Morgen-Briefing nach dem Wecker</h3>'
    + '<p class="hint">Wecker wie immer in der Uhr-App stellen. Wenn du ihn stoppst, spricht James, was heute ansteht.</p>';
  h += '<p class="lbl" style="margin:10px 0 0">Stimme</p>';
  if (on) {
    h += '<p class="hint">Microsoft-Stimme ist aktiv (kostenlos, Region ' + esc(st.region || '') + '). Antippen zum Probehören und Auswählen:</p><div class="vlist">'
      + (st.voices || []).map(([id, n, d]) => '<button data-j="stvoice" data-v="' + id + '" class="' + (id === cur ? 'on' : '') + '"><b>' + (J.stPlay === id ? '■ ' : '▶ ') + esc(n) + '</b><small>' + esc(d) + '</small></button>').join('') + '</div>'
      + '<div class="row"><button class="sm" data-j="stoff">Microsoft-Stimme entfernen</button></div>';
  } else {
    h += '<p class="hint">Für eine natürliche Stimme statt Siri: Schlüssel und Region aus Microsoft Azure (Speech-Dienst, Tarif „Free F0“) hier eintragen. Der Schlüssel bleibt nur auf deinem James-Server.</p>'
      + '<label class="f">Schlüssel<input id="stkey" type="password" autocomplete="off" placeholder="Schlüssel 1"></label>'
      + '<label class="f">Region<input id="streg" autocomplete="off" placeholder="z. B. westeurope" value="westeurope"></label>'
      + '<div class="row"><button class="pri" data-j="stset">Speichern</button></div>';
  }
  h += '<p class="lbl" style="margin:10px 0 0">Kurzbefehl (einmal einrichten)</p><ol>'
    + '<li>Diese Adresse kopieren:</li></ol>' + (J.weckCode ? '<div class="row"><button class="pri" data-j="copy" data-v="' + esc(u) + '">Adresse kopieren</button></div>' : '') + '<ol start="2">'
    + '<li>Kurzbefehle → <b>Automation</b> → deine Wecker-Automation öffnen.</li>'
    + '<li>Bei <b>Inhalte von URL abrufen</b> die neue Adresse einfügen.</li>'
    + (on ? '<li>„Text sprechen“ löschen und stattdessen eine Aktion zum <b>Abspielen</b> der Datei hinzufügen (Suchwort „Ton“ oder „abspielen“).</li>' : '<li>Danach <b>Text sprechen</b> mit deiner Stimme.</li>')
    + '</ol>' + (on ? '<p class="hint">Unsicher, welche Aktion? Schick Claude einen Screenshot der Suchergebnisse.</p>' : '') + '</section>';
  return h;
}
function jamesSettings() {
  return themeSettings() + briefSetup() + '<section class="card"><h3>Claude-Connector</h3><p class="hint">Damit Claude in der Claude-App und in geplanten Aufgaben direkt mit James arbeitet – über dein Abo, ohne Zusatzkosten. In Claude: Einstellungen → Connectors → Eigenen Connector hinzufügen → Name „James“, diese Adresse einfügen. Die Adresse ist geheim wie ein Passwort.</p>'
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
    h += '<details class="card more" id="wwar"' + (J.w.warOpen ? ' open' : '') + '><summary>Alle Regionen (' + war.length + ')</summary><div>' + war.sort((a, b) => (a[1].land || '').localeCompare(b[1].land || '', 'de') || a[1].n.localeCompare(b[1].n, 'de')).map(placeRow).join('') + '</div></details>';
    setTimeout(mountGlobe, 0);
  } else {
    h += '<section class="jc"><div class="jc-top"><span class="orb"></span><div><b>Wohin als Nächstes?</b><small>James kennt deine Liste und wo du schon warst</small></div></div>'
      + '<div class="grid2"><input id="wbud" inputmode="numeric" placeholder="Budget CHF" value="' + esc(J.w.budget) + '" data-wi="budget" style="background:rgba(255,255,255,.08);color:#F3F1EC"><input id="wtage" inputmode="numeric" placeholder="Tage" value="' + esc(J.w.tage) + '" data-wi="tage" style="background:rgba(255,255,255,.08);color:#F3F1EC"></div>'
      + '<input id="wmon" placeholder="Wann? z. B. März oder Ostern" value="' + esc(J.w.monat) + '" data-wi="monat" style="background:rgba(255,255,255,.08);color:#F3F1EC">'
      + '<div class="row"><button class="gold" data-j="reise">Vorschläge holen</button></div></section>';
    const srt = will.sort((a, b) => ((b[1].prio ? 1 : 0) - (a[1].prio ? 1 : 0)) || a[1].n.localeCompare(b[1].n, 'de'));
    h += '<section class="card"><div class="head"><h2>Meine Liste</h2><span class="hint">' + will.length + ' Ziele</span></div>' + (srt.length ? '<div>' + srt.map(placeRow).join('') + '</div>' : '<p class="hint">Noch leer.</p>') + '</section>';
    h += addPlaceCard(false);
  }
  return h;
}
function placeRow([id, x]) {
  const sub = [x.region && x.region !== x.n ? x.region : '', x.land, x.war && x.besucht ? 'seit ' + fmtDate(x.besucht) : ''].filter(Boolean).join(' · ');
  const open = J.w.open === id;
  return '<div class="place" data-id="' + id + '"><span class="fl">' + flag(x.cc) + '</span><span><b>' + (x.prio ? '⭐ ' : '') + esc(x.n) + '</b><small>' + esc(sub) + '</small>'
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
  if (best && best.id) { G.tip.hidden = true; G.pick = { id: best.id }; gPickShow(wrap); return; }
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
  const p = G.pick, ex = p.id && orte.get(p.id);
  if (p.id && !ex) { G.pick = null; G.pickEl.remove(); return; }
  G.pickEl.innerHTML = ex ? '<b>' + flag(ex.cc) + ' ' + esc(ex.n) + '</b><small>' + esc([ex.region && ex.region !== ex.n ? ex.region : '', ex.land, ex.war ? 'war ich' : 'will ich hin'].filter(Boolean).join(' · ')) + '</small><div class="row">'
      + (ex.war ? '<button data-j="gpmove">Will ich noch hin</button>' : '<button class="gold" data-j="gpmove">War ich</button>') + '<button class="danger" data-j="gprm">Entfernen</button><button data-j="gpx" aria-label="Schließen">✕</button></div>'
    : p.loading ? '<div class="busyline"><span class="orb busy"></span>Welcher Ort ist das …</div>'
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
  const P = orte.all().map(([id, x]) => Object.assign({ id }, x)).filter((x) => isFinite(x.lat) && isFinite(x.lon));
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
    G.hit.push({ x: px, y: py, n: x.n, cc: x.cc, war: x.war, id: x.id });
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
    + '<div class="row"><button class="gold" data-j="krplan">' + (pl.length ? '↻ Weg neu berechnen' : 'Weg berechnen') + '</button></div></section>';
  // Pfad
  h += '<div class="path2">';
  hist.forEach((s) => { h += '<div class="st2 done"><span class="node">' + (s.flagge || '✓') + '</span><div class="bx"><span class="meta">' + esc([s.von, s.bis].filter(Boolean).join(' – ')) + '</span><b>' + esc(s.rolle || '') + '</b><span class="co">' + esc([s.firma, s.land].filter(Boolean).join(' · ')) + '</span></div></div>'; });
  h += '<div class="st2 now"><span class="node">' + (a.flagge || '📍') + '</span><div class="bx"><span class="meta"><span class="pill now">Jetzt</span>' + (a.seit ? 'seit ' + esc(a.seit) : '') + '</span><b>' + esc(a.rolle || 'Aktuelle Station eintragen') + '</b><span class="co">' + esc([a.firma, a.land].filter(Boolean).join(' · ')) + '</span></div></div>';
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
  if (!pl.length && !J.krBusy) h += '<p class="hint">Noch kein Weg berechnet. Tippe auf „Weg berechnen“.</p>';
  if (k.plan) {
    if ((k.plan.jetzt_tun || []).length) h += '<section class="card"><div class="lbl">Jetzt tun</div><ul style="margin:0;padding-left:20px;display:grid;gap:6px">' + k.plan.jetzt_tun.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></section>';
  }
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
  if (a === 'briefopen') { J.briefOpen = !J.briefOpen; if (J.briefOpen && !reports.get('james-' + today())) jBriefing(false); return softRender(); }
  if (a === 'briefnew') return jBriefing(true);
  if (a === 'chat') return openChat(b.dataset.v);
  // Welt
  if (a === 'wtab') { J.w.tab = b.dataset.v; J.w.res = []; J.w.open = ''; try { localStorage.setItem('james-welt', J.w.tab); } catch (err) {} return render(); }
  if (a === 'popen') {
    const prev = J.w.open; J.w.open = prev === b.dataset.id ? '' : b.dataset.id;
    [prev, J.w.open].filter(Boolean).forEach((id) => { const x = orte.get(id), el = document.querySelector('.place[data-id="' + id + '"]'); if (x && el) el.outerHTML = placeRow([id, x]); });
    return;
  }
  if (a === 'pwar' || a === 'pwill' || a === 'pstar' || a === 'pdel') { const y = window.scrollY; requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y))); }
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
  if (a === 'gpmove' || a === 'gprm') {
    const id = G.pick && G.pick.id, x = id && orte.get(id); if (!x) return;
    if (a === 'gprm') { const old = clone(x); orte.del(id); toast(x.n + ' entfernt', () => { orte.put(id, old, 0); G.cKey = ''; render(); }); }
    else { const e = orte.edit(id); e.war = !x.war; e.besucht = e.war ? today() : ''; orte.touch(id, 0); toast(x.n + (e.war ? ' – war ich' : ' – will ich hin')); }
    G.pick = null; G.cKey = ''; gPickShow(); return render();
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
document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'wwar') J.w.warOpen = e.target.open; }, true);
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
function jamesTrain() { return typeof weekDays === 'function' ? trainHero(weekDays()) : ''; }
function jamesQuick() {
  const k = today(), lg = logged(k), ty = typeOf(k), p = planT(k);
  let label, sub;
  if (lg) { label = doneLine(k).replace(/^\S+\s/, ''); sub = 'Heute erledigt ✓'; }
  else if (p === 'free') { label = 'Training eintragen'; sub = '(heute frei laut Plan)'; }
  else { label = 'Training eintragen'; sub = '(planmäßig: ' + recLine(k).replace(/^\S+\s/, '') + ')'; }
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
   Seitenmenü (aus- und einklappbar)
   ============================================================ */
const NAV = [['heute', 'James'], ['todos', 'To-dos'], ['training', 'Training'], ['einkauf', 'Einkauf'], ['gebet', 'Gebet'], ['orte', 'Welt'], ['jobs', 'Karriere'], ['einstellungen', 'Einstellungen']];
const NAVIC = {
  gebet: '<svg viewBox="0 0 24 24"><path d="M12 3v18M6.5 8.5h11"/></svg>',
  orte: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z"/></svg>',
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
  if (a === 'stset') {
    const key = (document.getElementById('stkey') || {}).value || '', region = (document.getElementById('streg') || {}).value || '';
    if (!key.trim() || !region.trim()) return toast('Bitte Schlüssel und Region eintragen.');
    b.textContent = 'Prüfe …';
    TH.call('/stimme', { method: 'POST', body: JSON.stringify({ key: key.trim(), region: region.trim() }) })
      .then(() => { J.stLoaded = false; stLoad(); toast('Microsoft-Stimme aktiv'); })
      .catch(() => { b.textContent = 'Speichern'; toast('Schlüssel oder Region stimmt nicht.'); });
    return;
  }
  if (a === 'stoff') { TH.call('/stimme', { method: 'POST', body: JSON.stringify({ key: '' }) }).then(() => { J.stLoaded = false; stLoad(); }); return; }
  if (a === 'stvoice') {
    const v = b.dataset.v, au = J.stAu || (J.stAu = new Audio());
    const w = settings.edit('stimme'); w.voice = v; settings.touch('stimme', 0);
    if (J.stPlay === v && !au.paused) { au.pause(); J.stPlay = ''; return render(); }
    J.stPlay = v; render();
    au.src = '/api/stimme/probe?v=' + encodeURIComponent(v) + '&k=' + J.weckCode;
    au.onended = au.onerror = () => { J.stPlay = ''; softRender(); };
    au.play().catch(() => { J.stPlay = ''; softRender(); toast('Hörprobe gerade nicht möglich.'); });
    return;
  }
  if (a === 'qtrain') {
    sel = today(); setView('training');
    if (!typeOf(sel) && planT(sel) !== 'free') { const p = planT(sel); setTrainType(p === 'gym' ? 'g' + nextTpl(sel) : p); }
    return;
  }
  if (a === 'copy') { const v = b.dataset.v; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast('Kopiert')).catch(() => { prompt('Kopieren:', v); }); return; }
});
/* ============================================================
   Herrnhuter Losung (kommt mit dem Tagesbericht: reports/tag-<Datum>.losung)
   ============================================================ */
function losungCard() {
  const r = reports.get('tag-' + today()), l = reports.get('losung-' + today()) || (r && r.losung);
  if (!l || !l.text) return '<section class="card losung"><span class="lbl">Losung heute</span><p class="hint">Die Herrnhuter Losung kommt jeden Morgen automatisch.</p></section>';
  return '<section class="card losung"><span class="lbl">Losung heute</span><blockquote>' + esc(l.text) + '<cite>' + esc(l.ref || '') + '</cite></blockquote>'
    + (l.lehr ? '<blockquote class="lt">' + esc(l.lehr) + '<cite>' + esc(l.lehrRef || '') + '</cite></blockquote>' : '')
    + '<small class="src">Herrnhuter Losungen · © Evangelische Brüder-Unität – Herrnhuter Brüdergemeine</small></section>';
}
