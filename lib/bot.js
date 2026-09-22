const { Telegraf, Markup, Input } = require("telegraf");
const {
  getState,
  setState,
  clearState,
  nextDocNumber,
  saveInvoiceRecord,
} = require("./state");
const { extractInvoiceData } = require("./parseText");
const { renderInvoiceHtml } = require("../templates/invoice");
const { renderInvoice } = require("./render");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ARCHIVE_CHANNEL_ID = process.env.ARCHIVE_CHANNEL_ID;
const MAX_ITEMS = 8; // au-dela, risque de depasser le cadre fixe de la page
const DOC_LABELS = { devis: "Devis", facture: "Facture", proforma: "Proforma" };

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
    number: null,
    echeance: null,
    termsAndConditions: null,
    garantie: null,
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
    [Markup.button.callback("🛠️ Gérer les prestations", "manage_items")],
    [Markup.button.callback("✅ Terminer et voir l'aperçu", "items_done")],
  ]);
}

function confirmKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Confirmer et générer", "confirm")],
    [Markup.button.callback("➕ Ajouter une prestation", "add_item")],
    [Markup.button.callback("🛠️ Gérer les prestations", "manage_items")],
    [Markup.button.callback("❌ Annuler", "cancel")],
  ]);
}

function manageItemsKeyboard(items) {
  const rows = items.map((it, i) => [
    Markup.button.callback("✏️", `edit_item_${i}`),
    Markup.button.callback(`🗑️ ${i + 1}. ${it.description.slice(0, 22)}`, `del_item_${i}`),
  ]);
  rows.push([Markup.button.callback("⬅️ Retour", "back_from_manage")]);
  return Markup.inlineKeyboard(rows);
}

async function askClientName(ctx, docType) {
  await setState(ctx.chat.id, emptyDoc(docType));
  await ctx.reply(
    `D'accord, on prépare un *${DOC_LABELS[docType].toLowerCase()}*.\n\nQuel est le nom du client ?`,
    { parse_mode: "Markdown" }
  );
}

async function goToItemsStep(ctx, state) {
  state.step = "await_items";
  await setState(ctx.chat.id, state);
  await ctx.reply(
    "Décris la ou les prestations, avec le prix (et la quantité si besoin).\n" +
      "Exemple : \"Diagnostic et repérage 25000, câblage du tableau électrique 55000\"",
    itemsKeyboard()
  );
}

async function askEcheance(ctx, state) {
  state.step = "await_echeance";
  await setState(ctx.chat.id, state);
  await ctx.reply("Quelle est la date d'échéance de cette proforma ? (ex: 20/10/2026)");
}

async function askTerms(ctx, state) {
  state.step = "await_terms";
  await setState(ctx.chat.id, state);
  await ctx.reply(
    "Quels sont les termes et conditions à afficher ? (ou envoie \"-\" pour ne rien mettre)"
  );
}

async function askGarantie(ctx, state) {
  state.step = "await_garantie";
  await setState(ctx.chat.id, state);
  await ctx.reply(
    "Quelle garantie s'applique à ce document ? (ou envoie \"-\" pour ne rien mettre)"
  );
}

async function showPreview(ctx, state) {
  state.step = "await_confirmation";
  await setState(ctx.chat.id, state);
  const total = totalHT(state.items);
  const tva = Math.round(total * (state.tvaRate / 100));
  const echeanceLine = state.docType === "proforma" ? `Échéance : ${state.echeance}\n` : "";
  const termsLine = state.termsAndConditions ? `Termes : ${state.termsAndConditions}\n` : "";
  const garantieLine = state.garantie ? `Garantie : ${state.garantie}\n` : "";
  await ctx.reply(
    `*Aperçu du ${DOC_LABELS[state.docType].toLowerCase()}*\n\n` +
      `Client : ${state.client.name || "(non précisé)"}\n` +
      `Adresse : ${state.client.address || "-"}\n` +
      `Téléphone : ${state.client.phone || "-"}\n` +
      echeanceLine +
      termsLine +
      garantieLine +
      `\nPrestations :\n${itemsSummary(state.items)}\n\n` +
      `Total HT : ${total.toLocaleString("fr-FR")} FCFA\n` +
      `TVA (${state.tvaRate}%) : ${tva.toLocaleString("fr-FR")} FCFA\n` +
      `*Total : ${(total + tva).toLocaleString("fr-FR")} FCFA*`,
    { parse_mode: "Markdown", ...confirmKeyboard() }
  );
}

