# ascii-tabs v0.1 — spec

Turn the tab editor into an open-source, zero-dependency web component library. Vocabulary follows [GLOSSARY.md](../GLOSSARY.md); design decisions are in [docs/adr](./adr).

## Origin

The starting code is the editor in `guitar-chords/src/site/tab-editor.js` (more advanced than `tablatura.html`: frets up to 24, i18n, initial tabs, spacing). Keep its editing behaviour (click a slot, type a fret, arrows/Enter/Tab to move, Backspace/Delete, drag a fret to another slot, staves wrap to the width, a new staff appears when you write past the end, copy as plain ASCII). Drop its `window.TAB_EDITOR_OPTIONS` flags API.

## Distribution

- One ES module, `ascii-tabs.js`, with no build step and no dependencies.
- Published only on GitHub (no npm), at `libasoles/ascii-tabs`, MIT, tagged `v0.1.0` (latest `v0.1.1`).
- Usage: `<script type="module" src="https://cdn.jsdelivr.net/gh/libasoles/ascii-tabs@0.1.1/ascii-tabs.js">`.
- Exports `parse` and `format` as pure functions.

## Composition (see ADR 0001)

```html
<ascii-tabs readonly spacing="3" labels="notes" theme="dark" lang="es">
  <ascii-tabs-hint></ascii-tabs-hint>
  <ascii-tabs-spacing></ascii-tabs-spacing>
  <ascii-tabs-sheet>
    <ascii-tabs-copy></ascii-tabs-copy>
    <ascii-tabs-delete></ascii-tabs-delete>
  </ascii-tabs-sheet>
  <ascii-tabs-add></ascii-tabs-add>
  <ascii-tabs-storage key="my-tabs"></ascii-tabs-storage>
</ascii-tabs>
```

- A feature is on when its part is present.
- An empty part shows its default icon or text; content inside a part replaces it.
- `<ascii-tabs-sheet>` is the template repeated for every Tab; the per-Tab tools go inside it.
- **Default composition** (when the root has no part children):
  - Editable: hint + sheet(copy, delete) + add.
  - Read-only: sheet(copy).
  - The spacing slider is never in the default composition.
- **Read-only** (`readonly`): no editing; hint, delete and add hide themselves even when declared. Copy and the spacing slider still work. Staves still span the full Sheet width, as when editable.
- **Imperative API on the root** (to wire up your own controls): `copy(index)`, `addTab()`, `removeTab(index)`, `spacing` (get/set), `value` (get/set).

### Delete

- No confirmation.
- More than one Tab: every Sheet has an enabled delete that removes its Tab.
- Only one Tab: delete is shown. When the Tab has content it is enabled and clears the Tab (there is always at least one Tab). When the Tab is empty it is disabled.

## Root attributes

| Attribute | Values | Default |
|---|---|---|
| `readonly` | present / absent | editable |
| `spacing` | integer 1–6 | 2 |
| `labels` | `notes` | numbers |
| `theme` | `light`, `dark` | follows `prefers-color-scheme` |
| `lang` | `es` | English |

## Data

- `value` is `(number | null)[][][]`: Tabs → Columns → 6 entries indexed by String 1 to 6. Frets go from 0 to 24.
- The initial value comes from one `<pre>` per Tab inside the root (parsed from ASCII), or from `value` set before the element connects. `value` can be read or written at any time.
- Every edit fires a `change` event with `detail.value`. The component is uncontrolled by default; the controlled pattern works by listening to `change` and writing `value` back.
- `<ascii-tabs-storage key="…">` is opt-in persistence to `localStorage`. Without it, nothing is stored.

## ASCII format

- **Spacing** is the number of dashes between two consecutive Columns' Frets (1–6, default 2). For example, `-3--5-` has spacing 2. A Column that holds a two-digit Fret is one character wider on every String, so Frets never touch.
- Spacing applies to both what is shown and what is copied. There is one value per instance.
- **String labels**: numbers by default (`1 -3--`). With `labels="notes"`, standard tuning (`e|-3--`, from String 1 to 6: `e B G D A E`).
- **Parsing is lenient:** it always accepts both label styles and any spacing. Columns are inferred from the horizontal position of each Fret; Frets at the same position are the same Column. Malformed ASCII logs a console error and yields an empty Tab.
- **Formatting is strict:** it uses the instance's labels and spacing, and cuts each Staff right after its last Fret.

## Theming (see ADR 0002)

- Light DOM with `.ascii-tabs-*` classes and `--ascii-tabs-*` custom properties.
- Built-in `light` theme (from guitar-chords): paper `#fdfaf5`, sheet `#fff`, ink `#1a1a1a`, dash `#6f6c66`, hover `#f4efe4`, focus `#f6e4df`, accent `#8b0000`.
- Built-in `dark` theme (from the original page): bg `#1b1a18`, paper `#232220`, ink `#f1ede4`, muted `#959189`, line `#36342f`, accent `#fb923c`, hover `#2c2a27`, focus `#3a2a1d`.
- The component paints only its Sheets, never the page background.
- Both built-in themes meet WCAG 2.2 AA contrast: 4.5:1 for every text colour (Frets, dashes, String labels, Hint) on paper, sheet, hover and focus. `npm run a11y` and `npm run lighthouse` check it in CI.

## Text

- English by default, with a `lang="es"` preset.
- `messages` is a partial object merged over the defaults. It covers aria-labels, tooltips, "copied" feedback and the default Hint ("Click a string and type the fret number." / "Hacé clic en una cuerda y escribí el número de traste.").

## Demo and docs

- The repo root `index.html` is the GitHub Page, in English. It has one section per feature, with off and on side by side and the HTML snippet underneath: editable vs read-only, copy, hint, add/delete, spacing slider, initial `spacing`, number vs note labels, light/dark/auto/custom themes, ASCII `<pre>` input, `value` + `change` with a live JSON panel, storage, custom controls through the imperative API, and `lang="es"`/`messages`.
- The README is in English, with concrete copy-paste examples for each of those.

## Tests

`node --test` covers `parse` and `format`. The rest is a manual smoke test on the demo.

## Out of scope

- npm publishing.
- More than 6 strings, other tunings, bass.
- Shadow DOM.
- Migrating guitar-chords, which is tracked as an issue in `libasoles/guitar-chords` and keeps the same storage key so saved user tabs survive.
