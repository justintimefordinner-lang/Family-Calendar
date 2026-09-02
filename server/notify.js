// Parent notifications via ntfy (https://ntfy.sh): the Pi publishes to a private topic,
// parents subscribe to it in the ntfy phone app. Notifications carry signed action
// buttons so a chore can be paid or rejected straight from the notification.
const os = require('os');
const crypto = require('crypto');
const settings = require('./settings');
const { PORT } = require('./config');

function baseUrl() {
  const configured = settings.get('app_url');
  if (configured) return String(configured).replace(/\/+$/, '');
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) return `http://${i.address}:${PORT}`;
    }
  }
  return `http://localhost:${PORT}`;
}

function actionToken(completionId, action) {
  return crypto.createHmac('sha256', settings.sessionSecret()).update(`${action}:${completionId}`).digest('hex').slice(0, 32);
}

function verifyActionToken(completionId, action, token) {
  const expected = actionToken(completionId, action);
  return typeof token === 'string' && token.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function isConfigured() {
  return Boolean(settings.get('ntfy_topic'));
}

async function send({ title, message, tags = [], click, actions = [], priority = 3 }) {
  const topic = settings.get('ntfy_topic');
  if (!topic) return false;
  const server = String(settings.get('ntfy_server') || 'https://ntfy.sh').replace(/\/+$/, '');
  const res = await fetch(server, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, title, message, tags, click, actions, priority }),
  });
  if (!res.ok) throw new Error(`ntfy responded ${res.status}`);
  return true;
}

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

async function choreCompleted(completion, chore, member) {
  const url = baseUrl();
  const act = (action) => `${url}/api/chores/completions/${completion.id}/action?do=${action}&t=${actionToken(completion.id, action)}`;
  return send({
    title: `${member.name} finished: ${chore.title}`,
    message: `${money(chore.amount_cents)} to pay out. Approve or reject from here, or open the parent app.`,
    tags: ['moneybag'],
    click: `${url}/parent/#chores`,
    actions: [
      { action: 'http', label: `Pay ${money(chore.amount_cents)}`, url: act('approve'), method: 'POST', clear: true },
      { action: 'http', label: 'Reject', url: act('reject'), method: 'POST', clear: true },
      { action: 'view', label: 'Open app', url: `${url}/parent/#chores` },
    ],
  });
}

async function test() {
  return send({
    title: 'Family Calendar',
    message: 'Notifications are working. You will get one here whenever a kid finishes an Earn Money chore.',
    tags: ['tada'],
    click: `${baseUrl()}/parent/`,
  });
}

module.exports = { baseUrl, isConfigured, send, choreCompleted, test, verifyActionToken };
