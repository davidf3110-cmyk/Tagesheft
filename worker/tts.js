// Natürliche Stimme fürs Morgen-Briefing über Microsoft Azure Speech (Gratisstufe F0).
// Schlüssel und Region liegen nur in D1 (secrets.azure), die gewählte Stimme in settings/stimme.
export const VOICES = [
  ['de-DE-ConradNeural', 'Conrad', 'Hochdeutsch, ruhig, männlich'],
  ['de-DE-FlorianMultilingualNeural', 'Florian', 'Hochdeutsch, natürlich, männlich'],
  ['de-DE-SeraphinaMultilingualNeural', 'Seraphina', 'Hochdeutsch, natürlich, weiblich'],
  ['de-DE-KatjaNeural', 'Katja', 'Hochdeutsch, klar, weiblich'],
  ['de-CH-JanNeural', 'Jan', 'Schweizer Akzent, männlich'],
  ['de-CH-LeniNeural', 'Leni', 'Schweizer Akzent, weiblich'],
];
const DEF = 'de-DE-ConradNeural';
const PROBE = 'Guten Morgen, David. Hier ist James. 4 bis 9 Grad, sonnig. Termine: um 9 Uhr Team-Meeting. Training: Gym. Auf geht’s.';

export async function azure(env) {
  const r = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('azure').first();
  try { return r && r.v ? JSON.parse(r.v) : null; } catch (e) { return null; }
}
export async function voiceOf(env) {
  const r = await env.DB.prepare('SELECT d FROM docs WHERE c=?1 AND id=?2').bind('settings', 'stimme').first();
  const v = r && r.d ? JSON.parse(r.d).voice : '';
  return VOICES.some((x) => x[0] === v) ? v : DEF;
}
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
async function synth(cfg, voice, text) {
  const lang = voice.slice(0, 5);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><lang xml:lang="de-DE"><prosody rate="+4%">${xml(text)}</prosody></lang></voice></speak>`;
  const r = await fetch(`https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': cfg.key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3', 'User-Agent': 'James' },
    body: ssml,
  });
  if (!r.ok) throw new Error('tts ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return r.arrayBuffer();
}
// MP3 fürs Briefing; in KV zwischengespeichert, solange Text und Stimme gleich bleiben.
export async function speech(env, text) {
  const cfg = await azure(env); if (!cfg) throw new Error('nokey');
  const voice = await voiceOf(env), h = await sha(voice + '|' + text);
  const c = await env.KV.getWithMetadata('tts', 'arrayBuffer');
  if (c && c.value && c.metadata && c.metadata.h === h) return c.value;
  const buf = await synth(cfg, voice, text);
  await env.KV.put('tts', buf, { metadata: { h, at: new Date().toISOString() } });
  return buf;
}
// Kurze Hörprobe einer Stimme (pro Stimme zwischengespeichert).
export async function probe(env, voice) {
  if (!VOICES.some((x) => x[0] === voice)) voice = DEF;
  const cfg = await azure(env); if (!cfg) throw new Error('nokey');
  const c = await env.KV.get('probe-' + voice, 'arrayBuffer');
  if (c) return c;
  const buf = await synth(cfg, voice, PROBE);
  await env.KV.put('probe-' + voice, buf, { expirationTtl: 60 * 60 * 24 * 30 });
  return buf;
}
// Schlüssel prüfen: Stimmenliste der Region abrufen.
export async function checkAzure(key, region) {
  if (!/^[a-z0-9]{3,30}$/.test(region)) return false;
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { headers: { 'Ocp-Apim-Subscription-Key': key } });
  return r.ok;
}
