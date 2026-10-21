/* Greylock service worker
   - app shell: precached, served cache-first, refreshed in the background
   - map tiles: saved-area cache first, then a capped runtime cache, then network
   - data APIs (parcel lookups, weather): straight to network; the app keeps its own copies */

const VERSION = "greylock-v1.0.0";
const SHELL_CACHE = `${VERSION}-shell`;
const OFFLINE_TILES = "greylock-tiles-offline";   // tiles from saved areas, never trimmed here
const RUNTIME_TILES = "greylock-tiles-runtime";   // tiles you scrolled past, capped
const RUNTIME_LIMIT = 4000;

const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./seasons.js",
  "./manifest.webmanifest",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/leaflet.css",
  "./vendor/suncalc.js",
  "./fonts/atkinson-hyperlegible-latin-400-normal.woff2",
  "./fonts/atkinson-hyperlegible-latin-700-normal.woff2",
  "./fonts/barlow-semi-condensed-latin-500-normal.woff2",
  "./fonts/barlow-semi-condensed-latin-600-normal.woff2",
  "./fonts/barlow-semi-condensed-latin-700-normal.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

const TILE_HOSTS = ["tiles.arcgis.com", "basemap.nationalmap.gov"];

function isTile(url) {
  if (TILE_HOSTS.includes(url.hostname)) return true;
  // dynamic MapServer exports used as tiles (public land overlay)
  return url.hostname === "gis.eea.mass.gov" && url.pathname.endsWith("/MapServer/export");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith("greylock-v") && k !== SHELL_CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (isTile(url)) {
    event.respondWith(tileResponse(req));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(shellResponse(req));
  }
  // everything else (feature queries, weather) goes to the network untouched
});

async function shellResponse(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (cached) return cached; // the network refresh above keeps running in the background
  const res = await network;
  if (res) return res;
  if (req.mode === "navigate") {
    const shell = await cache.match("./index.html");
    if (shell) return shell;
  }
  return new Response("Offline", { status: 503, statusText: "Offline" });
}

async function tileResponse(req) {
  const key = req.url;
  const offline = await caches.open(OFFLINE_TILES);
  let hit = await offline.match(key);
  if (hit) return hit;
  const runtime = await caches.open(RUNTIME_TILES);
  hit = await runtime.match(key);
  if (hit) return hit;

  try {
    // Ask for a CORS response so the cached copy is not an opaque blob
    const res = await fetch(key, { mode: "cors", credentials: "omit" });
    if (res.ok) {
      runtime.put(key, res.clone()).then(() => trimRuntime(runtime)).catch(() => {});
    }
    return res;
  } catch (e) {
    try {
      return await fetch(req); // server without CORS: show it, don't cache it
    } catch (e2) {
      return new Response("", { status: 504, statusText: "Tile unavailable offline" });
    }
  }
}

let trimming = false;
async function trimRuntime(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    const extra = keys.length - RUNTIME_LIMIT;
    if (extra > 0) {
      // oldest entries come first in insertion order
      await Promise.all(keys.slice(0, extra + 200).map((k) => cache.delete(k)));
    }
  } finally {
    trimming = false;
  }
}

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
