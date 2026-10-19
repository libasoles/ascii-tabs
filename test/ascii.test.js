import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, format } from '../ascii-tabs.js';

const col = (...frets) => {
  const c = Array(6).fill(null);
  frets.forEach(([s, f]) => { c[s - 1] = f; });
  return c;
};

test('Column annotations follow Spacing, notation and Staff breaks in ASCII', () => {
  const tab = [col([1, 1]), col([1, 12]), col([1, 3])];
  for (const spacing of [1, 2, 6]) {
    for (const notation of ['frets', 'letters', 'solfege']) {
      const options = { spacing, notation, labels: 'notes', annotations: [{ column: 2, text: 'Dm/A' }] };
      const lines = format(tab, options).split('\n');
      const plain = format(tab, { spacing, notation, labels: 'notes' }).split('\n')[0];
      const third = format(tab.slice(0, 2), { spacing, notation, labels: 'notes' }).split('\n')[0].length + Math.ceil(spacing / 2);
      assert.equal(lines[0].indexOf('Dm/A'), third);
      assert.equal(lines[1], plain);
    }
  }
  const blocks = format(tab, { width: 6, annotations: [{ column: 2, text: 'Dm/A' }] }).split('\n\n');
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].split('\n').length, 6);
  assert.equal(blocks[2].split('\n')[0], '   Dm/A');
  assert.equal(format(tab, { annotations: [] }), format(tab));
});

test('HTML annotation ASCII export uses the explicit text fallback without a DOM', () => {
  const tab = [col([1, 1])];
  const annotations = [{ column: 0, html: '<strong>Dm</strong><sup>*</sup>', text: 'Dm*' }];
  assert.equal(format(tab, { annotations }), format(tab, { annotations: [{ column: 0, text: 'Dm*' }] }));
  assert.throws(() => format(tab, { annotations: [{ column: 0, html: '<b>Dm</b>' }] }), /text fallback/);
});

test('ASCII annotations stack collisions and preserve annotated empty Columns', () => {
  const tab = [col([1, 1]), col()];
  const annotations = [{ column: 1, text: 'Dm/F*' }, { column: 0, text: 'RE MENOR' }, { column: 0, text: 'Intro\nVerse' }];
  const lines = format(tab, { annotations }).split('\n');
  assert.deepEqual(lines.slice(0, 4), ['   RE MENOR', '   Intro', '   Verse', '      Dm/F*']);
  assert.equal(lines[4], '1 -1----');
  assert.throws(() => format(tab, { annotations: [{ column: 2, text: 'invalid' }] }), TypeError);
});

test('parenthesized frets and empty pairs survive ASCII round trips and notation changes', () => {
  const tab = [col([1, { fret: 12, parenthesized: true }], [2, 3]), col([1, { fret: null, parenthesized: true }]), col([1, 7])];
  const ascii = format(tab);
  assert.equal(ascii.split('\n')[0], '1 -(12)--()--7-');
  assert.deepEqual(parse(ascii), tab);
  assert.match(format(tab, { notation: 'letters' }), /\(E\)/);
  assert.match(format(tab, { notation: 'solfege' }), /\(mi\)/);
});

test('format writes number labels with spacing 2', () => {
  const out = format([col([3, 3]), col([3, 5])]);
  assert.equal(out.split('\n')[2], '3 -3--5-');
  assert.equal(out.split('\n')[0], '1 ------');
  assert.equal(out.split('\n').length, 6);
});

test('format cuts the Staff right after the last Column', () => {
  const out = format([col([1, 0]), col(), col()]);
  assert.equal(out.split('\n')[0], '1 -0-');
});

test('format of an empty Tab is empty', () => {
  assert.equal(format([]), '');
  assert.equal(format([col(), col()]), '');
});

test('a two-digit Fret widens its Column on every String', () => {
  const lines = format([col([1, 12], [2, 3]), col([1, 5])]).split('\n');
  assert.equal(lines[0], '1 -12--5-');
  assert.equal(lines[1], '2 -3-----');
  assert.equal(new Set(lines.map(l => l.length)).size, 1);
});

test('format honors spacing', () => {
  const lines = format([col([1, 3]), col([1, 5])], { spacing: 4 }).split('\n');
  assert.equal(lines[0], '1 --3----5--');
  assert.equal(format([col([1, 3]), col([1, 5])], { spacing: 1 }).split('\n')[0], '1 -3-5');
});