/**
 * Une fois les prestations pretes, on pose les questions restantes dans
 * l'ordre (echeance pour une proforma, puis termes, puis garantie -- ces
 * deux derniers pour devis et proforma seulement, jamais pour une facture),
 * et on passe a l'apercu une fois tout renseigne.
 */
async function afterItemsCollected(ctx, state) {
  if (state.docType === "proforma" && !state.echeance) {
    await askEcheance(ctx, state);
    return;
  }
  if (state.docType !== "facture" && state.termsAndConditions === null) {
    await askTerms(ctx, state);
    return;
  }
  if (state.docType !== "facture" && state.garantie === null) {
    await askGarantie(ctx, state);
    return;
  }
  await showPreview(ctx, state);
}

/** Ramene l'utilisateur a la vue appropriee apres une action sur les prestations. */
async function backToRelevantView(ctx, state) {
  if (state.step === "await_confirmation" || state.manageReturnStep === "await_confirmation") {
    await afterItemsCollected(ctx, state);
  } else {
    state.step = "await_items";
    await setState(ctx.chat.id, state);
    await ctx.reply(`Prestations actuelles :\n${itemsSummary(state.items)}`, itemsKeyboard());
  }
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
  await afterItemsCollected(ctx, state);
}

bot.start((ctx) =>
  ctx.reply(
    "👋 Bienvenue chez *B.A.G Technology Service*.\n\n" +
      "Je peux te préparer un devis, une facture ou une facture proforma de deux façons :\n\n" +
      "1️⃣ *Rapide* — décris tout en un message :\n" +
      '   "Devis pour M. Sawadogo, Kamboinsin, 70245268. Diagnostic 25000, câblage du tableau 55000"\n\n' +
      "2️⃣ *Guidé* — tape /devis, /facture ou /proforma et je te pose les questions une par une.\n\n" +
      "Tape /annuler à tout moment pour recommencer.",
    { parse_mode: "Markdown" }
  )
);

bot.command("devis", (ctx) => askClientName(ctx, "devis"));
bot.command("facture", (ctx) => askClientName(ctx, "facture"));
bot.command("proforma", (ctx) => askClientName(ctx, "proforma"));

bot.command("annuler", async (ctx) => {
  await clearState(ctx.chat.id);
  await ctx.reply("Ok, j'ai tout annulé. Tape /devis, /facture, /proforma, ou décris directement ta demande.");
});

bot.action("add_item", async (ctx) => {
  await ctx.answerCbQuery();
  const state = await getState(ctx.chat.id);
  if (!state) return ctx.reply("Aucune commande en cours. Tape /devis, /facture ou /proforma pour commencer.");
  if (state.items.length >= MAX_ITEMS) {
    return ctx.reply(
      `Limite de ${MAX_ITEMS} prestations atteinte pour garder le document sur une seule page. ` +
        "Supprime une ligne avant d'en ajouter une nouvelle (🛠️ Gérer les prestations)."
    );
  }
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
  await afterItemsCollected(ctx, state);
});

bot.action("manage_items", async (ctx) => {
  await ctx.answerCbQuery();
  const state = await getState(ctx.chat.id);
  if (!state) return;
  if (!state.items.length) {
    await ctx.reply("Aucune prestation à gérer pour le moment.");
    return;
  }
  state.manageReturnStep = state.step;
  await setState(ctx.chat.id, state);
  await ctx.reply(
    "Modifie (✏️) ou supprime (🗑️) une prestation :",
    manageItemsKeyboard(state.items)
  );
});

