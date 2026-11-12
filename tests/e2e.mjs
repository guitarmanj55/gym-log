// Phone + offline check on an iPhone 16 Pro viewport. Run: node tests/e2e.mjs
// The runner lives in the shared ../e2e-kit (Playwright + installed Edge); this app stays dependency-free.
// The tab walk covers the four tabs (Train, Food, Body, You); `flow` / `offline` also visit the
// other Train views (History, Lifts, Library) and the old #home link, and log a meal and a weight (offline too).
import { runPhoneCheck } from '../../e2e-kit/run.mjs';
import { fileURLToPath } from 'node:url';

// hash, text it must show, tab that must be highlighted
// (for Train views the text is the selected Today / History / Lifts / Library button)
const SECTIONS = [['home', 'Today', 'train'], ['history', 'History', 'train'], ['lift', 'Lifts', 'train'], ['library', 'Library', 'train'], ['food', 'Food', 'food'], ['health', 'Body', 'body']];

async function sections(page, { check }, where) {
  for (const [hash, word, tab] of SECTIONS) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => ({
      text: document.querySelector('.train-nav a[aria-current]')?.textContent || document.querySelector('.title')?.textContent || '',
      scrollW: document.documentElement.scrollWidth, w: innerWidth, tab: document.querySelector('#tabs a[aria-current]')?.dataset.tab,
    }));
    check(`${where} · #${hash}: shows "${word}"`, info.text === word, info.text);
    check(`${where} · #${hash}: no horizontal scroll`, info.scrollW <= info.w, `${info.scrollW} > ${info.w}`);
    check(`${where} · #${hash}: ${tab} tab highlighted`, info.tab === tab, `highlighted ${info.tab}`);
  }
}

async function logThings(page, { check }, where) {
  // A meal, then a weight, through the real screens.
  await page.evaluate(() => { location.hash = 'food'; });
  await page.waitForTimeout(400);
  await page.fill('[data-field=q-name]', `e2e ${where} lunch`);
  await page.fill('[data-field=q-kcal]', '640');
  await page.click('[data-act=quick]');
  await page.waitForTimeout(500);
  check(`${where}: a quick entry is logged`, (await page.innerText('.screen.food')).includes('640'), 'no 640 on the Food screen');
  await page.evaluate(() => { location.hash = 'health'; });
  await page.waitForTimeout(400);
  await page.fill('[data-field=kg]', where === 'online' ? '81.5' : '81.7');
  await page.click('[data-act=save]');
  await page.waitForTimeout(500);
  check(`${where}: a weight is saved`, /81\.[57]/.test(await page.innerText('.screen.health')), 'weight not shown');
}

await runPhoneCheck({
  name: 'gym-log',
  appDir: fileURLToPath(new URL('..', import.meta.url)),
  port: 9123, // e2e port = dev port + 1000, so it never collides with a running dev server
  path: '/#today',
  tabs: '#tabs a',
  // Back to Train afterwards: the offline reload lands on this hash.
  flow: async (page, ctx) => { await sections(page, ctx, 'online'); await logThings(page, ctx, 'online'); await page.evaluate(() => { location.hash = 'today'; }); },
  offline: async (page, ctx) => { await sections(page, ctx, 'offline'); await logThings(page, ctx, 'offline'); },
});
