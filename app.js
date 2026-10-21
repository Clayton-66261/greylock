/* Greylock — personal Massachusetts hunting map (PWA)
   Data: MassGIS (parcels, imagery, LiDAR, basemap), EEA OpenSpace, MassWildlife WMZs,
   USGS National Map, Open-Meteo forecasts, SunCalc for sun and moon. */
(() => {
"use strict";

/* ================= helpers ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const REGS = window.MA_REGS;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtTime = (d) => (d instanceof Date && !isNaN(d) ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "–");
const fmtDay = (d) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const fmtShort = (d) => d.toLocaleDateString([], { month: "short", day: "numeric" });
const money = (n) => (n || n === 0 ? "$" + Number(n).toLocaleString() : "–");
function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
}
function fmtDist(m) {
  if (m == null || isNaN(m)) return "–";
  const mi = m / 1609.344;
  if (mi < 0.25) return `${Math.round(m * 1.09361)} yd`;
  return `${mi.toFixed(mi < 10 ? 2 : 1)} mi`;
}
const DIRS16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const DIRS8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const norm360 = (b) => ((b % 360) + 360) % 360;
const dir16 = (b) => DIRS16[Math.round(norm360(b) / 22.5) % 16];
const dir8 = (b) => DIRS8[Math.round(norm360(b) / 45) % 8];
const fmtCoord = (p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

// arrow pointing the way the wind blows when rotated by the "from" direction
const windArrow = (deg) => `<svg viewBox="0 0 24 24" style="transform:rotate(${Math.round(deg)}deg)" aria-hidden="true"><path d="M12 3v18M12 21l-5-5M12 21l5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const upArrow = (deg) => `<svg viewBox="0 0 24 24" style="transform:rotate(${Math.round(deg)}deg)" aria-hidden="true"><path d="M12 3l6 16-6-4-6 4z" fill="currentColor"/></svg>`;

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

async function getJSON(url, ms = 15000) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j && j.error) throw new Error(j.error.message || "Service error");
    return j;
  } finally {
    clearTimeout(timer);
  }
}

function throttle(fn, ms) {
  let last = 0, timer = null;
  return (...args) => {
    const now = Date.now();
    const wait = ms - (now - last);
    if (wait <= 0) { last = now; fn(...args); }
    else if (!timer) timer = setTimeout(() => { timer = null; last = Date.now(); fn(...args); }, wait);
  };
}

async function copyText(s) {
  try { await navigator.clipboard.writeText(s); toast("Copied"); }
  catch (e) { prompt("Copy this:", s); }
}

/* ================= geometry ================= */
const toR = Math.PI / 180;
const R_EARTH = 6371008.8;
function distM(a, b) {
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}
function bearingDeg(a, b) {
  const p1 = a.lat * toR, p2 = b.lat * toR, dl = (b.lng - a.lng) * toR;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(Math.atan2(y, x) / toR);
}
function destPoint(p, brg, d) {
  const dr = d / R_EARTH, th = brg * toR, p1 = p.lat * toR, l1 = p.lng * toR;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / toR, lng: l2 / toR };
}
function ringHit(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polysOf = (g) => (!g ? [] : g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
// even-odd across rings handles holes and loosely grouped rings
const geomContains = (g, x, y) => polysOf(g).some((p) => p.reduce((acc, ring) => (ringHit(ring, x, y) ? !acc : acc), false));
function ringArea(ring) {
  if (!ring || ring.length < 3) return 0;
  const c = Math.cos(ring[0][1] * toR);
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += ring[j][0] * c * ring[i][1] - ring[i][0] * c * ring[j][1];
  }
  return Math.abs(s / 2) * (toR * R_EARTH) ** 2;
}
const geomAcres = (g) => Math.abs(polysOf(g).reduce((t, p) => t + p.reduce((a, ring, i) => a + (i === 0 ? 1 : -1) * ringArea(ring), 0), 0)) / 4046.8564224;
const inBounds = (p, b) => p.lat >= b.s && p.lat <= b.n && p.lng >= b.w && p.lng <= b.e;
const MA_BOUNDS = { s: 41.18, w: -73.55, n: 42.9, e: -69.85 };

/* ================= storage ================= */
const PREF_KEY = "greylock.prefs";
const DEFAULT_OVERLAYS = { openspace: true, parcels: true, lidar: false, labels: true, wmz: false, areas: true };
const prefs = Object.assign({ base: "aerial", theme: "auto", keepAwake: true, view: null, cone: false, seenInstall: false }, JSON.parse(localStorage.getItem(PREF_KEY) || "{}"));
prefs.overlays = Object.assign({}, DEFAULT_OVERLAYS, prefs.overlays || {});
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* storage full */ } };

const DB = (() => {
  let opening;
  const open = () => opening || (opening = new Promise((res, rej) => {
    const r = indexedDB.open("greylock", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of ["pins", "tracks", "areas"]) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: "id" });
      for (const s of ["photos", "kv"]) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      let out;
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  return {
    get: (s, k) => run(s, "readonly", (st) => st.get(k)),
    all: (s) => run(s, "readonly", (st) => st.getAll()),
    put: (s, v, k) => run(s, "readwrite", (st) => (k === undefined ? st.put(v) : st.put(v, k))),
    del: (s, k) => run(s, "readwrite", (st) => st.delete(k)),
  };
})();

/* ================= theme ================= */
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const t = prefs.theme === "auto" ? (darkQuery.matches ? "dark" : "light") : prefs.theme;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", t === "night" ? "#160404" : "#1E2B24");
}
darkQuery.addEventListener?.("change", applyTheme);
applyTheme();

/* ================= data sources ================= */
const AGOL = "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services";
const USGS = "https://basemap.nationalmap.gov/arcgis/rest/services";
const SRC = {
  parcels: "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0",
  openspaceFS: "https://gis.eea.mass.gov/server/rest/services/Protected_and_Recreational_OpenSpace_Polygons/FeatureServer/0",
  openspaceMS: "https://gis.eea.mass.gov/server/rest/services/Protected_and_Recreational_OpenSpace_Polygons/MapServer",
  wmz: "https://gis.eea.mass.gov/server/rest/services/DFG/MA_DFW_Wildlife_Management_Zones/MapServer/0",
  weather: "https://api.open-meteo.com/v1/forecast",
};
const PARCEL_FIELDS = "OWNER1,OWN_ADDR,OWN_CITY,OWN_STATE,OWN_ZIP,SITE_ADDR,CITY,LOT_SIZE,LOT_UNITS,USE_CODE,USE_DESC,TOTAL_VAL,FY,LS_DATE,LS_PRICE,MAP_PAR_ID,LOC_ID,POLY_TYPE";
const OS_FIELDS = "SITE_NAME,FEE_OWNER,OWNER_TYPE,MANAGER,MANAGR_ABRV,MANAGR_TYPE,PRIM_PURP,PUB_ACCESS,LEV_PROT,GIS_ACRES,FEESYM,OLI_1_ORG,OLI_1_INT";

const TILESETS = {
  aerial: { label: "Aerial 2025", url: `${AGOL}/Massachusetts_Aerial_Imagery_2025/MapServer/tile/{z}/{y}/{x}`, minZoom: 7, maxNative: 19, kb: 38, z: 1,
    swatch: "radial-gradient(circle at 30% 40%, #6d7a4a 0 18%, transparent 19%), linear-gradient(135deg,#3f4d33,#6f7350 50%,#34432f)" },
  aerialUnder: { url: `${USGS}/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}`, maxNative: 16, kb: 30, z: 0 },
  topo: { label: "MassGIS topo", url: `${AGOL}/MassGISBasemap/MapServer/tile/{z}/{y}/{x}`, maxNative: 18, kb: 22, z: 1,
    swatch: "repeating-radial-gradient(circle at 60% 55%, #dfe6d3 0 5px, #b9c9a8 6px 7px), #dfe6d3" },
  usgs: { label: "USGS topo", url: `${USGS}/USGSTopo/MapServer/tile/{z}/{y}/{x}`, maxNative: 16, kb: 24, z: 1,
    swatch: "repeating-radial-gradient(circle at 35% 60%, #f3efe0 0 6px, #c9a77c 7px 8px), #f3efe0" },
  lidar: { label: "LiDAR hillshade", url: `${AGOL}/LiDAR_ShadedRelief/MapServer/tile/{z}/{y}/{x}`, maxNative: 18, minZoom: 10, opacity: 0.6, z: 2, kb: 16, className: "lyr-lidar" },
  openspace: { label: "Public and conservation land", exportBase: SRC.openspaceMS, maxNative: 18, minZoom: 8, opacity: 0.42, z: 3, kb: 7 },
  parcels: { label: "Property lines", url: `${AGOL}/MassGIS_Level3_Parcels/MapServer/tile/{z}/{y}/{x}`, maxNative: 18, minZoom: 15, z: 4, kb: 6 },
  labels: { label: "Roads and labels", url: `${AGOL}/MassGIS_Map_Features_for_Imagery/MapServer/tile/{z}/{y}/{x}`, maxNative: 18, z: 5, kb: 9 },
};
const BASES = ["aerial", "topo", "usgs"];
const TILE_OVERLAYS = ["openspace", "parcels", "lidar", "labels"];
const OFFLINE_TILES = "greylock-tiles-offline";

function exportUrl(base, z, x, y) {
  const S = 2 * Math.PI * 6378137, span = S / Math.pow(2, z);
  const minx = -S / 2 + x * span, maxx = minx + span, maxy = S / 2 - y * span, miny = maxy - span;
  return `${base}/export?bbox=${minx.toFixed(3)},${miny.toFixed(3)},${maxx.toFixed(3)},${maxy.toFixed(3)}` +
    "&bboxSR=3857&imageSR=3857&size=512,512&dpi=192&format=png32&transparent=true&layers=show:0&f=image";
}
function tileUrl(id, z, x, y) {
  const t = TILESETS[id];
  if (t.exportBase) return exportUrl(t.exportBase, z, x, y);
  return t.url.replace("{z}", z).replace("{y}", y).replace("{x}", x);
}

/* ================= map ================= */
const map = L.map("map", {
  zoomControl: false, maxZoom: 21, minZoom: 6, zoomSnap: 0.5, wheelPxPerZoomLevel: 90,
  maxBounds: [[40.4, -75.6], [44.2, -68.4]], maxBoundsViscosity: 0.8,
});
map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution("MassGIS, MassWildlife, USGS");
if (prefs.view) map.setView([prefs.view.lat, prefs.view.lng], prefs.view.z);
else map.setView([42.637, -73.166], 12); // Mt Greylock until GPS arrives

const ExportLayer = L.TileLayer.extend({
  getTileUrl(c) { return tileUrl(this.options.tileset, c.z, c.x, c.y); },
});
function makeLayer(id) {
  const t = TILESETS[id];
  const o = { maxZoom: 21, maxNativeZoom: t.maxNative, minZoom: t.minZoom || 0, opacity: t.opacity ?? 1, zIndex: t.z ?? 1,
    className: t.className || "", tileset: id, keepBuffer: 2 };
  const layer = t.exportBase ? new ExportLayer("", o) : L.tileLayer(t.url, o);
  // When a tile can't load (no signal, or zoomed past what was saved), stretch the
  // closest cached parent tile into its place instead of leaving a hole.
  layer.on("tileerror", async (ev) => {
    const tile = ev.tile, c = ev.coords;
    if (!tile || tile.dataset.fallback) return;
    tile.dataset.fallback = "1";
    const src = await parentTileImage(id, c.z, c.x, c.y);
    if (src) tile.src = src;
  });
  return layer;
}
const OPAQUE_LAYERS = new Set(["aerial", "aerialUnder", "topo", "usgs"]);
async function parentTileImage(id, z, x, y) {
  if (!window.caches || !window.createImageBitmap) return null;
  try {
    for (let dz = 1; dz <= 6 && z - dz >= 0; dz++) {
      const pz = z - dz, px = x >> dz, py = y >> dz;
      const res = await caches.match(tileUrl(id, pz, px, py));
      if (!res || res.type === "opaque" || !res.ok) continue;
      const bmp = await createImageBitmap(await res.blob());
      const n = 1 << dz, size = bmp.width / n;
      const sx = (x - (px << dz)) * size, sy = (y - (py << dz)) * size;
      const cv = document.createElement("canvas");
      cv.width = cv.height = 256;
      const ctx = cv.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, sx, sy, size, size, 0, 0, 256, 256);
      bmp.close && bmp.close();
      return OPAQUE_LAYERS.has(id) ? cv.toDataURL("image/jpeg", 0.86) : cv.toDataURL("image/png");
    }
  } catch (e) { /* no usable parent */ }
  return null;
}
const layerCache = {};
const layerFor = (id) => layerCache[id] || (layerCache[id] = id === "aerial" ? L.layerGroup([makeLayer("aerialUnder"), makeLayer("aerial")]) : makeLayer(id));
let currentBase = null;
function setBase(id) {
  if (!BASES.includes(id)) id = "aerial";
  if (currentBase) map.removeLayer(layerFor(currentBase));
  layerFor(id).addTo(map);
  currentBase = id;
  prefs.base = id;
  savePrefs();
}
function setOverlay(id, on) {
  prefs.overlays[id] = on;
  savePrefs();
  if (TILE_OVERLAYS.includes(id)) {
    if (on) layerFor(id).addTo(map); else map.removeLayer(layerFor(id));
  } else if (id === "wmz") setWMZ(on);
  else if (id === "areas") drawAreaOutlines();
}
setBase(prefs.base);
TILE_OVERLAYS.forEach((id) => { if (prefs.overlays[id]) layerFor(id).addTo(map); });

