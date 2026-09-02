const fs = require('fs');
const Database = require('better-sqlite3');
const { DB_PATH, PHOTO_DIR, THEME_DIR } = require('./config');

fs.mkdirSync(PHOTO_DIR, { recursive: true });
fs.mkdirSync(THEME_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'kid',          -- 'kid' | 'parent'
  color TEXT NOT NULL DEFAULT '#4f86f7',
  emoji TEXT NOT NULL DEFAULT '🙂',
  aliases TEXT NOT NULL DEFAULT '',            -- comma-separated nicknames/abbreviations for event matching
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS google_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  tokens TEXT NOT NULL,
  last_error TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  google_id TEXT NOT NULL,
  name TEXT NOT NULL,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,  -- who this calendar belongs to
  is_family INTEGER NOT NULL DEFAULT 0,                         -- shown for everyone
  enabled INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  UNIQUE(account_id, google_id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  google_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start TEXT NOT NULL,        -- as given by Google: date or dateTime
  end TEXT NOT NULL,
  start_ts INTEGER NOT NULL,  -- epoch ms; all-day events use server-local midnight
  end_ts INTEGER NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  description TEXT,
  UNIQUE(calendar_id, google_id)
);
CREATE INDEX IF NOT EXISTS idx_events_range ON events(start_ts, end_ts);

CREATE TABLE IF NOT EXISTS chores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,  -- NULL = anyone can claim (Earn Money only)
  schedule TEXT NOT NULL DEFAULT 'daily',   -- 'daily' | 'weekly' | 'once'
  days TEXT NOT NULL DEFAULT '1111111',     -- Sun..Sat flags, used by 'weekly'
  due_date TEXT,                            -- used by 'once'
  paid INTEGER NOT NULL DEFAULT 0,          -- 1 = Earn Money chore
  amount_cents INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'any',       -- 'morning' | 'afternoon' | 'evening' | 'any'
  coins INTEGER,                            -- reward coins when approved; NULL = use the default setting
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chore_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chore_id INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                       -- the day the chore was for
  status TEXT NOT NULL DEFAULT 'done',      -- 'done' | 'pending' | 'approved' | 'rejected'
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  UNIQUE(chore_id, member_id, date)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- 'deposit' | 'withdrawal' | 'chore' | 'interest' | 'adjustment' | 'transfer'
  account TEXT NOT NULL DEFAULT 'invested',  -- 'cash' (pocket money) | 'invested' (with Dad, earns interest)
  amount_cents INTEGER NOT NULL, -- signed; positive adds to the balance
  note TEXT,
  completion_id INTEGER REFERENCES chore_completions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_member ON transactions(member_id, created_at);

CREATE TABLE IF NOT EXISTS coin_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,       -- signed whole coins
  note TEXT,
  completion_id INTEGER REFERENCES chore_completions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coins_member ON coin_transactions(member_id, created_at);

CREATE TABLE IF NOT EXISTS meals (
  date TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS local_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'event',       -- 'birthday' | 'event'
  title TEXT NOT NULL,                      -- birthday: the person's name
  date TEXT NOT NULL,                       -- YYYY-MM-DD; for birthdays the date of birth
  end_date TEXT,
  time TEXT,                                -- HH:MM, NULL = all day
  end_time TEXT,
  yearly INTEGER NOT NULL DEFAULT 0,
  show_age INTEGER NOT NULL DEFAULT 1,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,  -- NULL = family-wide
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shopping_history (
  key TEXT PRIMARY KEY,          -- lower-cased item name
  label TEXT NOT NULL,           -- as last typed
  count INTEGER NOT NULL DEFAULT 1,
  last_used TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  qty INTEGER,                              -- optional quantity (1-99)
  checked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migrations for databases created by earlier versions.
const memberCols = db.prepare('PRAGMA table_info(members)').all().map((c) => c.name);
if (!memberCols.includes('aliases')) db.exec(`ALTER TABLE members ADD COLUMN aliases TEXT NOT NULL DEFAULT ''`);
const choreCols = db.prepare('PRAGMA table_info(chores)').all().map((c) => c.name);
if (!choreCols.includes('period')) db.exec(`ALTER TABLE chores ADD COLUMN period TEXT NOT NULL DEFAULT 'any'`);
if (!choreCols.includes('coins')) db.exec('ALTER TABLE chores ADD COLUMN coins INTEGER');
const shopCols = db.prepare('PRAGMA table_info(shopping_items)').all().map((c) => c.name);
if (!shopCols.includes('qty')) db.exec('ALTER TABLE shopping_items ADD COLUMN qty INTEGER');
const txCols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
if (!txCols.includes('account')) db.exec(`ALTER TABLE transactions ADD COLUMN account TEXT NOT NULL DEFAULT 'invested'`);

module.exports = db;
