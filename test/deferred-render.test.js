import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

test('hidden panels defer rendering and reuse the visible DOM at the same width', async t => {
  const source = await readFile(new URL('../ascii-tabs.js', import.meta.url));
  const server = createServer((req, res) => {
    res.setHeader('content-type', req.url === '/ascii-tabs.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/ascii-tabs.js' ? source : '<script type="module" src="/ascii-tabs.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async () => {
      await customElements.whenDefined('ascii-tabs');
      window.renderCosts = [];
      const Observer = window.ResizeObserver;
      window.ResizeObserver = class extends Observer {
        constructor(callback) {
          super((...args) => {
            const start = performance.now();
            callback(...args);
            window.renderCosts.push(performance.now() - start);
          });
        }
      };
      for (let i = 0; i < 87; i++) {
        const panel = document.createElement('section');
        panel.hidden = true;
        panel.style.width = '800px';
        const el = document.createElement('ascii-tabs');
        el.readonly = true;
        el.setDocument({
          value: [Array.from({ length: 120 }, (_, c) => [c % 13, null, 2, null, null, null])],
          annotations: [Array.from({ length: 30 }, (_, c) => ({ column: c * 4, html: '<button>Play</button>', text: 'Play' }))],
        });
        panel.append(el);
        document.body.append(panel);
      }
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const initial = await page.evaluate(() => ({ cells: document.querySelectorAll('.ascii-tabs-cell').length, value: document.querySelector('ascii-tabs').value[0].length, annotations: document.querySelector('ascii-tabs').annotations[0].length }));
    t.diagnostic(`Hidden initial cells: ${initial.cells}`);
    assert.equal(initial.cells, 0);
    assert.equal(initial.value, 120);
    assert.equal(initial.annotations, 30);
    const costs = [];
    const taskCosts = [];
    for (let i = 0; i < 75; i++) {
      const before = await page.metrics();
      const cost = await page.evaluate(async i => {
        window.renderCosts.length = 0;
        const panels = document.querySelectorAll('body > section');
        if (i) panels[i - 1].hidden = true;
        panels[i].hidden = false;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return window.renderCosts.reduce((sum, cost) => sum + cost, 0);
      }, i);
      costs.push(cost);
      taskCosts.push(((await page.metrics()).TaskDuration - before.TaskDuration) * 1000);
    }
    t.diagnostic(`75 panel reveals: mean ${(costs.reduce((a, b) => a + b) / costs.length).toFixed(2)} ms, max ${Math.max(...costs).toFixed(2)} ms in ResizeObserver callbacks`);
    t.diagnostic(`Main-thread work per reveal (including style/layout): mean ${(taskCosts.reduce((a, b) => a + b) / taskCosts.length).toFixed(2)} ms, max ${Math.max(...taskCosts).toFixed(2)} ms`);
    assert.ok(costs.every(cost => cost < 30), 'each reveal must spend less than 30 ms rendering');
    assert.ok(taskCosts.reduce((a, b) => a + b) / taskCosts.length < 30, 'mean total main-thread work per reveal must stay below 30 ms');
    const reused = await page.evaluate(async () => {
      const panel = document.querySelectorAll('body > section')[74];
      const el = panel.firstElementChild;
      const cell = el.querySelector('.ascii-tabs-cell');
      panel.hidden = true;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      panel.hidden = false;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return cell === el.querySelector('.ascii-tabs-cell');
    });
    assert.equal(reused, true);

    const lifecycle = await page.evaluate(async () => {
      const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const panel = document.querySelectorAll('body > section')[86];
      const el = panel.firstElementChild;
      el.setDocument({ value: [[[7, null, null, null, null, null]]], annotations: [[{ column: 0, html: '<button>Updated</button>' }]], tabTitles: ['Hidden update'] });
      el.spacing = 4;
      const hidden = { cells: el.querySelectorAll('.ascii-tabs-cell').length, fret: el.value[0][0][0], title: el.tabTitles[0] };
      panel.hidden = false;
      await frames();
      const updated = el.querySelector('.ascii-tabs-annotation').textContent;
      const cell = el.querySelector('.ascii-tabs-cell');
      panel.hidden = true;
      panel.style.width = '360px';
      await frames();
      panel.hidden = false;
      await frames();
      const resized = cell !== el.querySelector('.ascii-tabs-cell');
      const retained = el.querySelector('.ascii-tabs-cell');
      el.remove();
      panel.append(el);
      await frames();
      const reconnected = retained === el.querySelector('.ascii-tabs-cell');
      el.style.width = '0px';
      await frames();
      el.annotations = [[{ column: 0, text: 'Zero width update' }]];
      const before = el.querySelector('.ascii-tabs-annotation').textContent;
      el.style.width = '';
      await frames();
      return { hidden, updated, resized, reconnected, before, after: el.querySelector('.ascii-tabs-annotation').textContent };
    });
    assert.deepEqual(lifecycle, {
      hidden: { cells: 0, fret: 7, title: 'Hidden update' }, updated: 'Updated', resized: true, reconnected: true,
      before: 'Updated', after: 'Zero width update',
    });

    const before = await page.metrics();
    await page.evaluate(() => {
      const el = document.querySelectorAll('ascii-tabs')[86];
      el.annotations = [Array.from({ length: 60 }, () => ({ column: 0, html: '<button>Collision</button>' }))];
    });
    const layouts = (await page.metrics()).LayoutCount - before.LayoutCount;
    t.diagnostic(`Layouts for 60 HTML annotations: ${layouts}`);
    assert.ok(layouts <= 6, 'layout passes must be batched rather than grow per annotation');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
