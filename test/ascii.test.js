import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, format } from '../ascii-tabs.js';

const col = (...frets) => {
  const c = Array(6).fill(null);
  frets.forEach(([s, f]) => { c[s - 1] = f; });
  return c;
};

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
