// axe-core over the demo page in light and dark, idle and while editing a cell.
// Lighthouse alone isn't enough: axe reports the contrast of 1–3 character text (Frets, dashes,
// String labels) as "incomplete" when it fails, and Lighthouse drops incomplete results.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer';

const PAGES = ['index.html'];
const SCHEMES = ['light', 'dark'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.md': 'text/markdown' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, resolve));
const origin = `http://localhost:${server.address().port}`;

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });

const states = {
  idle: async () => {},
  // Focus a cell of the first editable element, so the current-cell colours get checked
  editing: async tab => {
    const cell = await tab.$('ascii-tabs:not([readonly]) .ascii-tabs-cell');
    await cell.click();
  },
};

let failures = 0;
for (const path of PAGES) {
  for (const scheme of SCHEMES) {
    for (const [state, enter] of Object.entries(states)) {
      const tab = await browser.newPage();
      await tab.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      await tab.goto(`${origin}/${path}`, { waitUntil: 'networkidle0' });
      await enter(tab);
      await tab.addScriptTag({ content: axeSource });
      const { violations, incomplete } = await tab.evaluate(tags => axe.run(document, { runOnly: tags }), TAGS);
      const problems = [...violations, ...incomplete.filter(result => result.id === 'color-contrast')];
      console.log(`${problems.length ? '✗' : '✓'} ${path} · ${scheme} · ${state}`);
      for (const problem of problems) {
        failures++;
        console.log(`  ${problem.id}: ${problem.help} (${problem.nodes.length})`);
        for (const node of problem.nodes.slice(0, 5)) {
          const check = [...node.any, ...node.all, ...node.none][0];
          console.log(`    ${node.html.slice(0, 100)}\n      ${check?.message ?? ''}`);
        }
      }
      await tab.close();
    }
  }
}

await browser.close();
server.close();
process.exit(failures ? 1 : 0);
