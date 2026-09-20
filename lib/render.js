const chromium = require("@sparticuz/chromium-min");
const puppeteer = require("puppeteer-core");

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1080, height: 1400 },
      executablePath: await chromium.executablePath(process.env.CHROMIUM_PACK_URL),
      headless: chromium.headless,
    });
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

    const pdfBuffer = await page.pdf({
      printBackground: true,
      width: "1080px",
      preferCSSPageSize: false,
    });

    const pngBuffer = await page.screenshot({
      type: "png",
      fullPage: true,
    });

    return { pdfBuffer, pngBuffer };
  } finally {
    await page.close();
  }
}

module.exports = { renderInvoice };
