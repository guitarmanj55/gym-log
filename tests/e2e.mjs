// Phone + offline check on an iPhone 16 Pro viewport. Run: node tests/e2e.mjs
// The runner lives in the shared ../e2e-kit (Playwright + installed Edge); this app stays dependency-free.
// The app opens on Home (no tab bar), so the tab walk starts inside the Gym section (#today) and
// `flow` / `offline` visit Home, Food and Health, logging a meal and a weight (offline too).
import { runPhoneCheck } from '../../e2e-kit/run.mjs';
import { fileURLToPath } from 'node:url';

const SECTIONS = [['home', 'Gym'], ['food', 'Food'], ['health', 'Health']];

async function sections(page, { check }, where) {
  for (const [hash, word] of SECTIONS) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => ({ text: document.body.innerText, scrollW: document.documentElement.scrollWidth, w: innerWidth, tabs: getComputedStyle(document.getElementById('tabs')).display }));
    check(`${where} · #${hash}: shows "${word}"`, info.text.includes(word), info.text.slice(0, 60));
    check(`${where} · #${hash}: no horizontal scroll`, info.scrollW <= info.w, `${info.scrollW} > ${info.w}`);
    check(`${where} · #${hash}: no tab bar`, info.tabs === 'none', `display ${info.tabs}`);
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
  // Back to the Gym section afterwards: the offline reload lands on this hash and the tab walk needs the tab bar.
  flow: async (page, ctx) => { await sections(page, ctx, 'online'); await logThings(page, ctx, 'online'); await page.evaluate(() => { location.hash = 'today'; }); },
  offline: async (page, ctx) => { await sections(page, ctx, 'offline'); await logThings(page, ctx, 'offline'); },
});
