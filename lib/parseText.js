/**
 * Analyseur de texte 100% local (regex), sans aucun service externe payant.
 * Comprend des messages du type:
 *   "Devis pour M. Sawadogo, Kamboinsin, 70245268. Diagnostic 25000, câblage du tableau 55000"
 *   "Facture pour Awa Traore 78 12 34 56, peinture salon 40000 x2, tva 18%"
 *
 * C'est volontairement simple et previsible (pas d'IA) : moins souple qu'un
 * modele de langage sur des phrases tres libres, mais gratuit, rapide, et
 * sans surprise. L'etape "aperçu" avant generation permet de corriger si
 * une prestation a ete mal comprise.
 */

function normalizeNumber(raw) {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function detectDocType(text) {
  return /facture/i.test(text) ? "facture" : "devis";
}

function detectTvaRate(text) {
  const m = text.match(/tva\D{0,5}(\d{1,2})\s*%/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Un numero de telephone burkinabe: 8 chiffres (avec espaces/tirets
 * optionnels), avec ou sans indicatif +226.
 */
const PHONE_RE = /(\+?226[\s.-]?)?\b(\d[\s.-]?){7}\d\b/;

/**
 * Isole la partie "client" (avant les prestations) de la partie "items".
 * On cherche "pour <infos client>" ou "client <infos client>", puis on
 * coupe cette zone des qu'un numero de telephone est trouve (le telephone
 * est presque toujours la derniere info donnee sur le client). S'il n'y a
 * pas de telephone, on coupe a la premiere phrase.
 */
function splitClientAndItems(text) {
  const keywordMatch = text.match(/\b(?:pour|client)\s*[:\-]?\s*/i);
  if (!keywordMatch) {
    return { clientRegion: "", itemsPart: text };
  }

  const regionStart = keywordMatch.index + keywordMatch[0].length;
  const rest = text.slice(regionStart);

  const phoneMatch = rest.match(PHONE_RE);
  let clientRegion;
  let itemsPart;

  if (phoneMatch) {
    const cutAt = phoneMatch.index + phoneMatch[0].length;
    clientRegion = rest.slice(0, cutAt);
    itemsPart = rest.slice(cutAt);
  } else {
    const dotIdx = rest.indexOf(".");
    if (dotIdx !== -1) {
      clientRegion = rest.slice(0, dotIdx);
      itemsPart = rest.slice(dotIdx + 1);
    } else {
      clientRegion = rest;
      itemsPart = "";
    }
  }

  itemsPart = itemsPart.replace(/^\s*[.,]\s*/, "");
  return { clientRegion, itemsPart };
}

function parseClient(clientRegion) {
  const phoneMatch = (clientRegion || "").match(PHONE_RE);
  const phone = phoneMatch ? phoneMatch[0].trim() : "";

  const withoutPhone = (clientRegion || "").replace(PHONE_RE, "");
  const parts = withoutPhone
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const name = parts[0] || "";
  const address = parts.slice(1).join(", ");

  return { name, address, phone };
}

/**
 * Extrait les lignes de prestations depuis un texte (utilise a la fois pour
 * le message complet et pour l'etape "decris tes prestations" du mode guide).
 */
function parseItems(itemsPart) {
  if (!itemsPart || !itemsPart.trim()) return [];

  const chunks = itemsPart
    .split(/[,;\n]|(?:\bet\s+encore\b)/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const items = [];
  const priceRe = /(\d[\d\s.]{1,8}\d|\d{3,7})\s*(?:f\s?cfa|fcfa|francs?)?\s*$/i;
  const qtyRe = /(?:x|\*)\s*(\d{1,3})\s*$/i;

  for (const chunk of chunks) {
    // On ignore les fragments qui ne parlent que de TVA.
    if (/^tva\b/i.test(chunk)) continue;

    let working = chunk.replace(/\btva\D{0,5}\d{1,2}\s*%/i, "").trim();
    if (!working) continue;

    let quantity = null;
    const qtyMatch = working.match(qtyRe);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
      working = working.slice(0, qtyMatch.index).trim();
    }

    const priceMatch = working.match(priceRe);
    if (!priceMatch) continue; // pas de prix identifiable -> on ignore ce fragment

    const unitPrice = normalizeNumber(priceMatch[1]);
    const description = working.slice(0, priceMatch.index).trim().replace(/[-:]\s*$/, "").trim();

    if (!description || !unitPrice) continue;

    items.push({ description, unitPrice, quantity });
  }

  return items;
}

/**
 * Point d'entree principal, meme signature que l'ancienne version basee IA,
 * pour que le reste du bot n'ait rien a changer.
 */
function extractInvoiceData(text) {
  const docType = detectDocType(text);
  const tvaRate = detectTvaRate(text);
  const { clientRegion, itemsPart } = splitClientAndItems(text);
  const client = parseClient(clientRegion);
  const items = parseItems(itemsPart || text);

  return { docType, client, items, tvaRate };
}

module.exports = { extractInvoiceData };
