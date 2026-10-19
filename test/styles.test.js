import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const root = new URL('../', import.meta.url);

test('annotations track logical Columns across slider, notation, labels and width changes', async () => {
  await withPage(`
    <ascii-tabs style="width: 480px"><ascii-tabs-spacing></ascii-tabs-spacing><ascii-tabs-sheet></ascii-tabs-sheet></ascii-tabs>
    <script type="module" src="/ascii-tabs.js"></script>
  `, async page => {
    await page.waitForSelector('.ascii-tabs-cell');
    await page.$eval('ascii-tabs', el => el.setDocument({
      value: [Array.from({ length: 20 }, (_, c) => [c % 2 ? 12 : 3, null, null, null, null, null])],
      annotations: [[{ column: 1, text: 'Dm*' }, { column: 7, text: 'Dm/F*' }, { column: 19, text: 'Dm/A' }]],
    }));
    for (const spacing of [1, 2, 6]) {
      for (const notation of ['frets', 'letters', 'solfege']) {
        const result = await page.$eval('ascii-tabs', (el, { spacing, notation }) => {
          const slider = el.querySelector('.ascii-tabs-spacing-input');
          slider.value = spacing;
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          el.notation = notation;
          el.labels = spacing === 2 ? 'none' : 'notes';
          const charWidth = el.querySelector('.ascii-tabs-probe').getBoundingClientRect().width / 10;
          return [...el.querySelectorAll('.ascii-tabs-annotation')].map(annotation => {
            const cell = annotation.closest('.ascii-tabs-staff').querySelector(`.ascii-tabs-cell[data-c="${annotation.dataset.column}"][data-s="0"]`);
            const box = annotation.getBoundingClientRect();
            return { delta: box.left - cell.getBoundingClientRect().left - Math.ceil(spacing / 2) * charWidth, above: box.bottom <= cell.getBoundingClientRect().top };
          });
        }, { spacing, notation });
        assert.equal(result.length, 3);
        assert.ok(result.every(r => Math.abs(r.delta) < .1 && r.above));
      }
    }
    await page.$eval('ascii-tabs', el => { el.style.width = '280px'; el.style.setProperty('--ascii-tabs-font-size', '18px'); });
    await page.waitForFunction(() => {
      const el = document.querySelector('ascii-tabs');
      const charWidth = el.querySelector('.ascii-tabs-probe').getBoundingClientRect().width / 10;
      return [...el.querySelectorAll('.ascii-tabs-annotation')].every(a => {
        const cell = a.closest('.ascii-tabs-staff').querySelector(`.ascii-tabs-cell[data-c="${a.dataset.column}"][data-s="0"]`).getBoundingClientRect();
        const box = a.getBoundingClientRect();
        return Math.abs(box.left - cell.left - Math.ceil(el.spacing / 2) * charWidth) < .1 && box.bottom <= cell.top;
      });
    });
    assert.equal(await page.$$eval('.ascii-tabs-annotation', els => els.length), 3);
  });
});

test('colliding multiline annotations reserve height and clear without changing note layout', async () => {
  await withPage('<ascii-tabs readonly style="width: 320px"></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>', async page => {
    await page.waitForSelector('.ascii-tabs-staff');
    const original = await page.$eval('ascii-tabs', el => {
      el.value = [Array.from({ length: 20 }, () => [1, 3, 2, 0, null, null])];
      const original = { value: el.value, height: el.getBoundingClientRect().height };
      el.annotations = [[{ column: 0, text: 'RE MENOR\nIntro' }, { column: 0, text: 'duplicate' }, { column: 1, text: 'Long annotation '.repeat(8) }, { column: 8, text: 'Verse' }]];
      return original;
    });
    const separated = await page.$eval('ascii-tabs', el => [...el.querySelectorAll('.ascii-tabs-staff')].every(staff => {
      const boxes = [...staff.querySelectorAll('.ascii-tabs-annotation')].map(a => a.getBoundingClientRect());
      const first = staff.querySelector('.ascii-tabs-line').getBoundingClientRect();
      return boxes.every((box, i) => box.bottom <= first.top && boxes.slice(i + 1).every(other => box.right <= other.left || other.right <= box.left || box.bottom <= other.top || other.bottom <= box.top));
    }));
    assert.equal(separated, true);
    assert.deepEqual(await page.$eval('ascii-tabs', el => el.value), original.value);
    await page.$eval('ascii-tabs', el => { el.annotations = null; });
    assert.equal(await page.$$eval('.ascii-tabs-annotations', els => els.length), 0);
    assert.equal(await page.$eval('ascii-tabs', el => el.getBoundingClientRect().height), original.height);
  });
});

