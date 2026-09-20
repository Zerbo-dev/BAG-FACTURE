/**
 * Lance le bot EN LOCAL, sans Vercel ni tunnel (ngrok, etc.), en utilisant
 * le "long polling" de Telegram : le bot va lui-meme interroger Telegram
 * toutes les quelques secondes au lieu d'attendre un webhook.
 *
 * Usage:
 *   1. Copie .env.example en .env et remplis au moins TELEGRAM_BOT_TOKEN
 *      et les variables KV_REST_API_URL / KV_REST_API_TOKEN (Upstash).
 *   2. npm install
 *   3. npm run dev
 *
 * Note: la generation PDF/PNG (lib/render.js) telecharge un vrai
 * navigateur Chromium optimise pour Linux (l'environnement de Vercel).
 * Sur Linux ca fonctionne aussi tel quel en local. Sur macOS/Windows le
 * binaire telecharge peut ne pas s'executer - dans ce cas utilise
 * `npm run preview` (voir README) pour tester uniquement le rendu du
 * document sur ta machine, ou teste directement sur Vercel (gratuit).
 */
require("dotenv").config();
const { bot } = require("./lib/bot");

bot
  .launch()
  .then(() => {
    console.log("✅ Bot lancé en local (long polling). Va tester sur Telegram.");
    console.log("   Ctrl+C pour arrêter.");
  })
  .catch((err) => {
    console.error("Impossible de démarrer le bot:", err);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
