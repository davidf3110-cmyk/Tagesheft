// Die App-Dateien aus public/, direkt im Worker ausgeliefert.
import index from '../public/index.html';
import sync from '../public/sync.js';
import sw from '../public/sw.js';
import manifest from '../public/manifest.webmanifest';
import icon from '../public/icon.svg';
import icon180 from '../public/icon-180.png';
import icon192 from '../public/icon-192.png';
import icon512 from '../public/icon-512.png';
import jamesJs from '../public/james.js';
import jamesCss from '../public/james.css';
import globeLib from '../public/globe-lib.js';
import world from '../public/world.json';
import geoExtra from '../public/geo-extra.json';

const FILES = {
  '/': [index, 'text/html; charset=utf-8', 'no-cache'],
  '/index.html': [index, 'text/html; charset=utf-8', 'no-cache'],
  '/sync.js': [sync, 'text/javascript; charset=utf-8', 'no-cache'],
  '/sw.js': [sw, 'text/javascript; charset=utf-8', 'no-cache'],
  '/manifest.webmanifest': [manifest, 'application/manifest+json', 'max-age=3600'],
  '/james.js': [jamesJs, 'text/javascript; charset=utf-8', 'no-cache'],
  '/james.css': [jamesCss, 'text/css; charset=utf-8', 'no-cache'],
  '/globe-lib.js': [globeLib, 'text/javascript; charset=utf-8', 'max-age=604800'],
  '/world.json': [typeof world === 'string' ? world : JSON.stringify(world), 'application/json', 'max-age=604800'],
  '/geo-extra.json': [typeof geoExtra === 'string' ? geoExtra : JSON.stringify(geoExtra), 'application/json; charset=utf-8', 'max-age=604800'],
  '/icon.svg': [icon, 'image/svg+xml', 'max-age=86400'],
  '/icon-180.png': [icon180, 'image/png', 'max-age=86400'],
  '/icon-192.png': [icon192, 'image/png', 'max-age=86400'],
  '/icon-512.png': [icon512, 'image/png', 'max-age=86400'],
};

export function serveStatic(url) {
  const f = FILES[url.pathname];
  if (!f) return new Response('Nicht gefunden', { status: 404 });
  return new Response(f[0], {
    headers: {
      'content-type': f[1],
      'cache-control': f[2],
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}
