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


for (const modifier of ['Meta', 'Alt']) {
  test(`${modifier}+0 fills only empty cells and keeps the cursor in place`, async () => {
    await withPage('<ascii-tabs><ascii-tabs-storage key="zeros-test"></ascii-tabs-storage></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>', async page => {
      await page.waitForSelector('.ascii-tabs-cell');
      const next = [7, null, null, null, null, null];
      await page.$eval('ascii-tabs', (el, column) => {
        el.value = [[[0, null, 12, null, 5, 24], column]];
        window.changes = [];
        el.addEventListener('change', e => window.changes.push(e.detail.value));
      }, next);
      await page.click('.ascii-tabs-cell[data-c="0"][data-s="2"]');
      for (let repeat = 0; repeat < 2; repeat++) {
        await page.keyboard.down(modifier);
        await page.keyboard.press('0');
        await page.keyboard.up(modifier);
      }
      assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0]), [[0, 0, 12, 0, 5, 24], next]);
      assert.deepEqual(await page.$eval('.ascii-tabs-cur', el => [el.dataset.c, el.dataset.s]), ['0', '2']);
      assert.equal(await page.evaluate(() => window.changes.length), 1);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('zeros-test'))[0][0]), ['0', '0', '12', '0', '5', '24']);
    });
  });

  test(`${modifier}+Right copies all strings, clears old frets and moves the cursor`, async () => {
    await withPage('<ascii-tabs><ascii-tabs-storage key="shortcut-test"></ascii-tabs-storage></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>', async page => {
      await page.waitForSelector('.ascii-tabs-cell');
      const original = [0, null, 12, null, 5, 24];
      await page.$eval('ascii-tabs', (el, column) => {
        el.value = [[column, [9, 9, 9, 9, 9, 9], [7, null, null, null, null, null]]];
        window.changes = [];
        el.addEventListener('change', e => window.changes.push(e.detail.value));
      }, original);
      await page.click('.ascii-tabs-cell[data-c="0"][data-s="2"]');
      await page.keyboard.down(modifier);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.up(modifier);
      assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0]), [original, original, [7, null, null, null, null, null]]);
      assert.deepEqual(await page.$eval('.ascii-tabs-cur', el => [el.dataset.c, el.dataset.s]), ['1', '2']);
      assert.equal(await page.evaluate(() => window.changes.length), 1);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('shortcut-test'))[0][1][2]), '12');
      await page.keyboard.press('Delete');
      assert.equal(await page.$eval('ascii-tabs', el => el.value[0][0][2]), 12);
      assert.equal(await page.$eval('ascii-tabs', el => el.value[0][1][2]), null);
    });
  });
}

test('0 alone edits one cell; Alt+0 fills a new column even when Alt changes the key character', async () => {
  await withPage('<ascii-tabs></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>', async page => {
    await page.waitForSelector('.ascii-tabs-cell');
    await page.$eval('ascii-tabs', el => { el.value = [[[3, null, null, null, null, null]]]; });
    await page.click('.ascii-tabs-cell[data-c="0"][data-s="1"]');
    await page.keyboard.press('0');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0][0]), [3, 0, null, null, null, null]);
    await page.keyboard.press('ArrowRight');
    await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
      key: '≠', code: 'Digit0', altKey: true, bubbles: true, cancelable: true,
    })));
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0]), [[3, 0, null, null, null, null], [0, 0, 0, 0, 0, 0]]);
    assert.deepEqual(await page.$eval('.ascii-tabs-cur', el => [el.dataset.c, el.dataset.s]), ['1', '1']);
  });
});

test('Right alone only navigates; duplicating the last column extends the tab', async () => {
  await withPage('<ascii-tabs></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>', async page => {
    await page.waitForSelector('.ascii-tabs-cell');
    await page.$eval('ascii-tabs', el => { el.value = [[[3, null, null, null, null, null]]]; });
    await page.click('.ascii-tabs-cell[data-c="0"][data-s="0"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval('ascii-tabs', el => el.value[0].length), 1);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Alt');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0]), [[3, null, null, null, null, null], [3, null, null, null, null, null]]);
  });
});
