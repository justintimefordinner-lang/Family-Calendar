const path = require('path');
const express = require('express');
const { PORT, PHOTO_DIR, THEME_DIR, PUBLIC_DIR, DATA_DIR } = require('./config');
const settings = require('./settings');

// Use the family's timezone for all date math (all-day events, "today", interest day).
const tz = settings.get('timezone');
if (tz) process.env.TZ = tz;

const google = require('./google');
const interest = require('./interest');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));

app.use('/api', require('./routes'));
app.use('/photos', express.static(PHOTO_DIR, { maxAge: '1d', index: false }));
app.use('/theme-art', express.static(THEME_DIR, { maxAge: '1d', index: false }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Family Calendar listening on http://0.0.0.0:${PORT}  (data: ${DATA_DIR})`);
  google.startSync();
  interest.start();
});
