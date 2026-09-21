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
 * Burkina Faso = UTC+0 toute l'annee (pas de changement d'heure),
 * donc les composantes UTC de Date correspondent directement a l'heure locale.
 */
function currentYearMonth() {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}

/**
 * Numerotation mensuelle : YYMMNNNN (ex: 25010001 = 1ere facture de janvier 2025).
 * Le compteur repart a 0001 chaque mois, separement pour devis et facture.
 */
async function nextDocNumber(docType) {
  const ym = currentYearMonth();
  const key = `counter:${docType}:${ym}`;
  const n = await kv.incr(key);
  return `${ym}${String(n).padStart(4, "0")}`;
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