map.on("moveend", throttle(() => {
  const c = map.getCenter();
  prefs.view = { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), z: map.getZoom() };
  savePrefs();
  if (!me) { updateZone(); updateStatus(); }
}, 1500));

/* ================= location and compass ================= */
let me = null, follow = false, firstFix = true, heading = null;
let meMarker = null, meAcc = null;
const meIcon = L.divIcon({
  className: "",
  html: `<div class="me"><svg class="cone" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="mecg" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#FF6A13" stop-opacity=".6"/><stop offset="1" stop-color="#FF6A13" stop-opacity="0"/></radialGradient></defs><path d="M32 32 L17 3 A32 32 0 0 1 47 3 Z" fill="url(#mecg)"/></svg><div class="core"></div></div>`,
  iconSize: [22, 22], iconAnchor: [11, 11],
});
const here = () => (me ? { lat: me.lat, lng: me.lng, gps: true } : Object.assign(map.getCenter(), { gps: false }));

function drawMe() {
  if (!me) return;
  const ll = [me.lat, me.lng];
  if (!meMarker) {
    meAcc = L.circle(ll, { radius: me.acc, color: "#FF6A13", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
    meMarker = L.marker(ll, { icon: meIcon, interactive: false, zIndexOffset: 1000, keyboard: false }).addTo(map);
  } else {
    meMarker.setLatLng(ll);
    meAcc.setLatLng(ll).setRadius(me.acc);
  }
  drawHeading();
}
function drawHeading() {
  const el = meMarker && meMarker.getElement();
  if (!el) return;
  const box = el.querySelector(".me");
  let h = heading;
  if (h == null && me && me.speed > 0.7 && me.gpsHeading != null && !isNaN(me.gpsHeading)) h = me.gpsHeading;
  box.classList.toggle("has-heading", h != null);
  if (h != null) box.querySelector(".cone").style.transform = `rotate(${Math.round(h)}deg)`;
}
const slowUpdates = throttle(() => { updateZone(); updateStatus(); }, 10000);

function onPos(p) {
  const c = p.coords;
  me = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, alt: c.altitude, gpsHeading: c.heading, speed: c.speed, t: p.timestamp };
  drawMe();
  if (firstFix) {
    firstFix = false;
    if (inBounds(me, MA_BOUNDS)) map.setView([me.lat, me.lng], Math.max(map.getZoom(), 15));
    updateZone(); updateStatus(); refreshWeather();
  }
  if (follow) map.panTo([me.lat, me.lng], { animate: true });
  onTrackPoint(me);
  updateGuide();
  if (coneOn) drawConeThrottled();
  slowUpdates();
}
function onPosErr(e) {
  if (e.code === 1) {
    $("#lightSub").textContent = "Location is off. Times use the map center.";
    toast("Location permission is off. Turn it on in Settings to see yourself on the map.", 4200);
  }
  updateStatus();
}
let gpsWatch = null;
function startGPS() {
  if (!("geolocation" in navigator) || gpsWatch !== null) return;
  gpsWatch = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
}
map.on("dragstart", () => { if (follow) { follow = false; $("#btnLocate").classList.remove("follow"); } });

let compassOn = false;
const drawHeadingThrottled = throttle(drawHeading, 120);
function onOrient(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
  else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
  if (h == null) return;
  heading = norm360(h + ((screen.orientation && screen.orientation.angle) || 0));
  drawHeadingThrottled();
  if (guide) renderChipsThrottled();
}
async function enableCompass() {
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== "granted") { toast("Compass permission was declined"); return false; }
    }
    window.addEventListener("deviceorientationabsolute", onOrient, true);
    window.addEventListener("deviceorientation", onOrient, true);
    compassOn = true;
    toast("Compass on. Your heading shows on the location dot.");
    return true;
  } catch (e) {
    toast("This device doesn't offer a compass to the browser");
    return false;
  }
}
function disableCompass() {
  window.removeEventListener("deviceorientationabsolute", onOrient, true);
  window.removeEventListener("deviceorientation", onOrient, true);
  compassOn = false;
  heading = null;
  drawHeading();
}

/* ================= WMZ and status strip ================= */
let wmzData = null, wmzLayer = null;
const zoneName = (f) => {
  const p = f.properties || {};
  const v = p.DMZ ?? p.WMZ ?? p.ZONE ?? Object.values(p).find((x) => /^\s*(zone\s*)?\d{1,2}\s*[NS]?\s*$/i.test(String(x)));
  return String(v ?? "?").replace(/^\s*zone\s*/i, "").trim();
};
const zoneAt = (pt) => {
  if (!wmzData || !wmzData.fc) return null;
  const f = wmzData.fc.features.find((ft) => geomContains(ft.geometry, pt.lng, pt.lat));
  return f ? zoneName(f) : null;
};
async function loadWMZ() {
  try { wmzData = await DB.get("kv", "wmz"); } catch (e) { wmzData = null; }
  const stale = !wmzData || Date.now() - (wmzData.fetched || 0) > 120 * 864e5;
  if (stale && navigator.onLine !== false) {
    try {
      const q = new URLSearchParams({ where: "1=1", outFields: "*", returnGeometry: "true", outSR: "4326", maxAllowableOffset: "0.0003", geometryPrecision: "5", f: "geojson" });
      const fc = await getJSON(`${SRC.wmz}/query?${q}`, 30000);
      if (fc.features && fc.features.length) {
        wmzData = { fc, fetched: Date.now() };
        await DB.put("kv", wmzData, "wmz");
      }
    } catch (e) { /* keep whatever we had */ }
  }
  updateZone();
  if (prefs.overlays.wmz) setWMZ(true);
}
function setWMZ(on) {
  if (wmzLayer) { map.removeLayer(wmzLayer); wmzLayer = null; }
  if (!on) return;
  if (!wmzData) { toast("Zone boundaries haven't downloaded yet"); return; }
  wmzLayer = L.geoJSON(wmzData.fc, {
    interactive: false,
    style: { color: "#FFFFFF", weight: 2.5, dashArray: "8 6", fill: false, opacity: 0.9 },
    onEachFeature: (f, lyr) => lyr.bindTooltip(`WMZ ${esc(zoneName(f))}`, { permanent: true, direction: "center", className: "wmz-label" }),
  }).addTo(map);
}
let zoneNow = null;
function updateZone() {
  const loc = here();
  zoneNow = zoneAt(loc);
  $("#zoneNum").textContent = zoneNow || "–";
  $("#zoneChip small").textContent = loc.gps ? "WMZ" : "Map WMZ";
}

const noonOf = (d) => { const n = new Date(d); n.setHours(12, 0, 0, 0); return n; };
function legalTimes(date, loc) {
  const t = SunCalc.getTimes(noonOf(date), loc.lat, loc.lng);
  return { start: new Date(t.sunrise - 30 * 60000), end: new Date(t.sunset.getTime() + 30 * 60000), sunrise: t.sunrise, sunset: t.sunset, dawn: t.dawn, dusk: t.dusk };
}
function nextHuntDay(from) {
  const d = new Date(from);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0);
  return d;
}
function updateStatus() {
  const loc = here(), now = new Date();
  const main = $("#lightMain"), sub = $("#lightSub");
  const lt = legalTimes(now, loc);
  let m, s, hot = false;
  if (now.getDay() === 0) {
    const nd = nextHuntDay(now);
    m = "No hunting today";
    s = `Sunday. Legal light ${nd.toLocaleDateString([], { weekday: "long" })} ${fmtTime(legalTimes(nd, loc).start)}`;
  } else if (now < lt.start) {
    m = `Legal light ${fmtTime(lt.start)}`;
    s = `In ${fmtDur(lt.start - now)}. Sunrise ${fmtTime(lt.sunrise)}`;
    hot = lt.start - now < 30 * 60000;
  } else if (now <= lt.end) {
    m = `Legal until ${fmtTime(lt.end)}`;
    s = `${fmtDur(lt.end - now)} left. Sunset ${fmtTime(lt.sunset)}`;
    hot = lt.end - now < 30 * 60000;
  } else {
    const nd = nextHuntDay(now);
    m = "Legal light is over";
    s = `Next: ${nd.toLocaleDateString([], { weekday: "long" })} ${fmtTime(legalTimes(nd, loc).start)}`;
  }
  if (!loc.gps) s += " (map center)";
  main.textContent = m;
  main.classList.toggle("hot", hot);
  sub.textContent = s;
}

/* ================= sheets and tabs ================= */
const sheet = $("#sheet");
let sheetKind = null;
const TAB_KINDS = ["pins", "tracks", "weather", "regs"];
function setTab(kind) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === (TAB_KINDS.includes(kind) ? kind : "map")));
}
function openSheet(title, html, { kind = null, tall = false } = {}) {
  if (sheetKind && sheetKind !== kind) cleanupSheet(sheetKind, kind);
  const changed = sheetKind !== kind;
  sheetKind = kind;
  $("#sheetTitle").textContent = title;
  $("#sheetBody").innerHTML = html;
  if (changed) $("#sheetBody").scrollTop = 0;
  sheet.classList.toggle("tall", tall);
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("sheet-open");
  setTab(kind);
}
function closeSheet() {
  if (sheetKind) cleanupSheet(sheetKind, null);
  sheetKind = null;
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
  sheet.style.transform = "";
  document.body.classList.remove("sheet-open");
  setTab("map");
}
function cleanupSheet(oldKind, newKind) {
  if (oldKind === "land" && newKind !== "land") clearLandMarks();
  if (oldKind === "edit-pin" && newKind !== "edit-pin") cancelEdit();
  if (oldKind === "pin" && newKind !== "pin") openPinId = null;
  if (oldKind === "download" && newKind !== "download") clearDownloadBox();
}
// drag the grip down to close
(() => {
  const grip = $("#sheetGrip"), head = sheet.querySelector(".sheet-head");
  let startY = null, dy = 0;
  const down = (e) => { startY = e.clientY; dy = 0; sheet.style.transition = "none"; };
  const move = (e) => { if (startY == null) return; dy = Math.max(0, e.clientY - startY); sheet.style.transform = `translateY(${dy}px)`; };
  const up = () => {
    if (startY == null) return;
    sheet.style.transition = "";
    startY = null;
    if (dy > 90) closeSheet(); else sheet.style.transform = "";
  };
  [grip, head].forEach((el) => el.addEventListener("pointerdown", (e) => { if (!e.target.closest("button")) { down(e); el.setPointerCapture(e.pointerId); } }));
  [grip, head].forEach((el) => { el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); });
})();

function showTab(tab) {
  if (tab === "map") return closeSheet();
  if (tab === "pins") return renderPins(true);
  if (tab === "tracks") return renderTracks(true);
  if (tab === "weather") { renderWeather(true); refreshWeather(); return; }
  if (tab === "regs") return renderRegs(true);
  if (tab === "layers") return renderLayers(true);
}

/* ================= status chips ================= */
function renderChips() {
  const box = $("#chips");
  let html = "";
  if (navigator.onLine === false) {
    html += `<div class="chip offline" role="status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M3 3l18 18"/></svg>Offline. Saved areas still work.</div>`;
  }
  if (rec) {
    html += `<button class="chip" data-act="tab" data-tab="tracks"><span class="dot"></span>Recording ${fmtDist(rec.dist)}, ${fmtClock(Date.now() - rec.start)}</button>`;
  }
  if (guide) {
    let txt = "Waiting for GPS", rot = 0;
    if (me) {
      const d = distM(me, guide), b = bearingDeg(me, guide);
      txt = `${fmtDist(d)} ${dir16(b)}`;
      rot = heading != null ? b - heading : b;
    }
    html += `<button class="chip" data-act="stop-guide" aria-label="Stop guiding to ${esc(guide.name)}">${upArrow(rot)}<span>${esc(guide.name)}: ${txt}</span></button>`;
  }
  box.innerHTML = html;
}
const renderChipsThrottled = throttle(renderChips, 300);
window.addEventListener("online", () => { renderChips(); refreshWeather(); });
window.addEventListener("offline", renderChips);

