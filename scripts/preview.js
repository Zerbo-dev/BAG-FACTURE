/**
 * Genere un devis d'exemple en PDF + PNG dans ./preview/, sans passer par
 * Telegram ni par le bot : utile pour verifier rapidement une modification
 * du gabarit (templates/invoice.js) ou du logo/infos entreprise.
 *
 * Usage: npm run preview
 */
const fs = require("fs");
const path = require("path");
const { renderInvoiceHtml } = require("../templates/invoice");
const { renderInvoice } = require("../lib/render");

const sampleData = {
  docType: "devis",
  number: "TEST",
  date: new Intl.DateTimeFormat("fr-FR").format(new Date()),
  client: {
    name: "M. Sawadogo",
    address: "1 Kamboinsin, Ouaga",
    phone: " 70245268",
  },
  items: [
    { description: "Diagnostic et repérage", unitPrice: 25000, quantity: 4 },
    { description: "Câblage du tableau électrique", unitPrice: 55000, quantity: 5 },
  ],
  tvaRate: 10,
};

async function main() {
  const outDir = path.join(__dirname, "..", "preview");
  fs.mkdirSync(outDir, { recursive: true });

  const html = renderInvoiceHtml(sampleData);
  fs.writeFileSync(path.join(outDir, "devis.html"), html);
  console.log(" HTML écrit dans preview/devis.html (ouvrable directement dans un navigateur)");

  console.log(" Rendu PDF + PNG via Chromium (peut prendre quelques secondes la 1ère fois)...");
  const { pdfBuffer, pngBuffer } = await renderInvoice(html);
  fs.writeFileSync(path.join(outDir, "devis.pdf"), pdfBuffer);
  fs.writeFileSync(path.join(outDir, "devis.png"), pngBuffer);
  console.log(" preview/devis.pdf et preview/devis.png générés.");
}

main().catch((err) => {
  console.error(" Erreur:", err);
  console.error(
    "\nSi l'erreur vient de Chromium (ex: 'wrong ELF class' ou 'exec format error'),\n" +
      "c'est que le binaire telecharge par @sparticuz/chromium-min ne peut pas\n" +
      "s'executer sur cette machine (frequent sur macOS/Windows). Le PDF/PNG\n" +
      "fonctionnera normalement une fois deploye sur environnement Linux."
  );
  process.exit(1);
});
