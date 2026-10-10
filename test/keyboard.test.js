import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const root = new URL('../', import.meta.url);

async function selectNotes(page) {
  const bounds = await page.$eval('ascii-tabs', el => {
    const start = el.querySelector('.ascii-tabs-cell[data-c="0"][data-s="5"]').getBoundingClientRect();
    const end = el.querySelector('.ascii-tabs-cell[data-c="2"][data-s="0"]').getBoundingClientRect();
    return { x: start.left + 1, y: start.bottom - 1, toX: end.right - 1, toY: end.top + 1 };
  });
  await page.mouse.move(bounds.x, bounds.y);
  await page.mouse.down();
  await page.mouse.move(bounds.toX, bounds.toY, { steps: 10 });
  await page.mouse.up();
}

async function dragNote(page, from, to) {
  const positions = await page.$eval('ascii-tabs', (el, { from, to }) => {
    const point = ([c, s]) => {
      const box = el.querySelector(`.ascii-tabs-cell[data-c="${c}"][data-s="${s}"]`).getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    return { from: point(from), to: point(to) };
  }, { from, to });
  await page.mouse.move(positions.from.x, positions.from.y);
  await page.mouse.down();
  await page.mouse.move(positions.to.x, positions.to.y, { steps: 10 });
  await page.mouse.up();
}

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

const selectionMarkup = '<ascii-tabs><ascii-tabs-storage key="selection-test"></ascii-tabs-storage></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>';
const selectedColumns = [[3, 5, null, null, null, null], [7, null, null, null, null, null], [null, 12, null, null, null, null]];

async function seedSelection(page) {
  await page.waitForSelector('.ascii-tabs-cell');
  await page.$eval('ascii-tabs', (el, columns) => {
    el.value = [[...columns, [null, null, 9, null, null, null]]];
    window.changes = [];
    el.addEventListener('change', e => window.changes.push(e.detail.value));
  }, selectedColumns);
  await selectNotes(page);
}

for (const modifier of ['Meta', 'Alt']) {
  test(`${modifier}+Right duplicates selected notes as a block and keeps the duplicate selected`, async () => {
    await withPage(selectionMarkup, async page => {
      await seedSelection(page);
      assert.equal(await page.$$eval('.ascii-tabs-selected', cells => cells.length), 4);
      assert.equal(await page.evaluate(() => window.changes.length), 0);
      await page.keyboard.down(modifier);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.up(modifier);
      assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0]), [
        ...selectedColumns, [3, 5, 9, null, null, null], selectedColumns[1], selectedColumns[2],
      ]);
      assert.deepEqual(await page.$$eval('.ascii-tabs-selected', cells => cells.map(el => +el.dataset.c)), [3, 4, 3, 5]);
      assert.equal(await page.evaluate(() => window.changes.length), 1);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('selection-test'))[0][5][1]), '12');
      await page.keyboard.press('Delete');
      assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0]), [...selectedColumns, [null, null, 9, null, null, null]]);
    });
  });
}

test('moving selected notes preserves overlaps and moves the group across strings', async () => {
  await withPage(selectionMarkup, async page => {
    await seedSelection(page);
    await dragNote(page, [0, 0], [1, 1]);
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0]), [
      [null, null, null, null, null, null],
      [null, 3, 5, null, null, null],
      [null, 7, null, null, null, null],
      [null, null, 12, null, null, null],
    ]);
    assert.equal(await page.$$eval('.ascii-tabs-selected', cells => cells.length), 4);
    assert.equal(await page.evaluate(() => window.changes.length), 1);
  });
});

test('invalid drops and cancelled selection leave the notes unchanged', async () => {
  await withPage(selectionMarkup, async page => {
    await seedSelection(page);
    await dragNote(page, [0, 1], [0, 0]); // Would move String 1 out of bounds.
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0].slice(0, 3)), selectedColumns);
    assert.equal(await page.evaluate(() => window.changes.length), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.$$eval('.ascii-tabs-selected', cells => cells.length), 0);
    await dragNote(page, [0, 0], [4, 0]); // Single-note dragging still works.
    assert.equal(await page.$eval('ascii-tabs', el => el.value[0][4][0]), 3);
    assert.equal(await page.$eval('ascii-tabs', el => el.value[0][0][0]), null);
  });
});

test('copying selected notes produces ASCII that can be pasted at the cursor', async () => {
  await withPage(selectionMarkup, async page => {
    await seedSelection(page);
    const text = await page.evaluate(() => {
      const clipboardData = new DataTransfer();
      document.activeElement.dispatchEvent(new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true }));
      return clipboardData.getData('text/plain');
    });
    const { parse } = await import('../ascii-tabs.js');
    assert.deepEqual(parse(text), selectedColumns);
    await page.click('.ascii-tabs-cell[data-c="5"][data-s="0"]');
    await page.evaluate(text => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    }, text);
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0].slice(5)), selectedColumns);
    assert.equal(await page.$$eval('.ascii-tabs-selected', cells => cells.length), 4);
    assert.equal(await page.evaluate(() => window.changes.length), 1);
  });
});

test('selection can start in Sheet padding, supports copy shortcuts and the button, and cancels cleanly', async () => {
  await withPage(selectionMarkup, async page => {
    await seedSelection(page);
    await page.keyboard.press('Escape');
    const bounds = await page.$eval('ascii-tabs', el => {
      const sheet = el.querySelector('.ascii-tabs-sheet').getBoundingClientRect();
      const end = el.querySelector('.ascii-tabs-cell[data-c="2"][data-s="4"]').getBoundingClientRect();
      el.addEventListener('pointerdown', e => { window.pointerId = e.pointerId; });
      navigator.clipboard.writeText = async text => { window.copiedText = text; };
      return { x: sheet.left + 4, y: sheet.top + 4, toX: end.right - 1, toY: end.bottom - 1 };
    });
    const start = async () => {
      await page.mouse.move(bounds.x, bounds.y);
      await page.mouse.down();
      await page.mouse.move(bounds.toX, bounds.toY, { steps: 10 });
    };
    await start();
    assert.equal(await page.$$eval('.ascii-tabs-marquee', els => els.length), 1);
    await page.mouse.up();
    assert.equal(await page.$$eval('.ascii-tabs-selected', cells => cells.length), 4);
    await page.keyboard.down('Meta');
    await page.keyboard.press('c');
    await page.keyboard.up('Meta');
    const { parse } = await import('../ascii-tabs.js');
    assert.deepEqual(parse(await page.evaluate(() => window.copiedText)), selectedColumns);
    await page.evaluate(() => { window.copiedText = null; });
    await page.click('.ascii-tabs-copy');
    assert.deepEqual(parse(await page.evaluate(() => window.copiedText)), selectedColumns);
    await start();
    await page.evaluate(() => dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.pointerId })));
    await page.mouse.up();
    assert.equal(await page.$$eval('.ascii-tabs-selected, .ascii-tabs-marquee', els => els.length), 0);
    assert.equal(await page.evaluate(() => window.changes.length), 0);
    await page.$eval('ascii-tabs', el => { el.readonly = true; });
    await start();
    await page.mouse.up();
    assert.equal(await page.$$eval('.ascii-tabs-selected, .ascii-tabs-marquee', els => els.length), 0);
  });
});