/* ================= land lookup ================= */
let landSeq = 0, landHighlight = null, tapMark = null;
let osDomains = JSON.parse(localStorage.getItem("greylock.osdomains") || "null");
const OS_FALLBACK = {
  PUB_ACCESS: { Y: "Full public access", N: "No public access", L: "Limited public access", X: "Unknown" },
  OWNER_TYPE: { F: "Federal", S: "State", C: "County", M: "Municipal", P: "Private", L: "Land trust", N: "Private nonprofit", B: "Public nonprofit", G: "Conservation organization", O: "Other", X: "Unknown" },
  LEV_PROT: { P: "In perpetuity", T: "Term limited", L: "Limited", N: "None", X: "Unknown" },
  PRIM_PURP: { A: "Agriculture", B: "Recreation and conservation", C: "Conservation", R: "Recreation" },
  OLI_1_INT: { CR: "Conservation restriction", APR: "Agricultural preservation restriction" },
};
async function loadOsDomains() {
  if (osDomains || navigator.onLine === false) return;
  try {
    const meta = await getJSON(`${SRC.openspaceFS}?f=json`, 20000);
    const out = {};
    for (const f of meta.fields || []) {
      if (f.domain && f.domain.codedValues) out[f.name] = Object.fromEntries(f.domain.codedValues.map((c) => [c.code, c.name]));
    }
    osDomains = out;
    localStorage.setItem("greylock.osdomains", JSON.stringify(out));
  } catch (e) { /* fall back to the built-in labels */ }
}
const decode = (field, code) => (code == null || code === "" ? "" : (osDomains && osDomains[field] && osDomains[field][code]) || (OS_FALLBACK[field] && OS_FALLBACK[field][code]) || String(code));

function pointQuery(base, pt, fields) {
  const q = new URLSearchParams({ geometry: `${pt.lng},${pt.lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: fields, returnGeometry: "true", outSR: "4326", geometryPrecision: "6", f: "geojson" });
  return `${base}/query?${q}`;
}
function bboxQuery(base, b, fields, offset, count, simplify) {
  const q = new URLSearchParams({ geometry: `${b.w},${b.s},${b.e},${b.n}`, geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: fields, returnGeometry: "true", outSR: "4326", geometryPrecision: "6", resultOffset: String(offset), resultRecordCount: String(count), orderByFields: "OBJECTID", f: "geojson" });
  if (simplify) q.set("maxAllowableOffset", String(simplify));
  return `${base}/query?${q}`;
}

const areaFeatCache = new Map();
async function offlineLookup(pt) {
  const res = { parcel: null, os: null };
  for (const a of await getAreas()) {
    if (!inBounds(pt, a.bounds)) continue;
    let f = areaFeatCache.get(a.id);
    if (!f) {
      f = (await DB.get("kv", "feat:" + a.id)) || { parcels: [], openspace: [] };
      areaFeatCache.set(a.id, f);
    }
    if (!res.parcel) res.parcel = f.parcels.find((x) => geomContains(x.geometry, pt.lng, pt.lat)) || null;
    if (!res.os) res.os = f.openspace.find((x) => geomContains(x.geometry, pt.lng, pt.lat)) || null;
    if (res.parcel && res.os) break;
  }
  return res;
}

function clearLandMarks() {
  if (landHighlight) { map.removeLayer(landHighlight); landHighlight = null; }
  if (tapMark) { map.removeLayer(tapMark); tapMark = null; }
}
async function showLandInfo(latlng) {
  const seq = ++landSeq;
  const pt = { lat: latlng.lat, lng: latlng.lng };
  clearLandMarks();
  tapMark = L.circleMarker([pt.lat, pt.lng], { radius: 9, color: "#FF6A13", weight: 3, fill: false, interactive: false }).addTo(map);
  openSheet("This spot", `<div class="sec"><p class="muted">Looking up owner and land status…</p></div>`, { kind: "land" });

  let parcel = null, os = null, source = "live", failed = false, parcelCount = 0;
  if (navigator.onLine !== false) {
    const [pr, orr] = await Promise.allSettled([getJSON(pointQuery(SRC.parcels, pt, PARCEL_FIELDS), 12000), getJSON(pointQuery(SRC.openspaceFS, pt, OS_FIELDS), 12000)]);
    if (pr.status === "fulfilled") { const fs = pr.value.features || []; parcelCount = fs.length; parcel = fs.find((f) => ["FEE", "TAX"].includes(f.properties.POLY_TYPE)) || fs[0] || null; } else failed = true;
    if (orr.status === "fulfilled") os = (orr.value.features || [])[0] || null; else failed = true;
  } else failed = true;
  if (failed && !parcel && !os) {
    const off = await offlineLookup(pt);
    if (off.parcel || off.os) { parcel = off.parcel; os = off.os; source = "saved"; failed = false; }
  }
  if (seq !== landSeq || sheetKind !== "land") return;
  if (parcel && parcel.geometry) {
    landHighlight = L.geoJSON(parcel, { interactive: false, style: { color: "#FF6A13", weight: 3, fillColor: "#FF6A13", fillOpacity: 0.07 } }).addTo(map);
  } else if (os && os.geometry) {
    landHighlight = L.geoJSON(os, { interactive: false, style: { color: "#2F7D45", weight: 3, dashArray: "6 5", fillOpacity: 0.06 } }).addTo(map);
  }
  renderLand(pt, parcel, os, source, failed, parcelCount);
}

const PUBLIC_OWNER = /\b(COMMONWEALTH|COMM OF MASS|TOWN OF|CITY OF|UNITED STATES|USA|U S A|DEPT OF|DEPARTMENT OF|MASS(ACHUSETTS)? DIV|INHABITANTS OF|COUNTY OF)\b/i;
function publicNote(o) {
  const sym = String(o.FEESYM || "").toUpperCase(), mgr = String(o.MANAGR_ABRV || "").toUpperCase(), name = String(o.SITE_NAME || "");
  if (sym === "DFG" || mgr.includes("DFG") || mgr.includes("DFW") || /\bWMA\b|wildlife management/i.test(name))
    return "MassWildlife lands are generally open to hunting, fishing and trapping. Check posted rules and any WMA-specific regulations.";
  if (sym.startsWith("DCRW")) return "DCR water supply land. Hunting is allowed only in designated areas, some by permit. Check DCR rules for this watershed.";
  if (sym.startsWith("DCR")) return "DCR state park or forest. Hunting is allowed in many of these but not all, and some areas are closed. Check DCR’s list for this property.";
  if (o.OWNER_TYPE === "M") return "Town or city land. Rules vary by town; many conservation areas allow hunting, some don’t. Check before you go.";
  if (o.OWNER_TYPE === "F") return "Federal land. Rules depend on the managing agency.";
  return "Confirm hunting is allowed here before you go.";
}
function renderLand(pt, parcel, os, source, failed, parcelCount) {
  const p = parcel ? parcel.properties : null;
  const o = os ? os.properties : null;
  const zone = zoneAt(pt);
  const isPublic = o && ["F", "S", "C", "M"].includes(o.OWNER_TYPE);
  const isGroup = o && ["L", "G", "N", "B"].includes(o.OWNER_TYPE);
  const hasCR = o && !isPublic && (o.OLI_1_INT || isGroup || o.OWNER_TYPE === "P");
  let badge;
  if (isPublic) badge = `<span class="badge public">${esc(decode("OWNER_TYPE", o.OWNER_TYPE))} land</span>`;
  else if (hasCR) badge = `<span class="badge restricted">${esc(isGroup ? decode("OWNER_TYPE", o.OWNER_TYPE) : o.OLI_1_INT ? decode("OLI_1_INT", o.OLI_1_INT) : "Private conservation land")}</span>`;
  else if (p && PUBLIC_OWNER.test(p.OWNER1 || "")) badge = `<span class="badge neutral">Public owner</span>`;
  else if (p) badge = `<span class="badge private">Private parcel</span>`;
  else badge = `<span class="badge neutral">No parcel found</span>`;

  let html = "";
  if (failed && !p && !o) {
    html += `<div class="sec"><div class="warn">Couldn’t reach the MassGIS servers and this spot isn’t in a saved area. Save areas from the layers button before you lose signal.</div></div>`;
  } else {
    html += `<div class="sec">${badge}`;
    if (o && (isPublic || hasCR)) html += `<div class="owner">${esc(o.SITE_NAME ? nice(o.SITE_NAME) : nice(o.FEE_OWNER) || "Conservation land")}</div>`;
    else if (p) html += `<div class="owner">${esc(nice(p.OWNER1) || "Owner not listed")}</div>`;
    if (o && isPublic) html += `<p class="note">${esc(publicNote(o))}</p>`;
    if (o && hasCR) {
      html += o.PUB_ACCESS === "Y"
        ? `<p class="note">Open to the public, but many conservation groups don’t allow hunting. Check the owner’s rules for this property.</p>`
        : `<p class="note">Protected land, but not public. Get the owner’s permission to hunt.</p>`;
    }
    html += `</div>`;

    if (p) {
      const mailing = [p.OWN_ADDR, [p.OWN_CITY, p.OWN_STATE].filter(Boolean).join(", "), p.OWN_ZIP].filter(Boolean).join(" ");
      const mapped = parcel.geometry ? geomAcres(parcel.geometry) : null;
      let assessor = "";
      if (p.LOT_SIZE) assessor = String(p.LOT_UNITS || "").toUpperCase().startsWith("S") ? `${(p.LOT_SIZE / 43560).toFixed(2)} ac` : `${(+p.LOT_SIZE).toFixed(2)} ac`;
      const sale = p.LS_DATE && String(p.LS_DATE).length === 8 ? `${p.LS_DATE.slice(4, 6)}/${p.LS_DATE.slice(6, 8)}/${p.LS_DATE.slice(0, 4)}` : "";
      html += `<div class="sec"><h3>Parcel</h3><dl class="kv">
        <dt>Owner</dt><dd>${esc(nice(p.OWNER1) || "–")}</dd>
        ${mailing ? `<dt>Mailing</dt><dd>${esc(nice(mailing))}</dd>` : ""}
        ${p.SITE_ADDR ? `<dt>Address</dt><dd>${esc(nice(p.SITE_ADDR))}${p.CITY ? ", " + esc(nice(p.CITY)) : ""}</dd>` : ""}
        <dt>Size</dt><dd>${mapped ? `${mapped.toFixed(1)} ac mapped` : "–"}${assessor ? ` (assessor ${assessor})` : ""}</dd>
        ${p.USE_DESC || p.USE_CODE ? `<dt>Use</dt><dd>${esc(nice(p.USE_DESC) || "")}${p.USE_CODE ? ` <span class="muted">${esc(p.USE_CODE)}</span>` : ""}</dd>` : ""}
        ${p.TOTAL_VAL ? `<dt>Assessed</dt><dd>${money(p.TOTAL_VAL)}${p.FY ? ` <span class="muted">FY${esc(p.FY)}</span>` : ""}</dd>` : ""}
        ${sale ? `<dt>Last sale</dt><dd>${esc(sale)}${p.LS_PRICE ? `, ${money(p.LS_PRICE)}` : ""}</dd>` : ""}
        ${p.MAP_PAR_ID ? `<dt>Map/lot</dt><dd>${esc(p.MAP_PAR_ID)}</dd>` : ""}
      </dl>${parcelCount > 1 ? `<p class="note">${parcelCount} assessor records share this spot. Showing the first.</p>` : ""}</div>`;
    }
    if (o) {
      html += `<div class="sec"><h3>Open space record</h3><dl class="kv">
        ${o.SITE_NAME ? `<dt>Site</dt><dd>${esc(nice(o.SITE_NAME))}</dd>` : ""}
        ${o.FEE_OWNER ? `<dt>Owner</dt><dd>${esc(nice(o.FEE_OWNER))}</dd>` : ""}
        ${o.MANAGER && o.MANAGER !== o.FEE_OWNER ? `<dt>Manager</dt><dd>${esc(nice(o.MANAGER))}</dd>` : ""}
        <dt>Access</dt><dd>${esc(decode("PUB_ACCESS", o.PUB_ACCESS) || "Unknown")}</dd>
        ${o.PRIM_PURP ? `<dt>Purpose</dt><dd>${esc(decode("PRIM_PURP", o.PRIM_PURP))}</dd>` : ""}
        ${o.LEV_PROT ? `<dt>Protection</dt><dd>${esc(decode("LEV_PROT", o.LEV_PROT))}</dd>` : ""}
        ${o.OLI_1_ORG ? `<dt>Interest</dt><dd>${esc(nice(o.OLI_1_ORG))}${o.OLI_1_INT ? ` (${esc(decode("OLI_1_INT", o.OLI_1_INT))})` : ""}</dd>` : ""}
        ${o.GIS_ACRES ? `<dt>Acres</dt><dd>${(+o.GIS_ACRES).toFixed(1)}</dd>` : ""}
      </dl></div>`;
    }
  }
  const from = me ? `${fmtDist(distM(me, pt))} ${dir16(bearingDeg(me, pt))} of you` : "";
  html += `<div class="sec"><dl class="kv">
      <dt>Zone</dt><dd>${zone ? `WMZ ${esc(zone)}` : "Outside Massachusetts zones"}</dd>
      ${from ? `<dt>Distance</dt><dd>${from}</dd>` : ""}
      <dt>Coordinates</dt><dd><button class="btn" style="min-height:36px;padding:0 10px" data-act="copy" data-text="${fmtCoord(pt)}">${fmtCoord(pt)}</button></dd>
    </dl>
    <div class="actions">
      <button class="btn primary" data-act="pin-here" data-lat="${pt.lat}" data-lng="${pt.lng}">${ICON.plus} Pin this spot</button>
      <button class="btn" data-act="guide-here" data-lat="${pt.lat}" data-lng="${pt.lng}">Guide me here</button>
      <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${pt.lat},${pt.lng}" target="_blank" rel="noopener">Driving directions</a>
    </div>
    <p class="note">${source === "saved" ? "From your saved offline data. " : ""}Assessor lines are approximate and can be off by tens of feet. Confirm boundaries and posting on the ground.</p>
  </div>`;
  $("#sheetBody").innerHTML = html;
}
const KEEP_UP = new Set(["LLC", "LLP", "LP", "INC", "II", "III", "IV", "TR", "TRS", "USA", "US", "MA", "DCR", "DFW", "DFG", "WMA", "NA", "PC", "CO", "PO", "RR", "NY", "VT", "CT", "NH", "RI"]);
function nice(s) {
  if (!s) return "";
  return String(s).toLowerCase()
    .replace(/\b([a-z])([a-z']*)/g, (m, a, b) => (KEEP_UP.has((a + b).toUpperCase()) ? (a + b).toUpperCase() : a.toUpperCase() + b))
    .replace(/\bMc([a-z])/g, (m, c) => "Mc" + c.toUpperCase());
}

/* ================= pins ================= */
const ICON = {
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
};
const PIN_TYPES = {
  stand: { label: "Stand", color: "#E2580F", icon: '<path d="M5 1.5v13M11 1.5v13M5 4.5h6M5 8h6M5 11.5h6"/>' },
  blind: { label: "Ground blind", color: "#8A6A3B", icon: '<path d="M1.5 14L8 2.5 14.5 14z"/><path d="M6.3 14L8 10.5 9.7 14"/>' },
  camera: { label: "Trail camera", color: "#46698C", icon: '<rect x="1.5" y="4.5" width="13" height="9" rx="2"/><circle cx="8" cy="9" r="2.4"/><path d="M5.5 4.5l1-2h3l1 2"/>' },
  rub: { label: "Rub", color: "#A7713F", icon: '<path d="M6 15V1M10 15V1"/><path d="M6 6.5l4-2M6 10.5l4-2"/>' },
  scrape: { label: "Scrape", color: "#6E4C2E", icon: '<ellipse cx="8" cy="11" rx="6.5" ry="3"/><path d="M8 1.5v6M5 4l3 2 3-2"/>' },
  bed: { label: "Bedding", color: "#4B7537", icon: '<ellipse cx="8" cy="8.5" rx="6.5" ry="4.5"/><ellipse cx="8" cy="8.5" rx="2.6" ry="1.6"/>' },
  sign: { label: "Tracks or sign", color: "#66722F", icon: '<path d="M4 2.5c-1.2 2-1.2 4.2.4 5.2s2.1-1 1.6-3.1S5 1.6 4 2.5zM11 8c-1.2 2-1.2 4.2.4 5.2s2.1-1 1.6-3.1S12 7.1 11 8z"/>' },
  food: { label: "Food or mast", color: "#B98A12", icon: '<path d="M2.5 7h11"/><path d="M3.5 7a4.5 4 0 0 1 9 0"/><path d="M4.5 7c0 3.3 1.6 6.3 3.5 7.5 1.9-1.2 3.5-4.2 3.5-7.5"/>' },
  water: { label: "Water", color: "#2A73AE", icon: '<path d="M8 1.5c2.7 3.7 4.7 6.4 4.7 8.6a4.7 4.7 0 0 1-9.4 0c0-2.2 2-4.9 4.7-8.6z"/>' },
  parking: { label: "Parking or access", color: "#56616B", icon: '<path d="M5 14.5V1.5h4.2a3.6 3.6 0 0 1 0 7.2H5"/>' },
  harvest: { label: "Harvest", color: "#AE2A1E", icon: '<path d="M8 15V8.5M8 8.5L3.5 2M8 8.5L12.5 2M5.2 4.6H2.5M10.8 4.6h2.7M5.9 6.4L4.6 9M10.1 6.4l1.3 2.6"/>' },
  note: { label: "Note", color: "#2F3B40", icon: '<path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h5.5"/>' },
};
const WIND_TYPES = ["stand", "blind"];
let pins = [];
const pinMarkers = new Map();
let openPinId = null;

const typeIcon = (t) => `<span class="ti" style="background:${t.color}"><svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg></span>`;
function pinIcon(type) {
  const t = PIN_TYPES[type] || PIN_TYPES.note;
  return L.divIcon({
    className: "pin-icon",
    html: `<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 42.5s14-14.4 14-25.2A14 14 0 0 0 3 17.3C3 28.1 17 42.5 17 42.5z" fill="${t.color}" stroke="#fff" stroke-width="2.4"/><g transform="translate(8.6 8.8) scale(1.05)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${t.icon}</g></svg>`,
    iconSize: [34, 44], iconAnchor: [17, 42],
  });
}
function addPinMarker(pin) {
  const m = L.marker([pin.lat, pin.lng], { icon: pinIcon(pin.type), title: pin.name || PIN_TYPES[pin.type]?.label || "Pin", riseOnHover: true });
  m.on("click", () => showPin(pin.id));
  m.on("drag", () => {
    if (editing && editing.pin.id === pin.id) {
      const ll = m.getLatLng();
      editing.pin.lat = ll.lat; editing.pin.lng = ll.lng;
      const c = $("#editCoords"); if (c) c.textContent = fmtCoord(editing.pin);
    }
  });
  m.addTo(map);
  pinMarkers.set(pin.id, m);
}
async function loadPins() {
  pins = (await DB.all("pins")) || [];
  pins.forEach(addPinMarker);
}
const pinName = (p) => p.name || PIN_TYPES[p.type]?.label || "Pin";

