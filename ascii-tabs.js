// <ascii-tabs>: a zero-dependency web component to write and show guitar tabs as plain ASCII.
// Light DOM, `.ascii-tabs-*` classes, `--ascii-tabs-*` custom properties (see docs/adr/0002-light-dom.md).
// Vocabulary (Tab, Column, String, Fret, Sheet, Staff, Spacing, Hint) follows GLOSSARY.md.

const STRING_COUNT = 6;
const MAX_FRET = 24;
const LABEL_WIDTH = 2; // "1 "
const DEFAULT_SPACING = 2;
const MIN_SPACING = 1;
const MAX_SPACING = 6;
const DEFAULT_CAPACITY = 48; // characters per Staff before the element is measured

// String labels, String 1 to 6: numbers by default, notes in standard tuning
const LABELS = {
  numbers: ['1 ', '2 ', '3 ', '4 ', '5 ', '6 '],
  notes: ['e|', 'B|', 'G|', 'D|', 'A|', 'E|'],
};
const labelStyle = value => (value === 'notes' ? 'notes' : 'numbers');
const toolsPosition = value => (value === 'top' ? 'top' : 'side');

const emptyColumn = () => Array(STRING_COUNT).fill(null);

const clampSpacing = n => {
  const spacing = Math.round(Number(n));
  return Number.isFinite(spacing) ? Math.min(MAX_SPACING, Math.max(MIN_SPACING, spacing)) : DEFAULT_SPACING;
};

const isFret = v => Number.isInteger(v) && v >= 0 && v <= MAX_FRET;

// Index of the last Column that holds a Fret, or -1 for an empty Tab
const lastUsed = tab => {
  for (let i = tab.length - 1; i >= 0; i--) if (tab[i].some(v => v !== null)) return i;
  return -1;
};

// A Column is as wide as its Spacing plus its widest Fret, so Frets never touch
const columnDigits = column => Math.max(1, ...column.map(v => (v === null ? 1 : String(v).length)));
const columnWidth = (column, spacing) => spacing + columnDigits(column);
const leadingDashes = spacing => Math.ceil(spacing / 2);
const visualDashes = count =>
  count ? `<span class="ascii-tabs-string" aria-hidden="true">${'-'.repeat(count)}</span>` : '';

// Split Columns into Staves: [start, end) ranges that fit `capacity` characters
function layout(tab, spacing, capacity) {
  const staves = [];
  let start = 0;
  let used = 0;
  for (let c = 0; c < tab.length; c++) {
    const width = columnWidth(tab[c], spacing);
    if (c > start && used + width > capacity) {
      staves.push([start, c]);
      start = c;
      used = 0;
    }
    used += width;
  }
  if (tab.length > start) staves.push([start, tab.length]);
  return staves;
}