test('HTML annotations render markup, copy text and reflow when their content changes size', async () => {
  await withPage('<ascii-tabs style="width: 480px"></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>', async page => {
    await page.waitForSelector('.ascii-tabs-cell');
    const result = await page.$eval('ascii-tabs', async el => {
      const entries = [[
        { column: 0, html: '<strong>Dm</strong><sup>*</sup><br>Intro &amp; verse' },
        { column: 0, html: '<span style="display:inline-block;height:25px">Dm/F</span>', text: 'D minor over F' },
        { column: 1, text: '<em>literal</em>' },
      ]];
      el.setDocument({ value: [[[1, 3, 2, 0, null, null], [3, null, null, null, null, null]]], annotations: entries });
      entries[0][0].html = 'mutated input';
      el.annotations[0][0].html = 'mutated output';
      navigator.clipboard.writeText = async text => { window.copied = text; };
      await el.copy();
      return { text: window.copied, annotations: el.annotations, strong: el.querySelector('.ascii-tabs-annotation strong').textContent, sup: el.querySelector('.ascii-tabs-annotation sup').textContent, literal: el.querySelector('.ascii-tabs-annotation[data-column="1"]').textContent };
    });
    assert.equal(result.strong, 'Dm');
    assert.equal(result.sup, '*');
    assert.equal(result.literal, '<em>literal</em>');
    assert.equal(result.annotations[0][0].html, '<strong>Dm</strong><sup>*</sup><br>Intro &amp; verse');
    assert.match(result.text, /Dm\*\n {3}Intro & verse/);
    assert.match(result.text, /D minor over F/);
    assert.doesNotMatch(result.text, /<strong>|<sup>|<br>/);
    await page.$eval('.ascii-tabs-annotation span', span => { span.style.height = '140px'; });
    await page.waitForFunction(() => {
      const annotations = [...document.querySelectorAll('.ascii-tabs-annotation')];
      const boxes = annotations.map(a => a.getBoundingClientRect());
      const line = document.querySelector('.ascii-tabs-line').getBoundingClientRect();
      return document.querySelector('.ascii-tabs-annotation span').getBoundingClientRect().height >= 140 && boxes.every((box, i) => box.bottom <= line.top && boxes.slice(i + 1).every(other => box.right <= other.left || other.right <= box.left || box.bottom <= other.top || other.bottom <= box.top));
    });
    const errors = await page.$eval('ascii-tabs', el => {
      let errors = 0;
      for (const entry of [{ column: 0 }, { column: 0, html: 3 }, { column: 0, html: '<b>Dm</b>', text: null }]) {
        try { el.annotations = [[entry]]; } catch (error) { if (error instanceof TypeError) errors++; }
      }
      return errors;
    });
    assert.equal(errors, 3);
  });
});