function renderPins(open) {
  const loc = here();
  const filter = renderPins.filter || "all";
  const types = [...new Set(pins.map((p) => p.type))];
  const list = pins.filter((p) => filter === "all" || p.type === filter)
    .map((p) => ({ p, d: distM(loc, p) }))
    .sort((a, b) => a.d - b.d);
  let html = `<div class="sec"><div class="actions" style="margin-top:0">
      <button class="btn primary" data-act="drop-pin">${ICON.plus} Pin at crosshair</button>
      ${me ? `<button class="btn" data-act="pin-me">Pin my location</button>` : ""}
    </div></div>`;
  if (pins.length) {
    html += `<div class="filters" role="group" aria-label="Filter pins"><button class="${filter === "all" ? "on" : ""}" data-act="pin-filter" data-type="all">All ${pins.length}</button>${types.map((t) => `<button class="${filter === t ? "on" : ""}" data-act="pin-filter" data-type="${t}">${esc(PIN_TYPES[t]?.label || t)}</button>`).join("")}</div>`;
    html += `<ul class="list">${list.map(({ p, d }) => `<li><button class="item" data-act="open-pin" data-id="${p.id}">${typeIcon(PIN_TYPES[p.type] || PIN_TYPES.note)}<span class="meta"><b>${esc(pinName(p))}</b><small>${esc(PIN_TYPES[p.type]?.label || "")}${p.notes ? " – " + esc(p.notes.slice(0, 60)) : ""}</small></span><span class="end">${fmtDist(d)}<br><small class="muted">${dir16(bearingDeg(loc, p))}</small></span></button></li>`).join("")}</ul>`;
    html += `<p class="note">Sorted by distance from ${loc.gps ? "you" : "the map center"}.</p>`;
  } else {
    html += `<p class="empty">No pins yet. Move the crosshair to a stand, camera or scrape and tap “Pin at crosshair”.</p>`;
  }
  if (open || sheetKind !== "pins") openSheet("Pins", html, { kind: "pins", tall: true });
  else $("#sheetBody").innerHTML = html;
}

async function showPin(id) {
  const pin = pins.find((p) => p.id === id);
  if (!pin) return;
  openPinId = id;
  const t = PIN_TYPES[pin.type] || PIN_TYPES.note;
  const photo = await DB.get("photos", id).catch(() => null);
  const from = me ? `${fmtDist(distM(me, pin))} ${dir16(bearingDeg(me, pin))} of you` : "";
  const winds = WIND_TYPES.includes(pin.type) && pin.winds && pin.winds.length ? pin.winds.join(", ") : "";
  const html = `<div class="sec"><div class="row">${typeIcon(t)}<div class="grow"><div class="owner" style="margin:0">${esc(pinName(pin))}</div><div class="muted small">${esc(t.label)}, added ${fmtShort(new Date(pin.created))}</div></div></div>
    ${pin.notes ? `<p style="white-space:pre-wrap;margin:12px 0 0">${esc(pin.notes)}</p>` : ""}
    ${photo ? `<img class="photo" alt="Photo for ${esc(pinName(pin))}" src="${URL.createObjectURL(photo)}">` : ""}
    </div>
    <div class="sec"><dl class="kv">
      ${winds ? `<dt>Good winds</dt><dd>${esc(winds)}</dd>` : ""}
      ${from ? `<dt>Distance</dt><dd>${from}</dd>` : ""}
      <dt>Zone</dt><dd>${zoneAt(pin) ? "WMZ " + esc(zoneAt(pin)) : "–"}</dd>
      <dt>Coordinates</dt><dd><button class="btn" style="min-height:36px;padding:0 10px" data-act="copy" data-text="${fmtCoord(pin)}">${fmtCoord(pin)}</button></dd>
    </dl>
    <div class="actions">
      <button class="btn primary" data-act="guide-pin" data-id="${id}">Guide me here</button>
      <button class="btn" data-act="edit-pin" data-id="${id}">Edit</button>
      <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}" target="_blank" rel="noopener">Directions</a>
    </div></div>`;
  openSheet(t.label, html, { kind: "pin" });
  if (coneOn) drawCone();
}