bot.action("back_from_manage", async (ctx) => {
  await ctx.answerCbQuery();
  const state = await getState(ctx.chat.id);
  if (!state) return;
  await backToRelevantView(ctx, state);
});

bot.action(/^del_item_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const state = await getState(ctx.chat.id);
  if (!state) return;
  const idx = Number(ctx.match[1]);
  if (idx < 0 || idx >= state.items.length) return;

  const removed = state.items.splice(idx, 1)[0];
  await setState(ctx.chat.id, state);

  if (!state.items.length) {
    await ctx.reply(`Supprimé : ${removed.description}`);
    await goToItemsStep(ctx, state);
  } else {
    await ctx.editMessageText(
      `Supprimé : ${removed.description}\n\nModifie (✏️) ou supprime (🗑️) une prestation :`,
      manageItemsKeyboard(state.items)
    ).catch(() => ctx.reply("Modifie ou supprime une prestation :", manageItemsKeyboard(state.items)));
  }
});

bot.action(/^edit_item_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const state = await getState(ctx.chat.id);
  if (!state) return;
  const idx = Number(ctx.match[1]);
  if (idx < 0 || idx >= state.items.length) return;

  state.editIndex = idx;
  state.step = "await_item_edit";
  await setState(ctx.chat.id, state);
  await ctx.reply(
    `Renvoie la nouvelle description + prix pour remplacer :\n"${state.items[idx].description}"\n\n` +
      'Exemple : "Câblage complet 60000"'
  );
});

bot.action("cancel", async (ctx) => {
  await ctx.answerCbQuery();
  await clearState(ctx.chat.id);
  await ctx.editMessageReplyMarkup(null).catch(() => {});
  await ctx.reply("Annulé. Tape /devis, /facture ou /proforma pour recommencer.");
});

