const { Telegraf, Markup, Input } = require("telegraf");
const { getState, setState, clearState, nextDocNumber } = require("./state");
const { extractInvoiceData } = require("./parseText");
const { renderInvoiceHtml } = require("../templates/invoice");
const { renderInvoice } = require("./render");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

function todayFr() {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Ouagadougou" }).format(new Date());
}

function emptyDoc(docType) {
  return {
    step: "await_client_name",
    docType,
    client: { name: "", address: "", phone: "" },
    items: [],
    tvaRate: 0,
  };
}

function itemsSummary(items) {
  if (!items.length) return "(aucune prestation pour le moment)";
  return items
    .map((it, i) => {
      const qty = it.quantity && it.quantity > 0 ? it.quantity : 1;
      const total = Number(it.unitPrice) * qty;
      return `${i + 1}. ${it.description} — ${it.unitPrice.toLocaleString("fr-FR")} FCFA${
        it.quantity && it.quantity > 1 ? ` x${it.quantity}` : ""
      } = ${total.toLocaleString("fr-FR")} FCFA`;
    })
    .join("\n");
}

function totalHT(items) {
  return items.reduce((sum, it) => {
    const qty = it.quantity && it.quantity > 0 ? it.quantity : 1;
    return sum + Number(it.unitPrice) * qty;
  }, 0);
}

function itemsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ Ajouter une prestation", "add_item")],
    [Markup.button.callback("✅ Terminer et voir l'aperçu", "items_done")],
  ]);
}

function confirmKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Confirmer et générer", "confirm")],
    [Markup.button.callback("➕ Ajouter une prestation", "add_item")],
    [Markup.button.callback("❌ Annuler", "cancel")],
  ]);
}

async function askClientName(ctx, docType) {
  await setState(ctx.chat.id, emptyDoc(docType));
  await ctx.reply(
    `D'accord, on prépare un *${docType}*.\n\nQuel est le nom du client ?`,
    { parse_mode: "Markdown" }
  );
}

async function goToItemsStep(ctx, state) {
  state.step = "await_items";
  await setState(ctx.chat.id, state);
  await ctx.reply(
    "Décris la ou les prestations, avec le prix (et la quantité si besoin).\n" +
      "Exemple : \"Diagnostic et repérage 25000, câblage du tableau électrique 55000\""
  );
}

async function showPreview(ctx, state) {
  state.step = "await_confirmation";
  await setState(ctx.chat.id, state);
  const total = totalHT(state.items);
  const tva = Math.round(total * (state.tvaRate / 100));
  await ctx.reply(
    `*Aperçu du ${state.docType}*\n\n` +
      `Client : ${state.client.name || "(non précisé)"}\n` +
      `Adresse : ${state.client.address || "-"}\n` +
      `Téléphone : ${state.client.phone || "-"}\n\n` +
      `Prestations :\n${itemsSummary(state.items)}\n\n` +
      `Total HT : ${total.toLocaleString("fr-FR")} FCFA\n` +
      `TVA (${state.tvaRate}%) : ${tva.toLocaleString("fr-FR")} FCFA\n` +
      `*Total : ${(total + tva).toLocaleString("fr-FR")} FCFA*`,
    { parse_mode: "Markdown", ...confirmKeyboard() }
  );
}

/** Decides what to ask next based on which fields are still missing. */
async function advanceAfterExtraction(ctx, state) {
  if (!state.client.name) {
    state.step = "await_client_name";
    await setState(ctx.chat.id, state);
    await ctx.reply("Quel est le nom du client ?");
    return;
  }
  if (!state.items || state.items.length === 0) {
    await goToItemsStep(ctx, state);
    return;
  }
  await showPreview(ctx, state);
}

bot.start((ctx) =>
  ctx.reply(
    "👋 Bienvenue chez *B.A.G Technology Service*.\n\n" +
      "Je peux te préparer un devis ou une facture de deux façons :\n\n" +
      "1️⃣ *Rapide* — décris tout en un message :\n" +
      '   "Devis pour M. Sawadogo, Kamboinsin, 70245268. Diagnostic 25000, câblage du tableau 55000"\n\n' +
      "2️⃣ *Guidé* — tape /devis ou /facture et je te pose les questions une par une.\n\n" +
      "Tape /annuler à tout moment pour recommencer.",
    { parse_mode: "Markdown" }
  )
);

bot.command("devis", (ctx) => askClientName(ctx, "devis"));
bot.command("facture", (ctx) => askClientName(ctx, "facture"));

bot.command("annuler", async (ctx) => {
  await clearState(ctx.chat.id);
  await ctx.reply("Ok, j'ai tout annulé. Tape /devis, /facture, ou décris directement ta demande.");
});

bot.action("add_item", async (ctx) => {
  await ctx.answerCbQuery();
  const state = await getState(ctx.chat.id);
  if (!state) return ctx.reply("Aucune commande en cours. Tape /devis ou /facture pour commencer.");
  await goToItemsStep(ctx, state);
});

bot.action("items_done", async (ctx) => {
  await ctx.answerCbQuery();
  const state = await getState(ctx.chat.id);
  if (!state) return;
  if (!state.items.length) {
    await ctx.reply("Il faut au moins une prestation avant de continuer.");
    return;
  }
  await showPreview(ctx, state);
});

bot.action("cancel", async (ctx) => {
  await ctx.answerCbQuery();
  await clearState(ctx.chat.id);
  await ctx.editMessageReplyMarkup(null).catch(() => {});
  await ctx.reply("Annulé. Tape /devis ou /facture pour recommencer.");
});