let editing = null;
function newPinAt(latlng, type = "stand") {
  const pin = { id: uid(), type, name: "", notes: "", winds: [], lat: latlng.lat, lng: latlng.lng, created: Date.now(), updated: Date.now() };
  const m = L.marker([pin.lat, pin.lng], { icon: pinIcon(type), draggable: true, zIndexOffset: 900 }).addTo(map);
  m.on("drag", () => { const ll = m.getLatLng(); if (editing) { editing.pin.lat = ll.lat; editing.pin.lng = ll.lng; const c = $("#editCoords"); if (c) c.textContent = fmtCoord(editing.pin); } });
  editing = { pin, isNew: true, temp: m, photo: undefined };
  renderEditor();
}
function editPin(id) {
  const pin = pins.find((p) => p.id === id);
  if (!pin) return;
  const m = pinMarkers.get(id);
  m.dragging.enable();
  editing = { pin: { ...pin, winds: [...(pin.winds || [])] }, isNew: false, orig: { lat: pin.lat, lng: pin.lng }, photo: undefined };
  renderEditor();
}
async function renderEditor() {
  const e = editing;
  const p = e.pin;
  const existingPhoto = e.photo !== undefined ? e.photo : e.isNew ? null : await DB.get("photos", p.id).catch(() => null);
  const html = `<div class="sec">
    <div class="types" role="radiogroup" aria-label="Pin type">${Object.entries(PIN_TYPES).map(([k, t]) => `<button role="radio" aria-checked="${p.type === k}" class="${p.type === k ? "on" : ""}" data-act="pin-type" data-type="${k}">${typeIcon(t)}${esc(t.label)}</button>`).join("")}</div>
    <label class="f" for="pinName">Name</label>
    <input class="input" id="pinName" maxlength="60" placeholder="${esc((PIN_TYPES[p.type] || PIN_TYPES.note).label)}" value="${esc(p.name)}" autocomplete="off">
    <label class="f" for="pinNotes">Notes</label>
    <textarea class="input" id="pinNotes" placeholder="Height, access route, what you saw">${esc(p.notes)}</textarea>
    ${WIND_TYPES.includes(p.type) ? `<label class="f">Winds this spot works in</label><div class="compass8" role="group" aria-label="Good winds">${DIRS8.map((d) => `<button aria-pressed="${p.winds.includes(d)}" class="${p.winds.includes(d) ? "on" : ""}" data-act="wind-toggle" data-dir="${d}">${d}</button>`).join("")}</div>` : ""}
    <label class="f">Photo</label>
    ${existingPhoto ? `<img class="photo" alt="Pin photo" src="${URL.createObjectURL(existingPhoto)}">` : ""}
    <div class="actions" style="margin-top:8px">
      <label class="btn">${existingPhoto ? "Replace photo" : "Add photo"}<input type="file" accept="image/*" id="pinPhoto" class="vh"></label>
      ${existingPhoto ? `<button class="btn danger" data-act="photo-remove">Remove photo</button>` : ""}
    </div>
    <p class="note">Drag the pin or tap the map to move it. <span id="editCoords">${fmtCoord(p)}</span></p>
    <div class="actions">
      <button class="btn primary" data-act="pin-save">Save pin</button>
      <button class="btn" data-act="close-sheet">Cancel</button>
      ${!e.isNew ? `<button class="btn danger" data-act="pin-delete">Delete</button>` : ""}
    </div></div>`;
  const keepName = $("#pinName") ? $("#pinName").value : null;
  const keepNotes = $("#pinNotes") ? $("#pinNotes").value : null;
  const wasEditor = sheetKind === "edit-pin";
  if (wasEditor) $("#sheetBody").innerHTML = html;
  else openSheet(e.isNew ? "New pin" : "Edit pin", html, { kind: "edit-pin", tall: true });
  if (wasEditor && keepName !== null) { $("#pinName").value = keepName; $("#pinNotes").value = keepNotes; }
  $("#pinPhoto").addEventListener("change", async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    editing.pin.name = $("#pinName").value; editing.pin.notes = $("#pinNotes").value;
    try { editing.photo = await shrinkImage(f); } catch (err) { toast("That photo couldn't be read"); }
    renderEditor();
  });
}
function readEditorFields() {
  if (!editing) return;
  const n = $("#pinName"), t = $("#pinNotes");
  if (n) editing.pin.name = n.value.trim();
  if (t) editing.pin.notes = t.value.trim();
}
function cancelEdit() {
  if (!editing) return;
  if (editing.isNew) map.removeLayer(editing.temp);
  else {
    const m = pinMarkers.get(editing.pin.id);
    if (m) { m.dragging.disable(); m.setLatLng([editing.orig.lat, editing.orig.lng]); }
  }
  editing = null;
}
async function savePin() {
  readEditorFields();
  const e = editing;
  const pin = { ...e.pin, updated: Date.now() };
  if (!WIND_TYPES.includes(pin.type)) pin.winds = [];
  await DB.put("pins", pin);
  if (e.photo === null) await DB.del("photos", pin.id);
  else if (e.photo) await DB.put("photos", e.photo, pin.id);
  if (e.isNew) { map.removeLayer(e.temp); pins.push(pin); addPinMarker(pin); }
  else {
    pins = pins.map((p) => (p.id === pin.id ? pin : p));
    const m = pinMarkers.get(pin.id);
    m.dragging.disable();
    m.setIcon(pinIcon(pin.type));
    m.off("click").on("click", () => showPin(pin.id));
  }
  editing = null;
  sheetKind = "pin-saved"; // skip cancel cleanup
  toast("Pin saved");
  showPin(pin.id);
}
async function deletePin() {
  const id = editing.pin.id;
  if (!confirm(`Delete “${pinName(editing.pin)}”?`)) return;
  await DB.del("pins", id);
  await DB.del("photos", id);
  const m = pinMarkers.get(id);
  if (m) map.removeLayer(m);
  pinMarkers.delete(id);
  pins = pins.filter((p) => p.id !== id);
  editing = null;
  sheetKind = "pin-deleted";
  if (guide && guide.id === id) stopGuide();
  toast("Pin deleted");
  renderPins(true);
}
async function shrinkImage(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ================= guide-to ================= */
let guide = null, guideLine = null;
function startGuide(target) {
  guide = target;
  closeSheet();
  if (me) map.fitBounds(L.latLngBounds([[me.lat, me.lng], [target.lat, target.lng]]).pad(0.35), { maxZoom: 17 });
  else map.setView([target.lat, target.lng], 17);
  updateGuide();
  if (!compassOn && typeof DeviceOrientationEvent !== "undefined") toast("Tip: turn on the compass in Layers so the arrow follows your heading", 3800);
}
function stopGuide() {
  guide = null;
  if (guideLine) { map.removeLayer(guideLine); guideLine = null; }
  renderChips();
}
function updateGuide() {
  if (!guide) return;
  if (me) {
    const ll = [[me.lat, me.lng], [guide.lat, guide.lng]];
    if (!guideLine) guideLine = L.polyline(ll, { color: "#FF6A13", weight: 3, dashArray: "2 8", lineCap: "round", interactive: false }).addTo(map);
    else guideLine.setLatLngs(ll);
  }
  renderChips();
}

/* ================= tracks ================= */
let rec = null, recLine = null, recTicker = null, wakeLock = null;
const shownTracks = new Map();
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator) { wakeLock = await navigator.wakeLock.request("screen"); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* not supported or denied */ }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (rec && prefs.keepAwake) keepAwake(true);
  updateStatus();
  refreshWeather();
});
async function startRec() {
  rec = { id: uid(), name: `Track ${fmtDay(new Date())}`, start: Date.now(), end: null, points: [], dist: 0 };
  recLine = L.polyline([], { color: "#FF6A13", weight: 4, opacity: 0.95, interactive: false }).addTo(map);
  if (prefs.keepAwake) keepAwake(true);
  await DB.put("tracks", rec);
  recTicker = setInterval(() => { renderChips(); if (sheetKind === "tracks") renderTracks(); }, 5000);
  if (me) onTrackPoint(me);
  renderChips();
  toast(me ? "Recording" : "Recording. Waiting for GPS…");
}
function onTrackPoint(p) {
  if (!rec || !p || p.acc > 40) return;
  const last = rec.points[rec.points.length - 1];
  if (last) {
    const d = distM({ lat: last[0], lng: last[1] }, p);
    if (d < Math.max(4, p.acc * 0.5)) return;
    rec.dist += d;
  }
  rec.points.push([+p.lat.toFixed(6), +p.lng.toFixed(6), p.alt != null ? Math.round(p.alt * 10) / 10 : null, p.t]);
  recLine.addLatLng([p.lat, p.lng]);
  if (rec.points.length % 10 === 0) DB.put("tracks", { ...rec });
  renderChipsThrottled();
}
async function stopRec() {
  if (!rec) return;
  rec.end = Date.now();
  const done = { ...rec };
  await DB.put("tracks", done);
  clearInterval(recTicker);
  map.removeLayer(recLine);
  recLine = null;
  rec = null;
  keepAwake(false);
  if (done.points.length > 1) toggleTrack(done.id, true);
  renderChips();
  toast(`Saved ${fmtDist(done.dist)} track`);
}
async function toggleTrack(id, on) {
  if (!on) { const l = shownTracks.get(id); if (l) map.removeLayer(l); shownTracks.delete(id); return; }
  const t = await DB.get("tracks", id);
  if (!t || t.points.length < 2) return;
  const l = L.polyline(t.points.map((p) => [p[0], p[1]]), { color: "#E8A33D", weight: 4, opacity: 0.9, dashArray: "1 7", lineCap: "round", interactive: false }).addTo(map);
  shownTracks.set(id, l);
}
async function renderTracks(open) {
  const tracks = ((await DB.all("tracks")) || []).filter((t) => !rec || t.id !== rec.id).sort((a, b) => b.start - a.start);
  let html = `<div class="sec">`;
  if (rec) {
    html += `<div class="row"><div class="grow"><div class="big">${fmtDist(rec.dist)}</div><div class="muted">${fmtClock(Date.now() - rec.start)} recording, ${rec.points.length} points</div></div>
      <button class="btn primary" data-act="rec-stop">Stop and save</button></div>`;
  } else {
    html += `<button class="btn primary block" data-act="rec-start">Start recording</button>`;
  }
  html += `<button class="toggle" data-act="awake-toggle" aria-pressed="${prefs.keepAwake}"><span class="t-text">Keep screen on while recording<small>Phones pause GPS when the screen locks, so a locked phone leaves gaps</small></span><span class="switch"></span></button></div>`;
  html += `<div class="sec"><h3>Saved tracks</h3>`;
  if (tracks.length) {
    html += `<ul class="list">${tracks.map((t) => {
      const shown = shownTracks.has(t.id);
      const last = t.points.length ? t.points[t.points.length - 1][3] : null;
      const dur = (t.end || last || t.start) - t.start;
      const menu = renderTracks.menu === t.id;
      return `<li><div class="item"><span class="meta"><b>${esc(t.name)}</b><small>${fmtDist(t.dist)}, ${fmtDur(dur)}, ${esc(fmtShort(new Date(t.start)))}</small></span>
        <span class="row"><button class="btn" style="min-height:40px;padding:0 12px" data-act="track-toggle" data-id="${t.id}" aria-pressed="${shown}">${shown ? "Hide" : "Show"}</button>
        <button class="btn" style="min-height:40px;padding:0 12px" data-act="track-more" data-id="${t.id}" aria-expanded="${menu}" aria-label="More actions for ${esc(t.name)}">More</button></span></div>
        ${menu ? `<div class="actions" style="margin:0 0 12px"><button class="btn" data-act="track-zoom" data-id="${t.id}">Zoom to track</button><button class="btn" data-act="track-gpx" data-id="${t.id}">Export GPX</button><button class="btn" data-act="track-rename" data-id="${t.id}">Rename</button><button class="btn danger" data-act="track-delete" data-id="${t.id}">Delete</button></div>` : ""}</li>`;
    }).join("")}</ul>`;
  } else html += `<p class="empty">No tracks yet. Start recording on the walk in to remember your route out in the dark.</p>`;
  html += `</div>`;
  if (open || sheetKind !== "tracks") openSheet("Tracks", html, { kind: "tracks", tall: true });
  else $("#sheetBody").innerHTML = html;
}
async function trackAction(act, id) {
  const t = await DB.get("tracks", id);
  if (!t) return;
  if (act === "track-zoom") {
    if (t.points.length < 2) return toast("This track has no points yet");
    if (!shownTracks.has(id)) await toggleTrack(id, true);
    closeSheet();
    map.fitBounds(L.latLngBounds(t.points.map((p) => [p[0], p[1]])).pad(0.2));
    return;
  }
  if (act === "track-gpx") return saveFile(`${t.name.replace(/[^\w-]+/g, "_")}.gpx`, gpx([], [t]), "application/gpx+xml");
  if (act === "track-rename") {
    const n = prompt("Track name", t.name);
    if (n && n.trim()) { t.name = n.trim().slice(0, 60); await DB.put("tracks", t); }
  }
  if (act === "track-delete") {
    if (!confirm(`Delete “${t.name}”?`)) return;
    await toggleTrack(id, false);
    await DB.del("tracks", id);
    renderTracks.menu = null;
    toast("Track deleted");
  }
  renderTracks();
}