test('format wraps into Staves by width', () => {
  const out = format([col([1, 1]), col([1, 2]), col([1, 3]), col([1, 4])], { width: 2 + 6 });
  const staves = out.split('\n\n');
  assert.equal(staves.length, 2);
  assert.equal(staves[0].split('\n')[0], '1 -1--2-');
  assert.equal(staves[1].split('\n')[0], '1 -3--4-');
});

test('parse accepts number labels and any number of dashes', () => {
  const tab = parse('1 -3----5--\n2 -----------\n3 -----------\n4 -----------\n5 -----------\n6 -----------');
  assert.deepEqual(tab, [col([1, 3]), col([1, 5])]);
});

test('parse accepts note labels', () => {
  const tab = parse('e|-3--|\nB|----|\nG|----|\nD|-5--|\nA|----|\nE|----|');
  assert.deepEqual(tab, [col([1, 3], [4, 5])]);
});

test('parse groups Frets at the same position into a Column', () => {
  const tab = parse('1 -12-\n2 -3--\n3 ----\n4 ----\n5 ----\n6 ----');
  assert.deepEqual(tab, [col([1, 12], [2, 3])]);
});

test('parse joins several Staves into one Tab', () => {
  const tab = parse('1 -1-\n2 ---\n3 ---\n4 ---\n5 ---\n6 ---\n\n1 -2-\n2 ---\n3 ---\n4 ---\n5 ---\n6 ---');
  assert.deepEqual(tab, [col([1, 1]), col([1, 2])]);
});

test('parse of malformed input logs an error and yields an empty Tab', () => {
  const errors = [];
  const original = console.error;
  console.error = (...a) => errors.push(a);
  try {
    assert.deepEqual(parse('hello world'), []);
    assert.deepEqual(parse('1 -3-\n2 -5-'), []);
    assert.deepEqual(parse('1 -99-\n2 ---\n3 ---\n4 ---\n5 ---\n6 ---'), []);
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 3);
});

test('parse of blank input is an empty Tab', () => {
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse('  \n '), []);
});

test('parse(format(v)) round-trips', () => {
  const tab = [col([1, 0], [3, 12]), col([2, 3]), col([6, 24], [1, 7]), col([4, 5])];
  assert.deepEqual(parse(format(tab)), tab);
  assert.deepEqual(parse(format(tab, { spacing: 3 })), tab);
  assert.deepEqual(parse(format(tab, { width: 14 })), tab);
});

test('parse(format(v)) keeps an empty Column between Frets', () => {
  const tab = [col([1, 3]), col(), col([1, 5]), col([2, 1])];
  assert.deepEqual(parse(format(tab)), tab);
});

test('format uses number labels by default', () => {
  const lines = format([col([3, 3])]).split('\n');
  assert.deepEqual(lines.map(l => l.slice(0, 2)), ['1 ', '2 ', '3 ', '4 ', '5 ', '6 ']);
});

test('format with labels "notes" uses note labels in standard tuning', () => {
  const lines = format([col([1, 3], [6, 5])], { labels: 'notes' }).split('\n');
  assert.deepEqual(lines.map(l => l.slice(0, 2)), ['e|', 'B|', 'G|', 'D|', 'A|', 'E|']);
  assert.equal(lines[0], 'e|-3-');
  assert.equal(lines[5], 'E|-5-');
});

test('parse keeps accepting both label styles whatever the format used', () => {
  const tab = [col([1, 3]), col([6, 5])];
  assert.deepEqual(parse(format(tab, { labels: 'notes' })), tab);
  assert.deepEqual(parse(format(tab, { labels: 'numbers' })), tab);
});

test('note notation converts all open Strings and octaves in standard tuning', () => {
  for (const [notation, names] of [
    ['letters', ['E', 'B', 'G', 'D', 'A', 'E']],
    ['solfege', ['mi', 'si', 'sol', 're', 'la', 'mi']],
  ]) {
    for (const fret of [0, 12, 24]) {
      const lines = format([Array(6).fill(fret)], { notation }).split('\n');
      assert.deepEqual(lines.map(line => line.slice(2).replace(/-/g, '')), names);
      assert.equal(new Set(lines.map(line => line.length)).size, 1);
    }
  }
});

