import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const root = new URL('../', import.meta.url);

async function withPage(markup, run) {
  const source = await readFile(new URL('ascii-tabs.js', root));
  const server = createServer(async (request, response) => {
    if (request.url === '/demo/giuliani-arpeggio-02.svg') {
      response.writeHead(200, { 'content-type': 'image/svg+xml' });
      response.end(await readFile(new URL('demo/giuliani-arpeggio-02.svg', root)));
      return;
    }
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


const markup = '<ascii-tabs variant="flat"><ascii-tabs-sheet><ascii-tabs-copy></ascii-tabs-copy><ascii-tabs-delete></ascii-tabs-delete></ascii-tabs-sheet><ascii-tabs-add></ascii-tabs-add></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>';
const column = fret => [fret, null, null, null, null, null];

async function setup(page, frets = [3, 12, null], positions = [40.5, 110.25, 210], width = 280) {
  await page.waitForSelector('.ascii-tabs-cell');
  await page.$eval('ascii-tabs', (el, document) => {
    window.changes = [];
    window.overflows = [];
    el.addEventListener('change', e => window.changes.push(e.detail.value));
    el.addEventListener('layoutoverflow', e => window.overflows.push(e.detail));
    el.setDocument(document);
  }, { value: [frets.map(column)], columnLayout: [{ width, positions }] });
}

const cell = (c, s = 0) => `.ascii-tabs-cell[data-c="${c}"][data-s="${s}"]`;

async function paste(page, text) {
  await page.$eval('input.ascii-tabs-input', (el, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, text);
}

async function drag(page, from, to) {
  const [start, end] = await Promise.all([from, to].map(selector => page.$eval(selector, el => {
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  })));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

test('external centers survive labels, notation, font, spacing and narrow viewports without wrapping', async () => {
  await withPage(markup, async page => {
    await setup(page);
    for (const labels of ['numbers', 'notes', 'none']) {
      await page.$eval('ascii-tabs', (el, labels) => {
        el.labels = labels;
        el.spacing = 6;
        el.notation = 'solfege';
        el.style.setProperty('--ascii-tabs-font-size', '27px');
      }, labels);
      await page.setViewport({ width: 240, height: 500 });
      const result = await page.$eval('ascii-tabs', el => ({
        rows: el.querySelectorAll('.ascii-tabs-staff').length,
        lines: el.querySelectorAll('.ascii-tabs-line').length,
        positions: [...el.querySelectorAll('.ascii-tabs-area[data-s="0"] .ascii-tabs-cell')].map(cell => {
          const a = cell.parentElement.getBoundingClientRect(), b = cell.getBoundingClientRect();
          return b.x + b.width / 2 - a.x;
        }),
        width: el.querySelector('.ascii-tabs-area').getBoundingClientRect().width,
        scroll: el.querySelector('.ascii-tabs-tab').scrollWidth > el.querySelector('.ascii-tabs-tab').clientWidth,
        length: el.value[0].length,
      }));
      assert.equal(result.rows, 1);
      assert.equal(result.lines, 6);
      assert.deepEqual(result.positions, [40.5, 110.25, 210]);
      assert.equal(result.width, 280);
      assert.equal(result.scroll, true);
      assert.equal(result.length, 3);
    }
  });
});

test('layout validation is atomic, copies geometry and retains explicit trailing Columns on activation', async () => {
  await withPage(markup, async page => {
    await setup(page);
    const result = await page.$eval('ascii-tabs', el => {
      const original = JSON.stringify([el.value, el.columnLayout]);
      const errors = [];
      const bad = [[], [{ width: 0, positions: [1, 2, 3] }], [{ width: Infinity, positions: [1, 2, 3] }],
        [{ width: 280, positions: [1, NaN, 3] }], [{ width: 280, positions: [2, 2, 3] }],
        [{ width: 280, positions: [2, 1, 3] }], [{ width: 280, positions: [-1, 2, 3] }],
        [{ width: 280, positions: [1, 2, 281] }], [{ width: 280, positions: [1] }],
        [{ width: 280, positions: Array(3) }], Array(1)];
      for (const value of bad) {
        try { el.columnLayout = value; } catch (error) { errors.push(error.message); }
        if (JSON.stringify([el.value, el.columnLayout]) !== original) throw Error('partial update');
      }
      try { el.value = [[]]; } catch (error) { errors.push(error.message); }
      try { el.setDocument({ value: [null], columnLayout: [{ width: 20, positions: [] }] }); } catch (error) { errors.push(error.message); }
      const copy = el.columnLayout;
      copy[0].positions[0] = 7;
      const unchanged = JSON.stringify([el.value, el.columnLayout]) === original;
      el.columnLayout = null;
      el.value = [Array.from({ length: 30 }, () => Array(6).fill(null))];
      el.columnLayout = [{ width: 1000, positions: Array.from({ length: 30 }, (_, c) => c * 30) }];
      return { errors, unchanged, length: el.value[0].length, changes: window.changes.length };
    });
    assert.equal(result.errors.length, 13);
    assert.ok(result.errors.every(error => error.startsWith('columnLayout:')));
    assert.equal(result.unchanged, true);
    assert.equal(result.length, 30);
    assert.equal(result.changes, 0);
  });
});

test('editing, metadata, mobile input and navigation preserve fixed logical indices', async () => {
  await withPage(markup, async page => {
    await setup(page);
    await page.$eval('ascii-tabs', el => {
      const value = el.value;
      value[0][1][0] = { fret: 12, color: 'royalblue', bold: false, parenthesized: true };
      el.value = value;
    });
    await page.click(cell(1));
    await page.keyboard.type('7');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0][1][0]), { fret: 7, color: 'royalblue', bold: false, parenthesized: true });
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('ascii-tabs', el => el.value[0][1][0].fret), 12);
    await page.keyboard.press('Delete');
    await page.keyboard.press('ArrowRight');
    await page.$eval('.ascii-tabs-input', el => { el.value = '24'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval('.ascii-tabs-cur', el => el.dataset.c), '2');
    await page.keyboard.press('Delete');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Delete');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0]), [column(3), column(null), column(null)]);
    assert.ok(await page.evaluate(() => window.changes.every(value => value[0].length === 3)));
    await page.$eval('ascii-tabs', el => { el.addTab(); el.removeTab(0); });
    assert.equal(await page.$eval('ascii-tabs', el => el.value[0].length), 3);
    assert.equal(await page.$eval('.ascii-tabs-add', el => el.disabled), true);
  });
});

test('paste and duplication reject out of bounds atomically but work in existing Columns', async () => {
  await withPage(markup, async page => {
    await setup(page);
    await page.click(cell(2));
    const text = '1 -7--8-\n2 ------\n3 ------\n4 ------\n5 ------\n6 ------';
    await paste(page, text);
    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Alt');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0]), [column(3), column(12), column(null)]);
    assert.equal(await page.evaluate(() => window.changes.length), 0);
    await page.click(cell(0));
    await paste(page, text);
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0].map(c => c[0])), [7, 8, null]);
    await page.keyboard.press('Escape');
    await page.click(cell(1));
    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Alt');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0].map(c => c[0])), [7, 8, 8]);
  });
});