/* ================= weather, wind, sun ================= */
let wx = null;
try { wx = JSON.parse(localStorage.getItem("greylock.wx") || "null"); } catch (e) { wx = null; }
const WMO = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorms", 96: "Storms, hail", 99: "Storms, hail" };
let wxBusy = false;
async function refreshWeather(force) {
  const loc = here();
  if (!loc || wxBusy) return;
  const fresh = wx && Date.now() - wx.fetched < 30 * 60000 && distM(loc, wx.loc) < 5000;
  if (!force && fresh) { renderWind(); return; }
  if (navigator.onLine === false) { renderWind(); return; }
  wxBusy = true;
  const q = new URLSearchParams({
    latitude: loc.lat.toFixed(4), longitude: loc.lng.toFixed(4),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl",
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
    temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "inch", timezone: "America/New_York", past_days: "1", forecast_days: "7",
  });
  try {
    const data = await getJSON(`${SRC.weather}?${q}`, 15000);
    wx = { data, loc: { lat: loc.lat, lng: loc.lng, gps: loc.gps }, fetched: Date.now() };
    try { localStorage.setItem("greylock.wx", JSON.stringify(wx)); } catch (e) { /* full */ }
  } catch (e) {
    if (force) toast("Couldn't reach the forecast. Showing the last one saved.");
  } finally { wxBusy = false; }
  renderWind();
  if (sheetKind === "weather") renderWeather();
  if (coneOn) drawCone();
}
function currentWind() {
  if (!wx || !wx.data || !wx.data.current) return null;
  const c = wx.data.current;
  return { dir: c.wind_direction_10m, spd: c.wind_speed_10m, gust: c.wind_gusts_10m };
}
function renderWind() {
  const w = currentWind();
  if (!w) return;
  $("#windArrow").style.transform = `rotate(${Math.round(w.dir)}deg)`;
  $("#windText").textContent = `${dir8(w.dir)} ${Math.round(w.spd)}`;
  $("#windChip").setAttribute("aria-label", `Wind from the ${dir16(w.dir)} at ${Math.round(w.spd)} mph. Open weather.`);
}
function hourIndex(times) {
  const n = new Date();
  const key = `${ymd(n)}T${pad2(n.getHours())}:00`;
  const i = times.indexOf(key);
  return i >= 0 ? i : 0;
}
const moonName = (ph) => ph < 0.03 || ph > 0.97 ? "New moon" : ph < 0.22 ? "Waxing crescent" : ph < 0.28 ? "First quarter" : ph < 0.47 ? "Waxing gibbous" : ph < 0.53 ? "Full moon" : ph < 0.72 ? "Waning gibbous" : ph < 0.78 ? "Last quarter" : "Waning crescent";

function renderWeather(open) {
  const loc = here();
  const now = new Date();
  let html = "";
  if (wx && wx.data) {
    const d = wx.data, c = d.current, h = d.hourly;
    const i = hourIndex(h.time);
    const p0 = h.pressure_msl[i], p3 = h.pressure_msl[Math.max(0, i - 3)];
    const dp = p0 - p3;
    const trend = dp > 0.6 ? "rising" : dp < -0.6 ? "falling" : "steady";
    const age = Date.now() - wx.fetched;
    html += `<div class="sec"><div class="wx-now"><div class="wx-temp">${Math.round(c.temperature_2m)}°</div>
        <div><b>${esc(WMO[c.weather_code] || "–")}</b><div class="muted small">Feels ${Math.round(c.apparent_temperature)}°, humidity ${Math.round(c.relative_humidity_2m)}%</div>
        <div class="muted small">Pressure ${(c.pressure_msl * 0.02953).toFixed(2)} inHg, ${trend}</div></div></div>
      <div class="wx-wind"><span class="arrow">${windArrow(c.wind_direction_10m)}</span>
        <div><div class="big">${dir16(c.wind_direction_10m)} ${Math.round(c.wind_speed_10m)} mph</div><div class="muted small">Gusts ${Math.round(c.wind_gusts_10m)} mph. Scent drifts ${dir16(c.wind_direction_10m + 180)}.</div></div></div>
      <p class="note">${age > 3 * 3600000 ? "Saved forecast from " : "Updated "}${fmtTime(new Date(wx.fetched))}${age > 86400000 ? ` on ${fmtShort(new Date(wx.fetched))}` : ""}, ${wx.loc.gps ? "at your location" : "at the map center"}. <button class="btn" style="min-height:34px;padding:0 10px" data-act="wx-refresh">Refresh</button></p></div>`;

    // stands that suit the wind now
    const sector = dir8(c.wind_direction_10m);
    const good = pins.filter((p) => WIND_TYPES.includes(p.type) && (p.winds || []).includes(sector));
    const rated = pins.filter((p) => WIND_TYPES.includes(p.type) && (p.winds || []).length).length;
    html += `<div class="sec"><h3>Stands for a ${sector} wind</h3>`;
    if (good.length) html += `<ul class="list">${good.map((p) => `<li><button class="item" data-act="open-pin" data-id="${p.id}">${typeIcon(PIN_TYPES[p.type])}<span class="meta"><b>${esc(pinName(p))}</b><small>Works in ${esc(p.winds.join(", "))}</small></span><span class="end">${fmtDist(distM(loc, p))}</span></button></li>`).join("")}</ul>`;
    else html += `<p class="empty">${rated ? "None of your rated stands list this wind." : "Edit a stand or blind and mark the winds it works in. Matching stands show up here."}</p>`;
    html += `</div>`;

    html += `<div class="sec"><h3>Next 18 hours</h3><div class="hours">`;
    for (let k = i; k < Math.min(h.time.length, i + 18); k++) {
      const t = new Date(h.time[k]);
      html += `<div class="hour ${k === i ? "now" : ""}"><div>${k === i ? "Now" : t.toLocaleTimeString([], { hour: "numeric" })}</div>${windArrow(h.wind_direction_10m[k])}<div>${dir8(h.wind_direction_10m[k])} ${Math.round(h.wind_speed_10m[k])}</div><div class="muted">${Math.round(h.temperature_2m[k])}°</div><div class="muted">${h.precipitation_probability[k] ?? 0}%</div></div>`;
    }
    html += `</div><p class="note">Wind from, mph, temperature, chance of precipitation.</p></div>`;

    html += `<div class="sec"><h3>7 days</h3><table class="days"><tbody>`;
    d.daily.time.forEach((day, k) => {
      const dt = parseYmd(day);
      if (dt < parseYmd(ymd(now))) return;
      html += `<tr><td>${k === d.daily.time.indexOf(ymd(now)) ? "Today" : dt.toLocaleDateString([], { weekday: "short" })}</td><td>${esc(WMO[d.daily.weather_code[k]] || "")}</td><td class="n">${dir8(d.daily.wind_direction_10m_dominant[k])} ${Math.round(d.daily.wind_speed_10m_max[k])}</td><td class="n">${Math.round(d.daily.temperature_2m_max[k])}° / ${Math.round(d.daily.temperature_2m_min[k])}°</td><td class="n">${d.daily.precipitation_probability_max[k] ?? 0}%</td></tr>`;
    });
    html += `</tbody></table></div>`;
  } else {
    html += `<div class="sec"><p class="empty">${navigator.onLine === false ? "No forecast saved yet. Open this tab once with signal." : "Loading forecast…"}</p></div>`;
  }
  // sun and moon (works offline)
  const lt = legalTimes(now, loc);
  const mt = SunCalc.getMoonTimes(noonOf(now), loc.lat, loc.lng);
  const mi = SunCalc.getMoonIllumination(now);
  const lightRows = [["First light (civil dawn)", lt.dawn, false], ["Legal shooting starts", lt.start, true], ["Sunrise", lt.sunrise, false],
    ["Sunset", lt.sunset, false], ["Last light (civil dusk)", lt.dusk, false], ["Legal shooting ends", lt.end, true]]
    .filter((r) => r[1] instanceof Date && !isNaN(r[1])).sort((a, b) => a[1] - b[1]);
  html += `<div class="sec"><h3>Light today</h3><div class="suntimes">
      ${lightRows.map(([label, t, legal]) => `<span class="${legal ? "legal" : ""}">${label}</span><span class="t ${legal ? "legal" : ""}">${fmtTime(t)}</span>`).join("")}
    </div>${now.getDay() === 0 ? `<p class="note">Sunday. No hunting in Massachusetts.</p>` : ""}</div>
    <div class="sec"><h3>Moon</h3><div class="suntimes">
      <span>${moonName(mi.phase)}</span><span class="t">${Math.round(mi.fraction * 100)}% lit</span>
      <span>Moonrise</span><span class="t">${mt.rise ? fmtTime(mt.rise) : "None today"}</span>
      <span>Moonset</span><span class="t">${mt.set ? fmtTime(mt.set) : "None today"}</span>
    </div></div>
    <p class="note">Forecast by Open-Meteo. Sun and moon times are calculated on the phone and work offline.</p>`;
  if (open || sheetKind !== "weather") openSheet("Wind and weather", html, { kind: "weather", tall: true });
  else $("#sheetBody").innerHTML = html;
}

/* scent cone */
let coneOn = !!prefs.cone, coneLayer = null;
function coneOrigin() {
  if (openPinId) { const p = pins.find((x) => x.id === openPinId); if (p && WIND_TYPES.includes(p.type)) return { lat: p.lat, lng: p.lng }; }
  return me ? { lat: me.lat, lng: me.lng } : map.getCenter();
}
function drawCone() {
  if (coneLayer) { map.removeLayer(coneLayer); coneLayer = null; }
  if (!coneOn) return;
  const w = currentWind();
  if (!w) return;
  const o = coneOrigin();
  const down = norm360(w.dir + 180);
  const spread = w.spd < 3 ? 70 : w.spd < 7 ? 35 : 22;   // light air swirls
  const len = clamp(150 + w.spd * 20, 150, 520);          // metres
  const pts = [[o.lat, o.lng]];
  for (let a = -spread; a <= spread + 0.01; a += spread / 6) { const q = destPoint(o, down + a, len); pts.push([q.lat, q.lng]); }
  coneLayer = L.polygon(pts, { color: "#FF6A13", weight: 1.5, dashArray: "4 4", fillColor: "#FF6A13", fillOpacity: 0.18, interactive: false }).addTo(map);
}
const drawConeThrottled = throttle(drawCone, 4000);
function setCone(on) {
  coneOn = on;
  prefs.cone = on;
  savePrefs();
  const b = $("#btnCone");
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", String(on));
  if (on && !currentWind()) { toast("Loading wind…"); refreshWeather(true); }
  else if (on) { const w = currentWind(); toast(`Scent drifts ${dir16(w.dir + 180)} on a ${dir16(w.dir)} wind`); }
  drawCone();
}

