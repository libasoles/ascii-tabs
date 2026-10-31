# ASCII Tabs

A guitar tablature editor and viewer whose canonical output is plain ASCII text, meant to be pasted anywhere.

## Language

**Tab**:
One guitar tablature: a single continuous sequence of Columns. A page can hold several Tabs.
_Avoid_: Tablature (in code), song

**Column**:
One moment in a Tab: for each String, either a Fret or nothing.
_Avoid_: Beat, time, step, slot

**Annotation**:
Text attached to a Column in a Tab, such as a chord name or a playing instruction.
_Avoid_: Staff header, row text

**Annotation fit**:
How an Annotation's text claims horizontal room: `widen` its Column, `overflow` into the next one, or `stagger` on two rows.
_Avoid_: Annotation width mode

**String**:
One of the six guitar strings, numbered 1 (highest pitch) to 6 (lowest).
_Avoid_: Line, cuerda

**Fret**:
The number written on a String in a Column; 0 is the open string.
_Avoid_: Note, number, traste

**Sheet**:
The visual card that shows one Tab together with its per-Tab tools (copy, delete).
_Avoid_: Card, panel, page

**String label**:
How Strings are named in the ASCII text: by number (`1`–`6`, the default) or by the note of the open String in the Tuning (`e B G D A E` in standard tuning).
_Avoid_: String name

**Tuning**:
The note of each open String, from String 1 to 6 (`E B G D A E` by default; `E B G D A D` is drop D). It decides which note a Fret sounds when notes are shown instead of Fret numbers, and the names used by note String labels. It never changes the Frets stored in a Tab.
_Avoid_: Afinación, string names

**Staff**:
A visual row of a Tab that holds six Strings. A Tab wraps into as many Staves as the available width needs; Staves are not part of the Tab's content.
_Avoid_: System, row, line

**Spacing**:
The number of dashes between two consecutive Columns' Frets in the rendered and copied ASCII text.
_Avoid_: Gap, separation, padding, width

**Hint**:
The short instruction shown to someone editing, telling them how to start (e.g. "Click a string and type the fret number").
_Avoid_: Legend, leyenda, help, instructions

**Read-only**:
The mode where a Tab can be viewed and copied but not changed. Its opposite, the default, is **Editable**.
_Avoid_: View mode, locked, static
