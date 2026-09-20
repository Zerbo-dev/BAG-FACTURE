const { bot } = require("../lib/bot");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).send("BAG Invoice Bot is running.");
    return;
  }

  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).send("Unauthorized");
    return;
  }

  try {
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error("Erreur webhook:", err);
  }
  res.status(200).send("ok");
};