test('nearest-center hit testing overrides overlapping DOM boxes, including drag destinations', async () => {
  await withPage(markup, async page => {
    await setup(page, [12, 24, null], [40, 48, 140], 200);
    const origin = await page.$eval('.ascii-tabs-area', el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y + b.height / 2 }; });
    // The later DOM cell covers x=41, but Column 0 is closer.
    await page.mouse.click(origin.x + 41, origin.y);
    assert.equal(await page.$eval('.ascii-tabs-cur', el => el.dataset.c), '0');
    await page.mouse.move(origin.x + 41, origin.y);
    await page.mouse.down();
    await page.mouse.move(origin.x + 140, origin.y, { steps: 8 });
    await page.mouse.up();
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0].map(c => c[0])), [null, 24, 12]);
    await page.mouse.move(origin.x + 140, origin.y);
    await page.mouse.down();
    await page.mouse.move(origin.x + 41, origin.y, { steps: 8 });
    await page.mouse.up();
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0].map(c => c[0])), [12, 24, null]);
  });
});

test('overflow reports text collisions and edges without moving centers; empty Tabs remain six Strings', async () => {
  await withPage(markup, async page => {
    await setup(page, [12, 24, 3], [0, 5, 100], 100);
    await page.waitForFunction(() => window.overflows.length > 0);
    const report = await page.evaluate(() => window.overflows.at(-1));
    assert.equal(report.index, 0);
    assert.ok(report.collisions.some(c => c.edge === 'left'));
    assert.ok(report.collisions.some(c => c.edge === 'right'));
    assert.ok(report.collisions.some(c => c.columns.length === 2));
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.columnLayout[0].positions), [0, 5, 100]);
    await page.$eval('ascii-tabs', el => {
      const textWidth = el.querySelector('.ascii-tabs-fret').getBoundingClientRect().width;
      window.overflows = [];
      el.columnLayout = [{ width: 200, positions: [40, 40 + textWidth - 0.1, 160] }];
    });
    await page.waitForFunction(() => window.overflows.length > 0);
    const overlap = await page.evaluate(() => window.overflows.at(-1).collisions[0].overlap);
    assert.ok(overlap > 0 && overlap < 0.2, `subpixel overlap: ${overlap}`);
    await page.$eval('ascii-tabs', el => el.setDocument({ value: [[]], columnLayout: [{ width: 320, positions: [] }] }));
    assert.equal(await page.$$eval('.ascii-tabs-line', els => els.length), 6);
    assert.equal(await page.$$eval('.ascii-tabs-cell', els => els.length), 0);
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value), [[]]);
    await page.click('.ascii-tabs-area');
    await page.keyboard.type('7');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value), [[]]);
  });
});

