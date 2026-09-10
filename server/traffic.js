// Live drive times between two saved places, via TomTom's Routing API (traffic-aware).
// Needs a TomTom developer key (Settings > Traffic). The free tier (no card) allows 2,500 requests a day.
const db = require('./db');
const settings = require('./settings');
const { HttpError } = require('./util');

const TTL = 5 * 60 * 1000; // one lookup per route per 5 minutes
const cache = new Map();

function apiKey() {
  const key = settings.get('tomtom_key');
  if (!key) throw new HttpError(400, 'No TomTom key yet. A parent can add one under Settings > Traffic.');
  return key;
}

async function fail(res, what) {
  const text = await res.text().catch(() => '');
  let msg = text.slice(0, 200);
  try { const j = JSON.parse(text); msg = (j.detailedError && j.detailedError.message) || (j.error && j.error.description) || j.errorText || msg; } catch { /* keep raw */ }
  throw new HttpError(502, `${what}: ${msg || res.status}`);
}

// Addresses are geocoded once and the coordinates kept on the place.
async function geocode(place) {
  if (place.lat != null && place.lon != null) return place;
  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(place.address)}.json?key=${encodeURIComponent(apiKey())}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) await fail(res, `Could not find "${place.address}"`);
  const json = await res.json();
  const hit = (json.results || [])[0];
  if (!hit || !hit.position) throw new HttpError(404, `Could not find "${place.address}" on the map`);
  db.prepare('UPDATE places SET lat = ?, lon = ? WHERE id = ?').run(hit.position.lat, hit.position.lon, place.id);
  return { ...place, lat: hit.position.lat, lon: hit.position.lon };
}

async function report(fromPlace, toPlace) {
  const ck = `${fromPlace.id}|${toPlace.id}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const from = await geocode(fromPlace);
  const to = await geocode(toPlace);
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json?key=${encodeURIComponent(apiKey())}&traffic=true&travelMode=car&computeTravelTimeFor=all&routeType=fastest&maxAlternatives=2&instructionsType=text&language=en-US`;
  const res = await fetch(url);
  if (!res.ok) await fail(res, 'TomTom routing');
  const json = await res.json();
  const routes = (json.routes || []).filter((r) => r.summary);
  if (!routes.length) throw new HttpError(404, 'No driving route found between those places');
  // The main road(s) a route uses, from the turn-by-turn text: e.g. "I-25 / US-36".
  const via = (r) => {
    const seen = []; const ins = (r.guidance && r.guidance.instructions) || [];
    for (const i of ins) for (const n of (i.roadNumbers || [])) if (n && !seen.includes(n)) seen.push(n);
    if (!seen.length) for (const i of ins) if (i.street && !seen.includes(i.street)) seen.push(i.street);
    return seen.slice(0, 2).join(' / ');
  };
  const t = (r) => Number(r.summary.travelTimeInSeconds) || 0;
  const t0 = (r) => Number(r.summary.noTrafficTravelTimeInSeconds) || t(r);
  const fastest = routes.reduce((a, b) => (t(b) < t(a) ? b : a));        // quickest right now, with traffic
  const usual = routes.reduce((a, b) => (t0(b) < t0(a) ? b : a));        // the normal way when roads are clear
  const saved = Math.round((t(usual) - t(fastest)) / 60);
  const alternate = fastest !== usual && saved >= 3;
  const s = fastest.summary;
  const now = t(fastest);
  const typical = t0(usual) || now;
  const delay = Math.max(0, now - typical);
  const ratio = typical ? delay / typical : 0;
  const level = ratio < 0.1 ? 'clear' : ratio < 0.3 ? 'light' : ratio < 0.6 ? 'moderate' : 'heavy';
  const label = { clear: 'Clear roads', light: 'Light traffic', moderate: 'Moderate traffic', heavy: 'Heavy traffic' }[level];
  const fastVia = via(fastest); const usualVia = via(usual);
  const route_note = alternate
    ? `Take the alternate route${fastVia ? ` via ${fastVia}` : ''}: ${saved} min faster than the usual way${usualVia ? ` (${usualVia})` : ''}`
    : `Usual route${usualVia ? ` via ${usualVia}` : ''}`;
  const data = {
    minutes: Math.max(1, Math.round(now / 60)),
    typical_minutes: Math.max(1, Math.round(typical / 60)),
    delay_minutes: Math.round(delay / 60),
    miles: Math.round(((Number(s.lengthInMeters) || 0) / 1609.34) * 10) / 10,
    level, label, alternate, route_note, via: fastVia,
    checked_at: new Date().toISOString(),
  };
  cache.set(ck, { at: Date.now(), data });
  return data;
}

module.exports = { report, geocode };
