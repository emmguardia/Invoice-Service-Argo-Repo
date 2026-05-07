import { chromium } from 'playwright';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

const TEMPLATES_DIR = process.env.TEMPLATES_DIR || '/app/templates';

const templateCache = new Map();

export function getTemplate(name) {
  let tpl = templateCache.get(name);
  if (!tpl) {
    const path = join(TEMPLATES_DIR, `${name}.html`);
    tpl = Handlebars.compile(readFileSync(path, 'utf8'), { strict: true });
    templateCache.set(name, tpl);
  }
  return tpl;
}

let browserPromise = null;

function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
}

async function getBrowser() {
  if (!browserPromise) browserPromise = launchBrowser();
  try {
    const b = await browserPromise;
    if (b.isConnected()) return b;
  } catch {
    // relaunch
  }
  browserPromise = launchBrowser();
  return browserPromise;
}

export async function renderPdf(html) {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' },
    });
  } finally {
    await context.close();
  }
}

export async function shutdownPdf() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      // ignore
    } finally {
      browserPromise = null;
    }
  }
}

export async function isPdfReady() {
  try {
    const b = await getBrowser();
    return b.isConnected();
  } catch {
    return false;
  }
}
