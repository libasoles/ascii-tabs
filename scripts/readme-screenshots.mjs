// Regenerate the README's real component captures: node scripts/readme-screenshots.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const root = new URL('../', import.meta.url);
const routes = {
  '/docs/img/readme-example.html': ['docs/img/readme-example.html', 'text/html'],
  '/ascii-tabs.js': ['ascii-tabs.js', 'text/javascript'],
};
const server = createServer(async (req, res) => {
  const route = routes[new URL(req.url, 'http://localhost').pathname];
  if (!route) return res.writeHead(404).end();
  try {
    res.writeHead(200, { 'content-type': route[1] }).end(await readFile(new URL(route[0], root)));
  } catch {
    res.writeHead(500).end();
  }
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 1000, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const theme of ['light', 'dark']) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
    await page.goto(`http://127.0.0.1:${server.address().port}/docs/img/readme-example.html?theme=${theme}`);
    await page.waitForSelector('body[data-ready="true"]');
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const captures = theme === 'light'
      ? { editor: 'example-light', notation: 'feature-notation', styles: 'feature-note-styles', initial: 'initial-value' }
      : { editor: 'example-dark' };
    for (const [id, name] of Object.entries(captures)) {
      const element = await page.$(`#${id}`);
      await element.screenshot({ path: new URL(`docs/img/${name}.png`, root).pathname });
      console.log(`Captured ${name}.png`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
