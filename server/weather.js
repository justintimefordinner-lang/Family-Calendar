const settings = require('./settings');

let cache = { key: '', at: 0, data: null };
const TTL = 15 * 60 * 1000;

// Open-Meteo WMO weather codes -> label + emoji
const CODES = {
  0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Icy fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Heavy showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm', '⛈️'],
};

function describe(code) {
  const [label, emoji] = CODES[code] || ['—', '🌡️'];
  return { label, emoji };
}

async function forecast() {
  const lat = settings.get('weather_lat');
  const lon = settings.get('weather_lon');
  if (lat == null || lon == null) return null;
  const unit = settings.get('temp_unit') === 'celsius' ? 'celsius' : 'fahrenheit';
  const key = `${lat},${lon},${unit}`;
  if (cache.key === key && Date.now() - cache.at < TTL) return cache.data;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    temperature_unit: unit,
    timezone: 'auto',
    forecast_days: '7',
  }).toString();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  const j = await res.json();
  const data = {
    label: settings.get('weather_label'),
    unit: unit === 'celsius' ? '°C' : '°F',
    current: { temp: Math.round(j.current.temperature_2m), ...describe(j.current.weather_code) },
    daily: j.daily.time.map((date, i) => ({
      date,
      hi: Math.round(j.daily.temperature_2m_max[i]),
      lo: Math.round(j.daily.temperature_2m_min[i]),
      precip: j.daily.precipitation_probability_max[i],
      ...describe(j.daily.weather_code[i]),
    })),
  };
  cache = { key, at: Date.now(), data };
  return data;
}

async function geocode(q) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const j = await res.json();
  return (j.results || []).map((r) => ({
    label: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

module.exports = { forecast, geocode };
