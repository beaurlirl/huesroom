// The privacy and support pages App Store Connect asks for: they render, say what they must, and keep the game's privacy promises.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3100';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
});
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

for (const [path, heading, must] of [
  ['/privacy', 'Privacy', ['does not collect your data', 'no analytics', 'iPhone app', 'Purchases', 'Children']],
  ['/support', 'Support', ['Controls', 'Where is my progress saved', 'Report a problem']],
]) {
  const res = await page.goto(BASE + path, { waitUntil: 'load' });
  check(`${path} loads`, res.status() === 200, String(res.status()));
  check(`${path} has its heading`, (await page.locator('h1').innerText()).trim().toLowerCase() === heading.toLowerCase());
  const text = await page.locator('main').innerText();
  check(`${path} says what it must`, must.every((m) => text.toLowerCase().includes(m.toLowerCase())), must.filter((m) => !text.toLowerCase().includes(m.toLowerCase())).join(', '));
  const out = await page.evaluate(() => ({
    external: [...document.querySelectorAll('a[href]')].filter((a) => !a.href.startsWith('mailto:') && new URL(a.href, location.href).origin !== location.origin).length,
    scripts: [...document.querySelectorAll('script[src]')].filter((s) => new URL(s.src, location.href).origin !== location.origin).length,
    scrolls: document.querySelector('main').scrollHeight > document.querySelector('main').clientHeight,
  }));
  check(`${path} has no outbound links or third-party scripts`, out.external === 0 && out.scripts === 0, JSON.stringify(out));
  check(`${path} scrolls (the game page locks scrolling)`, out.scrolls);
  if (/\[support email to be added\]/.test(text)) console.log(`WARN  ${path}: the support email is still a placeholder (app/_legal/contact.ts). Set it before the pages are submitted.`);
}
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
