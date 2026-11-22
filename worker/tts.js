// Natürliche Stimme fürs Morgen-Briefing über Google Cloud Text-to-Speech (Gratis-Kontingent).
// Der API-Schlüssel liegt nur in D1 (secrets.gtts), die gewählte Stimme in settings/stimme.
const API = 'https://texttospeech.googleapis.com/v1';
const PROBE = 'Guten Morgen, David. Hier ist James. 4 bis 9 Grad, sonnig. Termine: um 9 Uhr Team-Meeting. Training: Gym. Auf geht’s.';
const PREF = ['Charon', 'Orus', 'Fenrir', 'Puck', 'Iapetus', 'Algenib', 'Kore', 'Aoede', 'Leda', 'Zephyr'];

export async function gkey(env) {
  const r = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('gtts').first();
  return r && r.v ? r.v : '';
}
// Deutsche Chirp-3-HD-Stimmen (die natürlichsten), sonst Neural2/WaveNet. Liste 1 Tag zwischengespeichert.
export async function voices(env, key) {
  key = key || await gkey(env); if (!key) return [];
  const c = await env.KV.get('gvoices', 'json'); if (c && c.length) return c;
  const r = await fetch(API + '/voices?languageCode=de-DE&key=' + encodeURIComponent(key));
  if (!r.ok) return [];
  const all = ((await r.json()).voices || []).filter((v) => (v.languageCodes || []).includes('de-DE'));
  let pick = all.filter((v) => /Chirp3-HD/.test(v.name));
  if (!pick.length) pick = all.filter((v) => /Neural2|Wavenet/.test(v.name));
  const rank = (v) => { const i = PREF.findIndex((p) => v.name.endsWith('-' + p)); return i < 0 ? 99 : i; };
  const out = pick.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 8)
    .map((v) => [v.name, v.name.split('-').pop(), v.ssmlGender === 'MALE' ? 'männlich' : v.ssmlGender === 'FEMALE' ? 'weiblich' : '']);
  if (out.length) await env.KV.put('gvoices', JSON.stringify(out), { expirationTtl: 86400 });
  return out;
}
export async function voiceOf(env) {
  const r = await env.DB.prepare('SELECT d FROM docs WHERE c=?1 AND id=?2').bind('settings', 'stimme').first();
  const v = r && r.d ? JSON.parse(r.d).voice : '';
  const vs = await voices(env);
  return vs.some((x) => x[0] === v) ? v : (vs[0] ? vs[0][0] : 'de-DE-Chirp3-HD-Charon');
}
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
async function synth(key, voice, text) {
  const body = { input: { text: text.slice(0, 4500) }, voice: { languageCode: 'de-DE', name: voice }, audioConfig: { audioEncoding: 'MP3' } };
  if (!/Chirp/.test(voice)) body.audioConfig.speakingRate = 1.05;
  const r = await fetch(API + '/text:synthesize?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('tts ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const b64 = (await r.json()).audioContent || '';
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
// MP3 fürs Briefing; in KV zwischengespeichert, solange Text und Stimme gleich bleiben.
export async function speech(env, text) {
  const key = await gkey(env); if (!key) throw new Error('nokey');
  const voice = await voiceOf(env), h = await sha(voice + '|' + text);
  const c = await env.KV.getWithMetadata('tts', 'arrayBuffer');
  if (c && c.value && c.metadata && c.metadata.h === h) return c.value;
  const buf = await synth(key, voice, text);
  await env.KV.put('tts', buf, { metadata: { h, at: new Date().toISOString() } });
  return buf;
}
// Kurze Hörprobe einer Stimme (pro Stimme zwischengespeichert).
export async function probe(env, voice) {
  const key = await gkey(env); if (!key) throw new Error('nokey');
  const vs = await voices(env, key);
  if (!vs.some((x) => x[0] === voice)) voice = vs[0] ? vs[0][0] : 'de-DE-Chirp3-HD-Charon';
  const c = await env.KV.get('probe-' + voice, 'arrayBuffer');
  if (c) return c;
  const buf = await synth(key, voice, PROBE);
  await env.KV.put('probe-' + voice, buf, { expirationTtl: 60 * 60 * 24 * 30 });
  return buf;
}
// Schlüssel prüfen: Stimmenliste abrufen.
export async function checkKey(key) {
  const r = await fetch(API + '/voices?languageCode=de-DE&key=' + encodeURIComponent(key));
  return r.ok ? '' : ((await r.json().catch(() => ({}))).error || {}).message || ('Fehler ' + r.status);
}
// Einmalig sprechen, ohne den Briefing-Zwischenspeicher zu überschreiben (für die Demo).
export async function speakOnce(env, text) {
  const key = await gkey(env); if (!key) throw new Error('nokey');
  return synth(key, await voiceOf(env), text);
}