bot.action("confirm", async (ctx) => {
  await ctx.answerCbQuery();
  const state = await getState(ctx.chat.id);
  if (!state) return;

  await ctx.editMessageReplyMarkup(null).catch(() => {});
  const waitMsg = await ctx.reply("⏳ Génération du document en cours...");

  try {
    // Le numero n'est tire qu'une seule fois : une tentative ratee reutilise le meme.
    if (!state.number) {
      state.number = await nextDocNumber(state.docType);
      await setState(ctx.chat.id, state);
    }
    const number = state.number;

    const html = renderInvoiceHtml({
      docType: state.docType,
      number,
      date: todayFr(),
      echeance: state.echeance,
      termsAndConditions: state.termsAndConditions,
      garantie: state.garantie,
      client: state.client,
      items: state.items,
      tvaRate: state.tvaRate,
    });

    const { pdfBuffer, pngBuffer } = await renderInvoice(html);
    const label = DOC_LABELS[state.docType];
    const fileBase = `${label}_${number}_${(state.client.name || "client").replace(/\s+/g, "_")}`;

    const sentPhoto = await ctx.replyWithPhoto(Input.fromBuffer(pngBuffer, `${fileBase}.png`));
    const sentDoc = await ctx.replyWithDocument(Input.fromBuffer(pdfBuffer, `${fileBase}.pdf`));
    await ctx.reply(`✅ ${label} n° ${number} généré(e) avec succès !`);

    // Archivage : canal Telegram + enregistrement Redis (numero, client, montant, file_ids).
    let archivePhotoFileId = null;
    let archiveDocFileId = null;
    if (ARCHIVE_CHANNEL_ID) {
      try {
        const archPhoto = await bot.telegram.sendPhoto(
          ARCHIVE_CHANNEL_ID,
          Input.fromBuffer(pngBuffer, `${fileBase}.png`),
          { caption: `${label} n° ${number} — ${state.client.name || "client"}` }
        );
        const archDoc = await bot.telegram.sendDocument(
          ARCHIVE_CHANNEL_ID,
          Input.fromBuffer(pdfBuffer, `${fileBase}.pdf`)
        );
        archivePhotoFileId = archPhoto.photo?.at(-1)?.file_id || null;
        archiveDocFileId = archDoc.document?.file_id || null;
      } catch (archErr) {
        console.error("Archivage canal échoué:", archErr.message);
      }
    }

    const total = totalHT(state.items);
    const tva = Math.round(total * (state.tvaRate / 100));
    await saveInvoiceRecord({
      number,
      docType: state.docType,
      date: todayFr(),
      echeance: state.echeance,
      termsAndConditions: state.termsAndConditions,
      garantie: state.garantie,
      client: state.client,
      items: state.items,
      totalHT: total,
      tvaRate: state.tvaRate,
      totalTTC: total + tva,
      chatId: ctx.chat.id,
      photoFileId: sentPhoto.photo?.at(-1)?.file_id || null,
      documentFileId: sentDoc.document?.file_id || null,
      archivePhotoFileId,
      archiveDocFileId,
      createdAt: new Date().toISOString(),
    });

    await clearState(ctx.chat.id);
  } catch (err) {
    console.error(err);
    await ctx.reply(
      "❌ Une erreur est survenue pendant la génération. Retape sur *Confirmer et générer* — le même numéro sera réutilisé.",
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
      const docType = ["facture", "proforma"].includes(extracted.docType) ? extracted.docType : "devis";
      const newState = {
        step: "collecting",
        docType,
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
        number: null,
        echeance: null,
        termsAndConditions: null,
        garantie: null,
      };
      await setState(ctx.chat.id, newState);
      await advanceAfterExtraction(ctx, newState);
    } catch (err) {
      console.error(err);
      await ctx.reply(
        "Je n'ai pas bien compris. Tu peux réessayer en décrivant client + prestations + prix, " +
          "ou taper /devis, /facture ou /proforma pour être guidé étape par étape."
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
      if (state.items.length >= MAX_ITEMS) {
        await ctx.reply(
          `Limite de ${MAX_ITEMS} prestations atteinte. Supprime une ligne (🛠️ Gérer les prestations) avant d'en ajouter.`
        );
        return;
      }
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

    case "await_item_edit": {
      await ctx.sendChatAction("typing");
      try {
        const extracted = await extractInvoiceData(text);
        const newItem = (extracted.items || [])[0];
        if (!newItem) {
          await ctx.reply("Je n'ai pas trouvé de prix dans ce texte. Réessaie, ex: \"Câblage 60000\".");
          return;
        }
        state.items[state.editIndex] = {
          description: newItem.description,
          unitPrice: Number(newItem.unitPrice) || 0,
          quantity: newItem.quantity ? Number(newItem.quantity) : null,
        };
        delete state.editIndex;
        await setState(ctx.chat.id, state);
        await ctx.reply(`Modifié ✅\n\n${itemsSummary(state.items)}`);
        await backToRelevantView(ctx, state);
      } catch (err) {
        console.error(err);
        await ctx.reply("Je n'ai pas compris, réessaie avec le prix inclus.");
      }
      break;
    }

    case "await_echeance": {
      state.echeance = text;
      await setState(ctx.chat.id, state);
      await afterItemsCollected(ctx, state);
      break;
    }

    case "await_terms": {
      state.termsAndConditions = text === "-" ? "" : text;
      await setState(ctx.chat.id, state);
      await afterItemsCollected(ctx, state);
      break;
    }

    case "await_garantie": {
      state.garantie = text === "-" ? "" : text;
      await setState(ctx.chat.id, state);
      await afterItemsCollected(ctx, state);
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
      await ctx.reply("Utilise les boutons ci-dessus pour confirmer, ajouter/gérer une prestation ou annuler 👆");
      break;

    default:
      await clearState(ctx.chat.id);
      await ctx.reply("Tape /devis, /facture ou /proforma pour commencer.");
  }
});

module.exports = { bot };