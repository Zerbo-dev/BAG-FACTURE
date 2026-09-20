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

/**
 * data = {
 *   docType: "devis" | "facture",
 *   number: "0006",
 *   date: "20/09/2026",
 *   client: { name, address, phone },
 *   items: [{ description, unitPrice, quantity }],
 *   tvaRate: 0
 * }
 */
function renderInvoiceHtml(data) {
  const docLabel = data.docType === "facture" ? "Facture" : "Devis";
  const items = data.items || [];

  const rows = items
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

  const totalHT = items.reduce((sum, it) => {
    const qty = it.quantity && Number(it.quantity) > 0 ? Number(it.quantity) : 1;
    return sum + Number(it.unitPrice) * qty;
  }, 0);
  const tvaRate = Number(data.tvaRate) || 0;
  const tvaAmount = Math.round(totalHT * (tvaRate / 100));
  const totalTTC = totalHT + tvaAmount;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1a2140;
    width: 1080px;
    background: #ffffff;
  }
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
  thead tr { }
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
    min-height: 160px;
    padding: 20px 24px;
    font-size: 15px;
    font-weight: 600;
  }
  .sig-box .date-line { margin-bottom: 60px; }

  .footer {
    margin-top: 50px;
    padding: 18px 56px;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    color: #1a2140;
  }
</style>
</head>
<body>
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
  </div>

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
        ${rows}
      </tbody>
    </table>
  </div>

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
        <p>Paiement par virement bancaire</p>
        <p>Compte : ${escapeHtml(company.paymentBankAccount)}</p>
        <p style="margin-top:8px;">Paiement par Orange Money</p>
        <p>${escapeHtml(company.paymentOrangeMoney)}</p>
      </div>
      <div class="section">
        <h3>Termes &amp; conditions</h3>
        <p>${escapeHtml(company.termsAndConditions)}</p>
      </div>
    </div>
    <div class="sig-box">
      <div class="date-line">Date: ${escapeHtml(data.date || "")}</div>
      <div>Signature:</div>
    </div>
  </div>

  <div class="footer">
    RCCM : ${escapeHtml(company.rccm)} | IFU : ${escapeHtml(company.ifu)} | N\u00b0 S\u00e9curit\u00e9 sociale : ${escapeHtml(company.socialSecurity)}
  </div>
</body>
</html>`;
}

module.exports = { renderInvoiceHtml };
