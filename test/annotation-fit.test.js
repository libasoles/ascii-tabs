import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { format } from '../ascii-tabs.js';

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
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`http://127.0.0.1:${port}`);
    await page.waitForSelector('.ascii-tabs-cell');
    await run(page);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

const page = (attrs = 'annotations-editable') =>
  `<ascii-tabs ${attrs}><ascii-tabs-sheet></ascii-tabs-sheet></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>`;

const TAB = [[0, 2, 2, 2, 0, null], [2, 1, 2, 1, null, null], [0, 0, 1, 0, 2, 0], [3, null, null, null, null, null]];
const setDoc = (p, annotations, value = [TAB]) =>
  p.$eval('ascii-tabs', (el, doc) => el.setDocument(doc), { value, annotations: [annotations] });
const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// Left edge of a Column's first String cell, and of its Fret text
const cellX = (p, c) => p.$eval(`.ascii-tabs-cell[data-c="${c}"][data-s="0"]`, el => el.getBoundingClientRect().left);
const fretX = (p, c) => p.$eval(`.ascii-tabs-cell[data-c="${c}"][data-s="0"] .ascii-tabs-fret`, el => el.getBoundingClientRect().left);
const annotationBox = (p, index = 0) => p.evaluate(i => {
  const box = document.querySelectorAll('.ascii-tabs-annotation')[i].getBoundingClientRect();
  return { left: box.left, right: box.right, top: box.top };
}, index);
const copied = p => p.evaluate(async () => {
  const original = navigator.clipboard.writeText;
  let text;
  navigator.clipboard.writeText = async value => { text = value; };
  try { await document.querySelector('ascii-tabs').copy(0); } finally { navigator.clipboard.writeText = original; }
  return text;
});

test('Ddim7 widens its Column so the next Column with notes starts after it', async () => {
  await withPage(page(), async p => {
    await setDoc(p, []);
    const original = await fretX(p, 2);
    await setDoc(p, [{ column: 1, text: 'Ddim7' }]);
    const annotation = await annotationBox(p);
    assert.ok(annotation.right < await fretX(p, 2), 'annotation ends before the next Column');
    assert.ok(await fretX(p, 2) > original, 'the next Column moved right');
  });
});

test('HTML annotations reserve the width of their text fallback', async () => {
  await withPage(page(), async p => {
    await setDoc(p, [{ column: 1, html: '<strong>Ddim</strong><sup>7</sup>', text: 'Ddim7' }]);
    const widened = await fretX(p, 2);
    await setDoc(p, [{ column: 1, text: 'Ddim7' }]);
    assert.equal(await fretX(p, 2), widened, 'HTML and plain text with the same fallback take the same width');
    await setDoc(p, []);
    assert.ok(await fretX(p, 2) < widened);
  });
});

test('the width follows editing, deleting, reloading and resizing', async () => {
  await withPage(page(), async p => {
    await setDoc(p, []);
    const original = await fretX(p, 2);
    await p.click('.ascii-tabs-annotation-slot[data-c="1"]');
    await p.keyboard.type('Ddim7');
    await p.keyboard.press('Enter');
    await settle(p);
    const short = await fretX(p, 2);
    assert.ok(short > original, 'typing widens');
    await p.click('.ascii-tabs-annotation');
    await p.keyboard.down('Control');
    await p.keyboard.press('a');
    await p.keyboard.up('Control');
    await p.keyboard.type('Anotación larga');
    await p.keyboard.press('Enter');
    await settle(p);
    const long = await fretX(p, 2);
    assert.ok(long > short, 'editing to longer text widens more');

    // Reload: a document set from persisted state gets the same geometry
    await setDoc(p, [{ column: 1, text: 'Anotación larga' }]);
    assert.equal(await fretX(p, 2), long);

    await p.setViewport({ width: 900, height: 720 });
    await settle(p);
    assert.ok(await fretX(p, 2) > original, 'resizing keeps the widened Column');

    await p.click('.ascii-tabs-annotation');
    await p.keyboard.down('Control');
    await p.keyboard.press('a');
    await p.keyboard.up('Control');
    await p.keyboard.press('Backspace');
    await p.keyboard.press('Enter');
    await settle(p);
    assert.equal(await fretX(p, 2), original, 'deleting restores the width');
  });
});

test('a very long annotation wraps inside a narrow Staff without horizontal overflow', async () => {
  await withPage(page(), async p => {
    await p.setViewport({ width: 390, height: 844 });
    await setDoc(p, [{ column: 1, text: 'Una anotación muy larga que debe ajustarse al ancho disponible sin desbordar la tablatura' }]);
    await settle(p);
    const result = await p.evaluate(() => {
      const annotation = document.querySelector('.ascii-tabs-annotation').getBoundingClientRect();
      const staff = document.querySelector('.ascii-tabs-staff').getBoundingClientRect();
      const tab = document.querySelector('.ascii-tabs-tab');
      const lines = [...document.querySelectorAll('.ascii-tabs-staff:first-child .ascii-tabs-line')].map(l => Math.round(l.getBoundingClientRect().width));
      const staffOf = c => document.querySelector(`.ascii-tabs-cell[data-c="${c}"][data-s="0"]`).closest('.ascii-tabs-staff');
      return { right: annotation.right, limit: staff.right, moved: staffOf(1) !== staffOf(2), scrolls: tab.scrollWidth > tab.clientWidth, lines };
    });
    assert.ok(result.right <= result.limit + 1, 'annotation stays within the Staff');
    assert.ok(result.moved, 'the widened Column pushes the next one onto another Staff');
    assert.ok(!result.scrolls, 'no horizontal scrolling');
    assert.equal(new Set(result.lines).size, 1, 'all six Strings keep the same width');
  });
});

