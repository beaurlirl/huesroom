// The home menu: shows on the plain address with the locations, sound switches and policy links, and with no level loaded behind it (no canvas, no model download);
// choosing a location loads that one in a fresh page (?level=<id>); a direct ?level= link skips the menu; pause can come back to it.
// Needs the dev server (npx next dev -p 3100).
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3100';
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1000, height: 760 } })).newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
const shotDir = process.env.SHOTS;
const models = [];
page.on('request', (r) => { const path = new URL(r.url()).pathname; if (path.endsWith('.glb')) models.push(path); });
// The menu loads a location in a fresh page (?level=<id>): wait for it, then begin with a key, as a player does.
const beginLevel = async (id) => {
  await page.waitForURL(new RegExp(`[?&]level=${id}(&|$)`), { timeout: 20000 });
  await page.getByText('press any key', { exact: false }).waitFor({ timeout: 90000 });
  await page.keyboard.press('Space');
  // The prompt stays (fading) while he stands up from the chair and is removed once he is playing.
  await page.getByText('press any key', { exact: false }).waitFor({ state: 'detached', timeout: 20000 });
  await page.waitForFunction(() => /\d\d\s*\/\s*\d\d/.test(document.body.innerText), null, { timeout: 10000 });
};

// 1. The plain address opens the menu.
await page.goto(BASE + '/');
await page.getByRole('link', { name: 'privacy' }).waitFor({ timeout: 90000 });
const text = (await page.locator('body').innerText()).toLowerCase();
check('the menu opens on the plain address', true);
await page.waitForTimeout(2000); // long enough for a scene to start downloading, if one were going to
check('no level is loaded behind it: no canvas', (await page.locator('canvas').count()) === 0);
check('and no model is downloaded', models.length === 0, models.join(', '));
check('it lists the three locations', ['home', 'ludlow st', 'the deli'].every((n) => text.includes(n)), text.slice(0, 120).replace(/\n/g, ' | '));
check('nothing played yet says so', (text.match(/not played/g) ?? []).length === 3);
check('it has no "press any key" prompt under it', !text.includes('press any key'));
if (shotDir) await page.screenshot({ path: `${shotDir}/menu.png` });

// 1b. Without a mouse: the location that loaded has focus, the arrow keys walk the buttons.
const focused = () => page.evaluate(() => (document.activeElement?.textContent ?? '').toLowerCase());
await page.waitForFunction(() => (document.activeElement?.matches('button') && (document.activeElement.textContent ?? '').toLowerCase().includes('play')), null, { timeout: 8000 }).then(
  () => check('the play button has focus once the menu is up', true),
  async () => check('the play button has focus once the menu is up', false, `focus is on "${await focused()}"`),
);
await page.keyboard.press('ArrowDown');
check('ArrowDown moves focus to the next location', (await focused()).includes('go'), `"${await focused()}"`);
await page.keyboard.press('ArrowUp');
check('ArrowUp moves it back', (await focused()).includes('play'), `"${await focused()}"`);

// 2. Sound switches.
const label = () => page.getByRole('button', { name: /sound (on|off)/i }).first().innerText();
const before = (await label()).toLowerCase();
await page.getByRole('button', { name: /sound (on|off)/i }).first().click();
const after = (await label()).toLowerCase();
check('the sound switch flips', before !== after, `${before} -> ${after}`);
await page.getByRole('button', { name: /sound (on|off)/i }).first().click();
check('and flips back', (await label()).toLowerCase() === before);
const music0 = (await page.getByRole('button', { name: /music (on|off)/i }).first().innerText()).toLowerCase();
await page.getByRole('button', { name: /music (on|off)/i }).first().click();
check('the music switch flips', (await page.getByRole('button', { name: /music (on|off)/i }).first().innerText()).toLowerCase() !== music0);
await page.getByRole('button', { name: /music (on|off)/i }).first().click();

// 3. The policy links stay inside the game.
const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => new URL(a.href, location.href)).filter((u) => u.origin !== location.origin).map(String));
check('no link on the menu leaves the game', hrefs.length === 0, hrefs.join(', '));
for (const [name, heading] of [['privacy', 'Privacy'], ['support', 'Support'], ['terms', 'Terms']]) {
  await page.getByRole('link', { name }).click();
  await page.waitForURL(new RegExp(`/${name}/?$`));
  check(`${name} opens its page`, (await page.locator('h1').innerText()).trim().toLowerCase() === heading.toLowerCase());
  await page.getByRole('link', { name: /back to the game/i }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await page.getByRole('link', { name: 'privacy' }).waitFor({ timeout: 60000 });
}

// 4. Play loads the first location (a fresh page, ?level=home); a key then begins the run.
await page.getByRole('button', { name: 'play' }).first().click();
await beginLevel('home').then(
  () => check('play loads the first location and a key starts the run (the coin counter shows)', true),
  (e) => check('play loads the first location and a key starts the run (the coin counter shows)', false, `${e.message.split('\n')[0]} @ ${page.url()}`),
);
const hud = (await page.locator('body').innerText()).toLowerCase();
check('the counter is level 1\'s 11 coins', /\d\d\s*\/\s*11/.test(hud), hud.replace(/\n/g, ' ').slice(0, 120));
check('its model downloaded only now', models.some((m) => /room\.glb$/.test(m)), models.join(', '));

// 4b. Enter on the focused play button begins it too (the keyboard way in).
await page.goto(BASE + '/');
await page.getByRole('link', { name: 'privacy' }).waitFor({ timeout: 90000 });
await page.waitForFunction(() => (document.activeElement?.matches('button') && (document.activeElement.textContent ?? '').toLowerCase().includes('play')), null, { timeout: 8000 });
await page.keyboard.press('Enter');
await beginLevel('home').then(
  () => check('Enter on the focused play button starts the run', true),
  (e) => check('Enter on the focused play button starts the run', false, e.message.split('\n')[0]),
);
await page.waitForTimeout(1000);

// 5. Pause has a menu button that comes back here.
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'menu' }).waitFor({ timeout: 10000 });
check('the pause screen has a menu button', true);
await page.getByRole('button', { name: 'menu' }).click();
await page.getByRole('link', { name: 'privacy' }).waitFor({ timeout: 90000 });
check('which comes back to the home menu', new URL(page.url()).search === '');

// 6. A direct link to a location skips the menu.
await page.goto(BASE + '/?level=deli');
await page.getByText('press any key', { exact: false }).waitFor({ timeout: 90000 });
check('?level=deli skips the menu (begin prompt shows)', (await page.getByRole('link', { name: 'privacy' }).count()) === 0);

check('no console or page errors', errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
