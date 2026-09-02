#!/usr/bin/env node
// Load the starter prizes (server/prizes.js) into an existing install. Safe to re-run.
//   node scripts/import-prizes.js
const path = require('path');
const { seedDefaults, DEFAULT_PRIZES } = require(path.join(__dirname, '..', 'server', 'prizes'));
const added = seedDefaults();
console.log(`Added ${added} prize(s); ${DEFAULT_PRIZES.length - added} already there.`);