test('annotations set before upgrade are literal text, copied and independently owned', async () => {
  await withPage(`
    <ascii-tabs id="song"></ascii-tabs>
    <script>
      song.value = [[[1, 3, 2, 0, null, null]], [[3, null, null, null, null, null]]];
      song.annotations = [[{ column: 0, text: '<b>Dm*</b>' }], [{ column: 0, text: 'Verse' }]];
    </script>
    <script type="module" src="/ascii-tabs.js"></script>
  `, async page => {
    await page.waitForSelector('.ascii-tabs-annotation');
    assert.equal(await page.$eval('.ascii-tabs-annotation', el => el.textContent), '<b>Dm*</b>');
    assert.equal(await page.$$eval('.ascii-tabs-annotation b', els => els.length), 0);
    const result = await page.$eval('ascii-tabs', async el => {
      let changes = 0;
      el.addEventListener('change', () => changes++);
      const annotations = [[{ column: 0, text: 'Intro' }], [{ column: 0, text: 'Verse' }]];
      el.annotations = annotations;
      annotations[0][0].text = 'mutated input';
      el.annotations[0][0].text = 'mutated output';
      el.value = el.value;
      navigator.clipboard.writeText = async text => { window.copied = text; };
      await el.copy();
      const text = window.copied;
      el.removeTab(0);
      return { text, annotations: el.annotations, changes };
    });
    assert.match(result.text, /^   Intro\n1 -1-/);
    assert.deepEqual(result.annotations, [[{ column: 0, text: 'Verse' }]]);
    assert.equal(result.changes, 1);
  });
});

test('annotation validation is atomic and fixed geometry keeps anchors at the supplied centers', async () => {
  await withPage('<ascii-tabs></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>', async page => {
    await page.waitForSelector('.ascii-tabs-staff');
    const result = await page.$eval('ascii-tabs', el => {
      el.setDocument({ value: [[[3, null, null, null, null, null], [null, null, null, null, null, null]]], columnLayout: [{ width: 180, positions: [40, 150] }], annotations: [[{ column: 1, text: 'Dm/F*' }, { column: 0, text: 'Intro\nLong annotation' }]] });
      const before = { value: el.value, annotations: el.annotations, geometry: el.columnLayout };
      let errors = 0;
      for (const column of [-1, .5, 2, NaN]) {
        try { el.annotations = [[{ column, text: 'invalid' }]]; } catch (e) { if (e instanceof TypeError) errors++; }
      }
      try { el.setDocument({ value: [[]], annotations: [[{ column: 0, text: 'invalid' }]] }); } catch (e) { if (e instanceof TypeError) errors++; }
      const after = { value: el.value, annotations: el.annotations, geometry: el.columnLayout };
      const anchors = [...el.querySelectorAll('.ascii-tabs-annotation')].map(a => {
        const area = el.querySelector('.ascii-tabs-area').getBoundingClientRect();
        const box = a.getBoundingClientRect();
        return { position: box.left - area.left, above: box.bottom <= area.top };
      });
      el.columnLayout = null;
      const preserved = el.value[0].length;
      el.setDocument({ value: el.value });
      return { before, after, errors, anchors, preserved, cleared: el.annotations };
    });
    assert.deepEqual(result.after, result.before);
    assert.equal(result.errors, 5);
    assert.ok(result.anchors.every((a, i) => Math.abs(a.position - [40, 150][i]) < .1 && a.above));
    assert.equal(result.preserved, 2);
    assert.deepEqual(result.cleared, []);
  });
});

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


test('per-note bold accepts booleans, preserves the default and combines with colors', async () => {
  await withPage('<ascii-tabs></ascii-tabs><script type="module" src="/ascii-tabs.js"></script>', async page => {
    await page.waitForSelector('.ascii-tabs-cell');
    const result = await page.$eval('ascii-tabs', el => {
      el.value = [[[
        { fret: 3, bold: true, color: 'royalblue' },
        { fret: 5, bold: false },
        7, { fret: 9 }, { fret: 12, bold: 'false' }, null,
      ]]];
      return {
        weights: [...el.querySelectorAll('.ascii-tabs-fret')].map(note => getComputedStyle(note).fontWeight),
        color: getComputedStyle(el.querySelector('.ascii-tabs-fret')).color,
        invalid: el.value[0][0][4],
      };
    });
    assert.deepEqual(result.weights, ['700', '400', '700', '700', '700']);
    assert.equal(result.color, 'rgb(65, 105, 225)');
    assert.deepEqual(result.invalid, { fret: 12 });
    await page.click('.ascii-tabs-cell[data-c="0"][data-s="1"]');
    assert.equal(await page.$eval('.ascii-tabs-cur .ascii-tabs-fret', el => getComputedStyle(el).fontWeight), '400');
  });
});