/* ================= seasons ================= */
const zoneNumber = (z) => { const n = parseInt(String(z || ""), 10); return isNaN(n) ? null : n; };
function inShotgun(d) { const s = ymd(d); return REGS.shotgunWindows.some(([a, b]) => s >= a && s <= b); }
function seasonOpen(season, date, zoneNum) {
  if (date.getDay() === 0) return false;
  if (season.days && !season.days.includes(date.getDay())) return false;
  if (zoneNum && season.zones !== "all" && !season.zones.includes(zoneNum)) return false;
  const s = ymd(date);
  if (!season.ranges.some(([a, b]) => s >= a && s <= b)) return false;
  if (season.closedDuringShotgun && inShotgun(date)) return false;
  return true;
}
const seasonLabel = (s) => s.name + (s.waterfowlZone ? ` (${s.waterfowlZone})` : "");
const zonesLabel = (s) => (s.waterfowlZone ? `${s.waterfowlZone} waterfowl zone` : s.zones === "all" ? "All zones" : `Zones ${compactZones(s.zones)}`);
function compactZones(z) {
  const out = []; let a = z[0], b = z[0];
  for (let i = 1; i <= z.length; i++) {
    if (z[i] === b + 1) b = z[i];
    else { out.push(a === b ? `${a}` : `${a}–${b}`); a = b = z[i]; }
  }
  return out.join(", ");
}
function fmtRange([a, b]) {
  const A = parseYmd(a), B = parseYmd(b);
  const sameYear = A.getFullYear() === B.getFullYear();
  return `${A.toLocaleDateString([], { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })} – ${B.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}
function groupedList(list) {
  const groups = new Map();
  for (const s of list) {
    if (!groups.has(s.group)) groups.set(s.group, new Map());
    const g = groups.get(s.group);
    if (!g.has(s.name)) g.set(s.name, []);
    if (s.waterfowlZone) g.get(s.name).push(s.waterfowlZone);
  }
  return `<ul>${[...groups].map(([group, names]) => `<li><b>${esc(group)}:</b> ${[...names].map(([n, z]) => esc(n) + (z.length ? ` (${esc(z.join(", "))})` : "")).join("; ")}</li>`).join("")}</ul>`;
}
function renderRegs(open) {
  const now = new Date(), today = ymd(now);
  const zn = zoneNumber(zoneNow);
  const loc = here();
  const lt = legalTimes(now, loc);
  const openToday = REGS.seasons.filter((s) => seasonOpen(s, now, zn));
  let html = `<div class="sec"><div class="today-card"><h3>${esc(fmtDay(now))}${zoneNow ? `, WMZ ${esc(zoneNow)}` : ""}</h3>`;
  if (now.getDay() === 0) {
    const nd = nextHuntDay(now);
    const tomorrow = REGS.seasons.filter((s) => seasonOpen(s, nd, zn));
    html += `<div class="big">No hunting today</div><p style="margin:6px 0 0">Sunday hunting is prohibited in Massachusetts.</p>`;
    if (tomorrow.length) html += `<p style="margin:10px 0 0">Open ${esc(nd.toLocaleDateString([], { weekday: "long" }))}:</p>${groupedList(tomorrow)}`;
  } else if (openToday.length) {
    html += `<div class="big">Open today</div>${groupedList(openToday)}`;
    html += `<p style="margin:10px 0 0">Legal hours ${fmtTime(lt.start)} to ${fmtTime(lt.end)}</p>`;
  } else {
    html += `<div class="big">Nothing open today</div>`;
  }
  if (!zoneNow) html += `<p style="margin:10px 0 0;font-size:14px">Zone unknown, so zone-limited seasons are included. Turn on location for your zone.</p>`;
  html += `</div></div>`;

  // upcoming within 30 days
  const soon = [];
  const limit = ymd(new Date(now.getTime() + 30 * 864e5));
  for (const s of REGS.seasons) {
    if (zn && s.zones !== "all" && !s.zones.includes(zn)) continue;
    for (const r of s.ranges) if (r[0] > today && r[0] <= limit) soon.push({ s, start: r[0] });
  }
  soon.sort((a, b) => (a.start < b.start ? -1 : 1));
  if (soon.length) {
    html += `<div class="sec"><h3>Opening in the next 30 days</h3>${soon.map(({ s, start }) => `<div class="season"><span class="st"></span><span class="nm">${esc(seasonLabel(s))}</span><span class="dt">${esc(parseYmd(start).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }))}</span></div>`).join("")}</div>`;
  }

  const groups = [...new Set(REGS.seasons.map((s) => s.group))];
  for (const g of groups) {
    html += `<div class="sec"><h3>${esc(g)}</h3>`;
    for (const s of REGS.seasons.filter((x) => x.group === g)) {
      const isOpen = seasonOpen(s, now, zn) || (now.getDay() === 0 && s.ranges.some(([a, b]) => today >= a && today <= b) && (!zn || s.zones === "all" || s.zones.includes(zn)));
      const ranges = s.ranges.map((r) => `<span class="${r[1] < today ? "past" : ""}">${esc(fmtRange(r))}</span>`).join("<br>");
      html += `<div class="season ${isOpen ? "open" : ""}"><span class="st" aria-label="${isOpen ? "Open" : "Closed"}"></span><span class="nm">${esc(s.name)}</span><span class="dt">${ranges}</span>
        <span class="nt">${esc(zonesLabel(s))}${s.closedDuringShotgun ? ". Closed during shotgun deer season" : ""}${s.note ? `. ${esc(s.note)}` : ""}</span></div>`;
    }
    html += `</div>`;
  }
  html += `<div class="sec"><h3>Rules to remember</h3>${REGS.rules.map((r) => `<p class="rule"><b>${esc(r.title)}</b>${esc(r.text)}</p>`).join("")}</div>`;
  html += `<div class="sec links"><h3>Official sources</h3>${REGS.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join("")}
    <p class="note">Dates checked against MassWildlife on ${esc(fmtShort(parseYmd(REGS.checked)))}, ${parseYmd(REGS.checked).getFullYear()}. This is a summary, not the law. Check the current abstracts before you hunt.</p></div>`;
  if (open || sheetKind !== "regs") openSheet("Seasons", html, { kind: "regs", tall: true });
  else $("#sheetBody").innerHTML = html;
}

/* ================= offline areas ================= */
let areasMem = null, areaOutlines = null;
async function getAreas() { if (!areasMem) areasMem = (await DB.all("areas")) || []; return areasMem; }
async function drawAreaOutlines() {
  if (areaOutlines) { map.removeLayer(areaOutlines); areaOutlines = null; }
  if (!prefs.overlays.areas) return;
  const areas = await getAreas();
  areaOutlines = L.layerGroup(areas.map((a) => L.rectangle([[a.bounds.s, a.bounds.w], [a.bounds.n, a.bounds.e]], { color: "#FFFFFF", weight: 2, dashArray: "3 6", fill: false, interactive: false, opacity: 0.85 }))).addTo(map);
}
const lng2x = (lng, n) => Math.floor(((lng + 180) / 360) * n);
const lat2y = (lat, n) => { const r = lat * toR; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n); };
function tileJobs(b, layers, maxZoom) {
  const jobs = [];
  for (const id of layers) {
    const t = TILESETS[id];
    const zMin = Math.max(t.minZoom || 0, 10), zMax = Math.min(maxZoom, t.maxNative);
    for (let z = zMin; z <= zMax; z++) {
      const n = 2 ** z;
      const x0 = lng2x(b.w, n), x1 = lng2x(b.e, n), y0 = lat2y(b.n, n), y1 = lat2y(b.s, n);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(`${id}/${z}/${x}/${y}`);
    }
  }
  return jobs;
}
function estimate(b, layers, maxZoom) {
  let tiles = 0, kb = 0;
  for (const id of layers) {
    const t = TILESETS[id];
    const zMin = Math.max(t.minZoom || 0, 10), zMax = Math.min(maxZoom, t.maxNative);
    for (let z = zMin; z <= zMax; z++) {
      const n = 2 ** z;
      const c = (lng2x(b.e, n) - lng2x(b.w, n) + 1) * (lat2y(b.s, n) - lat2y(b.n, n) + 1);
      tiles += c;
      kb += c * (t.kb || 15);
    }
  }
  return { tiles, mb: kb / 1024 };
}
const MAX_TILES = 30000;
let dlState = null, dlBox = null;
function clearDownloadBox() { if (dlBox) { map.removeLayer(dlBox); dlBox = null; } }
function boundsNow() { const b = map.getBounds(); return { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }; }

function renderDownload() {
  if (dlState && dlState.running) return;
  const b = boundsNow();
  clearDownloadBox();
  dlBox = L.rectangle([[b.s, b.w], [b.n, b.e]], { color: "#FF6A13", weight: 3, dashArray: "6 6", fill: false, interactive: false }).addTo(map);
  const sel = dlState?.layers || [currentBase, ...TILE_OVERLAYS.filter((id) => prefs.overlays[id])];
  const maxZoom = dlState?.maxZoom || 17;
  dlState = { bounds: b, layers: sel, maxZoom, features: dlState?.features ?? true, running: false };
  const choices = [...BASES, ...TILE_OVERLAYS];
  const est = estimate(b, sel, maxZoom);
  const tooBig = est.tiles > MAX_TILES;
  const html = `<div class="sec">
    <p class="note" style="margin-top:0">Saves the area inside the orange box: the whole screen, including what’s behind this panel.</p>
    <label class="f" for="dlName">Name</label>
    <input class="input" id="dlName" value="${esc(dlState.name || `Area saved ${fmtShort(new Date())}`)}" maxlength="50">
    <label class="f">Detail</label>
    <div class="seg" role="group" aria-label="Detail level">${[[16, "Standard"], [17, "Detailed"], [18, "Max"]].map(([z, l]) => `<button class="${maxZoom === z ? "on" : ""}" data-act="dl-zoom" data-z="${z}">${l}</button>`).join("")}</div>
    <label class="f">Layers</label>
    ${choices.map((id) => `<button class="toggle" data-act="dl-layer" data-id="${id}" aria-pressed="${sel.includes(id)}"><span class="t-text">${esc(TILESETS[id].label)}</span><span class="switch"></span></button>`).join("")}
    <button class="toggle" data-act="dl-features" aria-pressed="${dlState.features}"><span class="t-text">Owner and public-land details<small>Lets you tap a parcel offline</small></span><span class="switch"></span></button>
    <p class="${tooBig ? "warn" : "note"}" id="dlEst">${est.tiles.toLocaleString()} tiles, about ${est.mb < 1 ? "<1" : Math.round(est.mb)} MB${tooBig ? ". That’s too many; zoom in or lower the detail." : ""}</p>
    <div class="actions"><button class="btn primary" data-act="dl-start" ${tooBig || !sel.length ? "disabled" : ""}>Download</button><button class="btn" data-act="tab" data-tab="layers">Back</button></div>
  </div>`;
  openSheet("Save for offline", html, { kind: "download" });
}
async function runDownload() {
  const st = dlState;
  st.name = ($("#dlName")?.value || "").trim() || `Area saved ${fmtShort(new Date())}`;
  if (estimate(st.bounds, st.layers, st.maxZoom).tiles > MAX_TILES) return;
  st.running = true;
  st.cancel = false;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const jobs = tileJobs(st.bounds, st.layers, st.maxZoom);
  const total = jobs.length;
  let done = 0, failed = 0, bytes = 0;
  const keys = [];
  $("#sheetBody").innerHTML = `<div class="sec"><div class="big" id="dlPct">0%</div><div class="muted" id="dlTxt">Starting…</div><div class="bar"><i id="dlBar"></i></div>
    <div class="actions"><button class="btn" data-act="dl-cancel">Cancel</button></div><p class="note">Keep this screen open until it finishes.</p></div>`;
  const ui = throttle(() => {
    const pct = Math.round((done / total) * 100);
    const e1 = $("#dlPct"), e2 = $("#dlTxt"), e3 = $("#dlBar");
    if (e1) e1.textContent = `${pct}%`;
    if (e2) e2.textContent = `${done.toLocaleString()} of ${total.toLocaleString()} tiles, ${(bytes / 1048576).toFixed(1)} MB${failed ? `, ${failed} empty` : ""}`;
    if (e3) e3.style.width = `${pct}%`;
  }, 250);
  const cache = await caches.open(OFFLINE_TILES);
  const queue = jobs.slice();
  const worker = async () => {
    while (queue.length && !st.cancel) {
      const key = queue.pop();
      const [id, z, x, y] = key.split("/");
      const url = tileUrl(id, +z, +x, +y);
      try {
        if (!(await cache.match(url))) {
          let res;
          try { res = await fetch(url, { mode: "cors", credentials: "omit" }); }
          catch (e) { res = await fetch(url, { mode: "no-cors" }); }
          if (res.type !== "opaque" && !res.ok) throw new Error(String(res.status));
          if (res.type !== "opaque") { const len = +res.headers.get("content-length"); bytes += len || (await res.clone().blob()).size; }
          await cache.put(url, res);
        }
        keys.push(key);
      } catch (e) { failed++; }
      done++;
      ui();
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  if (st.cancel) {
    st.running = false;
    toast("Download canceled. Tiles already saved stay cached.");
    if (sheetKind === "download") renderLayers(true);
    return;
  }
  let feats = { parcels: [], openspace: [] };
  if (st.features) {
    const txt = $("#dlTxt"); if (txt) txt.textContent = "Saving owner and public-land details…";
    feats.parcels = await pageFeatures(SRC.parcels, st.bounds, PARCEL_FIELDS, 0.00001, 15000);
    feats.openspace = await pageFeatures(SRC.openspaceFS, st.bounds, OS_FIELDS, 0.00002, 5000);
  }
  const area = { id: uid(), name: st.name, bounds: st.bounds, maxZoom: st.maxZoom, layers: st.layers, keys, tiles: keys.length, bytes, created: Date.now(), parcels: feats.parcels.length, openspace: feats.openspace.length };
  await DB.put("areas", area);
  if (st.features) await DB.put("kv", feats, "feat:" + area.id);
  areasMem = null;
  areaFeatCache.delete(area.id);
  dlState = null;
  drawAreaOutlines();
  toast(`Saved “${area.name}” for offline use`);
  if (sheetKind === "download") renderLayers(true);
}
async function pageFeatures(base, b, fields, simplify, cap) {
  const out = [];
  const size = 1000;
  for (let off = 0; off < cap; off += size) {
    try {
      const fc = await getJSON(bboxQuery(base, b, fields, off, size, simplify), 30000);
      const fs = fc.features || [];
      out.push(...fs);
      if (fs.length < size) break;
    } catch (e) { break; }
  }
  return out;
}
async function deleteArea(id) {
  const areas = await getAreas();
  const target = areas.find((a) => a.id === id);
  if (!target || !confirm(`Delete saved area “${target.name}”?`)) return;
  const keep = new Set();
  areas.filter((a) => a.id !== id).forEach((a) => a.keys.forEach((k) => keep.add(k)));
  const cache = await caches.open(OFFLINE_TILES);
  const drop = target.keys.filter((k) => !keep.has(k));
  for (let i = 0; i < drop.length; i += 200) {
    await Promise.all(drop.slice(i, i + 200).map((k) => { const [l, z, x, y] = k.split("/"); return cache.delete(tileUrl(l, +z, +x, +y)); }));
  }
  await DB.del("areas", id);
  await DB.del("kv", "feat:" + id);
  areaFeatCache.delete(id);
  areasMem = null;
  drawAreaOutlines();
  toast("Saved area deleted");
  renderLayers();
}

/* ================= layers panel ================= */
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
async function renderLayers(open) {
  const areas = await getAreas();
  let storage = "";
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      storage = `Using ${(e.usage / 1048576).toFixed(0)} MB of about ${(e.quota / 1073741824).toFixed(1)} GB available to the app.`;
    }
  } catch (e) { /* ignore */ }
  const ov = (id, label, sub) => `<button class="toggle" data-act="overlay" data-id="${id}" aria-pressed="${!!prefs.overlays[id]}"><span class="t-text">${label}${sub ? `<small>${sub}</small>` : ""}</span><span class="switch"></span></button>`;
  let html = "";
  if (!isStandalone() && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
    html += `<div class="sec"><div class="warn">For full screen and offline use, tap Share, then “Add to Home Screen”, and open Greylock from there.</div></div>`;
  }
  html += `<div class="sec"><h3>Base map</h3><div class="bases">${BASES.map((id) => `<button class="${currentBase === id ? "on" : ""}" data-act="base" data-id="${id}" aria-pressed="${currentBase === id}"><div class="swatch" style="background:${TILESETS[id].swatch}"></div><span>${esc(TILESETS[id].label)}</span></button>`).join("")}</div></div>
    <div class="sec"><h3>On the map</h3>
      ${ov("openspace", "Public and conservation land", "Shaded by owner. Tap any spot for details")}
      <div class="legend"><span><i style="background:#04DB00"></i>MassWildlife</span><span><i style="background:#008200"></i>DCR parks and forests</span><span><i style="background:#3DF2BC"></i>DCR water supply</span><span><i style="background:#F8A6FF"></i>Town</span><span><i style="background:#6280BD"></i>Federal</span><span><i style="background:#C900DB"></i>Land trust</span><span><i style="background:#FFAE00"></i>Private, restricted</span></div>
      ${ov("parcels", "Property lines", "Visible when zoomed in close")}
      ${ov("lidar", "LiDAR hillshade", "Shows benches, draws, stone walls and old roads")}
      ${ov("labels", "Roads and labels")}
      ${ov("wmz", "Wildlife Management Zones")}
      ${ov("areas", "Outlines of saved areas")}
    </div>
    <div class="sec"><h3>Display</h3>
      <div class="seg" role="group" aria-label="Color theme">${[["auto", "Auto"], ["light", "Day"], ["dark", "Dark"], ["night", "Red night"]].map(([k, l]) => `<button class="${prefs.theme === k ? "on" : ""}" data-act="theme" data-theme="${k}">${l}</button>`).join("")}</div>
      <p class="note">Red night dims the map and turns everything red so your eyes stay adjusted before first light.</p>
      <button class="toggle" data-act="compass" aria-pressed="${compassOn}"><span class="t-text">Compass heading<small>Shows which way you face on the location dot and guide arrow</small></span><span class="switch"></span></button>
    </div>
    <div class="sec"><h3>Offline maps</h3>
      <p class="note" style="margin-top:0">Save an area while you have signal. Saved areas keep the map, property lines and owner details working with no service.</p>
      <div class="actions"><button class="btn primary" data-act="dl-open">Save this view for offline</button></div>
      ${areas.length ? `<ul class="list" style="margin-top:8px">${areas.sort((a, b) => b.created - a.created).map((a) => `<li><div class="item"><span class="meta"><b>${esc(a.name)}</b><small>${a.tiles.toLocaleString()} tiles, ${(a.bytes / 1048576).toFixed(0)} MB${a.parcels ? `, ${a.parcels.toLocaleString()} parcels` : ""}</small></span><span class="row"><button class="btn" style="min-height:40px;padding:0 12px" data-act="area-go" data-id="${a.id}">Show</button><button class="btn danger" style="min-height:40px;padding:0 12px" data-act="area-del" data-id="${a.id}">Delete</button></span></div></li>`).join("")}</ul>` : ""}
      ${storage ? `<p class="note">${storage}</p>` : ""}
    </div>
    <div class="sec"><h3>Your pins and tracks</h3>
      <p class="note" style="margin-top:0">Everything is stored only on this phone. Back up now and then.</p>
      <div class="actions"><button class="btn" data-act="export-gpx">Export GPX</button><button class="btn" data-act="backup">Back up</button><label class="btn">Restore<input type="file" accept=".json,application/json" id="restoreFile" class="vh"></label></div>
    </div>
    <p class="note">Map data from MassGIS (parcels, 2025 imagery, LiDAR, basemap), EEA open space, MassWildlife zones and the USGS National Map. Forecasts from Open-Meteo.</p>`;
  if (open || sheetKind !== "layers") openSheet("Layers", html, { kind: "layers", tall: true });
  else $("#sheetBody").innerHTML = html;
  const rf = $("#restoreFile");
  if (rf) rf.addEventListener("change", (e) => restore(e.target.files && e.target.files[0]));
}

/* ================= export, backup ================= */
const xml = (s) => esc(s).replace(/&#39;/g, "&apos;");
function gpx(pinList, trackList) {
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Greylock" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  for (const p of pinList) {
    out += `<wpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><time>${new Date(p.created).toISOString()}</time><name>${xml(pinName(p))}</name>${p.notes ? `<desc>${xml(p.notes)}</desc>` : ""}<type>${xml(PIN_TYPES[p.type]?.label || p.type)}</type></wpt>\n`;
  }
  for (const t of trackList) {
    out += `<trk><name>${xml(t.name)}</name><trkseg>\n`;
    for (const q of t.points) out += `<trkpt lat="${q[0]}" lon="${q[1]}">${q[2] != null ? `<ele>${q[2]}</ele>` : ""}${q[3] ? `<time>${new Date(q[3]).toISOString()}</time>` : ""}</trkpt>\n`;
    out += `</trkseg></trk>\n`;
  }
  return out + `</gpx>\n`;
}
async function saveFile(name, text, type) {
  const blob = new Blob([text], { type });
  try {
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}
const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
async function exportGpx() {
  const tracks = (await DB.all("tracks")) || [];
  await saveFile(`greylock-${ymd(new Date())}.gpx`, gpx(pins, tracks), "application/gpx+xml");
}
async function backup() {
  const tracks = (await DB.all("tracks")) || [];
  const photos = {};
  for (const p of pins) { const b = await DB.get("photos", p.id); if (b) photos[p.id] = await blobToDataURL(b); }
  const data = { app: "greylock", version: 1, exported: new Date().toISOString(), pins, tracks, photos };
  await saveFile(`greylock-backup-${ymd(new Date())}.json`, JSON.stringify(data), "application/json");
}
async function restore(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "greylock") throw new Error("not a Greylock backup");
    let n = 0;
    for (const p of data.pins || []) {
      await DB.put("pins", p);
      if (data.photos && data.photos[p.id]) await DB.put("photos", await (await fetch(data.photos[p.id])).blob(), p.id);
      n++;
    }
    for (const t of data.tracks || []) await DB.put("tracks", t);
    pinMarkers.forEach((m) => map.removeLayer(m));
    pinMarkers.clear();
    await loadPins();
    toast(`Restored ${n} pins and ${(data.tracks || []).length} tracks`);
  } catch (e) {
    toast("That file isn't a Greylock backup");
  }
}

/* ================= actions ================= */
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  switch (a) {
    case "tab": return showTab(el.dataset.tab);
    case "close-sheet": return closeSheet();
    case "locate":
      if (!me) { toast("Waiting for GPS…"); startGPS(); return; }
      follow = !follow;
      el.classList.toggle("follow", follow);
      if (follow) map.setView([me.lat, me.lng], Math.max(map.getZoom(), 16));
      toast(follow ? "Following your location" : "Stopped following");
      return;
    case "cone": return setCone(!coneOn);
    case "drop-pin": closeSheet(); return newPinAt(map.getCenter(), "stand");
    case "pin-me": if (me) return newPinAt({ lat: me.lat, lng: me.lng }, "stand"); return;
    case "pin-here": return newPinAt({ lat: +el.dataset.lat, lng: +el.dataset.lng }, "stand");
    case "guide-here": return startGuide({ lat: +el.dataset.lat, lng: +el.dataset.lng, name: "Marked spot" });
    case "guide-pin": { const p = pins.find((x) => x.id === id); if (p) startGuide({ lat: p.lat, lng: p.lng, name: pinName(p), id: p.id }); return; }
    case "stop-guide": stopGuide(); return toast("Stopped guiding");
    case "copy": return copyText(el.dataset.text);
    case "open-pin": {
      const p = pins.find((x) => x.id === id);
      if (p) { map.setView([p.lat, p.lng], Math.max(map.getZoom(), 16)); showPin(id); }
      return;
    }
    case "pin-filter": renderPins.filter = el.dataset.type; return renderPins();
    case "edit-pin": return editPin(id);
    case "pin-type":
      readEditorFields();
      editing.pin.type = el.dataset.type;
      (editing.isNew ? editing.temp : pinMarkers.get(editing.pin.id)).setIcon(pinIcon(editing.pin.type));
      return renderEditor();
    case "wind-toggle": {
      const d = el.dataset.dir, w = editing.pin.winds;
      const i = w.indexOf(d);
      if (i >= 0) w.splice(i, 1); else w.push(d);
      w.sort((x, y) => DIRS8.indexOf(x) - DIRS8.indexOf(y));
      el.classList.toggle("on", i < 0);
      el.setAttribute("aria-pressed", String(i < 0));
      return;
    }
    case "photo-remove": readEditorFields(); editing.photo = null; return renderEditor();
    case "pin-save": return savePin();
    case "pin-delete": return deletePin();
    case "rec-start": await startRec(); return renderTracks();
    case "rec-stop": await stopRec(); return renderTracks();
    case "awake-toggle":
      prefs.keepAwake = !prefs.keepAwake; savePrefs();
      el.setAttribute("aria-pressed", String(prefs.keepAwake));
      if (rec) keepAwake(prefs.keepAwake);
      return;
    case "track-toggle": await toggleTrack(id, !shownTracks.has(id)); return renderTracks();
    case "track-more": renderTracks.menu = renderTracks.menu === id ? null : id; return renderTracks();
    case "track-zoom": case "track-gpx": case "track-rename": case "track-delete": return trackAction(a, id);
    case "wx-refresh": return refreshWeather(true);
    case "base": setBase(id); return renderLayers();
    case "overlay": setOverlay(id, !prefs.overlays[id]); el.setAttribute("aria-pressed", String(!!prefs.overlays[id])); return;
    case "theme": prefs.theme = el.dataset.theme; savePrefs(); applyTheme(); return renderLayers();
    case "compass":
      if (compassOn) disableCompass(); else await enableCompass();
      el.setAttribute("aria-pressed", String(compassOn));
      return;
    case "dl-open": dlState = null; return renderDownload();
    case "dl-zoom": dlState.maxZoom = +el.dataset.z; dlState.name = $("#dlName").value; return renderDownload();
    case "dl-layer": {
      const s = dlState.layers, i = s.indexOf(id);
      if (i >= 0) s.splice(i, 1); else s.push(id);
      dlState.name = $("#dlName").value;
      return renderDownload();
    }
    case "dl-features": dlState.features = !dlState.features; dlState.name = $("#dlName").value; return renderDownload();
    case "dl-start": return runDownload();
    case "dl-cancel": if (dlState) dlState.cancel = true; return;
    case "area-go": {
      const ar = (await getAreas()).find((x) => x.id === id);
      if (ar) { closeSheet(); map.fitBounds([[ar.bounds.s, ar.bounds.w], [ar.bounds.n, ar.bounds.e]]); }
      return;
    }
    case "area-del": return deleteArea(id);
    case "export-gpx": return exportGpx();
    case "backup": return backup();
  }
});

map.on("click", (e) => {
  if (sheetKind === "edit-pin" && editing) {
    const m = editing.isNew ? editing.temp : pinMarkers.get(editing.pin.id);
    m.setLatLng(e.latlng);
    editing.pin.lat = e.latlng.lat; editing.pin.lng = e.latlng.lng;
    const c = $("#editCoords"); if (c) c.textContent = fmtCoord(editing.pin);
    return;
  }
  if (sheetKind === "download") return;
  showLandInfo(e.latlng);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetKind) closeSheet(); });

/* ================= start ================= */
(async function init() {
  $("#btnCone").classList.toggle("on", coneOn);
  $("#btnCone").setAttribute("aria-pressed", String(coneOn));
  updateStatus();
  renderWind();
  renderChips();
  startGPS();
  try { await loadPins(); } catch (e) { toast("Couldn't open saved pins on this device"); }
  drawAreaOutlines();
  loadWMZ();
  loadOsDomains();
  setTimeout(() => { if (!wx || Date.now() - wx.fetched > 30 * 60000) refreshWeather(); }, me ? 0 : 4000);
  setInterval(updateStatus, 30000);
  if (coneOn) setTimeout(drawCone, 1500);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
})();
