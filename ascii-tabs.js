// <ascii-tabs>: a zero-dependency web component to write and show guitar tabs as plain ASCII.
// Light DOM, `.ascii-tabs-*` classes, `--ascii-tabs-*` custom properties (see docs/adr/0002-light-dom.md).
// Vocabulary (Tab, Column, String, Fret, Sheet, Staff, Spacing, Hint) follows GLOSSARY.md.

const STRING_COUNT = 6;
const MAX_FRET = 24;
const DEFAULT_SPACING = 2;
const MIN_SPACING = 1;
const MAX_SPACING = 6;
const DEFAULT_CAPACITY = 48; // characters per Staff before the element is measured

const STANDARD_TUNING = ['E', 'B', 'G', 'D', 'A', 'E']; // String 1 to 6
const NATURAL_PITCHES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const tuningPitch = name => {
  if (typeof name !== 'string' || !/^[A-Ga-g][#b]?$/.test(name)) return null;
  return (NATURAL_PITCHES[name[0].toUpperCase()] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;
};
// Invalid or incomplete tunings fall back to standard tuning as a whole.
const normalizeTuning = value => {
  const names = typeof value === 'string' ? value.trim().split(/\s+/) : value;
  return Array.isArray(names) && names.length === STRING_COUNT && Array.from(names).every(name => tuningPitch(name) !== null)
    ? names.map(name => NOTE_NAMES.letters[tuningPitch(name)])
    : [...STANDARD_TUNING];
};
const labelStyle = value => (value === 'notes' || value === 'none' ? value : 'numbers');
const stringLabels = (labels, tuning) => {
  if (labelStyle(labels) === 'none') return Array(STRING_COUNT).fill('');
  if (labelStyle(labels) === 'numbers') return ['1 ', '2 ', '3 ', '4 ', '5 ', '6 '];
  const names = tuning.map((name, s) => `${s === 0 ? name.toLowerCase() : name}|`);
  const width = Math.max(...names.map(name => name.length));
  return names.map(name => name.padEnd(width, ' '));
};
const labelWidth = (labels, tuning) => stringLabels(labels, tuning)[0].length;
const notationStyle = value => (value === 'letters' || value === 'solfege' ? value : 'frets');
const NOTE_NAMES = {
  letters: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  solfege: ['do', 'do#', 're', 're#', 'mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'la#', 'si'],
};
const fretValue = note => (note !== null && typeof note === 'object' ? note.fret : note);
const cloneNote = note => (note !== null && typeof note === 'object' ? { ...note } : note);
const fretText = (note, string, notation, tuning) => {
  const fret = fretValue(note);
  const text = fret === null ? '' : notationStyle(notation) === 'frets' ? String(fret) : NOTE_NAMES[notation][(tuningPitch(tuning[string]) + fret) % 12];
  return note?.parenthesized ? `(${text})` : text || '-';
};
const toolsPosition = value => (value === 'top' ? 'top' : 'side');
const sheetVariant = value => (value === 'flat' ? 'flat' : 'default');

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

const lastContent = (tab, annotations = []) => Math.max(lastUsed(tab), ...annotations.map(a => a.column));

// Character offsets share the same Column widths as the six Strings.
function columnOffsets(tab, start, end, spacing, notation, tuning, sizes = []) {
  const offsets = [];
  let used = 0;
  for (let c = start; c < end; c++) {
    offsets.push(used + leadingDashes(spacing));
    used += columnWidth(tab[c], spacing, notation, tuning, sizes[c]);
  }
  return offsets;
}

function annotationLines(annotations, start, end, offsets, gutter) {
  const lines = [];
  const occupied = [];
  for (const entry of annotations) {
    const { column } = entry;
    if (column < start || column >= end) continue;
    const text = annotationText(entry);
    if (!text) continue;
    const x = gutter + offsets[column - start];
    const parts = text.split(/\r?\n/);
    const width = Math.max(...parts.map(part => part.length));
    let row = 0;
    while (occupied.some(box => row < box.bottom && row + parts.length > box.top && x < box.right && x + width + 1 > box.left)) row++;
    parts.forEach((part, i) => {
      lines[row + i] = (lines[row + i] ?? '').padEnd(x, ' ') + part;
    });
    occupied.push({ left: x, right: x + width + 1, top: row, bottom: row + parts.length });
  }
  return Array.from(lines, line => (line ?? '').trimEnd());
}

// A supplied text fallback also makes HTML annotations exportable without a DOM.
function annotationText(entry) {
  if (typeof entry.text === 'string') return entry.text;
  if (typeof document === 'undefined') throw new TypeError('HTML annotations need a text fallback for ASCII export outside a browser');
  const template = document.createElement('template');
  template.innerHTML = entry.html;
  template.content.querySelectorAll('script, style, template').forEach(node => node.remove());
  template.content.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  template.content.querySelectorAll('div, p, li, h1, h2, h3, h4, h5, h6, blockquote, pre').forEach(node => node.append('\n'));
  return template.content.textContent.replace(/\n+$/, '');
}

// Size every String in a Column using its longest displayed Fret or note name.
const columnDigits = (column, notation, tuning) => Math.max(1, ...column.map((v, s) => fretText(v, s, notation, tuning).length));
// `size` is the width reserved by Annotations; it never shrinks below the Frets.
const columnWidth = (column, spacing, notation, tuning, size) => spacing + (size ?? columnDigits(column, notation, tuning));

// How Annotation text claims horizontal room (`annotation-fit`):
// widen: its Column grows so the text ends before the next Column; overflow: text may cross into
// the next Column; stagger: alternate Annotations on two rows and grow only the gap between
// Annotations that share a row.
const ANNOTATION_FITS = ['widen', 'overflow', 'stagger'];
const DEFAULT_ANNOTATION_FIT = 'widen';
const normalizeAnnotationFit = value => (ANNOTATION_FITS.includes(value) ? value : DEFAULT_ANNOTATION_FIT);

// Annotations that take up room, in Column order. Stagger rows alternate along this list.
const shownAnnotations = annotations => annotations.filter(entry => entry.html ?? entry.text);
const annotationLength = entry => Math.max(0, ...annotationText(entry).split('\n').map(line => Array.from(line).length));

// Digits to give each Column (by index) so Annotations fit; Columns not listed keep their Frets' width.
function annotationSizes(tab, annotations, fit, { spacing, notation, tuning, capacity }) {
  const sizes = [];
  if (fit === 'overflow') return sizes;
  const digits = c => sizes[c] ?? columnDigits(tab[c], notation, tuning);
  const widen = (c, to) => { sizes[c] = Math.max(digits(c), to); };
  // Text wider than a Staff wraps instead, so one Staff is the most room it can claim.
  const room = length => Math.min(length + 1, capacity);
  const entries = shownAnnotations(annotations).filter(entry => tab[entry.column]);
  if (fit === 'widen') {
    for (const entry of entries) widen(entry.column, room(annotationLength(entry)) - spacing);
    return sizes;
  }
  const offset = c => {
    let x = leadingDashes(spacing);
    for (let k = 0; k < c; k++) x += columnWidth(tab[k], spacing, notation, tuning, sizes[k]);
    return x;
  };
  const rows = [null, null];
  entries.forEach((entry, i) => {
    const previous = rows[i % 2];
    if (previous && entry.column > previous.column) {
      const shortfall = offset(previous.column) + room(previous.length) - offset(entry.column);
      if (shortfall > 0) widen(entry.column - 1, digits(entry.column - 1) + shortfall);
    }
    rows[i % 2] = { column: entry.column, length: annotationLength(entry) };
  });
  return sizes;
}
const leadingDashes = spacing => Math.ceil(spacing / 2);
const visualDashes = count =>
  count ? `<span class="ascii-tabs-string" aria-hidden="true">${'-'.repeat(count)}</span>` : '';

// Split Columns into Staves: [start, end) ranges that fit `capacity` characters
function layout(tab, spacing, capacity, notation, tuning, sizes = []) {
  const staves = [];
  let start = 0;
  let used = 0;
  for (let c = 0; c < tab.length; c++) {
    const width = columnWidth(tab[c], spacing, notation, tuning, sizes[c]);
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
function format(tab, { spacing = DEFAULT_SPACING, labels = 'numbers', notation = 'frets', tuning = STANDARD_TUNING, width = Infinity, annotations = [], annotationFit = 'overflow' } = {}) {
  tuning = normalizeTuning(tuning);
  annotations = normalizeAnnotations([annotations], [tab])[0] ?? [];
  const names = stringLabels(labels, tuning);
  const columns = tab.slice(0, lastContent(tab, annotations) + 1);
  if (!columns.length) return '';
  const lead = '-'.repeat(leadingDashes(spacing));
  const trail = '-'.repeat(spacing - lead.length);
  const capacity = width - labelWidth(labels, tuning);
  const sizes = annotationSizes(columns, annotations, normalizeAnnotationFit(annotationFit), { spacing, notation, tuning, capacity });
  return layout(columns, spacing, capacity, notation, tuning, sizes)
    .map(([start, end]) => {
      const offsets = columnOffsets(columns, start, end, spacing, notation, tuning, sizes);
      const lines = annotationLines(annotations, start, end, offsets, labelWidth(labels, tuning));
      for (let s = 0; s < STRING_COUNT; s++) {
        let line = names[s];
        for (let c = start; c < end; c++) {
          const digits = sizes[c] ?? columnDigits(columns[c], notation, tuning);
          const fret = fretText(columns[c][s], s, notation, tuning);
          line += lead + fret.padEnd(digits, '-') + trail;
        }
        lines.push(line);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

const LABEL_PATTERN = /^\s*(?:[1-6][ \t]?\|?|[a-g][#b]?\|?[ \t]*)/i;

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
    if (!label && !/^\s*-/.test(line)) return fail(`unexpected line "${line.trim()}"`);
    const body = label ? line.slice(label[0].length) : line;
    if (!/^[-|\d\s]*$/.test(body.replace(/\(\d*\)/g, ''))) return fail(`unexpected characters in "${line.trim()}"`);
    group.push(body);
  }
  if (!flush()) return fail('a Staff needs six Strings');

  const tab = [];
  for (const staff of staves) {
    const columns = new Map(); // start position -> { digits, frets }
    for (let s = 0; s < STRING_COUNT; s++) {
      for (const match of staff[s].matchAll(/\((\d*)\)|(\d+)/g)) {
        const parenthesized = match[1] !== undefined;
        const digits = parenthesized ? match[1] : match[2];
        const fret = digits === '' ? null : Number(digits);
        if (fret !== null && !isFret(fret)) return fail(`fret ${digits} is out of range`);
        const at = columns.get(match.index) ?? { digits: 0, frets: emptyColumn() };
        at.digits = Math.max(at.digits, match[0].length);
        at.frets[s] = parenthesized ? { fret, parenthesized: true } : fret;
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
  annotation: 'Edit column annotation',
  tabTitle: 'Edit tab title',
  spacing: 'Spacing',
  notation: 'Notation',
  frets: 'Fret numbers',
  letters: 'Letters (E D F)',
  solfege: 'Spanish notes (mi re fa)',
};

const MESSAGES_ES = {
  hint: 'Hacé clic en una cuerda y escribí el número de traste.',
  copy: 'Copiar tablatura',
  copied: 'Copiado',
  delete: 'Eliminar tablatura',
  add: 'Nueva tablatura',
  fret: 'Traste',
  annotation: 'Editar anotación de columna',
  tabTitle: 'Editar título de tablatura',
  spacing: 'Espaciado',
  notation: 'Notación',
  frets: 'Números de traste',
  letters: 'Letras (E D F)',
  solfege: 'Notas en español (mi re fa)',
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
  --ascii-tabs-flat-background: transparent;
  --ascii-tabs-ink: #1a1a1a;
  --ascii-tabs-dash: #6f6c66;
  /* The ASCII dashes are the visual guitar strings, not text to be read aloud. */
  --ascii-tabs-string: #b3ada1;
  --ascii-tabs-line: #e7e2d6;
  --ascii-tabs-hover: #f4efe4;
  --ascii-tabs-focus: #f6e4df;
  --ascii-tabs-accent: #8b0000;
  --ascii-tabs-font: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
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
:where(ascii-tabs) {
  display: block;
  position: relative;
  isolation: isolate;
  font-family: var(--ascii-tabs-font);
  font-size: var(--ascii-tabs-font-size, 22px);
  color: var(--ascii-tabs-ink);
}
ascii-tabs .ascii-tabs-hint { margin: 0 0 16px; font-size: .7em; color: var(--ascii-tabs-dash); }
ascii-tabs .ascii-tabs-spacing, ascii-tabs .ascii-tabs-notation { display: flex; align-items: center; gap: 12px; margin: 0 0 16px; font-size: 14px; }
ascii-tabs .ascii-tabs-notation-input { font: inherit; color: inherit; background: var(--ascii-tabs-sheet); border: 1px solid var(--ascii-tabs-line); border-radius: 4px; padding: 4px; }
ascii-tabs .ascii-tabs-spacing-input { accent-color: var(--ascii-tabs-accent); }
ascii-tabs .ascii-tabs-sheet {
  display: flex; gap: 12px;
  padding: 20px;
  background: var(--ascii-tabs-sheet);
  border: 1px solid var(--ascii-tabs-line);
  border-radius: 8px;
}
/* A flat Sheet blends into the consumer's surface instead of looking like a card. */
ascii-tabs[variant="flat"] .ascii-tabs-sheet {
  gap: 20px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
}
ascii-tabs .ascii-tabs-sheet + .ascii-tabs-sheet { margin-top: 24px; }
/* Sheet tools sit in a column beside the Staves (tools="side", the default) or in a row above them
   (tools="top"), never over a String. Negative margins tuck them into the Sheet's corner. */
ascii-tabs .ascii-tabs-tools {
  order: 1; display: flex; flex-direction: column; gap: 2px;
  align-self: flex-start; margin: 4px -14px 0 0;
}
ascii-tabs[variant="flat"] .ascii-tabs-tools { margin-right: 0; }
ascii-tabs[tools="top"] .ascii-tabs-sheet { flex-direction: column; gap: 8px; }
ascii-tabs[tools="top"] .ascii-tabs-tools {
  order: -1; flex-direction: row; align-self: flex-end; margin-top: -14px;
}
ascii-tabs[variant="flat"][tools="top"] .ascii-tabs-tools { margin-top: 0; }
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
/* Flat Staffs let the consumer's surface show through by default. */
ascii-tabs[variant="flat"] .ascii-tabs-staff { background: var(--ascii-tabs-flat-background); }
ascii-tabs .ascii-tabs-staff + .ascii-tabs-staff { margin-top: 1.4em; }
/* The annotation band reserves enough height for every collision lane. */
ascii-tabs .ascii-tabs-annotations { position: relative; margin-bottom: .25em; }
ascii-tabs .ascii-tabs-annotation { position: absolute; display: flow-root; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5em; user-select: text; -webkit-user-select: text; }
ascii-tabs .ascii-tabs-annotation img { max-width: 100%; height: auto; }
/* Text entry is opt-in. Empty Column targets overlay the margin above the Strings. */
ascii-tabs .ascii-tabs-title[hidden] { display: none; }
ascii-tabs .ascii-tabs-title { display: block; margin: 0 0 8px; min-height: 1.5em; white-space: pre-wrap; overflow-wrap: anywhere; font-weight: 600; }
ascii-tabs .ascii-tabs-sheet + .ascii-tabs-title { margin-top: 24px; }
ascii-tabs .ascii-tabs-sheet + .ascii-tabs-title[hidden] + .ascii-tabs-sheet { margin-top: 24px; }
ascii-tabs .ascii-tabs-text-target { font: inherit; color: inherit; background: transparent; border: 0; padding: 0; text-align: left; cursor: text; }
ascii-tabs .ascii-tabs-title.ascii-tabs-text-target { min-width: 8ch; max-width: 100%; font-weight: 600; }
ascii-tabs .ascii-tabs-text-target:focus-visible { outline: 1px solid var(--ascii-tabs-accent); outline-offset: 2px; }
ascii-tabs .ascii-tabs-annotation-slots { position: absolute; inset: 0; height: .25em; }
ascii-tabs .ascii-tabs-annotations:has(.ascii-tabs-annotation) .ascii-tabs-annotation-slots { height: 1.5em; }
ascii-tabs .ascii-tabs-annotation.ascii-tabs-text-target { z-index: 1; line-height: 1.5em; }
ascii-tabs .ascii-tabs-annotation-slot { position: absolute; top: 0; height: 100%; }
ascii-tabs .ascii-tabs-annotation-slot::after, ascii-tabs .ascii-tabs-title:empty::after {
  content: ''; display: block; width: .9em; height: 3px; background: currentColor;
  opacity: 0; position: absolute; bottom: .25em; border-radius: 1px;
}
ascii-tabs .ascii-tabs-title:empty { position: relative; }
ascii-tabs .ascii-tabs-text-target:hover::after, ascii-tabs .ascii-tabs-text-target:focus-visible::after,
ascii-tabs .ascii-tabs-annotation-slot.ascii-tabs-column-hover::after { opacity: .65; }
ascii-tabs .ascii-tabs-annotation-slot[data-annotated]::after { display: none; }
ascii-tabs .ascii-tabs-annotation-slot[data-annotated] { pointer-events: none; }
ascii-tabs .ascii-tabs-text-target.ascii-tabs-text-active { visibility: hidden; }
ascii-tabs .ascii-tabs-text-editor {
  position: absolute; z-index: 5; box-sizing: border-box; resize: none; overflow: hidden; margin: 0; padding: 0;
  border: 0; border-bottom: 1px solid var(--ascii-tabs-line); border-radius: 0; outline: none;
  background: transparent; color: var(--ascii-tabs-ink); font: inherit; line-height: 1.5em;
}
ascii-tabs .ascii-tabs-text-editor:focus { border-bottom-color: var(--ascii-tabs-dash); }

ascii-tabs .ascii-tabs-line { display: block; height: 1.5em; line-height: 1.5em; }
ascii-tabs .ascii-tabs-label { color: var(--ascii-tabs-dash); }
ascii-tabs .ascii-tabs-string { color: var(--ascii-tabs-string); }
ascii-tabs .ascii-tabs-cell {
  display: inline-block; height: 1.5em;
  color: var(--ascii-tabs-dash); cursor: pointer; border-radius: 3px;
}
ascii-tabs .ascii-tabs-cell.ascii-tabs-has { cursor: grab; touch-action: none; }
ascii-tabs .ascii-tabs-fret { position: relative; z-index: 2; color: var(--ascii-tabs-ink); font-weight: 700; }
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
ascii-tabs .ascii-tabs-cell.ascii-tabs-selected {
  background: var(--ascii-tabs-focus); outline: none; border-radius: 0;
}
ascii-tabs .ascii-tabs-marquee {
  position: fixed; pointer-events: none; z-index: 1;
  background: color-mix(in srgb, var(--ascii-tabs-accent) 15%, transparent);
}
ascii-tabs.ascii-tabs-selecting .ascii-tabs-cell,
ascii-tabs.ascii-tabs-selecting .ascii-tabs-cell.ascii-tabs-cur {
  background: transparent;
}
ascii-tabs.ascii-tabs-selecting .ascii-tabs-cur .ascii-tabs-caret { display: none; }
ascii-tabs.ascii-tabs-selecting .ascii-tabs-cur .ascii-tabs-mid { display: inline; }
ascii-tabs .ascii-tabs-drag-preview {
  position: fixed; left: 0; top: 0; z-index: 3; pointer-events: none; opacity: .65;
}
ascii-tabs .ascii-tabs-drag-preview .ascii-tabs-fret {
  position: absolute; white-space: pre;
}
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
/* External geometry: labels occupy a gutter outside the String coordinates. */
ascii-tabs .ascii-tabs-tab.ascii-tabs-positioned { overflow-x: auto; }
ascii-tabs .ascii-tabs-positioned .ascii-tabs-staff { width: max-content; }
ascii-tabs .ascii-tabs-positioned .ascii-tabs-line { display: flex; }
ascii-tabs .ascii-tabs-positioned .ascii-tabs-label { flex: 0 0 2ch; }
ascii-tabs .ascii-tabs-area { position: relative; display: inline-block; height: 1.5em; flex: none; }
ascii-tabs .ascii-tabs-area::before {
  content: ''; position: absolute; left: 0; right: 0; top: 50%;
  border-top: 1px solid var(--ascii-tabs-string); pointer-events: none;
}
ascii-tabs .ascii-tabs-area .ascii-tabs-cell {
  position: absolute; top: 0; transform: translateX(-50%); min-width: 1ch; text-align: center;
}
ascii-tabs .ascii-tabs-area .ascii-tabs-fret { background: var(--ascii-tabs-fret-background, var(--ascii-tabs-sheet)); }
ascii-tabs .ascii-tabs-area .ascii-tabs-mid { visibility: hidden; }
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.prepend(style);
}

// Storage keeps legacy cells as '' or Fret text, and colored notes as objects
// (the shape the original editor stores). Reading is lenient: numbers and null work too, and so does
// a single Tab (an array of Columns) instead of an array of Tabs.
const serializeStored = tabs =>
  JSON.stringify(tabs.map(tab => tab.map(column => column.map(v => (v === null ? '' : typeof v === 'object' ? v : String(v))))));

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
      if (Array.isArray(column)) for (let s = 0; s < STRING_COUNT; s++) {
        const note = column[s];
        if (isFret(note)) out[s] = note;
        else if (note && typeof note === 'object' && (isFret(note.fret) || (note.fret === null && note.parenthesized === true))) {
          out[s] = { fret: note.fret };
          if (typeof note.color === 'string') out[s].color = note.color;
          if (typeof note.bold === 'boolean') out[s].bold = note.bold;
          if (note.parenthesized === true) out[s].parenthesized = true;
        }
      }
      return out;
    }),
  );
  return tabs.length ? tabs : [[]];
}

// Layout is consumer-owned geometry in CSS pixels, never part of the Tab data.
function normalizeColumnLayout(value, tabs) {
  if (value === null) return null;
  const fail = message => { throw new TypeError(`columnLayout: ${message}`); };
  if (!Array.isArray(value) || value.length !== tabs.length) fail('expected one layout per Tab');
  return Array.from(value, (entry, t) => {
    if (!entry || !Number.isFinite(entry.width) || entry.width <= 0) fail(`Tab ${t}: width must be finite and positive`);
    if (!Array.isArray(entry.positions) || entry.positions.length !== tabs[t].length) fail(`Tab ${t}: positions must match the ${tabs[t].length} logical Columns`);
    const positions = Array.from(entry.positions, (x, c) => {
      if (!Number.isFinite(x) || x < 0 || x > entry.width) fail(`Tab ${t}, Column ${c}: position must be finite and within [0, width]`);
      if (c && x <= entry.positions[c - 1]) fail(`Tab ${t}, Column ${c}: positions must be strictly increasing`);
      return x;
    });
    return { width: entry.width, positions };
  });
}

// Annotation anchors are logical Column indices, independent of rendered Staves.
function normalizeAnnotations(value, tabs) {
  if (value === null) return [];
  const fail = () => { throw new TypeError('annotations: expected arrays of { column, text } or { column, html, text? } with an existing nonnegative integer Column index and string content'); };
  if (!Array.isArray(value) || value.length > tabs.length) fail();
  return Array.from(value, (entries, t) => {
    if (!Array.isArray(entries)) fail();
    return Array.from(entries, entry => {
      if (!entry || !Number.isInteger(entry.column) || entry.column < 0 || entry.column >= tabs[t].length ||
        (typeof entry.text !== 'string' && typeof entry.html !== 'string') ||
        (entry.text !== undefined && typeof entry.text !== 'string') || (entry.html !== undefined && typeof entry.html !== 'string')) fail();
      const annotation = { column: entry.column };
      if (typeof entry.text === 'string') annotation.text = entry.text.replace(/\r\n?/g, '\n');
      if (typeof entry.html === 'string') annotation.html = entry.html;
      return annotation;
    }).sort((a, b) => a.column - b.column);
  });
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
  if (type === 'delete') part.enabled = el.hasAttribute('enabled');
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
  #logicalLengths = [0]; // Explicit Columns, excluding ASCII #fit padding
  #columnLayout = null;
  #annotations = [];
  #tabTitles = [];
  #titleEls = [];
  #textEditor = null;
  #overflowFrame = null;
  #overflowSignatures = [];
  #spacing = DEFAULT_SPACING;
  #capacity = DEFAULT_CAPACITY;
  #annotationMeasure = '';
  #sizes = [];
  #renderPending = true;
  #staves = [];
  #cur = null; // { t, c, s } focused cell
  #draft = null; // text typed in the focused cell, null if untouched
  #draftOrigin = null; // value the focused cell had before typing, for Escape
  #drag = null; // { t, c, s, x, y, moved } Fret being dragged
  #selection = []; // Selected note positions, all in one Tab
  #marquee = null;
  #dragPreview = null;
  #initialized = false;
  #resizeObserver = null;
  #annotationResizeObserver = null;
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
    return this.#tabs.map((tab, t) => (this.#columnLayout ? tab : tab.slice(0, lastContent(tab, this.#annotations[t]) + 1)).map(column => column.map(cloneNote)));
  }

  set value(value) {
    const tabs = normalizeValue(value);
    if (!tabs) return;
    this.setDocument({ value: tabs, columnLayout: this.#columnLayout, annotations: this.#annotations, tabTitles: this.tabTitles.slice(0, tabs.length) });
  }

  get annotations() {
    return this.#annotations.map(entries => entries.map(entry => ({ ...entry })));
  }

  set annotations(value) {
    const annotations = normalizeAnnotations(value, this.#tabs.map((tab, t) => tab.slice(0, this.#logicalLengths[t])));
    this.#closeTextEditor(false);
    this.#annotations = annotations;
    this.#render();
  }

  get annotationsEditable() { return this.hasAttribute('annotations-editable'); }
  set annotationsEditable(value) { this.toggleAttribute('annotations-editable', Boolean(value)); }

  get annotationFit() { return normalizeAnnotationFit(this.getAttribute('annotation-fit')); }
  set annotationFit(value) { this.setAttribute('annotation-fit', value); }
  get titlesEditable() { return this.hasAttribute('titles-editable'); }
  set titlesEditable(value) { this.toggleAttribute('titles-editable', Boolean(value)); }

  get tabTitles() { return this.#tabs.map((_, t) => this.#tabTitles[t] ?? ''); }
  set tabTitles(value) {
    const titles = this.#normalizeTitles(value, this.#tabs.length);
    this.#closeTextEditor(false);
    this.#tabTitles = titles;
    this.#render();
  }

  #normalizeTitles(value, length) {
    if (value == null) return Array(length).fill('');
    if (!Array.isArray(value) || value.length > length || Array.from(value).some(title => typeof title !== 'string')) {
      throw new TypeError('tabTitles: expected an array of strings, one per Tab');
    }
    return [...value];
  }

  get columnLayout() {
    return this.#columnLayout?.map(({ width, positions }) => ({ width, positions: [...positions] })) ?? null;
  }

  set columnLayout(value) {
    const tabs = this.#tabs.map((tab, t) => Array.from({ length: this.#logicalLengths[t] }, (_, c) => tab[c] ?? emptyColumn()));
    const geometry = normalizeColumnLayout(value, tabs);
    if (this.#drag) this.#endDrag({ pointerId: this.#drag.pointerId }, true);
    this.#tabs = tabs;
    this.#columnLayout = geometry;
    this.#overflowSignatures = [];
    if (this.#cur && !this.#inBounds(this.#cur.t, this.#cur.c, this.#cur.s)) {
      this.#cur = null;
      this.#endTyping();
    }
    this.#selection = this.#selection.filter(p => this.#inBounds(p.t, p.c, p.s));
    this.#render();
  }

  // Validate the entire document before committing either content or geometry.
  // Like the value setter, programmatic updates do not emit change.
  setDocument({ value, columnLayout = null, annotations = null, tabTitles = null }) {
    if (columnLayout !== null && (!Array.isArray(value) || !value.length ||
      Array.from(value).some(tab => !Array.isArray(tab) || Array.from(tab).some(column => !Array.isArray(column))))) {
      throw new TypeError('columnLayout: value must contain Tabs of logical Columns');
    }
    const tabs = normalizeValue(value);
    if (!tabs) return;
    const geometry = normalizeColumnLayout(columnLayout, tabs);
    const normalizedAnnotations = normalizeAnnotations(annotations, tabs);
    const titles = this.#normalizeTitles(tabTitles, tabs.length);
    this.#closeTextEditor(false);
    if (this.#drag) this.#endDrag({ pointerId: this.#drag.pointerId }, true);
    this.#valueSet = true;
    this.#tabs = tabs;
    this.#logicalLengths = tabs.map(tab => tab.length);
    this.#columnLayout = geometry;
    this.#annotations = normalizedAnnotations;
    this.#tabTitles = titles;
    this.#overflowSignatures = [];
    this.#selection = [];
    this.#cur = null;
    this.#endTyping();
    if (this.#initialized) {
      this.#buildSheets();
      this.#save();
    }
  }

  static observedAttributes = ['readonly', 'spacing', 'labels', 'notation', 'tuning', 'lang', 'tools', 'annotations-editable', 'titles-editable', 'annotation-fit', 'max-fret'];

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
    this.#closeTextEditor(false);
    this.#cur = null;
    this.#selection = [];
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

  get notation() {
    return notationStyle(this.getAttribute('notation'));
  }

  set notation(value) {
    this.setAttribute('notation', notationStyle(value));
  }

  get tuning() {
    return normalizeTuning(this.getAttribute('tuning'));
  }

  set tuning(value) {
    this.setAttribute('tuning', normalizeTuning(value).join(' '));
  }

  // Highest Fret the editor accepts: 24 by default, lower for instruments with fewer frets
  get maxFret() {
    const n = Math.floor(Number(this.getAttribute('max-fret')));
    return Number.isFinite(n) && n >= 1 && n <= MAX_FRET ? n : MAX_FRET;
  }

  set maxFret(value) {
    this.setAttribute('max-fret', value);
  }

  get tools() {
    return toolsPosition(this.getAttribute('tools'));
  }

  set tools(value) {
    this.setAttribute('tools', toolsPosition(value));
  }

  get variant() {
    return sheetVariant(this.getAttribute('variant'));
  }

  set variant(value) {
    if (sheetVariant(value) === 'flat') this.setAttribute('variant', 'flat');
    else this.removeAttribute('variant');
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
    if (name === 'labels' || name === 'tuning') {
      this.#measure();
      return this.#render();
    }
    if (name === 'notation') {
      for (const select of this.querySelectorAll('.ascii-tabs-notation-input')) select.value = this.notation;
      return this.#render();
    }
    // Moving the tools changes the Staves' width without resizing the element
    if (name === 'tools') return this.#measure();
    if (name === 'annotation-fit') return this.#render();
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
    for (const name of ['value', 'columnLayout', 'annotations', 'tabTitles', 'annotationsEditable', 'titlesEditable', 'annotationFit', 'readonly', 'spacing', 'labels', 'notation', 'tuning', 'maxFret', 'tools', 'variant', 'theme', 'messages']) {
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
        this.#logicalLengths = this.#tabs.map(tab => tab.length);
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
      this.addEventListener('pointerover', this.#onColumnHover);
      this.addEventListener('pointerleave', () => this.querySelectorAll('.ascii-tabs-column-hover').forEach(el => el.classList.remove('ascii-tabs-column-hover')));
    }
    addEventListener('pointermove', this.#onPointerMove);
    addEventListener('pointerup', this.#onPointerUp);
    addEventListener('pointercancel', this.#onPointerCancel);
    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => this.#measure());
      this.#resizeObserver.observe(this);
      this.#annotationResizeObserver = new ResizeObserver(entries => {
        const bands = new Set(entries.map(({ target }) => target.closest('.ascii-tabs-annotations')));
        if (!this.clientWidth) return;
        this.#layoutAnnotationBands([...bands].filter(band => band?.isConnected));
        if (this.#textEditor?.kind === 'annotation') this.#positionTextEditor();
      });
      for (const annotation of this.querySelectorAll('.ascii-tabs-annotation')) this.#annotationResizeObserver.observe(annotation);
    }
    this.#measure();
  }

  disconnectedCallback() {
    this.#closeTextEditor(false);
    cancelAnimationFrame(this.#overflowFrame);
    this.#overflowFrame = null;
    removeEventListener('pointermove', this.#onPointerMove);
    removeEventListener('pointerup', this.#onPointerUp);
    removeEventListener('pointercancel', this.#onPointerCancel);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#annotationResizeObserver?.disconnect();
    this.#annotationResizeObserver = null;
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
      } else if (part.type === 'notation') {
        const label = this.#el('label', 'ascii-tabs-notation', this);
        const text = this.#el('span', 'ascii-tabs-notation-label', label);
        if (part.content) text.replaceChildren(...part.content.map(n => n.cloneNode(true)));
        else text.textContent = this.#text.notation;
        const select = this.#el('select', 'ascii-tabs-notation-input', label);
        for (const value of ['frets', 'letters', 'solfege']) {
          const option = this.#el('option', '', select);
          option.value = value;
          option.textContent = this.#text[value];
        }
        select.value = this.notation;
        select.addEventListener('change', () => (this.notation = select.value));
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
    input.addEventListener('copy', this.#onCopy);
    input.addEventListener('paste', this.#onPaste);
    input.addEventListener('focus', () => this.classList.add('ascii-tabs-editing'));
    input.addEventListener('blur', () => {
      const detail = this.#cur && this.#editDetail(this.#cur);
      this.classList.remove('ascii-tabs-editing');
      this.#endTyping();
      this.#cur = null;
      this.#render();
      if (detail) this.dispatchEvent(new CustomEvent('cellblur', { detail, bubbles: true }));
    });
    this.#probe = this.#el('span', 'ascii-tabs-probe', this);
    this.#probe.textContent = '0000000000';
  }

  // Sheets (with their buttons) are only rebuilt when Tabs are added or removed
  #buildSheets() {
    if (!this.#sheetsEl) return;
    this.#closeTextEditor(false);
    this.#sheetsEl.textContent = '';
    this.#titleEls = [];
    this.#sheetEls = [];
    this.#tabEls = [];
    this.#tabs.forEach((_, t) => {
      const title = this.#el('div', 'ascii-tabs-title', this.#sheetsEl);
      title.dataset.t = t;
      this.#titleEls.push(title);
      const sheet = this.#el('section', 'ascii-tabs-sheet', this.#sheetsEl);
      sheet.dataset.t = t;
      const tools = this.#el('div', 'ascii-tabs-tools', sheet);
      for (const tool of this.#sheetTools) {
        if (tool.type === 'copy') this.#button('ascii-tabs-copy', this.#text.copy, ICON_COPY, tools, tool.content);
        else if (tool.type === 'delete') {
          const button = this.#button('ascii-tabs-delete', this.#text.delete, ICON_TRASH, tools, tool.content);
          button._forceEnabled = tool.enabled;
        }
      }
      if (!tools.children.length) tools.remove();
      this.#tabEls.push(this.#el('div', 'ascii-tabs-tab', sheet));
      this.#sheetEls.push(sheet);
    });
    this.#renderPending = true;
    this.#measure();
  }

  // --- Layout ---------------------------------------------------------------

  #measure() {
    const tabEl = this.#tabEls[0];
    if (!tabEl || !this.#probe) return;
    const width = tabEl.clientWidth;
    if (!this.isConnected || !width || !this.clientWidth) return;
    const charWidth = this.#probe.getBoundingClientRect().width / 10;
    if (!charWidth) return;
    this.#scheduleOverflow();
    const chars = Math.floor(width / charWidth);
    const capacity = Math.max(chars - labelWidth(this.labels, this.tuning), 4 * (this.#spacing + 1));
    const signature = `${width}:${charWidth}`;
    const annotationResized = this.#annotationMeasure !== signature;
    this.#annotationMeasure = signature;
    if (this.#renderPending || capacity !== this.#capacity || (annotationResized && this.#annotations.some(entries => entries.length))) {
      this.#capacity = capacity;
      this.#render();
    }
  }

  // Explicit Column geometry keeps its own spacing; every other Tab follows `annotation-fit`.
  #annotationFit() {
    return this.#columnLayout ? 'overflow' : this.annotationFit;
  }

  #annotationSizes(t) {
    return annotationSizes(this.#tabs[t], this.#annotations[t] ?? [], this.#annotationFit(), {
      spacing: this.#spacing, notation: this.notation, tuning: this.tuning, capacity: this.#capacity,
    });
  }

  // Always leave room after the last Fret; a new Staff appears when you write past the end
  #fit(t) {
    const tab = this.#tabs[t];
    if (this.#columnLayout) return (this.#staves[t] = [[0, tab.length]]);
    const need = Math.max(lastContent(tab, this.#annotations[t]) + (this.readonly ? 1 : 2), this.#cur && this.#cur.t === t ? this.#cur.c + 1 : 0, this.#textEditor?.t === t && this.#textEditor.kind === 'annotation' ? this.#textEditor.c + 1 : 0, 1);
    while (tab.length < need) tab.push(emptyColumn());
    tab.length = need;
    const sizes = (this.#sizes[t] = this.#annotationSizes(t));
    let staves = layout(tab, this.#spacing, this.#capacity, this.notation, this.tuning, sizes);
    // Fill the last Staff with empty Columns, so every Staff spans the Sheet and, when editable,
    // every slot can be clicked. `value` and copy trim them.
    const [start] = staves[staves.length - 1];
    let used = 0;
    for (let c = start; c < tab.length; c++) used += columnWidth(tab[c], this.#spacing, this.notation, this.tuning, sizes[c]);
    while (used + this.#spacing + 1 <= this.#capacity) {
      tab.push(emptyColumn());
      used += this.#spacing + 1;
    }
    staves = layout(tab, this.#spacing, this.#capacity, this.notation, this.tuning, sizes);
    this.#staves[t] = staves;
    return staves;
  }

  #render() {
    if (!this.#initialized) return;
    this.#renderPending = true;
    // Keep the model live while an ancestor is hidden; retain the last visible layout.
    if (!this.isConnected || !this.clientWidth || !this.#tabEls[0]?.clientWidth) return;
    this.#renderPending = false;
    this.#annotationResizeObserver?.disconnect();
    const annotationPositions = [];
    const labels = this.labels, notation = this.notation, tuning = this.tuning;
    const gutter = labelWidth(labels, tuning);
    const names = stringLabels(labels, tuning);
    this.#titleEls.forEach((title, t) => {
      title.textContent = this.#tabTitles[t] ?? '';
      title.hidden = !title.textContent && !(this.titlesEditable && !this.readonly);
      this.#textTarget(title, 'title', t, this.titlesEditable);
    });
    this.#tabEls.forEach((el, t) => {
      const tab = this.#tabs[t];
      const geometry = this.#columnLayout?.[t];
      el.classList.toggle('ascii-tabs-positioned', Boolean(geometry));
      const lead = '-'.repeat(leadingDashes(this.#spacing));
      const trail = '-'.repeat(this.#spacing - lead.length);
      let html = '';
      this.#sizes[t] = [];
      for (const [start, end] of this.#fit(t)) {
        // Dashes after the last Column, so every Staff ends flush with the Sheet
        const sizes = this.#sizes[t];
        const widths = tab.slice(start, end).map((column, i) => sizes[start + i] ?? columnDigits(column, notation, tuning));
        const used = widths.reduce((sum, digits) => sum + this.#spacing + digits, 0);
        const fill = geometry ? '' : visualDashes(this.#capacity - used);
        html += '<div class="ascii-tabs-staff">';
        for (let s = 0; s < STRING_COUNT; s++) {
          html += '<span class="ascii-tabs-line">';
          if (labels !== 'none') html += `<span class="ascii-tabs-label" style="flex-basis:${gutter}ch">${names[s]}</span>`;
          if (geometry) html += `<span class="ascii-tabs-area" data-t="${t}" data-s="${s}" style="width:${geometry.width}px">`;
          for (let c = start; c < end; c++) {
            const isCur = this.#cur && this.#cur.t === t && this.#cur.c === c && this.#cur.s === s;
            const fret = tab[c][s];
            const digits = geometry ? fretText(tab[c][s], s, notation, tuning).length : widths[c - start];
            const text = fretText(fret, s, notation, tuning);
            const selected = !this.#drag?.selecting && this.#selection.some(p => p.t === t && p.c === c && p.s === s);
            const cls = `ascii-tabs-cell${isCur ? ' ascii-tabs-cur' : ''}${fret !== null ? ' ascii-tabs-has' : ''}${selected ? ' ascii-tabs-selected' : ''}`;
            const body =
              fret === null
                ? `<span class="ascii-tabs-mid ascii-tabs-string" aria-hidden="true">-</span><span class="ascii-tabs-caret" aria-hidden="true"> </span>${visualDashes(digits - 1)}`
                : `<span class="ascii-tabs-fret">${fret.fret === null && fret.parenthesized ? '(<span class="ascii-tabs-caret" aria-hidden="true"></span>)' : text}</span>${visualDashes(digits - text.length)}`;
            const position = geometry ? ` style="left:${geometry.positions[c]}px"` : '';
            html += `<span class="${cls}" data-t="${t}" data-c="${c}" data-s="${s}"${position}>${geometry ? '' : visualDashes(lead.length)}${body}${geometry ? '' : visualDashes(trail.length)}</span>`;
          }
          if (geometry) html += '</span>';
          html += `${fill}</span>`;
        }
        html += '</div>';
      }
      el.innerHTML = html;
      this.#renderAnnotations(el, t, geometry, annotationPositions);
      // Assign through the CSSOM: consumer colors never become HTML or extra declarations.
      for (const cell of el.querySelectorAll('.ascii-tabs-has')) {
        const note = tab[+cell.dataset.c][+cell.dataset.s];
        const fret = cell.querySelector('.ascii-tabs-fret');
        if (note.color) fret.style.color = note.color;
        if (typeof note.bold === 'boolean') fret.style.fontWeight = note.bold ? '700' : '400';
      }
      const empty = lastContent(tab, this.#annotations[t]) < 0;
      for (const del of this.#sheetEls[t]?.querySelectorAll('.ascii-tabs-delete') ?? []) {
        del.disabled = Boolean(this.#columnLayout) || (this.#tabs.length === 1 && empty && !del._forceEnabled);
      }
    });
    // Build every Sheet first, then measure anchors and collision lanes in batches.
    this.#positionAnnotations(annotationPositions);
    this.#layoutAnnotationBands([...this.querySelectorAll('.ascii-tabs-annotations')]);
    this.#placeInput();
    for (const add of this.querySelectorAll('.ascii-tabs-add')) add.disabled = Boolean(this.#columnLayout);
    this.#scheduleOverflow();
    this.#positionTextEditor();
  }

  #renderAnnotations(el, t, geometry, positions) {
    const entries = this.#annotations[t] ?? [];
    if (!entries.length && !(this.annotationsEditable && !this.readonly)) return;
    el.querySelectorAll('.ascii-tabs-staff').forEach((staff, row) => {
      const [start, end] = this.#staves[t][row];
      const annotations = entries.filter(a => a.column >= start && a.column < end && (a.html ?? a.text));
      if (!annotations.length && !(this.annotationsEditable && !this.readonly)) return;
      const band = this.#el('div', 'ascii-tabs-annotations');
      if (geometry) band.style.width = `calc(${geometry.width}px + ${labelWidth(this.labels, this.tuning)}ch)`;
      staff.prepend(band);
      const shown = shownAnnotations(entries);
      for (const entry of annotations) {
        const { column, text, html } = entry;
        const annotation = this.#el('div', 'ascii-tabs-annotation', band);
        annotation.dataset.column = column;
        if (this.#annotationFit() === 'stagger') annotation.dataset.lane = shown.indexOf(entry) % 2;
        if (html !== undefined) annotation.innerHTML = html;
        else annotation.textContent = text;
        this.#textTarget(annotation, 'annotation', t, this.annotationsEditable, column, entries.indexOf(entry));
        annotation.style.top = '0px';
        positions.push({ target: annotation, container: band, staff, column, end, geometry, slot: false });
        this.#annotationResizeObserver?.observe(annotation);
      }
      if (this.annotationsEditable && !this.readonly) {
        const slots = this.#el('div', 'ascii-tabs-annotation-slots');
        if (geometry) slots.style.width = band.style.width;
        band.prepend(slots);
        for (let c = start; c < end; c++) {
          const slot = this.#el('button', 'ascii-tabs-text-target ascii-tabs-annotation-slot', slots);
          slot.type = 'button';
          if (annotations.some(a => a.column === c)) slot.dataset.annotated = '';
          positions.push({ target: slot, container: slots, staff, column: c, end, geometry, slot: true });
          this.#textTarget(slot, 'annotation', t, true, c, entries.findIndex(a => a.column === c));
          // Occupied Columns are edited through the annotation itself.
          slot.disabled = slot.hasAttribute('data-annotated');
        }
      }
    });
  }

  #positionAnnotations(positions) {
    if (!positions.length) return;
    const charWidth = this.#probe.getBoundingClientRect().width / 10;
    const bounds = new Map();
    // Complete every layout read before assigning any annotation/slot positions.
    const measured = positions.map(({ target, container, staff, column, end, geometry, slot }) => {
      if (!bounds.has(container)) bounds.set(container, container.getBoundingClientRect());
      const area = bounds.get(container);
      const cell = staff.querySelector(`.ascii-tabs-cell[data-c="${column}"][data-s="0"]`).getBoundingClientRect();
      const left = cell.left - area.left + (geometry ? cell.width / 2 : leadingDashes(this.#spacing) * charWidth);
      const next = slot && column + 1 < end ? staff.querySelector(`.ascii-tabs-cell[data-c="${column + 1}"][data-s="0"]`).getBoundingClientRect() : null;
      const width = next ? next.left - cell.left : Math.max(charWidth, area.width - left);
      return { target, slot, left, width };
    });
    for (const { target, slot, left, width } of measured) {
      target.style.left = `${left}px`;
      target.style[slot ? 'width' : 'maxWidth'] = `${width}px`;
    }
  }

  #textTarget(target, kind, t, enabled, c, index) {
    if (!enabled || this.readonly) {
      target.classList.remove('ascii-tabs-text-target');
      target.removeAttribute('role');
      target.removeAttribute('tabindex');
      return;
    }
    target.classList.add('ascii-tabs-text-target');
    target.dataset.kind = kind;
    target.dataset.t = t;
    if (c !== undefined) target.dataset.c = c;
    if (index !== undefined) target.dataset.index = index;
    target.setAttribute('role', 'button');
    target.tabIndex = 0;
    const label = kind === 'title' ? this.#text.tabTitle : `${this.#text.annotation} ${c + 1}`;
    target.setAttribute('aria-label', target.textContent.trim() ? `${target.textContent.trim()} — ${label}` : label);
    target.onpointerdown = event => { if (event.button === 0) event.preventDefault(); };
    target.onclick = () => this.#openTextEditor(target);
    target.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.#openTextEditor(target);
      }
    };
  }

  #onColumnHover = event => {
    this.querySelectorAll('.ascii-tabs-column-hover').forEach(el => el.classList.remove('ascii-tabs-column-hover'));
    const cell = event.target.closest('.ascii-tabs-cell');
    if (!cell) return;
    this.querySelector(`.ascii-tabs-annotation-slot[data-t="${cell.dataset.t}"][data-c="${cell.dataset.c}"]`)?.classList.add('ascii-tabs-column-hover');
  };

  #openTextEditor(target) {
    const { kind, t: tab, c: column, index: entryIndex } = target.dataset;
    const t = +tab, c = +column;
    const entry = kind === 'annotation' ? this.#annotations[t]?.[+entryIndex] : null;
    this.#closeTextEditor(true);
    if (!this.#tabs[t]) return;
    const entries = this.#annotations[t] ?? [];
    let index = entry ? entries.indexOf(entry) : -1;
    if (entry && index < 0) index = entries.findIndex(a => a.column === c);
    const text = kind === 'title' ? this.#tabTitles[t] ?? '' : index >= 0 ? annotationText(this.#annotations[t][index]) : '';
    // Blurring the Fret input may rebuild targets; the editor is anchored again below.
    this.#input.blur();
    const input = this.#el('textarea', 'ascii-tabs-text-editor', this);
    input.setAttribute('aria-label', kind === 'title' ? this.#text.tabTitle : `${this.#text.annotation} ${c + 1}`);
    input.value = text;
    this.#textEditor = { kind, t, c, index, original: text, input };
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey && !event.isComposing)) {
        event.preventDefault();
        this.#closeTextEditor(event.key === 'Enter', true);
      }
    });
    input.addEventListener('change', event => event.stopPropagation());
    input.addEventListener('input', () => this.#positionTextEditor());
    input.addEventListener('blur', () => this.#closeTextEditor(true));
    this.#positionTextEditor();
    input.focus();
    input.select();
  }

  #editorTarget(edit) {
    return edit.kind === 'title' ? this.#titleEls[edit.t] : this.querySelector(
      `.ascii-tabs-annotation[data-t="${edit.t}"][data-c="${edit.c}"][data-index="${edit.index}"]`) ?? this.querySelector(
      `.ascii-tabs-annotation-slot[data-t="${edit.t}"][data-c="${edit.c}"]`);
  }

  #positionTextEditor() {
    const edit = this.#textEditor;
    if (!edit) return;
    const target = this.#editorTarget(edit);
    if (!target) return this.#closeTextEditor(false);
    if (edit.kind === 'annotation') {
      const band = target.closest('.ascii-tabs-annotations');
      if (!edit.preview?.isConnected) {
        // Lay out a literal-text preview in the same order as committed entries.
        // Its intrinsic size drives both collision lanes and the editor overlay.
        const preview = this.#el('div', 'ascii-tabs-annotation');
        preview.style.visibility = 'hidden';
        preview.setAttribute('aria-hidden', 'true');
        if (target.dataset.lane) preview.dataset.lane = target.dataset.lane;
        else if (this.#annotationFit() === 'stagger') preview.dataset.lane = shownAnnotations(this.#annotations[edit.t] ?? []).filter(a => a.column <= edit.c).length % 2;
        const before = target.classList.contains('ascii-tabs-annotation') ? target
          : [...band.querySelectorAll('.ascii-tabs-annotation')].find(el => +el.dataset.column > edit.c);
        band.insertBefore(preview, before ?? null);
        edit.preview = preview;
      }
      const preview = edit.preview;
      preview.textContent = edit.input.value || '\u200b';
      preview.style.left = target.style.left;
      const charWidth = this.#probe.getBoundingClientRect().width / 10;
      preview.style.maxWidth = `${Math.max(charWidth, band.getBoundingClientRect().width - parseFloat(target.style.left))}px`;
      if (target.classList.contains('ascii-tabs-annotation')) target.style.display = 'none';
      this.#layoutAnnotationBand(band);
      const box = preview.getBoundingClientRect();
      const root = this.getBoundingClientRect();
      Object.assign(edit.input.style, {
        left: `${box.left - root.left}px`, top: `${box.top - root.top}px`,
        width: `${Math.max(1, box.width) + 1}px`, height: `${box.height + 1}px`, fontWeight: '400',
      });
      target.classList.add('ascii-tabs-text-active');
      return;
    }
    let box = target.getBoundingClientRect();
    const root = this.getBoundingClientRect();
    const fontSize = parseFloat(getComputedStyle(this).fontSize);
    const width = Math.min(Math.max(box.width, 10 * fontSize * .6, ...edit.input.value.split('\n').map(line => (line.length + 1) * fontSize * .6)), Math.max(fontSize, root.right - box.left));
    Object.assign(edit.input.style, {
      left: `${box.left - root.left}px`, top: `${box.top - root.top}px`, width: `${width}px`,
      fontWeight: edit.kind === 'title' ? '600' : '400', height: `${fontSize * 1.5}px`,
    });
    edit.input.style.height = `${Math.max(fontSize * 1.5, edit.input.scrollHeight + 1)}px`;
    target.classList.add('ascii-tabs-text-active');
    target.style.minHeight = edit.input.style.height;
    box = target.getBoundingClientRect();
    edit.input.style.top = `${box.top - root.top}px`;
  }

  #closeTextEditor(commit, focus = false) {
    const edit = this.#textEditor;
    if (!edit) return;
    this.#textEditor = null;
    const target = this.#editorTarget(edit);
    target?.classList.remove('ascii-tabs-text-active');
    if (target) {
      target.style.minHeight = '';
      target.style.display = '';
    }
    const band = edit.preview?.parentElement;
    edit.preview?.remove();
    if (band) this.#layoutAnnotationBand(band);
    const text = edit.input.value;
    edit.input.remove();
    if (commit && text !== edit.original) {
      if (edit.kind === 'title') {
        this.#tabTitles = this.tabTitles;
        this.#tabTitles[edit.t] = text;
      } else {
        this.#annotations = this.#tabs.map((_, t) => this.#annotations[t] ?? []);
        const entries = this.#annotations[edit.t];
        if (edit.index >= 0) entries.splice(edit.index, 1, ...(text ? [{ column: edit.c, text }] : []));
        else if (text) entries.push({ column: edit.c, text });
        entries.sort((a, b) => a.column - b.column);
        if (text) this.#logicalLengths[edit.t] = Math.max(this.#logicalLengths[edit.t], edit.c + 1);
      }
      this.#render();
      const detail = edit.kind === 'title'
        ? { index: edit.t, title: text, tabTitles: this.tabTitles }
        : { index: edit.t, column: edit.c, annotations: this.annotations };
      this.dispatchEvent(new CustomEvent(edit.kind === 'title' ? 'titlechange' : 'annotationchange', { detail, bubbles: true }));
    }
    if ((commit || focus) && !(commit && text !== edit.original)) this.#render();
    if (focus) this.#editorTarget(edit)?.focus();
  }

  #layoutAnnotationBand(band) {
    this.#layoutAnnotationBands([band]);
  }

  #layoutAnnotationBands(bands) {
    if (!bands.length) return;
    const charWidth = this.#probe.getBoundingClientRect().width / 10;
    // Read every box before writing any collision lane or band height.
    const measured = bands.map(band => ({
      band,
      annotations: [...band.children]
        .filter(el => el.classList.contains('ascii-tabs-annotation') && el.style.display !== 'none')
        .map(el => ({ el, box: el.getBoundingClientRect() })),
    }));
    for (const { band, annotations } of measured) {
      const occupied = [];
      let height = 0;
      // Stagger puts every second Annotation on a row of its own, below the first row's tallest text.
      const secondRow = Math.max(0, ...annotations.filter(({ el }) => el.dataset.lane === '0').map(({ box }) => box.height));
      for (const { el, box } of annotations) {
        const { left, right } = box;
        let top = el.dataset.lane === '1' ? secondRow : 0;
        for (const previous of occupied) {
          if (left < previous.right + charWidth && right + charWidth > previous.left) top = Math.max(top, previous.bottom);
        }
        el.style.top = `${top}px`;
        occupied.push({ left, right, bottom: top + box.height });
        height = Math.max(height, top + box.height);
      }
      band.style.height = `${height}px`;
    }
  }

  #scheduleOverflow() {
    if (!this.#columnLayout || this.#overflowFrame !== null || !this.isConnected) return;
    this.#overflowFrame = requestAnimationFrame(() => {
      this.#overflowFrame = null;
      if (!this.#columnLayout) return;
      // Measure displayed text (including note names, parentheses and bold) in CSS pixels.
      const reports = this.#columnLayout.map(({ width, positions }, index) => {
        const collisions = [];
        for (let s = 0; s < STRING_COUNT; s++) {
          let previous = null;
          for (const cell of this.#tabEls[index]?.querySelectorAll(`.ascii-tabs-has[data-s="${s}"]`) ?? []) {
            const c = +cell.dataset.c;
            const areaWidth = cell.parentElement.getBoundingClientRect().width;
            if (!areaWidth) continue;
            const half = cell.querySelector('.ascii-tabs-fret').getBoundingClientRect().width * width / areaWidth / 2;
            const left = positions[c] - half, right = positions[c] + half;
            if (left < 0) collisions.push({ string: s, columns: [c], edge: 'left', overlap: -left });
            if (right > width) collisions.push({ string: s, columns: [c], edge: 'right', overlap: right - width });
            if (previous && left < previous.right) collisions.push({ string: s, columns: [previous.c, c], overlap: previous.right - left });
            if (!previous || right > previous.right) previous = { c, right };
          }
        }
        return { index, width, collisions };
      });
      for (const report of reports) {
        const signature = JSON.stringify(report);
        const changed = this.#overflowSignatures[report.index] !== signature;
        this.#overflowSignatures[report.index] = signature;
        if (changed && report.collisions.length) this.dispatchEvent(new CustomEvent('layoutoverflow', { detail: report, bubbles: true }));
      }
    });
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

  #editDetail(position = null) {
    return {
      value: this.value,
      note: position ? {
        tabIndex: position.t,
        columnIndex: position.c,
        stringIndex: position.s,
        value: cloneNote(this.#tabs[position.t]?.[position.c]?.[position.s] ?? null),
      } : null,
    };
  }

  #emitChange(position = null) {
    const detail = this.#editDetail(position);
    this.#save();
    this.dispatchEvent(new CustomEvent('change', { detail, bubbles: true }));
  }

  // Stored Tabs win over <pre> and `value`; an empty or unreadable store falls back to them
  #load() {
    if (this.#columnLayout) return;
    try {
      const tabs = readStored(localStorage.getItem(this.#storageKey));
      if (tabs) {
        this.#tabs = tabs;
        this.#logicalLengths = tabs.map(tab => tab.length);
      }
    } catch {}
  }

  #save() {
    if (!this.#storageKey || this.#columnLayout) return;
    try {
      localStorage.setItem(this.#storageKey, serializeStored(this.#tabs.map(tab => tab.slice(0, lastUsed(tab) + 1))));
    } catch {}
  }

  #setFret(t, c, s, fret) {
    if (this.#columnLayout && !this.#inBounds(t, c, s)) return false;
    const tab = this.#tabs[t];
    while (tab.length <= c) tab.push(emptyColumn());
    const previous = tab[c][s];
    if (previous === fret || (previous && fret && typeof previous === 'object' && typeof fret === 'object'
      && previous.fret === fret.fret && previous.color === fret.color && previous.bold === fret.bold && previous.parenthesized === fret.parenthesized)) return false;
    tab[c][s] = cloneNote(fret);
    this.#logicalLengths[t] = Math.max(this.#logicalLengths[t], c + 1);
    return true;
  }

  #inBounds(t, c, s) {
    return Boolean(this.#tabs[t]) && c >= 0 && c < this.#tabs[t].length && s >= 0 && s < STRING_COUNT;
  }

  #endTyping() {
    this.#draft = null;
    this.#draftOrigin = null;
  }

  #goTo(t, c, s, keepSelection = false) {
    if (this.#columnLayout) {
      if (!this.#tabs[t]?.length) return;
      c = Math.min(c, this.#tabs[t].length - 1);
    }
    c = Math.max(0, c);
    const previous = this.#cur;
    const detail = previous && (previous.t !== t || previous.c !== c || previous.s !== s)
      ? this.#editDetail(previous) : null;
    if (!keepSelection) this.#selection = [];
    this.#endTyping();
    this.#cur = { t, c, s };
    this.#render();
    this.querySelector('.ascii-tabs-cur')?.scrollIntoView({ block: 'nearest' });
    if (detail) this.dispatchEvent(new CustomEvent('cellblur', { detail, bubbles: true }));
  }

  #moveHorizontal(d) {
    this.#goTo(this.#cur.t, this.#cur.c + d, this.#cur.s);
  }

  #duplicateColumn() {
    if (this.#selection.length) {
      const columns = this.#selection.map(p => p.c);
      return this.#transferSelection(this.#selection[0].t, Math.max(...columns) - Math.min(...columns) + 1, 0, true);
    }
    const { t, c, s } = this.#cur;
    if (this.#columnLayout && !this.#inBounds(t, c + 1, s)) return;
    const column = [...(this.#tabs[t][c] ?? emptyColumn())];
    let changed = false;
    for (let string = 0; string < STRING_COUNT; string++) {
      if (this.#setFret(t, c + 1, string, column[string])) changed = true;
    }
    this.#goTo(t, c + 1, s);
    if (changed) this.#emitChange();
  }

  #fillColumnWithZeros() {
    const { t, c, s } = this.#cur;
    let changed = false;
    for (let string = 0; string < STRING_COUNT; string++) {
      if (this.#tabs[t][c]?.[string] == null && this.#setFret(t, c, string, 0)) changed = true;
    }
    this.#goTo(t, c, s);
    if (changed) this.#emitChange();
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

  // Shift+Up/Down: re-finger the focused or selected notes on the nearest String that keeps their
  // pitch and puts every one of them within 0..maxFret. Strings are assumed to descend in pitch.
  #refinger(d) {
    const notes = (this.#selection.length ? this.#selection : [this.#cur]).filter(p => this.#tabs[p.t][p.c]?.[p.s] != null);
    if (!notes.length) return;
    const tuning = this.tuning;
    const depth = [0];
    for (let s = 1; s < STRING_COUNT; s++) depth[s] = depth[s - 1] + ((tuningPitch(tuning[s - 1]) - tuningPitch(tuning[s]) + 11) % 12 + 1);
    for (let step = 1; step < STRING_COUNT; step++) {
      const moved = notes.map(p => {
        const to = p.s + d * step;
        const note = this.#tabs[p.t][p.c][p.s];
        return { ...p, to, fret: fretValue(note) + depth[to] - depth[p.s], note };
      });
      if (moved.some(m => m.to < 0 || m.to >= STRING_COUNT || !isFret(m.fret) || m.fret > this.maxFret)) {
        if (moved.some(m => m.to < 0 || m.to >= STRING_COUNT)) return;
        continue;
      }
      for (const m of moved) this.#setFret(m.t, m.c, m.s, null);
      for (const m of moved) this.#setFret(m.t, m.c, m.to, typeof m.note === 'object' ? { ...m.note, fret: m.fret } : m.fret);
      const { t, c, s } = this.#cur;
      if (this.#selection.length) this.#selection = moved.map(m => ({ t: m.t, c: m.c, s: m.to }));
      this.#goTo(t, c, s + d * step, this.#selection.length > 0);
      return this.#emitChange(this.#selection.length ? null : this.#cur);
    }
  }

  // Typing writes to the value straight away, so `change` follows every keystroke
  #edit(draft, keepParentheses = true) {
    this.#selection = [];
    const { t, c, s } = this.#cur;
    if (this.#draft === null) this.#draftOrigin = this.#tabs[t][c]?.[s] ?? null;
    this.#draft = draft;
    const previous = this.#tabs[t][c]?.[s];
    const next = draft === '' && !(keepParentheses && previous?.parenthesized) ? null : previous && typeof previous === 'object'
      ? { ...previous, fret: draft === '' ? null : Number(draft) } : Number(draft);
    const changed = this.#setFret(t, c, s, next);
    this.#render();
    if (changed) this.#emitChange({ t, c, s });
  }

  #typeDigit(d) {
    if (this.#draft === null || this.#draft === '') return this.#edit(d);
    const next = this.#draft + d;
    if (/^(0|[1-9][0-9]?)$/.test(next) && Number(next) <= this.maxFret) this.#edit(next);
  }

  #parenthesize() {
    const { t, c, s } = this.#cur;
    const previous = this.#tabs[t][c]?.[s] ?? null;
    if (this.#draft === null) this.#draftOrigin = previous;
    this.#draft = String(fretValue(previous) ?? '');
    this.#selection = [];
    const changed = this.#setFret(t, c, s, {
      ...(previous && typeof previous === 'object' ? previous : { fret: previous }),
      parenthesized: true,
    });
    this.#render();
    if (changed) this.#emitChange({ t, c, s });
  }

  #toggleBold() {
    let changed = false;
    for (const { t, c, s } of this.#selection.length ? this.#selection : [this.#cur]) {
      const note = this.#tabs[t][c]?.[s];
      if (note == null) continue;
      const next = typeof note === 'object' ? { ...note } : { fret: note };
      next.bold = note.bold === false;
      if (this.#setFret(t, c, s, next)) changed = true;
    }
    if (!changed) return;
    this.#endTyping();
    this.#render();
    this.#emitChange(this.#selection.length ? null : this.#cur);
  }

  #onKeyDown = e => {
    if (!this.#cur || this.readonly) return;
    if (e.key.toLowerCase() === 'b' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      return this.#toggleBold();
    }
    if (this.#selection.length && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      return copyText(this.#selectionText());
    }
    if (this.#selection.length && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      for (const { t, c, s } of this.#selection) this.#setFret(t, c, s, null);
      this.#selection = [];
      this.#endTyping();
      this.#render();
      return this.#emitChange();
    }
    if (this.#selection.length && e.key === 'Escape') {
      e.preventDefault();
      this.#selection = [];
      return this.#render();
    }
    if ((e.metaKey || e.altKey) && (e.key === '0' || e.code === 'Digit0')) {
      e.preventDefault();
      return this.#fillColumnWithZeros();
    }
    if (e.key === '(' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      return this.#parenthesize();
    }
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
        if (e.metaKey || e.altKey) return this.#duplicateColumn();
        return this.#moveHorizontal(1);
      case 'ArrowLeft':
        e.preventDefault();
        return this.#moveHorizontal(-1);
      case 'ArrowUp':
        e.preventDefault();
        return e.shiftKey ? this.#refinger(-1) : this.#moveVertical(-1);
      case 'ArrowDown':
        e.preventDefault();
        return e.shiftKey ? this.#refinger(1) : this.#moveVertical(1);
      case 'Backspace': {
        e.preventDefault();
        const { t, c, s } = this.#cur;
        return this.#edit((this.#draft ?? String(fretValue(this.#tabs[t][c][s]) ?? '')).slice(0, -1));
      }
      case 'Delete':
        e.preventDefault();
        return this.#edit('', false);
      case 'Escape': {
        e.preventDefault();
        if (this.#draft === null) return;
        const { t, c, s } = this.#cur;
        const changed = this.#setFret(t, c, s, this.#draftOrigin);
        this.#endTyping();
        this.#render();
        if (changed) this.#emitChange({ t, c, s });
      }
    }
  };

  // Phone keyboards often skip keydown for digits; pick them up here
  #onInput = () => {
    for (const ch of this.#input.value) if (/[0-9]/.test(ch) && this.#cur) this.#typeDigit(ch);
    this.#input.value = '';
  };

  #selectionText() {
    const first = Math.min(...this.#selection.map(p => p.c));
    const last = Math.max(...this.#selection.map(p => p.c));
    const columns = Array.from({ length: last - first + 1 }, emptyColumn);
    for (const { t, c, s } of this.#selection) columns[c - first][s] = this.#tabs[t][c][s];
    return format(columns, { spacing: this.#spacing, labels: this.labels, notation: this.notation, tuning: this.tuning });
  }

  #onCopy = e => {
    if (!this.#selection.length) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', this.#selectionText());
  };

  #onPaste = e => {
    if (!this.#cur || this.readonly) return;
    const columns = parse(e.clipboardData.getData('text/plain'));
    if (lastUsed(columns) < 0) return;
    e.preventDefault();
    const { t, c } = this.#cur;
    if (this.#columnLayout && c + columns.length > this.#tabs[t].length) return;
    const selected = [];
    let changed = false;
    columns.forEach((column, offset) => column.forEach((fret, s) => {
      if (fret === null) return;
      if (this.#setFret(t, c + offset, s, fret)) changed = true;
      selected.push({ t, c: c + offset, s });
    }));
    this.#selection = selected;
    this.#endTyping();
    this.#render();
    if (changed) this.#emitChange();
  };

  // Snapshot before clearing: overlapping moves preserve every selected Fret.
  #transferSelection(t, dc, ds, duplicate = false) {
    const notes = this.#selection.map(p => ({ ...p, fret: this.#tabs[p.t][p.c][p.s] }));
    if (this.#columnLayout && notes.some(p => !this.#inBounds(t, p.c + dc, p.s + ds))) return false;
    if (notes.some(p => p.c + dc < 0 || p.s + ds < 0 || p.s + ds >= STRING_COUNT)) return false;
    if (!duplicate && notes.every(p => p.t === t) && dc === 0 && ds === 0) return false;
    let changed = false;
    if (!duplicate) for (const p of notes) changed = this.#setFret(p.t, p.c, p.s, null) || changed;
    this.#selection = notes.map(p => {
      const to = { t, c: p.c + dc, s: p.s + ds };
      changed = this.#setFret(to.t, to.c, to.s, p.fret) || changed;
      return to;
    });
    const first = this.#selection[0];
    this.#goTo(first.t, first.c, first.s, true);
    if (changed) this.#emitChange();
    return true;
  }

  // --- Pointer --------------------------------------------------------------

  #cellAt = (x, y) => {
    const target = document.elementFromPoint(x, y);
    if (!this.#columnLayout) return target?.closest('.ascii-tabs-cell');
    const area = target?.closest('.ascii-tabs-area');
    if (!area || !this.contains(area)) return null;
    const t = +area.dataset.t;
    const rect = area.getBoundingClientRect();
    const { width, positions } = this.#columnLayout[t];
    const local = (x - rect.left) * width / rect.width;
    if (local < 0 || local > width || y < rect.top || y > rect.bottom || !positions.length) return null;
    let nearest = 0;
    for (let c = 1; c < positions.length; c++) if (Math.abs(positions[c] - local) < Math.abs(positions[nearest] - local)) nearest = c;
    return area.querySelector(`[data-c="${nearest}"]`);
  };
  #position = el => ({ t: +el.dataset.t, c: +el.dataset.c, s: +el.dataset.s });

  #onPointerDown = e => {
    const cell = this.#columnLayout ? this.#cellAt(e.clientX, e.clientY) : e.target.closest('.ascii-tabs-cell');
    const sheet = e.target.closest('.ascii-tabs-sheet');
    if (!sheet || e.target.closest('.ascii-tabs-tools, .ascii-tabs-annotations, .ascii-tabs-annotation-slots, .ascii-tabs-text-editor') || e.button !== 0 || this.readonly) return;
    e.preventDefault(); // keep focus on the hidden input
    const p = cell && this.#position(cell);
    const hasNote = p && this.#tabs[p.t][p.c][p.s] !== null;
    const selected = p && this.#selection.some(n => n.t === p.t && n.c === p.c && n.s === p.s);
    if (p) this.#goTo(p.t, p.c, p.s, Boolean(selected));
    else { this.#selection = []; this.#endTyping(); this.#render(); }
    this.#input.focus({ preventScroll: true });
    this.#drag = { ...p, t: +sheet.dataset.t, x: e.clientX, y: e.clientY, moved: false, selecting: !hasNote, pointerId: e.pointerId };
    if (e.pointerType === 'mouse' || hasNote) this.setPointerCapture(e.pointerId);
  };

  #onPointerMove = e => {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.moved = true;
      if (drag.selecting) {
        this.classList.add('ascii-tabs-selecting');
        this.#marquee = this.#el('div', 'ascii-tabs-marquee', this);
      }
      else {
        this.classList.add('ascii-tabs-dragging');
        this.#dragPreview = this.#el('div', 'ascii-tabs-drag-preview', this);
        this.#dragPreview.setAttribute('aria-hidden', 'true');
        const sources = this.#selection.length ? this.querySelectorAll('.ascii-tabs-selected') : [this.querySelector('.ascii-tabs-cur')];
        for (const source of sources) {
          const fret = source?.querySelector('.ascii-tabs-fret');
          if (!fret) continue;
          const box = fret.getBoundingClientRect();
          const preview = fret.cloneNode(true);
          Object.assign(preview.style, { left: `${box.left - drag.x}px`, top: `${box.top - drag.y}px` });
          this.#dragPreview.append(preview);
          source.classList.add('ascii-tabs-src');
        }
      }
    }
    if (drag.selecting) {
      const left = Math.min(drag.x, e.clientX), top = Math.min(drag.y, e.clientY);
      const right = Math.max(drag.x, e.clientX), bottom = Math.max(drag.y, e.clientY);
      Object.assign(this.#marquee.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
      this.#selection = [];
      for (const cell of this.#tabEls[drag.t].querySelectorAll('.ascii-tabs-cell')) {
        const fret = cell.querySelector('.ascii-tabs-fret');
        const box = fret?.getBoundingClientRect();
        const selected = Boolean(box && box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom);
        if (selected) this.#selection.push(this.#position(cell));
      }
      return;
    }
    this.#dragPreview.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    this.querySelector('.ascii-tabs-drop')?.classList.remove('ascii-tabs-drop');
    const over = this.#cellAt(e.clientX, e.clientY);
    if (over && this.contains(over) && !over.classList.contains('ascii-tabs-src')) over.classList.add('ascii-tabs-drop');
  };

  #endDrag(e, cancelled) {
    const from = this.#drag;
    if (!from || from.pointerId !== e.pointerId) return;
    this.#drag = null;
    if (this.hasPointerCapture(e.pointerId)) this.releasePointerCapture(e.pointerId);
    this.#marquee?.remove();
    this.#marquee = null;
    this.#dragPreview?.remove();
    this.#dragPreview = null;
    this.classList.remove('ascii-tabs-dragging', 'ascii-tabs-selecting');
    if (from.selecting) {
      if (cancelled) this.#selection = [];
      const first = this.#selection[0];
      if (first) this.#goTo(first.t, first.c, first.s, true);
      else this.#render();
      return;
    }
    if (!from.moved) return;
    const over = !cancelled && this.#cellAt(e.clientX, e.clientY);
    if (!over || !this.contains(over)) return this.#render();
    const to = this.#position(over);
    if (this.#selection.length) {
      this.#transferSelection(to.t, to.c - from.c, to.s - from.s);
      return this.#render();
    }
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
    if (button.classList.contains('ascii-tabs-delete')) return this.#deleteFromButton(t);
  };

  // Listeners can observe or replace the built-in delete action. Cancelling the
  // event leaves the Tab untouched, so an asynchronous confirmation can call
  // removeTab(event.detail.index) later if it succeeds.
  #deleteFromButton(index) {
    const event = new CustomEvent('delete', { detail: { index }, bubbles: true, cancelable: true });
    if (!this.dispatchEvent(event)) return;
    this.removeTab(index);
  }

  // Copies Tab `index` as plain ASCII, like the copy button does
  async copy(index = 0) {
    const tab = this.#tabs[index];
    if (!tab) return;
    await copyText(this.#selection.length && this.#selection[0].t === index ? this.#selectionText() : format(tab, { spacing: this.#spacing, labels: this.labels, notation: this.notation, tuning: this.tuning, width: this.#capacity + labelWidth(this.labels, this.tuning), annotations: this.#annotations[index], annotationFit: this.#annotationFit() }));
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
    if (this.readonly || this.#columnLayout) return;
    this.#endTyping();
    this.#tabTitles = this.tabTitles;
    this.#tabTitles.push('');
    this.#tabs.push([]);
    this.#logicalLengths.push(0);
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
    if (this.readonly || this.#columnLayout || !this.#tabs[t]) return;
    if (this.#tabs.length === 1 && lastContent(this.#tabs[0], this.#annotations[0]) < 0) return;
    this.#endTyping();
    this.#cur = null;
    this.#selection = [];
    if (this.#tabs.length > 1) {
      this.#tabs.splice(t, 1);
      this.#logicalLengths.splice(t, 1);
      this.#annotations.splice(t, 1);
      this.#tabTitles.splice(t, 1);
    } else {
      this.#tabs[0] = [];
      this.#logicalLengths[0] = 0;
      this.#annotations[0] = [];
      this.#tabTitles[0] = '';
    }
    this.#buildSheets();
    this.#emitChange();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ascii-tabs')) {
  customElements.define('ascii-tabs', AsciiTabs);
}

export { AsciiTabs, parse, format };
