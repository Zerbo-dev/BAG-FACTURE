/**
 * Usage: node scripts/set-webhook.js https://ton-projet.vercel.app
 *
 * Enregistre l'URL de webhook aupres de Telegram, avec le secret
 * WEBHOOK_SECRET pour verifier que les requetes viennent bien de Telegram.
 * Necessite TELEGRAM_BOT_TOKEN et WEBHOOK_SECRET dans l'environnement
 * (charge-les avec `export $(cat .env | xargs)` ou copie-colle-les avant).
 */
const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/set-webhook.js https://ton-projet.vercel.app");
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.WEBHOOK_SECRET;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN manquant dans l'environnement.");
  process.exit(1);
}

async function main() {
  const endpoint = `https://api.telegram.org/bot${token}/setWebhook`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${url.replace(/\/$/, "")}/api/webhook`,
      secret_token: secret || undefined,
      drop_pending_updates: true,
    }),
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main();