bot.action("confirm", async (ctx) => {
  await ctx.answerCbQuery();
  const state = await getState(ctx.chat.id);
  if (!state) return;

  await ctx.editMessageReplyMarkup(null).catch(() => {});
  const waitMsg = await ctx.reply("⏳ Génération du document en cours...");

  try {
    // Ne tire un nouveau numéro que si ce devis/facture n'en a pas déjà un
    // (évite de sauter des numéros si une tentative précédente a échoué)
    if (!state.number) {
      state.number = await nextDocNumber(state.docType);
      await setState(ctx.chat.id, state);
    }
    const number = state.number;

    const html = renderInvoiceHtml({
      docType: state.docType,
      number,
      date: todayFr(),
      client: state.client,
      items: state.items,
      tvaRate: state.tvaRate,
    });

    const { pdfBuffer, pngBuffer } = await renderInvoice(html);
    const label = state.docType === "facture" ? "Facture" : "Devis";
    const fileBase = `${label}_${number}_${(state.client.name || "client").replace(/\s+/g, "_")}`;

    await ctx.replyWithPhoto(Input.fromBuffer(pngBuffer, `${fileBase}.png`));
    await ctx.replyWithDocument(Input.fromBuffer(pdfBuffer, `${fileBase}.pdf`));
    await ctx.reply(`✅ ${label} n° ${number} généré(e) avec succès !`);

    await clearState(ctx.chat.id);
  } catch (err) {
    console.error(err);
    await ctx.reply(
      "❌ Une erreur est survenue pendant la génération. Retape sur *Confirmer et générer* pour réessayer — le même numéro sera réutilisé.",
      { parse_mode: "Markdown", ...confirmKeyboard() }
    );
  } finally {
    await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
  }
});
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return; // commande inconnue, on ignore

  const state = await getState(ctx.chat.id);

  // Pas de conversation en cours -> on tente l'extraction complete en mode libre
  if (!state) {
    await ctx.sendChatAction("typing");
    try {
      const extracted = await extractInvoiceData(text);
      const newState = {
        step: "collecting",
        docType: extracted.docType === "facture" ? "facture" : "devis",
        client: {
          name: extracted.client?.name || "",
          address: extracted.client?.address || "",
          phone: extracted.client?.phone || "",
        },
        items: (extracted.items || []).map((it) => ({
          description: it.description,
          unitPrice: Number(it.unitPrice) || 0,
          quantity: it.quantity ? Number(it.quantity) : null,
        })),
        tvaRate: Number(extracted.tvaRate) || 0,
      };
      await setState(ctx.chat.id, newState);
      await advanceAfterExtraction(ctx, newState);
    } catch (err) {
      console.error(err);
      await ctx.reply(
        "Je n'ai pas bien compris. Tu peux réessayer en décrivant client + prestations + prix, " +
          "ou taper /devis pour être guidé étape par étape."
      );
    }
    return;
  }

  switch (state.step) {
    case "await_client_name":
      state.client.name = text;
      state.step = "await_client_address";
      await setState(ctx.chat.id, state);
      await ctx.reply("Adresse du client ? (ou envoie \"-\" pour passer)");
      break;

    case "await_client_address":
      state.client.address = text === "-" ? "" : text;
      state.step = "await_client_phone";
      await setState(ctx.chat.id, state);
      await ctx.reply("Téléphone du client ? (ou envoie \"-\" pour passer)");
      break;

    case "await_client_phone":
      state.client.phone = text === "-" ? "" : text;
      await goToItemsStep(ctx, state);
      break;

    case "await_items": {
      await ctx.sendChatAction("typing");
      try {
        const extracted = await extractInvoiceData(text);
        const newItems = (extracted.items || []).map((it) => ({
          description: it.description,
          unitPrice: Number(it.unitPrice) || 0,
          quantity: it.quantity ? Number(it.quantity) : null,
        }));
        if (!newItems.length) {
          await ctx.reply("Je n'ai pas trouvé de prestation avec un prix. Réessaie, ex: \"Câblage 55000\".");
          return;
        }
        state.items.push(...newItems);
        await setState(ctx.chat.id, state);
        await ctx.reply(
          `Ajouté ✅\n\n${itemsSummary(state.items)}\n\nAutre chose à ajouter ?`,
          itemsKeyboard()
        );
      } catch (err) {
        console.error(err);
        await ctx.reply("Je n'ai pas compris cette prestation, réessaie avec le prix inclus.");
      }
      break;
    }

    case "collecting":
      // L'utilisateur complete une info manquante detectee apres extraction libre
      if (!state.client.name) {
        state.client.name = text;
        await advanceAfterExtraction(ctx, state);
      } else {
        // sinon on traite comme une nouvelle ligne de prestation
        await ctx.sendChatAction("typing");
        const extracted = await extractInvoiceData(text);
        const newItems = (extracted.items || []).map((it) => ({
          description: it.description,
          unitPrice: Number(it.unitPrice) || 0,
          quantity: it.quantity ? Number(it.quantity) : null,
        }));
        state.items.push(...newItems);
        await setState(ctx.chat.id, state);
        await advanceAfterExtraction(ctx, state);
      }
      break;

    case "await_confirmation":
      await ctx.reply("Utilise les boutons ci-dessus pour confirmer, ajouter une prestation ou annuler 👆");
      break;

    default:
      await clearState(ctx.chat.id);
      await ctx.reply("Tape /devis ou /facture pour commencer.");
  }
});

module.exports = { bot };
