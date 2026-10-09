import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const root = new URL('../', import.meta.url);

async function withPage(markup, run) {
  const source = await readFile(new URL('ascii-tabs.js', root));
  const server = createServer((request, response) => {
    if (request.url === '/ascii-tabs.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end(source);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(markup);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}`);
    await run(page);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

test('an ancestor can override the component font size', async () => {
  await withPage(`
    <style>.consumer { --ascii-tabs-font-size: 1em; }</style>
    <main class="consumer"><ascii-tabs></ascii-tabs></main>
    <script type="module" src="/ascii-tabs.js"></script>
  `, async page => {
    await page.waitForSelector('ascii-tabs .ascii-tabs-sheet');
    assert.equal(await page.$eval('ascii-tabs', el => getComputedStyle(el).fontSize), '16px');
  });
});

test('the flat variant removes the Sheet card treatment', async () => {
  await withPage(`
    <ascii-tabs variant="flat"></ascii-tabs>
    <script type="module" src="/ascii-tabs.js"></script>
  `, async page => {
    await page.waitForSelector('ascii-tabs .ascii-tabs-sheet');
    const styles = await page.$eval('ascii-tabs .ascii-tabs-sheet', el => {
      const style = getComputedStyle(el);
      return { paddingTop: style.paddingTop, borderTopWidth: style.borderTopWidth, backgroundColor: style.backgroundColor };
    });
    assert.deepEqual(styles, { paddingTop: '0px', borderTopWidth: '0px', backgroundColor: 'rgba(0, 0, 0, 0)' });
  });
});
