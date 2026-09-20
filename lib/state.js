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
 * Numerotation continue des devis et factures, remise a zero jamais
 * automatiquement (compteur persistant dans le KV).
 */
async function nextDocNumber(docType) {
  const key = docType === "facture" ? "counter:facture" : "counter:devis";
  const n = await kv.incr(key);
  return String(n).padStart(4, "0");
}

module.exports = { getState, setState, clearState, nextDocNumber };