test('the six Strings and their hit areas stay aligned in a widened Column', async () => {
  await withPage(page(), async p => {
    await setDoc(p, [{ column: 1, text: 'Ddim7' }]);
    const xs = await p.evaluate(() => [0, 1, 2, 3, 4, 5].map(s => document.querySelector(`.ascii-tabs-cell[data-c="2"][data-s="${s}"]`).getBoundingClientRect().left));
    assert.equal(new Set(xs).size, 1);
    const slot = await p.$eval('.ascii-tabs-annotation-slot[data-c="2"]', el => el.getBoundingClientRect().left);
    assert.ok(slot >= xs[0] && slot <= await fretX(p, 2), 'the annotation slot sits on its Column');
  });
});

test('ASCII copy keeps the annotation spacing', async () => {
  await withPage(page(), async p => {
    await setDoc(p, [{ column: 1, text: 'Ddim7' }]);
    const text = await copied(p);
    const [annotationLine, firstString] = text.split('\n');
    assert.ok(annotationLine.indexOf('Ddim7') + 'Ddim7'.length < firstString.lastIndexOf('0'));
    assert.match(annotationLine, /Ddim7/);
  });
});

test('format() reserves annotation width with annotationFit', () => {
  const annotations = [{ column: 1, text: 'Ddim7' }];
  const widened = format(TAB, { annotations, annotationFit: 'widen' }).split('\n');
  assert.ok(widened[0].indexOf('Ddim7') + 5 < widened[1].lastIndexOf('0') + 1);
  const overflow = format(TAB, { annotations, annotationFit: 'overflow' }).split('\n');
  assert.equal(overflow.slice(1).join('\n'), format(TAB).split('\n').join('\n'));
  assert.ok(widened[1].length > overflow[1].length);
});

test('annotation-fit="overflow" keeps the previous geometry', async () => {
  await withPage(page('annotations-editable annotation-fit="overflow"'), async p => {
    await setDoc(p, []);
    const original = await fretX(p, 2);
    await setDoc(p, [{ column: 1, text: 'Ddim7' }]);
    assert.equal(await fretX(p, 2), original);
    const [, firstString] = (await copied(p)).split('\n');
    assert.equal(firstString.length, format(TAB).split('\n')[0].length);
  });
});

test('annotation-fit="stagger" alternates two rows and only widens where one row would collide', async () => {
  await withPage(page('annotations-editable annotation-fit="stagger"'), async p => {
    await setDoc(p, []);
    const original = await fretX(p, 2);
    await setDoc(p, [{ column: 0, text: 'Ddim7' }, { column: 1, text: 'Gmaj7' }]);
    const first = await annotationBox(p, 0), second = await annotationBox(p, 1);
    assert.ok(second.top > first.top, 'neighbours sit on different rows');
    assert.ok(second.left < first.right, 'which lets them overlap horizontally');
    assert.equal(await fretX(p, 2), original, 'so no Column needs to grow');

    // Annotations two apart share a row: the space between them grows
    await setDoc(p, [{ column: 0, text: 'Ddim7/F#' }, { column: 1, text: 'x' }, { column: 2, text: 'Gmaj7' }]);
    const a = await annotationBox(p, 0), c = await annotationBox(p, 2);
    assert.equal(a.top, c.top);
    assert.ok(a.right < c.left, 'same-row annotations never touch');
    assert.ok(await fretX(p, 2) > original);
    const lines = (await copied(p)).split('\n');
    assert.ok(lines[0].includes('Ddim7/F# Gmaj7'));
  });
});

test('annotation-fit="stagger" copies without overlapping text', () => {
  const annotations = [{ column: 0, text: 'Ddim7/F#' }, { column: 1, text: 'x' }, { column: 2, text: 'Gmaj7' }];
  const lines = format(TAB, { annotations, annotationFit: 'stagger' }).split('\n');
  const row = lines.findIndex(line => line.includes('Gmaj7'));
  assert.ok(row >= 0 && lines[row].includes('Ddim7/F# Gmaj7'));
});

test('explicit columnLayout geometry is untouched', async () => {
  await withPage(page('annotations-editable'), async p => {
    await p.$eval('ascii-tabs', el => el.setDocument({
      value: [[[0, 2, 2, 2, 0, null], [2, 1, 2, 1, null, null], [0, 0, 1, 0, 2, 0]]],
      columnLayout: [{ width: 300, positions: [10, 60, 110] }],
      annotations: [[{ column: 1, text: 'Ddim7 con texto largo' }]],
    }));
    const xs = await p.evaluate(() => [...document.querySelectorAll('.ascii-tabs-cell[data-s="0"]')].map(el => el.style.left));
    assert.deepEqual(xs, ['10px', '60px', '110px']);
  });
});

test('read-only Tabs honor annotation-fit too', async () => {
  for (const [attrs, widens] of [['readonly', true], ['readonly annotation-fit="widen"', true], ['readonly annotation-fit="overflow"', false]]) {
    await withPage(page(attrs), async p => {
      await setDoc(p, []);
      const original = await fretX(p, 2);
      await setDoc(p, [{ column: 1, text: 'Ddim7' }]);
      assert.equal(await fretX(p, 2) > original, widens, attrs);
      if (widens) assert.ok((await annotationBox(p)).right < await fretX(p, 2));
    });
  }
  await withPage(page('readonly annotation-fit="stagger"'), async p => {
    await setDoc(p, [{ column: 0, text: 'Ddim7' }, { column: 1, text: 'Gmaj7' }]);
    assert.ok((await annotationBox(p, 1)).top > (await annotationBox(p, 0)).top);
  });
});
