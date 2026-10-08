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

MIT licensed.
