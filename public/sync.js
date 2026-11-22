/* Tagesheft – Verbindung zum eigenen Server.
   Bildet die Schnittstelle nach, die das Tagesheft im Claude-Artifact hatte
   (db.collection(c).onSnapshot / .doc(id).set / .delete und Kalender über watchTool),
   damit der übrige Code unverändert bleibt. Alles wird zusätzlich lokal gespeichert,
   so startet die App sofort und funktioniert auch offline. */
(function () {
  const TK = 'th-token', SK = 'th-sync';
  const rd = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const token = () => { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } };

  async function call(path, opt) {
    opt = opt || {};
    let r;
    try {
      r = await fetch('/api' + path, {
        method: opt.method || 'GET',
        body: opt.body,
        headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' },
        cache: 'no-store',
      });
    } catch (e) {
      throw { code: 'unavailable', retryable: true };
    }
    if (r.status === 401) { login(); throw { code: 'revoked' }; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = j.error === 'quota_exceeded' ? 'quota_exceeded' : j.error === 'invalid_argument' ? 'invalid_argument'
        : j.error || 'unavailable';
      throw { code, message: j.message || '', retryable: r.status >= 500 || code === 'unavailable' };
    }
    return j;
  }

  /* ---------- Anmeldung ---------- */
  function login(msg) {
    if (document.getElementById('login')) return;
    const el = document.createElement('div');
    el.id = 'login';
    el.innerHTML =
      '<form class="login-in" autocomplete="on"><img src="icon.svg" alt="" width="64" height="64">' +
      '<h1>James</h1><p class="hint">' + (msg || 'Gib deinen Zugangscode ein. Du brauchst ihn nur einmal pro Gerät.') + '</p>' +
      '<input id="logincode" name="password" type="password" autocomplete="current-password" placeholder="xxxx-xxxx-xxxx-xxxx" aria-label="Zugangscode" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '<button class="pri" type="submit">Anmelden</button><p class="msg" id="loginmsg" hidden></p></form>';
    document.body.appendChild(el);
    document.body.classList.add('lock');
    const f = el.querySelector('form'), inp = el.querySelector('#logincode'), m = el.querySelector('#loginmsg');
    setTimeout(() => inp.focus(), 50);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = inp.value.trim().toLowerCase();
      if (!v) return inp.focus();
      try { localStorage.setItem(TK, v); } catch (err) {}
      try {
        await call('/sync?since=9007199254740000');
        location.reload();
      } catch (err) {
        m.hidden = false;
        m.textContent = err.code === 'revoked' ? 'Der Code stimmt nicht.' : 'Keine Verbindung. Versuch es gleich noch einmal.';
        if (err.code === 'revoked') { try { localStorage.removeItem(TK); } catch (e2) {} document.getElementById('login').remove(); login('Der Code stimmt nicht. Versuch es noch einmal.'); }
      }
    });
  }

  /* ---------- Datenbank ---------- */
  let st = rd(SK) || { cursor: 0, docs: {} };
  const subs = {};
  let loaded = false, busy = false, again = false;
  const save = () => wr(SK, st);
  const snap = (c, fromCache) => {
    const m = st.docs[c] || {};
    const docs = Object.keys(m).map((id) => ({ id, exists: true, data: () => m[id] }));
    return { metadata: { fromCache }, empty: !docs.length, docs };
  };
  const emit = (c, fromCache) => (subs[c] || []).forEach((cb) => cb(snap(c, fromCache)));

  async function pull() {
    if (!token()) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      const r = await call('/sync?since=' + (st.cursor || 0));
      const changed = new Set();
      r.docs.forEach((x) => {
        const m = (st.docs[x.c] = st.docs[x.c] || {});
        if (x.d == null) delete m[x.id]; else m[x.id] = x.d;
        changed.add(x.c);
      });
      st.cursor = r.cursor || st.cursor;
      save();
      const first = !loaded;
      loaded = true;
      Object.keys(subs).forEach((c) => { if (first || changed.has(c)) emit(c, false); });
      window.dispatchEvent(new CustomEvent('th-synced', { detail: { ok: true } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('th-synced', { detail: { ok: false, code: e && e.code } }));
    }
    busy = false;
    if (again) { again = false; pull(); }
  }

  let kick = null;
  const db = {
    collection(c) {
      return {
        onSnapshot(cb) {
          (subs[c] = subs[c] || []).push(cb);
          if (st.cursor) setTimeout(() => cb(snap(c, !loaded)), 0);
          clearTimeout(kick);
          kick = setTimeout(pull, 0);
          return () => { subs[c] = (subs[c] || []).filter((x) => x !== cb); };
        },
        doc(id) {
          const put = async (d) => {
            await call('/doc', { method: 'POST', body: JSON.stringify({ c, id, d }) });
            const m = (st.docs[c] = st.docs[c] || {});
            if (d == null) delete m[id]; else m[id] = d;
            save();
          };
          return { set: (d) => put(d), delete: () => put(null) };
        },
      };
    },
  };

  setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  window.addEventListener('online', pull);

  /* ---------- Kalender (privater iCal-Link, über den Server) ---------- */
  function calendar() {
    const watchers = new Set();
    const load = async (input) => {
      const from = String(input.startTime).slice(0, 10), to = String(input.endTime).slice(0, 10);
      const r = await call('/cal?from=' + from + '&to=' + to);
      return { payload: { events: r.events } };
    };
    const run = async (w) => {
      try { const res = await load(w.input); res.cache = { storedAt: Date.now() }; if (w.on) w.cb({ type: 'data', result: res }); }
      catch (e) { if (w.on) w.cb({ type: 'error', error: e }); }
    };
    return {
      watchTool(server, tool, input, cb, opts) {
        const w = { input, cb, on: true };
        watchers.add(w);
        run(w);
        w.t = setInterval(() => { if (document.visibilityState === 'visible') run(w); }, (opts && opts.refetchInterval) || 600000);
        return () => { w.on = false; clearInterval(w.t); watchers.delete(w); };
      },
      callTool: (server, tool, input) => load(input),
      invalidate: async () => { watchers.forEach(run); },
    };
  }

  window.TH = {
    open: async () => { if (!token()) { login(); return new Promise(() => {}); } return db; },
    calendar,
    call,
    pull,
    logout() { try { localStorage.removeItem(TK); localStorage.removeItem(SK); } catch (e) {} location.reload(); },
    exportAll() {
      const blob = new Blob([JSON.stringify({ app: 'James', stand: new Date().toISOString(), daten: st.docs })], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'james-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };
})();