test('note names, sharps and empty cells share aligned Column widths at every Spacing', () => {
  const tab = [col([1, 0], [3, 1]), col(), col([1, 1], [2, 3]), col([1, 3])];
  for (const spacing of [1, 2, 3, 4, 5, 6]) {
    const lines = format(tab, { notation: 'solfege', spacing }).split('\n');
    const lead = Math.ceil(spacing / 2);
    const first = 2 + lead;
    const third = first + 4 + spacing + 1 + spacing;
    assert.equal(lines[0].slice(first, first + 4), 'mi--');
    assert.equal(lines[2].slice(first, first + 4), 'sol#');
    assert.equal(lines[0].slice(third, third + 2), 'fa');
    assert.equal(lines[1].slice(third, third + 2), 're');
    assert.equal(new Set(lines.map(line => line.length)).size, 1);
  }
  assert.equal(format([col([1, 2]), col([1, 4])], { notation: 'letters' }).split('\n')[0], '1 -F#--G#-');
});

test('note notation wraps using the displayed names and preserves labels', () => {
  const tab = [col([1, 3]), col([1, 4]), col([1, 0])];
  const staves = format(tab, { notation: 'solfege', width: 12, labels: 'notes' }).split('\n\n');
  assert.equal(staves.length, 2);
  assert.equal(staves[0].split('\n')[0], 'e|-sol-');
  assert.equal(staves[1].split('\n')[0], 'e|-sol#--mi-');
  for (const staff of staves) {
    assert.equal(new Set(staff.split('\n').map(line => line.length)).size, 1);
    assert.ok(staff.split('\n').every(line => line.length <= 12));
  }
  assert.equal(format(tab, { notation: 'unknown' }), format(tab));
  assert.equal(format([], { notation: 'solfege' }), '');
});


test('format exports colored notes as plain frets with matching widths and notation', () => {
  const colored = [col([1, { fret: 12, color: 'red', bold: false }], [2, { fret: 0 }]), col([1, 5])];
  const plain = [col([1, 12], [2, 0]), col([1, 5])];
  for (const notation of ['frets', 'letters', 'solfege']) {
    assert.equal(format(colored, { notation, width: 8 }), format(plain, { notation, width: 8 }));
  }
});

test('labels none omits prefixes, reclaims wrapping width and parses back', () => {
  const tab = [col([1, 12], [6, 0]), col([2, 5]), col([3, 7])];
  const ascii = format(tab, { labels: 'none', width: 7 });
  assert.equal(ascii.split('\n')[0], '-12----');
  assert.equal(ascii.split('\n\n').length, 2);
  assert.deepEqual(parse(ascii), tab);
  assert.deepEqual(parse(format(tab, { labels: 'none', spacing: 1 })), tab);
  assert.equal(format(tab, { labels: 'invalid' }), format(tab));
});

test('Drop D changes the sixth String in both note notations and labels', () => {
  const tuning = ['E', 'B', 'G', 'D', 'A', 'D'];
  const tab = [Array(6).fill(0), col([6, 2]), col([6, 12])];
  assert.equal(format(tab, { tuning, notation: 'letters' }).split('\n')[5], '6 -D--E--D-');
  assert.equal(format(tab, { tuning: tuning.join(' '), notation: 'solfege' }).split('\n')[5], '6 -re---mi--re-');
  assert.deepEqual(parse(format(tab, { tuning, labels: 'notes' })), tab);
  assert.match(format(tab, { tuning, labels: 'notes' }).split('\n')[5], /^D\|/);
});

test('custom tunings accept accidentals and keep labels, wrapping and parsing aligned', () => {
  const tuning = ['Eb', 'B', 'Gb', 'D', 'Ab', 'E'];
  const tab = [Array(6).fill(0), Array(6).fill(1), Array(6).fill(12)];
  const ascii = format(tab, { tuning, labels: 'notes', width: 10 });
  assert.deepEqual(parse(ascii), tab);
  for (const line of ascii.split('\n').filter(Boolean)) assert.ok(line.length <= 10);
  assert.equal(format(tab, { tuning, notation: 'letters' }).split('\n')[0], '1 -D#--E---D#-');
});

test('invalid or incomplete tuning falls back to standard tuning', () => {
  const tab = [Array(6).fill(0)];
  for (const tuning of [null, '', 'E B G D A', 'E B G D A H', [4, 11, 7, 2, 9, 2], Array(6)]) {
    assert.equal(format(tab, { tuning, notation: 'letters', labels: 'notes' }), format(tab, { notation: 'letters', labels: 'notes' }));
  }
});
