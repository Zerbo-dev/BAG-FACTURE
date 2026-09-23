const company = require("../lib/company");

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function formatMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("fr-FR").replace(/\u202f/g, " ");
}

const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1350;

// Capacites d'items par type de page, recalculees a partir des dimensions
// CSS reelles (paddings, tailles de police, hauteur de ligne ~46px/ligne),
// avec le footer desormais present sur CHAQUE page. Gardees volontairement
// avec un peu de marge de securite (le depassement est silencieusement
// coupe par overflow:hidden), a affiner apres test reel si besoin.
const SINGLE_PAGE_ITEM_LIMIT = 9; // tout tient sur 1 page (en-tete + total + paiement + signature + footer)
const FIRST_PAGE_ITEM_LIMIT = 12; // page 1 quand pagination necessaire (en-tete + table + footer, pas de total)
const MIDDLE_PAGE_ITEM_LIMIT = 18; // page de continuation pure (bandeau reduit + table + footer)
const LAST_ONLY_ITEM_LIMIT = 10; // derniere page quand elle n'est pas la page 1 (bandeau reduit + table + total + footer)

function docLabelFor(docType) {
  if (docType === "facture") return "Facture";
  if (docType === "proforma") return "Facture Proforma";
  return "Devis";
}

/**
 * Repartit les prestations sur autant de pages que necessaire.
 * - 1 seule page si tout tient dans SINGLE_PAGE_ITEM_LIMIT (cas courant).
 * - Sinon : page 1 (en-tete complet, FIRST_PAGE_ITEM_LIMIT items), pages de
 *   continuation (bandeau reduit, MIDDLE_PAGE_ITEM_LIMIT items chacune),
 *   derniere page (bandeau reduit + totaux/paiement/signature).
 */
function paginateItems(items) {
  if (items.length <= SINGLE_PAGE_ITEM_LIMIT) {
    return [{ items, isFirst: true, isLast: true }];
  }

  const pages = [];
  const remaining = items.slice();

  const page1Items = remaining.splice(0, FIRST_PAGE_ITEM_LIMIT);
  pages.push({ items: page1Items, isFirst: true, isLast: false });

  while (remaining.length > LAST_ONLY_ITEM_LIMIT) {
    const chunk = remaining.splice(0, MIDDLE_PAGE_ITEM_LIMIT);
    pages.push({ items: chunk, isFirst: false, isLast: false });
  }

  if (remaining.length === 0) {
    pages[pages.length - 1].isLast = true;
  } else {
    pages.push({ items: remaining, isFirst: false, isLast: true });
  }

  return pages;
}

/**
 * Sur une facture, le ou les modes de paiement sont choisis par
 * l'utilisateur a la generation (plusieurs possibles), donc on
 * n'affiche que ceux-la. Sur devis/proforma (rien n'est encore
 * decide), on affiche les deux options possibles par defaut.
 */
function paymentInfoHtml(data) {
  const MODE_BLOCKS = {
    "Virement bancaire": () => `
      <p>Paiement par virement bancaire</p>
      <p>Compte : ${escapeHtml(company.paymentBankAccount)}</p>`,
    "Orange Money": () => `
      <p>Paiement par Orange Money</p>
      <p>${escapeHtml(company.paymentOrangeMoney)}</p>`,
    "Espèces": () => `<p>Paiement en esp\u00e8ces</p>`,
  };

  if (data.docType === "facture" && Array.isArray(data.paymentModes) && data.paymentModes.length) {
    return data.paymentModes
      .map((mode, i) => {
        const block = MODE_BLOCKS[mode];
        if (!block) return "";
        const spacer = i > 0 ? '<div style="margin-top:8px;"></div>' : "";
        return spacer + block();
      })
      .join("");
  }

  return `${MODE_BLOCKS["Virement bancaire"]()}
          <div style="margin-top:8px;"></div>
          ${MODE_BLOCKS["Orange Money"]()}`;
}

function itemRowsHtml(items) {
  return items
    .map((it) => {
      const qty = it.quantity && Number(it.quantity) > 0 ? Number(it.quantity) : 1;
      const total = Number(it.unitPrice) * qty;
      const qtyDisplay = it.quantity && Number(it.quantity) > 0 ? qty : "-";
      return `
        <tr>
          <td class="desc">${escapeHtml(it.description)}</td>
          <td class="num">${formatMoney(it.unitPrice)}</td>
          <td class="num">${qtyDisplay}</td>
          <td class="num">${formatMoney(total)}</td>
        </tr>`;
    })
    .join("");
}

