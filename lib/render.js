const puppeteer = require("puppeteer-core");
const { PAGE_WIDTH, PAGE_HEIGHT } = require("../templates/invoice");

let browserPromise = null;

async function launchBrowser() {
  const chromium = (await import("@sparticuz/chromium-min")).default;
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: PAGE_WIDTH, height: PAGE_HEIGHT, deviceScaleFactor: 2 },
    executablePath: await chromium.executablePath(process.env.CHROMIUM_PACK_URL),
    headless: chromium.headless,
  });
}

async function getBrowser() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (!browser.isConnected()) {
        console.warn("Chromium deconnecte, relance du navigateur...");
        browserPromise = null;
      }
    } catch (err) {
      console.warn("Navigateur precedent invalide, relance...", err.message);
      browserPromise = null;
    }
  }
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }
  return browserPromise;
}

/**
 * Renders the given HTML and returns { pdfBuffer, pngBuffer }.
 * pngBuffer ne capture QUE la premiere page (screenshot standard, sans
 * fullPage) : c'est l'apercu envoye sur Telegram. pdfBuffer contient
 * lui la totalite des pages (aucune limite de pageRanges).
 */
async function renderInvoice(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluateHandle("document.fonts.ready");

    const pdfBuffer = Buffer.from(
      await page.pdf({
        printBackground: true,
        width: `${PAGE_WIDTH}px`,
        height: `${PAGE_HEIGHT}px`,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      })
    );

    const pngBuffer = Buffer.from(
      await page.screenshot({
        type: "png",
      })
    );

    if (!pngBuffer || pngBuffer.length === 0) {
      throw new Error("Le screenshot PNG genere est vide.");
    }
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error("Le PDF genere est vide.");
    }

    return { pdfBuffer, pngBuffer };
  } finally {
    await page.close();
  }
}

module.exports = { renderInvoice };