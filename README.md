# ascii-tabs

A zero-dependency web component for writing and showing guitar tabs as plain ASCII text.

> Work in progress: see [docs/spec-v0.1.md](docs/spec-v0.1.md). `tablatura.html` is the original standalone editor this library grows from.

## Usage

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/libasoles/ascii-tabs@main/ascii-tabs.js"></script>

<ascii-tabs></ascii-tabs>
```

A bare `<ascii-tabs>` is editable: a hint, one Sheet per Tab with copy and delete buttons, and an add button. Click a string and type the fret number (0–24); move with the arrow keys, Enter and Tab.

Read and write the content with `value` (`(number|null)[][][]`: Tabs → Columns → 6 entries, String 1 to 6). Every edit fires `change`:

```js
const tabs = document.querySelector('ascii-tabs');
tabs.addEventListener('change', e => console.log(e.detail.value));
tabs.value = [[[null, null, 3, null, null, null], [0, null, null, null, null, null]]];
```

## ASCII in and out

A `<pre>` per Tab becomes the initial value. Parsing is lenient: number labels (`1 `–`6 `) and note labels (`e|B|G|D|A|E|`), any number of dashes. Frets at the same horizontal position share a Column, and several Staves are joined into one Tab.

```html
<ascii-tabs>
  <pre>
1 ---------
2 ---------
3 -2---2---
4 ---------
5 -0---0---
6 ---------</pre>
  <pre>
e|-0--3--|
B|-1--0--|
G|-0--0--|
D|-2--0--|
A|-3--2--|
E|-----3-|</pre>
</ascii-tabs>
```

The copy button copies the same plain ASCII. `parse` and `format` are exported as pure functions:

```js
import { parse, format } from './ascii-tabs.js';

const tab = parse('1 -3--5-\n2 ------\n3 ------\n4 ------\n5 ------\n6 ------'); // one Tab: Column[]
format(tab, { spacing: 2 }); // "1 -3--5-\n2 ------\n..."
```

`format` writes number labels, Spacing 2 by default, widens a Column that holds a two-digit Fret on every String, and cuts each Staff right after its last Column. Malformed ASCII logs a console error and parses to an empty Tab.

## Composition

Features are turned on by composing parts, not by boolean attributes ([ADR 0001](docs/adr/0001-composition-over-boolean-props.md)). With no part children you get the default composition: hint, a Sheet with copy and delete, and add (read-only: just a Sheet with copy). With any part child, only the parts you declare appear. Content inside a part replaces its default icon or text.

```html
<ascii-tabs>
  <ascii-tabs-hint></ascii-tabs-hint>
  <ascii-tabs-sheet>
    <ascii-tabs-copy></ascii-tabs-copy>
    <ascii-tabs-delete></ascii-tabs-delete>
  </ascii-tabs-sheet>
  <ascii-tabs-add></ascii-tabs-add>
</ascii-tabs>
```

### Read-only

```html
<ascii-tabs readonly>
  <pre>
1 -3---
...</pre>
</ascii-tabs>
```

`readonly` disables editing. Hint, delete and add hide themselves even when declared; copy still works.

### Copy, hint, add and delete

```html
<!-- No copy button -->
<ascii-tabs><ascii-tabs-sheet></ascii-tabs-sheet></ascii-tabs>

<!-- Custom copy text, custom hint -->
<ascii-tabs>
  <ascii-tabs-hint>Pick a string, then type a fret.</ascii-tabs-hint>
  <ascii-tabs-sheet><ascii-tabs-copy>Copy ASCII</ascii-tabs-copy></ascii-tabs-sheet>
  <ascii-tabs-add>+ New tab</ascii-tabs-add>
</ascii-tabs>
```

Delete never asks for confirmation. With several Tabs it removes its Tab; with one Tab it clears it, and is disabled while that Tab is empty.

### Custom controls

Skip the parts and call the root's methods:

```html
<ascii-tabs id="tabs"></ascii-tabs>
<button onclick="tabs.copy(0)">Copy</button>
<button onclick="tabs.addTab()">Add</button>
<button onclick="tabs.removeTab(0)">Delete</button>
```

`copy(index)`, `addTab()` and `removeTab(index)` behave like the built-in buttons, including the delete rules.

## Spacing

Spacing is the number of dashes between two Columns' Frets: `spacing="N"` (1–6, clamped, default 2), also available as the `spacing` property. Add the optional slider part to let people change it; it is not in the default composition and also works in `readonly`. Spacing changes the rendered Tab and the copied text, and a Column with a two-digit Fret is still one character wider on every String.

```html
<!-- Initial spacing, no slider -->
<ascii-tabs spacing="3"></ascii-tabs>

<!-- Slider from 1 to 6 (put text inside to replace its label) -->
<ascii-tabs>
  <ascii-tabs-spacing></ascii-tabs-spacing>
  <ascii-tabs-sheet><ascii-tabs-copy></ascii-tabs-copy></ascii-tabs-sheet>
</ascii-tabs>
```

MIT licensed.