test('ASCII copy, readonly and restoration keep the existing behavior', async () => {
  await withPage(markup, async page => {
    await setup(page);
    const text = await page.$eval('ascii-tabs', async el => {
      window.copied = '';
      navigator.clipboard.writeText = async text => { window.copied = text; };
      await el.copy();
      return window.copied;
    });
    assert.match(text, /^1 -3--12-/);
    await page.$eval('ascii-tabs', el => { el.readonly = true; });
    await page.click(cell(0));
    await page.keyboard.type('9');
    assert.equal(await page.$eval('ascii-tabs', el => el.value[0][0][0]), 3);
    await page.$eval('ascii-tabs', el => { el.readonly = false; el.columnLayout = null; });
    assert.equal(await page.$eval('ascii-tabs', el => el.columnLayout), null);
    assert.equal(await page.$$eval('.ascii-tabs-area', els => els.length), 0);
    assert.equal(await page.$eval('ascii-tabs', el => el.value[0].length), 2);
    await page.click(cell(2));
    await page.keyboard.type('9');
    assert.equal(await page.$eval('ascii-tabs', el => el.value[0][2][0]), 9);
  });
});

test('geometry-only updates keep typing focus and atomic document changes support multiple Tabs', async () => {
  await withPage(markup, async page => {
    await setup(page);
    await page.click(cell(1));
    await page.keyboard.type('1');
    await page.$eval('ascii-tabs', el => { el.columnLayout = [{ width: 400, positions: [40, 150.5, 300] }]; });
    await page.keyboard.type('2');
    assert.equal(await page.$eval('ascii-tabs', el => el.value[0][1][0]), 12);
    assert.equal(await page.$eval('.ascii-tabs-cur', el => el.dataset.c), '1');
    await page.$eval('ascii-tabs', el => el.setDocument({
      value: [[[3, null, null, null, null, null]], []],
      columnLayout: [{ width: 300, positions: [40] }, { width: 150, positions: [] }],
    }));
    assert.equal(await page.$$eval('.ascii-tabs-staff', els => els.length), 2);
    assert.deepEqual(await page.$$eval('.ascii-tabs-area[data-s="0"]', els => els.map(el => el.getBoundingClientRect().width)), [300, 150]);
    await page.$eval('ascii-tabs', el => el.setDocument({ value: [[]], columnLayout: [{ width: 200, positions: [] }] }));
    assert.equal(await page.$$eval('.ascii-tabs-staff', els => els.length), 1);
  });
});

