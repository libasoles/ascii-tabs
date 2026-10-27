import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const root = new URL('../', import.meta.url);

async function withPage(markup, run) {
  const source = await readFile(new URL('ascii-tabs.js', root));
  const server = createServer(async (request, response) => {
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

const markup = '<ascii-tabs annotations-editable titles-editable><ascii-tabs-sheet></ascii-tabs-sheet><ascii-tabs-add></ascii-tabs-add></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>';
const slot = c => `.ascii-tabs-annotation-slot[data-t="0"][data-c="${c}"]`;
const editor = '.ascii-tabs-text-editor';
async function ready(page) {
  await page.waitForSelector(slot(0));
  await page.$eval('ascii-tabs', el => {
    window.events = [];
    for (const name of ['annotationchange', 'titlechange', 'change']) el.addEventListener(name, e => window.events.push({ name, detail: e.detail }));
  });
}

test('hover indicates the Column and click edits literal annotations without editing Frets', async () => {
  await withPage(markup, async page => {
    await ready(page);
    await page.hover('.ascii-tabs-cell[data-c="2"][data-s="2"]');
    assert.equal(await page.$eval(slot(2), el => getComputedStyle(el, '::after').opacity), '0.65');
    await page.click('.ascii-tabs-cell[data-c="0"][data-s="0"]');
    await page.keyboard.type('3');
    await page.evaluate(() => { window.events = []; });
    await page.click(slot(2));
    await page.keyboard.type('<Dm>');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.annotations), [[{ column: 2, text: '<Dm>' }]]);
    assert.equal(await page.$eval('ascii-tabs', el => el.value[0].length), 3);
    assert.equal(await page.$eval('.ascii-tabs-annotation', el => el.textContent), '<Dm>');
    assert.deepEqual(await page.evaluate(() => window.events.map(e => e.name)), ['annotationchange']);
    await page.click('.ascii-tabs-annotation');
    await page.keyboard.type('cancel');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('.ascii-tabs-annotation', el => el.textContent), '<Dm>');
    await page.click('.ascii-tabs-annotation');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Tab');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.annotations), [[]]);
  });
});

test('title sits outside each card and supports keyboard editing, multiline and persistence events', async () => {
  await withPage(markup, async page => {
    await ready(page);
    assert.equal(await page.$eval('.ascii-tabs-title', el => el.closest('.ascii-tabs-sheet')), null);
    await page.focus('.ascii-tabs-title');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Estudio');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.tabTitles), ['Estudio']);
    assert.deepEqual(await page.evaluate(() => window.events[0]), { name: 'titlechange', detail: { index: 0, title: 'Estudio', tabTitles: ['Estudio'] } });
    await page.click('.ascii-tabs-title');
    await page.keyboard.type('Intro');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('.ascii-tabs-title', el => el.textContent), 'Estudio');
    await page.click(slot(0));
    await page.keyboard.type('Intro');
    await page.keyboard.press('Enter');
    await page.click('.ascii-tabs-add');
    await page.click('.ascii-tabs-title[data-t="1"]');
    await page.keyboard.type('Segunda');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
    await page.keyboard.type('parte');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.tabTitles), ['Estudio', 'Segunda\nparte']);
    await page.click('.ascii-tabs-annotation-slot[data-t="1"][data-c="0"]');
    await page.keyboard.type('C');
    await page.keyboard.press('Enter');
    await page.$eval('ascii-tabs', el => { el.value = el.value; el.removeTab(0); });
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.tabTitles), ['Segunda\nparte']);
  });
});

test('editing survives reflow, supports external geometry and preserves other annotations and HTML on cancel', async () => {
  await withPage(markup, async page => {
    await ready(page);
    await page.$eval('ascii-tabs', el => el.setDocument({
      value: [[[3,null,null,null,null,null], [12,null,null,null,null,null]]],
      columnLayout: [{ width: 300, positions: [40, 180] }],
      annotations: [[{ column: 0, html: '<b>Dm</b>' }, { column: 0, text: 'Verse' }]],
      tabTitles: ['Study'],
    }));
    await page.click('.ascii-tabs-annotation[data-index="0"]');
    await page.keyboard.type('Changed');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('.ascii-tabs-annotation b', el => el.textContent), 'Dm');
    await page.click(slot(1));
    await page.keyboard.type('Am');
    await page.setViewport({ width: 500, height: 600 });
    await page.$eval('ascii-tabs', el => { el.spacing = 5; });
    assert.equal(await page.$eval(editor, el => el.value), 'Am');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.annotations[0]), [{ column: 0, html: '<b>Dm</b>' }, { column: 0, text: 'Verse' }, { column: 1, text: 'Am' }]);
    await page.click('.ascii-tabs-annotation[data-index="1"]');
    await page.keyboard.type('Chorus');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('ascii-tabs', el => el.annotations[0][1].text), 'Chorus');
    await page.click('.ascii-tabs-annotation[data-index="0"]');
    await page.keyboard.press('Backspace');
    await page.click('.ascii-tabs-annotation[data-index="1"]');
    assert.equal(await page.$eval(editor, el => el.value), 'Chorus');
    await page.keyboard.type('Bridge');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.annotations[0]), [{ column: 0, text: 'Bridge' }, { column: 1, text: 'Am' }]);
  });
});

test('editing is opt-in, readonly disables it, and programmatic updates stay silent', async () => {
  await withPage(markup, async page => {
    await ready(page);
    await page.$eval('ascii-tabs', el => {
      el.tabTitles = ['Title'];
      el.annotations = [];
      el.annotationsEditable = false;
      el.titlesEditable = false;
    });
    assert.equal(await page.$(slot(0)), null);
    assert.equal(await page.$('.ascii-tabs-title[role="button"]'), null);
    assert.deepEqual(await page.evaluate(() => window.events), []);
    await page.$eval('ascii-tabs', el => { el.annotationsEditable = true; el.titlesEditable = true; el.readonly = true; });
    assert.equal(await page.$(slot(0)), null);
    assert.equal(await page.$('.ascii-tabs-title[role="button"]'), null);
    assert.equal(await page.$eval('.ascii-tabs-title', el => el.textContent), 'Title');
  });
});


test('title validation is atomic and replacing Tabs preserves remaining titles', async () => {
  await withPage(markup, async page => {
    await ready(page);
    const result = await page.$eval('ascii-tabs', el => {
      el.setDocument({ value: [[], []], tabTitles: ['First', 'Second'] });
      const source = ['Original', 'Other'];
      el.tabTitles = source;
      source[0] = 'mutated';
      el.tabTitles[0] = 'mutated output';
      let invalid = false;
      try { el.setDocument({ value: [[]], tabTitles: [23] }); } catch (error) { invalid = error instanceof TypeError; }
      const before = el.tabTitles;
      el.value = [[]];
      const after = el.tabTitles;
      el.setDocument({ value: [[]] });
      return { invalid, before, after, cleared: el.tabTitles };
    });
    assert.deepEqual(result, { invalid: true, before: ['Original', 'Other'], after: ['Original'], cleared: [''] });
  });
});