function tableHtml(pageItems) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <td>Description</td>
            <td class="num">Prix unitaire</td>
            <td class="num">Quantit\u00e9</td>
            <td class="num">Total HT</td>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml(pageItems)}
        </tbody>
      </table>
    </div>`;
}

function fullHeaderHtml(docLabel, data) {
  return `
    <div class="header">
      <svg class="wave" viewBox="0 0 1080 90" preserveAspectRatio="none" height="90">
        <path d="M0,40 C 250,90 750,0 1080,55 L1080,90 L0,90 Z" fill="#c81e3b"/>
        <path d="M0,55 C 250,100 750,15 1080,68 L1080,90 L0,90 Z" fill="#ffffff"/>
      </svg>
      <div class="doc-title">${docLabel} n\u00b0 ${escapeHtml(data.number)}</div>
      <img class="logo" src="${company.logoDataUri}" />
    </div>
    <div class="info-row">
      <div class="client-block">
        <div class="client-label">Client: <span>${escapeHtml(data.client?.name || "")}</span></div>
        <p>${escapeHtml(data.client?.address || "")}</p>
        <p>${escapeHtml(data.client?.phone || "")}</p>
      </div>
      <div class="company-block">
        <p>${escapeHtml(company.address)}</p>
        <p>${escapeHtml(company.phone)}</p>
        <p>${escapeHtml(company.email)}</p>
      </div>
    </div>`;
}

/**
 * Bandeau reduit pour les pages 2+. Rappelle juste le numero de document,
 * SANS mention "(suite)".
 */
function continuationHeaderHtml(docLabel, data) {
  return `
    <div class="header-continuation">
      ${docLabel} n\u00b0 ${escapeHtml(data.number)}
    </div>`;
}

function totalsAndSummaryHtml(data, totalHT, tvaRate, tvaAmount, totalTTC) {
  const showTerms = Boolean(data.termsAndConditions);
  const showGarantie = Boolean(data.garantie);

  return `
    <div class="summary">
      <table>
        <tr><td>total</td><td>${formatMoney(totalHT)}</td></tr>
        <tr><td>TVA (${tvaRate}%)</td><td>${formatMoney(tvaAmount)}</td></tr>
      </table>
    </div>

    <div class="total-bar">
      <span>Total</span>
      <span>${formatMoney(totalTTC)}</span>
    </div>

    <div class="bottom-row">
      <div class="payment-block">
        <div class="section">
          <h3>Informations de paiement</h3>
          ${paymentInfoHtml(data)}
        </div>
        ${showTerms ? `
        <div class="section">
          <h3>Termes &amp; conditions</h3>
          <p>${escapeHtml(data.termsAndConditions)}</p>
        </div>` : ""}
        ${showGarantie ? `
        <div class="section">
          <h3>Garantie</h3>
          <p>${escapeHtml(data.garantie)}</p>
        </div>` : ""}
      </div>
      <div class="sig-box">
        <div class="date-line">Date: ${escapeHtml(data.date || "")}</div>
        <div>Signature:</div>
        <img class="signature-img" src="${company.signatureDataUri}" />
      </div>
    </div>`;
}

/**
 * Pied de page : desormais affiche sur CHAQUE page (avant, seulement la
 * derniere page l'avait).
 */
function footerHtml() {
  return `
    <div class="footer">
      RCCM : ${escapeHtml(company.rccm)} | IFU : ${escapeHtml(company.ifu)} | N\u00b0 S\u00e9curit\u00e9 sociale : ${escapeHtml(company.socialSecurity)}
    </div>`;
}

/**
 * data = {
 *   docType: "devis" | "facture" | "proforma",
 *   number: "0000001-09/26",
 *   date: "20/09/2026",
 *   paymentModes: ["Virement bancaire", "Orange Money"], // facture seulement, un ou plusieurs
 *   termsAndConditions: "...",   // saisi par l'utilisateur, tous types
 *   garantie: "...",             // saisi par l'utilisateur, tous types
 *   client: { name, address, phone },
 *   items: [{ description, unitPrice, quantity }],
 *   tvaRate: 0
 * }
 */
function renderInvoiceHtml(data) {
  const docLabel = docLabelFor(data.docType);
  const items = data.items || [];

  const totalHT = items.reduce((sum, it) => {
    const qty = it.quantity && Number(it.quantity) > 0 ? Number(it.quantity) : 1;
    return sum + Number(it.unitPrice) * qty;
  }, 0);
  const tvaRate = Number(data.tvaRate) || 0;
  const tvaAmount = Math.round(totalHT * (tvaRate / 100));
  const totalTTC = totalHT + tvaAmount;

  const pages = paginateItems(items);

  const pagesHtml = pages
    .map((page, idx) => {
      const isLastPage = idx === pages.length - 1;
      const header = page.isFirst
        ? fullHeaderHtml(docLabel, data)
        : continuationHeaderHtml(docLabel, data);
      const table = tableHtml(page.items);
      const summary = page.isLast
        ? totalsAndSummaryHtml(data, totalHT, tvaRate, tvaAmount, totalTTC)
        : "";
      const pageBreakClass = isLastPage ? "" : " page-break";

      return `
      <div class="page${pageBreakClass}">
        <div class="page-content">
          ${header}
          ${table}
          ${summary}
        </div>
        ${footerHtml()}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${PAGE_WIDTH}px; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1a2140;
    background: #ffffff;
  }

  /* Une page physique = un bloc de hauteur FIXE. La derniere n'a pas de
     saut de page force apres elle (evite une page blanche finale). */
  .page {
    width: ${PAGE_WIDTH}px;
    height: ${PAGE_HEIGHT}px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .page-break { page-break-after: always; }
  .page-content { flex: 1 0 auto; }
  .footer { flex: 0 0 auto; }

  .header {
    position: relative;
    background: #2a2f66;
    padding: 48px 56px 90px 56px;
    overflow: hidden;
  }
  .wave {
    position: absolute;
    left: 0; right: 0; bottom: -2px;
    width: 100%;
    display: block;
  }
  .doc-title {
    color: #ffffff;
    font-size: 34px;
    font-weight: 700;
    position: relative;
    z-index: 2;
  }
  .logo {
    position: absolute;
    top: 40px;
    right: 56px;
    width: 130px;
    height: 130px;
    border-radius: 16px;
    object-fit: cover;
    z-index: 3;
    box-shadow: 0 6px 18px rgba(0,0,0,0.35);
  }

  /* Bandeau reduit pour les pages 2+ : pas de logo, pas de vague,
     juste le rappel du numero de document (sans mention "suite"). */
  .header-continuation {
    background: #2a2f66;
    color: #ffffff;
    font-size: 20px;
    font-weight: 700;
    padding: 22px 56px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 32px 56px 8px 56px;
  }
  .client-block { max-width: 55%; }
  .client-label { font-weight: 700; font-size: 17px; margin-bottom: 10px; }
  .client-label span { font-weight: 400; }
  .client-block p { font-size: 15px; line-height: 1.5; color: #2a2f66; }
  .company-block { text-align: right; font-size: 15px; line-height: 1.5; color: #2a2f66; }

  .table-wrap { padding: 36px 56px 0 56px; }
  table { width: 100%; border-collapse: collapse; }
  thead td {
    border: 2px solid #c81e3b;
    border-radius: 999px;
    font-weight: 700;
    font-size: 16px;
    padding: 14px 18px;
  }
  thead td:first-child { border-radius: 999px 0 0 999px; border-right: none; }
  thead td:last-child { border-radius: 0 999px 999px 0; border-left: none; }
  thead td:not(:first-child):not(:last-child) { border-left: none; border-right: none; }
  tbody td { padding: 14px 18px; font-size: 15px; }
  .num { text-align: right; }
  thead .num { text-align: right; }
  .desc { color: #2a2f66; }

  .summary {
    display: flex;
    justify-content: flex-end;
    padding: 10px 56px 0 56px;
  }
  .summary table { width: 320px; }
  .summary td { padding: 6px 0; font-size: 16px; }
  .summary td:first-child { color: #2a2f66; }
  .summary td:last-child { text-align: right; font-weight: 600; }

  .total-bar {
    margin: 28px 56px 0 56px;
    background: #c81e3b;
    color: #ffffff;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 28px;
    border-radius: 8px;
    font-size: 22px;
    font-weight: 700;
  }

  .bottom-row {
    display: flex;
    justify-content: space-between;
    padding: 34px 56px 0 56px;
    gap: 40px;
  }
  .payment-block { font-size: 14px; line-height: 1.6; max-width: 55%; }
  .payment-block h3 { font-size: 16px; margin-bottom: 8px; }
  .payment-block .section { margin-bottom: 16px; }
  .sig-box {
    border: 2px solid #c81e3b;
    border-radius: 14px;
    width: 340px;
    min-height: 220px;
    padding: 20px 24px;
    font-size: 15px;
    font-weight: 600;
    position: relative;
  }
  .sig-box .date-line { margin-bottom: 30px; }
  .signature-img {
    position: absolute;
    right: 10px;
    bottom: 20px;
    width: 220px;
    height: auto;
    pointer-events: none;
  }

  .footer {
    padding: 18px 56px;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    color: #1a2140;
  }
</style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;
}

module.exports = { renderInvoiceHtml, PAGE_WIDTH, PAGE_HEIGHT };