test('rectangular selection, group movement, invalid duplication and selection deletion keep the fixed Columns', async () => {
  await withPage(markup, async page => {
    await setup(page, [3, 5, null, null], [40, 100, 160, 220], 280);
    const points = await page.$eval('ascii-tabs', el => {
      const b = el.querySelector('.ascii-tabs-area').getBoundingClientRect();
      return { x: b.x, y: b.y, h: b.height };
    });
    await page.mouse.move(points.x + 25, points.y + points.h * 1.5);
    await page.mouse.down();
    await page.mouse.move(points.x + 115, points.y + 1, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.$$eval('.ascii-tabs-selected', els => els.length), 2);
    await drag(page, cell(0), cell(2));
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0].map(c => c[0])), [null, null, 3, 5]);
    const changes = await page.evaluate(() => window.changes.length);
    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Alt');
    assert.equal(await page.evaluate(() => window.changes.length), changes);
    await page.keyboard.press('Delete');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0].map(c => c[0])), [null, null, null, null]);
  });
});

test('external layout set before upgrade wins over storage and leaves the ASCII store untouched', async () => {
  await withPage(`<ascii-tabs id="editor"><ascii-tabs-storage key="external-test"></ascii-tabs-storage></ascii-tabs>
    <script>
      localStorage.setItem('external-test', JSON.stringify([[['9','','','','','']]]));
      editor.value = [[[3,null,null,null,null,null], [null,null,null,null,null,null]]];
      editor.columnLayout = [{width: 240, positions: [40, 160]}];
    </script><script type="module" src="/ascii-tabs.js"></script>`, async page => {
    await page.waitForSelector('.ascii-tabs-area');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value[0].map(c => c[0])), [3, null]);
    await page.click(cell(1));
    await page.keyboard.type('7');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('external-test'))), [[['9', '', '', '', '', '']]]);
    await page.$eval('ascii-tabs', el => { el.columnLayout = null; });
    await page.click(cell(1));
    await page.keyboard.type('8');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('external-test'))[0][1][0]), '8');
  });
});

test('GitHub Pages alignment demo switches layouts, reports collisions and resets to editable fixed Columns', async () => {
  await withPage(await readFile(new URL('../index.html', import.meta.url), 'utf8'), async page => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#alignment-demo .ascii-tabs-area');
    assert.equal(await page.$eval('#alignment-demo', el => el.value[0].length), 25);
    assert.ok(await page.$eval('.score-example img', img => img.complete && img.naturalWidth > 0));
    const originDifference = await page.evaluate(() =>
      document.querySelector('.score-example img').getBoundingClientRect().x -
      document.querySelector('#alignment-demo .ascii-tabs-area').getBoundingClientRect().x);
    assert.ok(Math.abs(originDifference) < 0.1, 'score and String area share an origin');
    await page.click('#alignment-collisions');
    await page.waitForFunction(() => document.getElementById('alignment-status').textContent.startsWith('layoutoverflow:'));
    await page.click('#alignment-ascii');
    assert.equal(await page.$eval('#alignment-demo', el => el.columnLayout), null);
    assert.equal(await page.$eval('#alignment-demo', el => el.value[0].length), 25);
    await page.click('#alignment-reset');
    await page.click(`#alignment-demo ${cell(3)}`);
    await page.keyboard.type('9');
    assert.equal(await page.$eval('#alignment-demo', el => el.value[0][3][0]), 9);
    assert.equal(await page.$eval('#alignment-demo', el => el.value[0].length), 25);
    assert.deepEqual(errors, []);
  });
});
