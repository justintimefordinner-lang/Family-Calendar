const path = require('path');

const DATA_DIR = path.resolve(process.env.FC_DATA_DIR || path.join(__dirname, '..', 'data'));

module.exports = {
  PORT: parseInt(process.env.PORT || '3100', 10),
  DATA_DIR,
  DB_PATH: path.join(DATA_DIR, 'family.db'),
  PHOTO_DIR: path.join(DATA_DIR, 'photos'),
  THEME_DIR: path.join(DATA_DIR, 'theme'),
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
};