// One Tab as plain ASCII, every Staff cut right after its last Column
function format(tab, { spacing = DEFAULT_SPACING, labels = 'numbers', width = Infinity } = {}) {
  const columns = tab.slice(0, lastUsed(tab) + 1);
  if (!columns.length) return '';
  const lead = '-'.repeat(leadingDashes(spacing));
  const trail = '-'.repeat(spacing - lead.length);
  return layout(columns, spacing, width - LABEL_WIDTH)
    .map(([start, end]) => {
      const lines = [];
      for (let s = 0; s < STRING_COUNT; s++) {
        let line = LABELS[labelStyle(labels)][s];
        for (let c = start; c < end; c++) {
          const digits = columnDigits(columns[c]);
          const fret = columns[c][s] === null ? '-' : String(columns[c][s]);
          line += lead + fret.padEnd(digits, '-') + trail;
        }
        lines.push(line);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

const LABEL_PATTERN = /^\s*(?:[1-6][ \t]?|[eBGDAE])\|?/;

// Plain ASCII to one Tab. Lenient: both String label styles, any number of dashes.
// Columns are inferred from the horizontal position of each Fret. Malformed input yields an empty Tab.
function parse(ascii) {
  const lines = String(ascii).split(/\r?\n/);
  const staves = [];
  let group = [];
  const flush = () => {
    if (!group.length) return true;
    if (group.length !== STRING_COUNT) return false;
    staves.push(group);
    group = [];
    return true;
  };
  const fail = reason => {
    console.error(`ascii-tabs: cannot parse tab (${reason})`);
    return [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      if (!flush()) return fail('a Staff needs six Strings');
      continue;
    }
    const label = LABEL_PATTERN.exec(line);
    if (!label) return fail(`unexpected line "${line.trim()}"`);
    const body = line.slice(label[0].length);
    if (!/^[-|\d\s]*$/.test(body)) return fail(`unexpected characters in "${line.trim()}"`);
    group.push(body);
  }
  if (!flush()) return fail('a Staff needs six Strings');

  const tab = [];
  for (const staff of staves) {
    const columns = new Map(); // start position -> { digits, frets }
    for (let s = 0; s < STRING_COUNT; s++) {
      for (const match of staff[s].matchAll(/\d+/g)) {
        const fret = Number(match[0]);
        if (!isFret(fret)) return fail(`fret ${match[0]} is out of range`);
        const at = columns.get(match.index) ?? { digits: 0, frets: emptyColumn() };
        at.digits = Math.max(at.digits, match[0].length);
        at.frets[s] = fret;
        columns.set(match.index, at);
      }
    }
    const starts = [...columns.keys()].sort((a, b) => a - b);
    // One Column is the smallest step between Frets; wider gaps hide empty Columns
    const steps = starts.slice(1).map((start, i) => start - starts[i] - (columns.get(starts[i]).digits - 1));
    const unit = Math.min(...steps.filter(step => step > 0));
    starts.forEach((start, i) => {
      if (i > 0 && steps[i - 1] > 0) {
        for (let n = Math.round(steps[i - 1] / unit) - 1; n > 0; n--) tab.push(emptyColumn());
      }
      tab.push(columns.get(start).frets);
    });
  }
  return tab;
}

const MESSAGES_EN = {
  hint: 'Click a string and type the fret number.',
  copy: 'Copy tab',
  copied: 'Copied',
  delete: 'Delete tab',
  add: 'New tab',
  fret: 'Fret',
  spacing: 'Spacing',
};

const MESSAGES_ES = {
  hint: 'Hacé clic en una cuerda y escribí el número de traste.',
  copy: 'Copiar tablatura',
  copied: 'Copiado',
  delete: 'Eliminar tablatura',
  add: 'Nueva tablatura',
  fret: 'Traste',
  spacing: 'Espaciado',
};

const PRESETS = { en: MESSAGES_EN, es: MESSAGES_ES };


// Lucide icons, inlined
const svg = paths =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON_COPY = svg('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
const ICON_CHECK = svg('<path d="M20 6 9 17l-5-5"/>');
const ICON_TRASH = svg('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>');
const ICON_PLUS = svg('<path d="M5 12h14"/><path d="M12 5v14"/>');

const STYLE_ID = 'ascii-tabs-styles';
const STYLES = `
:where(ascii-tabs) {
  --ascii-tabs-paper: #fdfaf5;
  --ascii-tabs-sheet: #fff;
  --ascii-tabs-ink: #1a1a1a;
  --ascii-tabs-dash: #6f6c66;
  /* The ASCII dashes are the visual guitar strings, not text to be read aloud. */
  --ascii-tabs-string: #b3ada1;
  --ascii-tabs-line: #e7e2d6;
  --ascii-tabs-hover: #f4efe4;
  --ascii-tabs-focus: #f6e4df;
  --ascii-tabs-accent: #8b0000;
  --ascii-tabs-font: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --ascii-tabs-font-size: 22px;
  color-scheme: light;
}
/* Dark palette, from the original editor. Default theme follows the OS; [theme] forces one. */
@media (prefers-color-scheme: dark) {
  :where(ascii-tabs:not([theme="light"])) {
    --ascii-tabs-paper: #1b1a18;
    --ascii-tabs-sheet: #232220;
    --ascii-tabs-ink: #f1ede4;
    --ascii-tabs-dash: #959189;
    --ascii-tabs-string: #b3ada1;
    --ascii-tabs-line: #36342f;
    --ascii-tabs-hover: #2c2a27;
    --ascii-tabs-focus: #3a2a1d;
    --ascii-tabs-accent: #fb923c;
    color-scheme: dark;
  }
}
:where(ascii-tabs[theme="dark"]) {
  --ascii-tabs-paper: #1b1a18;
  --ascii-tabs-sheet: #232220;
  --ascii-tabs-ink: #f1ede4;
  --ascii-tabs-dash: #959189;
  --ascii-tabs-string: #b3ada1;
  --ascii-tabs-line: #36342f;
  --ascii-tabs-hover: #2c2a27;
  --ascii-tabs-focus: #3a2a1d;
  --ascii-tabs-accent: #fb923c;
  color-scheme: dark;
}
ascii-tabs {
  display: block;
  position: relative;
  font-family: var(--ascii-tabs-font);
  font-size: var(--ascii-tabs-font-size);
  color: var(--ascii-tabs-ink);
}
ascii-tabs .ascii-tabs-hint { margin: 0 0 16px; font-size: .7em; color: var(--ascii-tabs-dash); }
ascii-tabs .ascii-tabs-spacing { display: flex; align-items: center; gap: 12px; margin: 0 0 16px; font-size: 14px; }
ascii-tabs .ascii-tabs-spacing-input { accent-color: var(--ascii-tabs-accent); }
ascii-tabs .ascii-tabs-sheet {
  display: flex; gap: 12px;
  padding: 20px;
  background: var(--ascii-tabs-sheet);
  border: 1px solid var(--ascii-tabs-line);
  border-radius: 8px;
}
ascii-tabs .ascii-tabs-sheet + .ascii-tabs-sheet { margin-top: 24px; }
/* Sheet tools sit in a column beside the Staves (tools="side", the default) or in a row above them
   (tools="top"), never over a String. Negative margins tuck them into the Sheet's corner. */
ascii-tabs .ascii-tabs-tools {
  order: 1; display: flex; flex-direction: column; gap: 2px;
  align-self: flex-start; margin: 4px -14px 0 0;
}
ascii-tabs[tools="top"] .ascii-tabs-sheet { flex-direction: column; gap: 8px; }
ascii-tabs[tools="top"] .ascii-tabs-tools {
  order: -1; flex-direction: row; align-self: flex-end; margin-top: -14px;
}
ascii-tabs .ascii-tabs-button {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 32px; height: 32px; padding: 0;
  font: inherit; font-size: 14px;
  color: var(--ascii-tabs-dash);
  background: transparent; border: 0; border-radius: 6px; cursor: pointer;
}
ascii-tabs .ascii-tabs-button:hover:not(:disabled) { background: var(--ascii-tabs-hover); color: var(--ascii-tabs-accent); }
ascii-tabs .ascii-tabs-button:focus-visible { outline: 2px solid var(--ascii-tabs-accent); outline-offset: 1px; }
ascii-tabs .ascii-tabs-button:disabled { opacity: .4; cursor: default; }
ascii-tabs .ascii-tabs-button svg { width: 18px; height: 18px; }
ascii-tabs .ascii-tabs-button.ascii-tabs-done { color: var(--ascii-tabs-accent); }
ascii-tabs .ascii-tabs-add {
  display: flex; margin: 20px auto 0; width: 44px; height: 44px;
  background: var(--ascii-tabs-paper);
  border: 1px dashed var(--ascii-tabs-dash); border-radius: 50%;
}
ascii-tabs .ascii-tabs-add svg { width: 22px; height: 22px; }
/* Buttons with text instead of an icon grow to fit it */
ascii-tabs .ascii-tabs-button.ascii-tabs-labelled { padding: 0 8px; }
ascii-tabs .ascii-tabs-add.ascii-tabs-labelled { width: auto; padding: 0 16px; border-radius: 22px; }

ascii-tabs .ascii-tabs-tab { flex: 1; min-width: 0; white-space: pre; user-select: none; -webkit-user-select: none; }
ascii-tabs .ascii-tabs-staff + .ascii-tabs-staff { margin-top: 1.4em; }
ascii-tabs .ascii-tabs-line { display: block; height: 1.5em; line-height: 1.5em; }
ascii-tabs .ascii-tabs-label { color: var(--ascii-tabs-dash); }
ascii-tabs .ascii-tabs-string { color: var(--ascii-tabs-string); }
ascii-tabs .ascii-tabs-cell {
  display: inline-block; height: 1.5em;
  color: var(--ascii-tabs-dash); cursor: pointer; border-radius: 3px;
}
ascii-tabs .ascii-tabs-cell.ascii-tabs-has { cursor: grab; touch-action: none; }
ascii-tabs .ascii-tabs-fret { color: var(--ascii-tabs-ink); font-weight: 700; }
ascii-tabs .ascii-tabs-cell:hover { background: var(--ascii-tabs-hover); color: var(--ascii-tabs-accent); }
ascii-tabs.ascii-tabs-editing .ascii-tabs-cell.ascii-tabs-cur { background: var(--ascii-tabs-focus); color: var(--ascii-tabs-accent); }
ascii-tabs.ascii-tabs-editing .ascii-tabs-cell.ascii-tabs-cur .ascii-tabs-fret { color: var(--ascii-tabs-accent); }
/* Blinking caret that takes the place of the Fret dash */
ascii-tabs .ascii-tabs-caret { display: none; position: relative; }
ascii-tabs .ascii-tabs-caret::before {
  content: ''; position: absolute; left: 50%; top: .25em; bottom: .25em;
  width: 2px; margin-left: -1px; background: var(--ascii-tabs-accent);
  animation: ascii-tabs-blink 1s steps(1) infinite;
}
ascii-tabs.ascii-tabs-editing .ascii-tabs-cur .ascii-tabs-caret { display: inline; }
ascii-tabs.ascii-tabs-editing .ascii-tabs-cur .ascii-tabs-mid { display: none; }
@keyframes ascii-tabs-blink { 50% { opacity: 0; } }

ascii-tabs.ascii-tabs-dragging, ascii-tabs.ascii-tabs-dragging .ascii-tabs-cell { cursor: grabbing; }
ascii-tabs.ascii-tabs-dragging .ascii-tabs-cur .ascii-tabs-caret { display: none; }
ascii-tabs.ascii-tabs-dragging .ascii-tabs-cur .ascii-tabs-mid { display: inline; }
ascii-tabs .ascii-tabs-src .ascii-tabs-fret { opacity: .35; }
ascii-tabs .ascii-tabs-cell.ascii-tabs-drop {
  background: var(--ascii-tabs-focus); color: var(--ascii-tabs-accent);
  outline: 1px dashed var(--ascii-tabs-accent);
}

ascii-tabs[readonly] .ascii-tabs-cell { pointer-events: none; cursor: default; }

/* Captures typing (and opens the numeric keyboard on phones) while staying invisible */
ascii-tabs .ascii-tabs-input {
  position: absolute; width: 1px; height: 1px; opacity: 0;
  border: 0; padding: 0; font-size: 16px; pointer-events: none;
}
ascii-tabs .ascii-tabs-probe { position: absolute; visibility: hidden; white-space: pre; }
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.prepend(style);
}

// What <ascii-tabs-storage> keeps in localStorage: Tabs → Columns → 6 cells, each '' or the Fret as text
// (the shape the original editor stores). Reading is lenient: numbers and null work too, and so does
// a single Tab (an array of Columns) instead of an array of Tabs.
const serializeStored = tabs =>
  JSON.stringify(tabs.map(tab => tab.map(column => column.map(v => (v === null ? '' : String(v))))));

function readStored(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  // A Tab's entries are Columns (arrays); a Column's entries are cells. A cell at the top level means a single Tab
  const singleTab = raw.some(entry => Array.isArray(entry) && entry.some(cell => !Array.isArray(cell)));
  const tabs = (singleTab ? [raw] : raw).filter(Array.isArray).map(tab =>
    tab.filter(Array.isArray).map(column => column.map(v => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v))),
  );
  const normalized = normalizeValue(tabs);
  const hasFrets = normalized?.some(tab => lastUsed(tab) >= 0);
  return hasFrets ? normalized : null;
}

function normalizeValue(value) {
  if (!Array.isArray(value)) return null;
  const tabs = value.filter(Array.isArray).map(tab =>
    tab.map(column => {
      const out = emptyColumn();
      if (Array.isArray(column)) for (let s = 0; s < STRING_COUNT; s++) if (isFret(column[s])) out[s] = column[s];
      return out;
    }),
  );
  return tabs.length ? tabs : [[]];
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {}
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

const PART_PREFIX = 'ascii-tabs-';
const isPart = node => node.nodeType === 1 && node.localName.startsWith(PART_PREFIX);

// A part is { type, content, tools }: `content` replaces its default icon or text, `tools` are a sheet's parts
function readPart(el) {
  const type = el.localName.slice(PART_PREFIX.length);
  const hasContent = [...el.childNodes].some(n => (n.nodeType === 3 ? n.textContent.trim() : n.nodeType === 1 && !isPart(n)));
  const part = { type, content: hasContent ? [...el.childNodes].map(n => n.cloneNode(true)) : null };
  if (type === 'storage') part.key = el.getAttribute('key');
  if (type === 'sheet') part.tools = [...el.children].filter(isPart).map(readPart);
  return part;
}

const DEFAULT_SHEET_TOOLS = [{ type: 'copy' }, { type: 'delete' }];
const DEFAULT_EDITABLE = [{ type: 'hint' }, { type: 'sheet', tools: DEFAULT_SHEET_TOOLS }, { type: 'add' }];
const DEFAULT_READONLY = [{ type: 'sheet', tools: [{ type: 'copy' }] }];
const EDITING_PARTS = new Set(['hint', 'delete', 'add']);

// Lets the module load in Node, where `parse` and `format` are tested
const Base = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

class AsciiTabs extends Base {
  #tabs = [[]];
  #spacing = DEFAULT_SPACING;
  #capacity = DEFAULT_CAPACITY;
  #staves = [];
  #cur = null; // { t, c, s } focused cell
  #draft = null; // text typed in the focused cell, null if untouched
  #draftOrigin = null; // value the focused cell had before typing, for Escape
  #drag = null; // { t, c, s, x, y, moved } Fret being dragged
  #initialized = false;
  #resizeObserver = null;
  #input = null;
  #probe = null;
  #sheetsEl = null;
  #tabEls = [];
  #sheetEls = [];
  #sheetTools = [];

  #valueSet = false;
  #storageKey = null; // set by <ascii-tabs-storage key>, null means nothing is stored
  #messages = {};
  #declared = null; // parts the consumer wrote as children, null for the default composition

  get value() {
    return this.#tabs.map(tab => tab.slice(0, lastUsed(tab) + 1).map(column => [...column]));
  }

  set value(value) {
    const tabs = normalizeValue(value);
    if (!tabs) return;
    this.#valueSet = true;
    this.#tabs = tabs;
    this.#cur = null;
    this.#draft = null;
    if (this.#initialized) {
      this.#buildSheets();
      this.#render();
      this.#save();
    }
  }

  static observedAttributes = ['readonly', 'spacing', 'labels', 'lang', 'tools'];

  // Strings: the `lang` preset (English by default) with `messages` merged over it
  get #text() {
    const lang = (this.getAttribute('lang') ?? '').toLowerCase().split('-')[0];
    return { ...(PRESETS[lang] ?? MESSAGES_EN), ...this.#messages };
  }

  get messages() {
    return { ...this.#text };
  }

  set messages(value) {
    this.#messages = value && typeof value === 'object' ? { ...value } : {};
    this.#rebuild();
  }

  #rebuild() {
    if (!this.#initialized) return;
    this.#cur = null;
    this.#endTyping();
    this.#buildFrame();
    this.#buildSheets();
  }

  get theme() {
    const theme = this.getAttribute('theme');
    return theme === 'light' || theme === 'dark' ? theme : null;
  }

  set theme(value) {
    if (value === 'light' || value === 'dark') this.setAttribute('theme', value);
    else this.removeAttribute('theme');
  }

  get labels() {
    return labelStyle(this.getAttribute('labels'));
  }

  set labels(value) {
    this.setAttribute('labels', labelStyle(value));
  }

  get tools() {
    return toolsPosition(this.getAttribute('tools'));
  }

  set tools(value) {
    this.setAttribute('tools', toolsPosition(value));
  }

  get spacing() {
    return this.#spacing;
  }

  set spacing(value) {
    this.setAttribute('spacing', String(clampSpacing(value)));
  }

  get readonly() {
    return this.hasAttribute('readonly');
  }

  set readonly(on) {
    this.toggleAttribute('readonly', Boolean(on));
  }

  attributeChangedCallback(name) {
    if (name === 'spacing') return this.#applySpacing();
    if (name === 'labels') return this.#render();
    // Moving the tools changes the Staves' width without resizing the element
    if (name === 'tools') return this.#measure();
    this.#rebuild();
  }

  // `spacing` attribute (or property) to state: slider, Staff width and view follow
  #applySpacing() {
    this.#spacing = this.hasAttribute('spacing') ? clampSpacing(this.getAttribute('spacing')) : DEFAULT_SPACING;
    if (!this.#initialized) return;
    for (const slider of this.querySelectorAll('.ascii-tabs-spacing-input')) slider.value = this.#spacing;
    this.#measure();
    this.#render();
  }

  connectedCallback() {
    // While the page is still being parsed, the children are not there yet
    if (!this.#initialized && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.isConnected && this.connectedCallback(), { once: true });
      return;
    }
    // Properties set before the element was upgraded shadow the accessors
    for (const name of ['value', 'readonly', 'spacing', 'labels', 'tools', 'theme', 'messages']) {
      if (Object.hasOwn(this, name)) {
        const own = this[name];
        delete this[name];
        this[name] = own;
      }
    }
    if (!this.#initialized) {
      this.#initialized = true;
      if (!this.#valueSet) {
        const pres = [...this.querySelectorAll('pre')];
        if (pres.length) this.#tabs = pres.map(pre => parse(pre.textContent));
      }
      // Storage is data, not interface: a root with only that part still gets the default composition
      const parts = [...this.children].filter(isPart).map(readPart);
      const storage = parts.find(part => part.type === 'storage');
      const interfaceParts = parts.filter(part => part.type !== 'storage');
      if (interfaceParts.length) this.#declared = interfaceParts;
      if (storage?.key) {
        this.#storageKey = storage.key;
        this.#load();
      }
      injectStyles();
      this.#buildFrame();
      this.#buildSheets();
      this.addEventListener('pointerdown', this.#onPointerDown);
      this.addEventListener('click', this.#onClick);
    }
    addEventListener('pointermove', this.#onPointerMove);
    addEventListener('pointerup', this.#onPointerUp);
    addEventListener('pointercancel', this.#onPointerCancel);
    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => this.#measure());
      this.#resizeObserver.observe(this);
    }
    this.#measure(true);
  }

  disconnectedCallback() {
    removeEventListener('pointermove', this.#onPointerMove);
    removeEventListener('pointerup', this.#onPointerUp);
    removeEventListener('pointercancel', this.#onPointerCancel);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
  }

  // --- Frame --------------------------------------------------------------

  #el(tag, className, parent) {
    const el = document.createElement(tag);
    el.className = className;
    parent?.appendChild(el);
    return el;
  }

  #button(className, label, icon, parent, content) {
    const button = this.#el('button', `ascii-tabs-button ${className}`, parent);
    button.type = 'button';
    button.title = label;
    if (content) button.replaceChildren(...content.map(n => n.cloneNode(true)));
    else button.innerHTML = icon;
    // Visible text is the accessible name; only icon buttons need one spelled out
    if (button.textContent.trim()) button.classList.add('ascii-tabs-labelled');
    else button.setAttribute('aria-label', label);
    button._custom = Boolean(content);
    return button;
  }

  // The parts to render: the declared ones, or the default composition. Read-only hides the editing parts
  #parts() {
    const parts = this.#declared ?? (this.readonly ? DEFAULT_READONLY : DEFAULT_EDITABLE);
    const visible = list => list.filter(part => !(this.readonly && EDITING_PARTS.has(part.type)));
    return visible(parts).map(part => (part.tools ? { ...part, tools: visible(part.tools) } : part));
  }

  #buildFrame() {
    this.textContent = '';
    this.#sheetsEl = null;
    this.#sheetTools = [];
    this.#tabEls = [];
    this.#sheetEls = [];
    for (const part of this.#parts()) {
      if (part.type === 'hint') {
        const hint = this.#el('p', 'ascii-tabs-hint', this);
        if (part.content) hint.replaceChildren(...part.content.map(n => n.cloneNode(true)));
        else hint.textContent = this.#text.hint;
      } else if (part.type === 'sheet' && !this.#sheetsEl) {
        this.#sheetsEl = this.#el('div', 'ascii-tabs-sheets', this);
        this.#sheetTools = part.tools ?? [];
      } else if (part.type === 'spacing') {
        const label = this.#el('label', 'ascii-tabs-spacing', this);
        const text = this.#el('span', 'ascii-tabs-spacing-label', label);
        if (part.content) text.replaceChildren(...part.content.map(n => n.cloneNode(true)));
        else text.textContent = this.#text.spacing;
        const slider = this.#el('input', 'ascii-tabs-spacing-input', label);
        slider.type = 'range';
        slider.min = MIN_SPACING;
        slider.max = MAX_SPACING;
        slider.step = 1;
        slider.value = this.#spacing;
        slider.addEventListener('input', () => (this.spacing = slider.value));
      } else if (part.type === 'add') {
        const add = this.#button('ascii-tabs-add', this.#text.add, ICON_PLUS, this, part.content);
        add.addEventListener('pointerdown', e => e.preventDefault()); // stay focused through the click
      }
    }
    const input = (this.#input = this.#el('input', 'ascii-tabs-input', this));
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', this.#text.fret);
    input.setAttribute('tabindex', '-1');
    input.addEventListener('keydown', this.#onKeyDown);
    input.addEventListener('input', this.#onInput);
    input.addEventListener('focus', () => this.classList.add('ascii-tabs-editing'));
    input.addEventListener('blur', () => {
      this.classList.remove('ascii-tabs-editing');
      this.#endTyping();
      this.#cur = null;
      this.#render();
    });
    this.#probe = this.#el('span', 'ascii-tabs-probe', this);
    this.#probe.textContent = '0000000000';
  }

  // Sheets (with their buttons) are only rebuilt when Tabs are added or removed
  #buildSheets() {
    if (!this.#sheetsEl) return;
    this.#sheetsEl.textContent = '';
    this.#sheetEls = [];
    this.#tabEls = [];
    this.#tabs.forEach((_, t) => {
      const sheet = this.#el('section', 'ascii-tabs-sheet', this.#sheetsEl);
      sheet.dataset.t = t;
      const tools = this.#el('div', 'ascii-tabs-tools', sheet);
      for (const tool of this.#sheetTools) {
        if (tool.type === 'copy') this.#button('ascii-tabs-copy', this.#text.copy, ICON_COPY, tools, tool.content);
        else if (tool.type === 'delete') this.#button('ascii-tabs-delete', this.#text.delete, ICON_TRASH, tools, tool.content);
      }
      if (!tools.children.length) tools.remove();
      this.#tabEls.push(this.#el('div', 'ascii-tabs-tab', sheet));
      this.#sheetEls.push(sheet);
    });
    this.#measure();
    this.#render();
  }

  // --- Layout ---------------------------------------------------------------

  #measure(force = false) {
    const tabEl = this.#tabEls[0];
    if (!tabEl || !this.#probe) return;
    const charWidth = this.#probe.getBoundingClientRect().width / 10;
    if (!charWidth || !tabEl.clientWidth) return;
    const chars = Math.floor(tabEl.clientWidth / charWidth);
    const capacity = Math.max(chars - LABEL_WIDTH, 4 * (this.#spacing + 1));
    if (capacity !== this.#capacity || force) {
      this.#capacity = capacity;
      this.#render();
    }
  }

  // Always leave room after the last Fret; a new Staff appears when you write past the end
  #fit(t) {
    const tab = this.#tabs[t];
    const need = Math.max(lastUsed(tab) + (this.readonly ? 1 : 2), this.#cur && this.#cur.t === t ? this.#cur.c + 1 : 0, 1);
    while (tab.length < need) tab.push(emptyColumn());
    tab.length = need;
    let staves = layout(tab, this.#spacing, this.#capacity);
    // Fill the last Staff with empty Columns, so every Staff spans the Sheet and, when editable,
    // every slot can be clicked. `value` and copy trim them.
    const [start] = staves[staves.length - 1];
    let used = 0;
    for (let c = start; c < tab.length; c++) used += columnWidth(tab[c], this.#spacing);
    while (used + this.#spacing + 1 <= this.#capacity) {
      tab.push(emptyColumn());
      used += this.#spacing + 1;
    }
    staves = layout(tab, this.#spacing, this.#capacity);
    this.#staves[t] = staves;
    return staves;
  }

  #render() {
    if (!this.#initialized) return;
    this.#tabEls.forEach((el, t) => {
      const tab = this.#tabs[t];
      const lead = '-'.repeat(leadingDashes(this.#spacing));
      const trail = '-'.repeat(this.#spacing - lead.length);
      let html = '';
      for (const [start, end] of this.#fit(t)) {
        // Dashes after the last Column, so every Staff ends flush with the Sheet
        let used = 0;
        for (let c = start; c < end; c++) used += columnWidth(tab[c], this.#spacing);
        const fill = visualDashes(this.#capacity - used);
        html += '<div class="ascii-tabs-staff">';
        for (let s = 0; s < STRING_COUNT; s++) {
          html += `<span class="ascii-tabs-line"><span class="ascii-tabs-label">${LABELS[this.labels][s]}</span>`;
          for (let c = start; c < end; c++) {
            const isCur = this.#cur && this.#cur.t === t && this.#cur.c === c && this.#cur.s === s;
            const fret = tab[c][s];
            const digits = columnDigits(tab[c]);
            const cls = `ascii-tabs-cell${isCur ? ' ascii-tabs-cur' : ''}${fret !== null ? ' ascii-tabs-has' : ''}`;
            const body =
              fret === null
                ? `<span class="ascii-tabs-mid ascii-tabs-string" aria-hidden="true">-</span><span class="ascii-tabs-caret" aria-hidden="true"> </span>${visualDashes(digits - 1)}`
                : `<span class="ascii-tabs-fret">${fret}</span>${visualDashes(digits - String(fret).length)}`;
            html += `<span class="${cls}" data-t="${t}" data-c="${c}" data-s="${s}">${visualDashes(lead.length)}${body}${visualDashes(trail.length)}</span>`;
          }
          html += `${fill}</span>`;
        }
        html += '</div>';
      }
      el.innerHTML = html;
      const empty = lastUsed(tab) < 0;
      const del = this.#sheetEls[t]?.querySelector('.ascii-tabs-delete');
      if (del) del.disabled = this.#tabs.length === 1 && empty;
    });
    this.#placeInput();
  }

  // Keep the hidden input next to the focused cell so phones scroll to it
  #placeInput() {
    const el = this.#cur && this.querySelector('.ascii-tabs-cur');
    if (!el) return;
    const box = el.getBoundingClientRect();
    const host = this.getBoundingClientRect();
    this.#input.style.left = `${box.left - host.left}px`;
    this.#input.style.top = `${box.top - host.top}px`;
  }

  // --- Editing --------------------------------------------------------------

  #emitChange() {
    this.#save();
    this.dispatchEvent(new CustomEvent('change', { detail: { value: this.value }, bubbles: true }));
  }

  // Stored Tabs win over <pre> and `value`; an empty or unreadable store falls back to them
  #load() {
    try {
      const tabs = readStored(localStorage.getItem(this.#storageKey));
      if (tabs) this.#tabs = tabs;
    } catch {}
  }

  #save() {
    if (!this.#storageKey) return;
    try {
      localStorage.setItem(this.#storageKey, serializeStored(this.#tabs.map(tab => tab.slice(0, lastUsed(tab) + 1))));
    } catch {}
  }

  #setFret(t, c, s, fret) {
    const tab = this.#tabs[t];
    while (tab.length <= c) tab.push(emptyColumn());
    if (tab[c][s] === fret) return false;
    tab[c][s] = fret;
    return true;
  }

  #endTyping() {
    this.#draft = null;
    this.#draftOrigin = null;
  }

  #goTo(t, c, s) {
    this.#endTyping();
    this.#cur = { t, c: Math.max(0, c), s };
    this.#render();
    this.querySelector('.ascii-tabs-cur')?.scrollIntoView({ block: 'nearest' });
  }

  #moveHorizontal(d) {
    this.#goTo(this.#cur.t, this.#cur.c + d, this.#cur.s);
  }

  // Up/down walks across Strings and jumps between Staves at the edges
  #moveVertical(d) {
    const { t, c, s } = this.#cur;
    const staves = this.#staves[t];
    const at = staves.findIndex(([start, end]) => c >= start && c < end);
    const offset = c - staves[at][0];
    const jump = to => {
      const target = staves[to];
      return target ? target[0] + Math.min(offset, target[1] - target[0] - 1) : c;
    };
    if (s + d < 0) {
      if (at === 0) return this.#goTo(t, c, 0);
      return this.#goTo(t, jump(at - 1), STRING_COUNT - 1);
    }
    if (s + d >= STRING_COUNT) {
      if (at === staves.length - 1) return this.#goTo(t, c, s);
      return this.#goTo(t, jump(at + 1), 0);
    }
    this.#goTo(t, c, s + d);
  }

  // Typing writes to the value straight away, so `change` follows every keystroke
  #edit(draft) {
    const { t, c, s } = this.#cur;
    if (this.#draft === null) this.#draftOrigin = this.#tabs[t][c]?.[s] ?? null;
    this.#draft = draft;
    const changed = this.#setFret(t, c, s, draft === '' ? null : Number(draft));
    this.#render();
    if (changed) this.#emitChange();
  }

  #typeDigit(d) {
    if (this.#draft === null || this.#draft === '') return this.#edit(d);
    const next = this.#draft + d;
    if (/^(0|[1-9][0-9]?)$/.test(next) && Number(next) <= MAX_FRET) this.#edit(next);
  }

  #onKeyDown = e => {
    if (!this.#cur) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      return this.#typeDigit(e.key);
    }
    switch (e.key) {
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        return this.#moveHorizontal(e.shiftKey ? -1 : 1);
      case 'ArrowRight':
        e.preventDefault();
        return this.#moveHorizontal(1);
      case 'ArrowLeft':
        e.preventDefault();
        return this.#moveHorizontal(-1);
      case 'ArrowUp':
        e.preventDefault();
        return this.#moveVertical(-1);
      case 'ArrowDown':
        e.preventDefault();
        return this.#moveVertical(1);
      case 'Backspace': {
        e.preventDefault();
        const { t, c, s } = this.#cur;
        return this.#edit((this.#draft ?? String(this.#tabs[t][c][s] ?? '')).slice(0, -1));
      }
      case 'Delete':
        e.preventDefault();
        return this.#edit('');
      case 'Escape': {
        e.preventDefault();
        if (this.#draft === null) return;
        const { t, c, s } = this.#cur;
        const changed = this.#setFret(t, c, s, this.#draftOrigin);
        this.#endTyping();
        this.#render();
        if (changed) this.#emitChange();
      }
    }
  };

  // Phone keyboards often skip keydown for digits; pick them up here
  #onInput = () => {
    for (const ch of this.#input.value) if (/[0-9]/.test(ch) && this.#cur) this.#typeDigit(ch);
    this.#input.value = '';
  };

  // --- Pointer --------------------------------------------------------------

  #cellAt = (x, y) => document.elementFromPoint(x, y)?.closest('.ascii-tabs-cell');
  #position = el => ({ t: +el.dataset.t, c: +el.dataset.c, s: +el.dataset.s });

  #onPointerDown = e => {
    const cell = e.target.closest('.ascii-tabs-cell');
    if (!cell || e.button !== 0 || this.readonly) return;
    e.preventDefault(); // keep focus on the hidden input
    const p = this.#position(cell);
    this.#goTo(p.t, p.c, p.s);
    this.#input.focus({ preventScroll: true });
    if (this.#tabs[p.t][p.c][p.s] !== null) this.#drag = { ...p, x: e.clientX, y: e.clientY, moved: false };
  };

  #onPointerMove = e => {
    const drag = this.#drag;
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.moved = true;
      this.classList.add('ascii-tabs-dragging');
      this.querySelector(`.ascii-tabs-cell[data-t="${drag.t}"][data-c="${drag.c}"][data-s="${drag.s}"]`)?.classList.add('ascii-tabs-src');
    }
    this.querySelector('.ascii-tabs-drop')?.classList.remove('ascii-tabs-drop');
    const over = this.#cellAt(e.clientX, e.clientY);
    if (over && this.contains(over) && !over.classList.contains('ascii-tabs-src')) over.classList.add('ascii-tabs-drop');
  };

  #endDrag(e, cancelled) {
    const from = this.#drag;
    if (!from) return;
    this.#drag = null;
    this.classList.remove('ascii-tabs-dragging');
    if (!from.moved) return;
    const over = !cancelled && this.#cellAt(e.clientX, e.clientY);
    if (!over || !this.contains(over)) return this.#render();
    const to = this.#position(over);
    if (to.t !== from.t || to.c !== from.c || to.s !== from.s) {
      const fret = this.#tabs[from.t][from.c][from.s];
      this.#setFret(to.t, to.c, to.s, fret);
      this.#setFret(from.t, from.c, from.s, null);
      this.#goTo(to.t, to.c, to.s);
      this.#emitChange();
    } else {
      this.#goTo(to.t, to.c, to.s);
    }
  }

  #onPointerUp = e => this.#endDrag(e, false);
  #onPointerCancel = e => this.#endDrag(e, true);

  // --- Buttons --------------------------------------------------------------

  #onClick = async e => {
    const button = e.target.closest('.ascii-tabs-button');
    if (!button || !this.contains(button)) return;
    if (button.classList.contains('ascii-tabs-add')) return this.addTab();
    const t = +button.closest('.ascii-tabs-sheet').dataset.t;
    if (button.classList.contains('ascii-tabs-copy')) return this.copy(t);
    if (button.classList.contains('ascii-tabs-delete')) return this.removeTab(t);
  };

  // Copies Tab `index` as plain ASCII, like the copy button does
  async copy(index = 0) {
    const tab = this.#tabs[index];
    if (!tab) return;
    await copyText(format(tab, { spacing: this.#spacing, labels: this.labels, width: this.#capacity + LABEL_WIDTH }));
    const button = this.#sheetEls[index]?.querySelector('.ascii-tabs-copy');
    if (!button) return;
    this.#flashCopied(button);
  }

  #flashCopied(button) {
    button.classList.add('ascii-tabs-done');
    button.title = this.#text.copied;
    clearTimeout(button._timer);
    const restore = () => {
      button.title = this.#text.copy;
      button.classList.remove('ascii-tabs-done');
    };
    if (button._custom) {
      button._timer = setTimeout(restore, 1200);
      return;
    }
    button.innerHTML = ICON_CHECK;
    button._timer = setTimeout(() => {
      button.innerHTML = ICON_COPY;
      restore();
    }, 1200);
  }

  addTab() {
    if (this.readonly) return;
    this.#endTyping();
    this.#tabs.push([]);
    this.#buildSheets();
    if (this.#sheetsEl) {
      this.#goTo(this.#tabs.length - 1, 0, 0);
      this.#input.focus({ preventScroll: true });
    }
    this.#emitChange();
  }

  // More than one Tab: remove it. A single Tab is cleared instead, and only when it has content
  removeTab(index) {
    const t = Number(index);
    if (this.readonly || !this.#tabs[t]) return;
    if (this.#tabs.length === 1 && lastUsed(this.#tabs[0]) < 0) return;
    this.#endTyping();
    this.#cur = null;
    if (this.#tabs.length > 1) this.#tabs.splice(t, 1);
    else this.#tabs[0] = [];
    this.#buildSheets();
    this.#emitChange();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ascii-tabs')) {
  customElements.define('ascii-tabs', AsciiTabs);
}

export { AsciiTabs, parse, format };
