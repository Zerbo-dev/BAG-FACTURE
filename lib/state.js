const { Redis } = require("@upstash/redis");

const kv = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const STATE_TTL_SECONDS = 60 * 60 * 6; // 6h: une conversation abandonnee expire toute seule

function stateKey(chatId) {
  return `conv:${chatId}`;
}

async function getState(chatId) {
  const state = await kv.get(stateKey(chatId));
  return state || null;
}

async function setState(chatId, state) {
  await kv.set(stateKey(chatId), state, { ex: STATE_TTL_SECONDS });
}

async function clearState(chatId) {
  await kv.del(stateKey(chatId));
}

/**
 * Numerotation par type de document, remise a zero chaque 1er janvier
 * (le compteur est stocke par annee civile), formatee en NNNNNNN-MM/YY
 * (ex: 0000001-01/27 = 1er document du type emis en janvier 2027).
 */
async function nextDocNumber(docType) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const key = `counter:${docType}:${year}`;
  const n = await kv.incr(key);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(year).slice(-2);
  return `${String(n).padStart(7, "0")}-${mm}/${yy}`;
}

/**
 * Archive d'un document genere : infos client/montant + file_id Telegram
 * (le file_id permet de renvoyer le fichier plus tard sans le regenerer).
 */
async function saveInvoiceRecord(record) {
  const key = `invoice:${record.number}`;
  await kv.set(key, record);
  await kv.zadd("invoices:index", { score: Date.now(), member: record.number });
}

async function getInvoiceRecord(number) {
  return kv.get(`invoice:${number}`);
}

/** Les N derniers documents generes, plus recent d'abord. */
async function listRecentInvoices(limit = 10) {
  const numbers = await kv.zrange("invoices:index", 0, limit - 1, { rev: true });
  if (!numbers.length) return [];
  const records = await Promise.all(numbers.map((n) => getInvoiceRecord(n)));
  return records.filter(Boolean);
}

module.exports = {
  getState,
  setState,
  clearState,
  nextDocNumber,
  saveInvoiceRecord,
  getInvoiceRecord,
  listRecentInvoices,
};