import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const root = new URL('../', import.meta.url);

test('flat Staff backgrounds stay transparent in automatic and forced themes', async () => {
  await withPage(`
    <ascii-tabs variant="flat"></ascii-tabs>
    <ascii-tabs variant="flat" theme="dark"></ascii-tabs>
    <ascii-tabs variant="flat" theme="light"></ascii-tabs>
    <script type="module" src="/ascii-tabs.js"></script>
  `, async page => {
    await page.waitForSelector('.ascii-tabs-staff');
    const backgrounds = () => page.$$eval('.ascii-tabs-staff', staffs => staffs.map(el => getComputedStyle(el).backgroundColor));
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    assert.deepEqual(await backgrounds(), Array(3).fill('rgba(0, 0, 0, 0)'));
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    assert.deepEqual(await backgrounds(), Array(3).fill('rgba(0, 0, 0, 0)'));
  });
});

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

test('flat Sheets keep the side tools clear of the Staffs', async () => {
  await withPage(`
    <ascii-tabs variant="flat" readonly></ascii-tabs>
    <script type="module" src="/ascii-tabs.js"></script>
  `, async page => {
    await page.setViewport({ width: 1640, height: 400 });
    await page.waitForSelector('ascii-tabs .ascii-tabs-sheet');
    const geometry = await page.$eval('ascii-tabs .ascii-tabs-sheet', sheet => {
      const tools = sheet.querySelector('.ascii-tabs-tools').getBoundingClientRect();
      const staff = sheet.querySelector('.ascii-tabs-line').getBoundingClientRect();
      return { clearance: tools.left - staff.right, tools: { left: tools.left, right: tools.right }, staff: { left: staff.left, right: staff.right } };
    });
    assert.ok(geometry.clearance >= 20, JSON.stringify(geometry));
  });
});

test('a consumer can customize the flat Staff background', async () => {
  await withPage(`
    <style>ascii-tabs { --ascii-tabs-flat-background: rebeccapurple; }</style>
    <ascii-tabs variant="flat"></ascii-tabs>
    <script type="module" src="/ascii-tabs.js"></script>
  `, async page => {
    await page.waitForSelector('ascii-tabs .ascii-tabs-staff');
    assert.equal(
      await page.$eval('ascii-tabs .ascii-tabs-staff', el => getComputedStyle(el).backgroundColor),
      'rgb(102, 51, 153)',
    );
  });
});

test('note colors accept CSS variables and invalid values cannot inject markup or styles', async () => {
  await withPage(`
    <ascii-tabs readonly style="--melody-color: #123456"></ascii-tabs>
    <script type="module" src="/ascii-tabs.js"></script>
  `, async page => {
    await page.waitForSelector('.ascii-tabs-cell');
    const result = await page.$eval('ascii-tabs', el => {
      el.value = [[[
        { fret: 3, color: 'var(--melody-color)' },
        { fret: 5, color: 'red; background: lime' },
        { fret: 7, color: '\"><img src=x onerror=alert(1)>' },
        9, { fret: 25, color: 'red' }, null,
      ]]];
      const notes = [...el.querySelectorAll('.ascii-tabs-fret')];
      return {
        colors: notes.map(note => getComputedStyle(note).color),
        backgrounds: notes.map(note => note.style.background),
        images: el.querySelectorAll('img').length,
        invalidFret: el.value[0][0][4],
      };
    });
    assert.equal(result.colors[0], 'rgb(18, 52, 86)');
    assert.equal(result.colors[1], result.colors[3]);
    assert.equal(result.colors[2], result.colors[3]);
    assert.deepEqual(result.backgrounds, ['', '', '', '']);
    assert.equal(result.images, 0);
    assert.equal(result.invalidFret, null);
  });
});
