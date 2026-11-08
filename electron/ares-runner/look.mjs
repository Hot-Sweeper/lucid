// Renders a project page in headless Chromium so Codex can see what it built.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};
const MAX_HEIGHT = 5200;

let browserPromise = null;

function findBrowser() {
  if (process.env.ARES_CHROME && existsSync(process.env.ARES_CHROME)) return process.env.ARES_CHROME;
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  if (existsSync(root)) {
    const dirs = readdirSync(root)
      .filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
    for (const d of dirs) {
      for (const rel of [
        'chrome-headless-shell-win64/chrome-headless-shell.exe',
        'chrome-win64/chrome.exe',
        'chrome-win/chrome.exe',
        'chrome-linux/chrome',
        'chrome-headless-shell-linux64/chrome-headless-shell',
      ]) {
        const p = path.join(root, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  for (const p of [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ]) if (existsSync(p)) return p;
  return null;
}

export async function getBrowser() {
  if (!browserPromise) {
    const executablePath = findBrowser();
    if (!executablePath) throw new Error('No Chromium, Chrome or Edge found on this machine. Set ARES_CHROME to a browser executable.');
    browserPromise = chromium.launch({ executablePath, headless: true }).catch((e) => {
      browserPromise = null;
      throw e;
    });
    browserPromise.then((b) => b.on('disconnected', () => { browserPromise = null; }));
  }
  return browserPromise;
}

export async function lookAtPage(url, { viewport = 'desktop', fullPage = true, selector = null, theme = 'light' } = {}) {
  const size = VIEWPORTS[viewport] || VIEWPORTS.desktop;
  const browser = await getBrowser();
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: size, deviceScaleFactor: 1, colorScheme: theme === 'dark' ? 'dark' : 'light' });
  await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const where = m.location()?.url;
    problems.push(`console ${m.type()}: ${m.text()}${where && /Failed to load resource/.test(m.text()) ? ` (${where})` : ''}`);
  });
  page.on('pageerror', (e) => problems.push(`script error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`failed to load ${r.url()}: ${r.failure()?.errorText || ''}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} for ${r.url()}`); });
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))])).catch(() => {});
    await page.waitForTimeout(450);
    const info = await page.evaluate(() => ({
      title: document.title,
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
    }));
    let shot;
    if (selector) {
      const el = page.locator(selector).first();
      if (!(await el.count())) throw new Error(`Nothing on the page matches the selector ${selector}`);
      shot = await el.screenshot({ type: 'jpeg', quality: 72 });
    } else if (fullPage) {
      const h = Math.min(info.height, MAX_HEIGHT);
      shot = await page.screenshot({ type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: size.width, height: h } });
    } else {
      shot = await page.screenshot({ type: 'jpeg', quality: 72 });
    }
    const notes = [
      `Rendered ${url} at ${size.width}x${size.height} (${viewport}, ${theme} color scheme).`,
      `Title: ${info.title || '(none)'}. Page height ${info.height}px${info.height > MAX_HEIGHT && fullPage && !selector ? `, screenshot shows the first ${MAX_HEIGHT}px` : ''}.`,
      info.width > size.width + 1 ? `Horizontal overflow: content is ${info.width}px wide in a ${size.width}px viewport.` : '',
      problems.length ? `Problems:\n${[...new Set(problems)].slice(0, 20).join('\n')}` : 'No console errors or failed requests.',
    ].filter(Boolean).join('\n');
    return { image: `data:image/jpeg;base64,${shot.toString('base64')}`, notes };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function closeBrowser() {
  if (browserPromise) (await browserPromise.catch(() => null))?.close();
}
