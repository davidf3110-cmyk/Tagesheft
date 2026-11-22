// Natürliche Stimme fürs Morgen-Briefing (OpenAI gpt-4o-mini-tts). Der Schlüssel liegt nur in D1 (secrets.openai).
const STIL = 'Sprich Deutsch wie J.A.R.V.I.S.: ein ruhiger, warmer, eleganter Butler mit trockenem Charme. '
  + 'Morgens, gelassen und klar, eher langsam, kleine Pausen zwischen den Themen. Bibelverse würdevoll und etwas langsamer.';
const VOICE = 'onyx', V = 'v1';

export async function voiceKey(env) {
  const r = await env.DB.prepare('SELECT v FROM secrets WHERE k=?1').bind('openai').first();
  return r && r.v ? r.v : '';
}

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

// Liefert MP3 (ArrayBuffer) für den Text; zwischengespeichert in KV, solange sich der Text nicht ändert.
export async function speech(env, text, { cacheOnly = false } = {}) {
  const h = await sha(V + VOICE + text);
  const c = await env.KV.getWithMetadata('tts', 'arrayBuffer');
  if (c && c.value && c.metadata && c.metadata.h === h) return c.value;
  if (cacheOnly) return null;
  const key = await voiceKey(env);
  if (!key) throw new Error('nokey');
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: VOICE, input: text.slice(0, 4000), instructions: STIL, response_format: 'mp3' }),
  });
  if (!r.ok) throw new Error('tts ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const buf = await r.arrayBuffer();
  await env.KV.put('tts', buf, { metadata: { h, at: new Date().toISOString() } });
  return buf;
}

export async function checkKey(key) {
  const r = await fetch('https://api.openai.com/v1/models/gpt-4o-mini-tts', { headers: { authorization: 'Bearer ' + key } });
  return r.ok;
}
