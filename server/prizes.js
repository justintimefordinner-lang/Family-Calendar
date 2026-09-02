// Starter prizes for the coin store. Seeded on first-run setup; can also be loaded later with
// `node scripts/import-prizes.js` (skips ones that already exist).
const db = require('./db');

const DEFAULT_PRIZES = [
  { emoji: '🌙', title: 'Stay up 30 minutes later', coins: 15 },
  { emoji: '🍨', title: 'Ice cream run', coins: 25 },
  { emoji: '🛝', title: 'Trip to the park', coins: 15 },
  { emoji: '🎨', title: 'Crafternoon', coins: 20, notes: 'An afternoon of crafts with Mom or Dad' },
  { emoji: '🧁', title: 'Bake something together', coins: 30 },
  { emoji: '📚', title: 'New book', coins: 40 },
  { emoji: '🎬', title: 'Pick the family movie', coins: 25 },
  { emoji: '🎲', title: 'Pick game night', coins: 20 },
  { emoji: '🍰', title: 'Dessert first', coins: 12, notes: 'Dessert before dinner, one time' },
];

function seedDefaults() {
  const exists = db.prepare('SELECT 1 FROM rewards WHERE lower(title) = lower(?) AND active = 1');
  const insert = db.prepare('INSERT INTO rewards(title, coins, emoji, notes, sort_order) VALUES(?, ?, ?, ?, ?)');
  let added = 0;
  db.transaction(() => {
    DEFAULT_PRIZES.forEach((p, i) => {
      if (exists.get(p.title)) return;
      insert.run(p.title, p.coins, p.emoji, p.notes || null, i);
      added += 1;
    });
  })();
  return added;
}

module.exports = { DEFAULT_PRIZES, seedDefaults };
