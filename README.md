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

MIT licensed.
