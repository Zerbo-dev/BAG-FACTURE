const puppeteer = require("puppeteer-core");

let browserPromise = null;

async function launchBrowser() {
  const chromium = (await import("@sparticuz/chromium-min")).default;
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1080, height: 1400,deviceScaleFactor: 2 },
    executablePath: await chromium.executablePath(process.env.CHROMIUM_PACK_URL),
    headless: chromium.headless,
  });
}

async function getBrowser() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (!browser.isConnected()) {
        console.warn("Chromium déconnecté, relance du navigateur...");
        browserPromise = null;
      }
    } catch (err) {
      console.warn("Navigateur précédent invalide, relance...", err.message);
      browserPromise = null;
    }
  }

  if (!browserPromise) {
    browserPromise = launchBrowser();
  }

  return browserPromise;
}

/**
 * Renders the given HTML and returns { pdfBuffer, pngBuffer }
 */
async function renderInvoice(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluateHandle("document.fonts.ready");

    const pdfBuffer = Buffer.from(await page.pdf({
      printBackground: true,
      width: "1080px",
      preferCSSPageSize: false,
    }));

    const pngBuffer = Buffer.from(await page.screenshot({
      type: "png",
      fullPage: true,
    }));

    console.log(
      "DEBUG buffers -> pdf:",
      Buffer.isBuffer(pdfBuffer),
      pdfBuffer?.length,
      "| png:",
      Buffer.isBuffer(pngBuffer),
      pngBuffer?.length
    );

    if (!pngBuffer || pngBuffer.length === 0) {
      throw new Error("Le screenshot PNG généré est vide.");
    }
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error("Le PDF généré est vide.");
    }

    return { pdfBuffer, pngBuffer };
  } finally {
    await page.close();
  }
}

module.exports = { renderInvoice };