'use strict';

function parseQuery(qs) {
  const result = {};
  if (qs.startsWith('?')) qs = qs.slice(1);
  const dec = (s) => decodeURIComponent(s.replace(/\+/g, ' '));
  for (const part of qs.split('&')) {
    if (part === '') continue;
    const i = part.indexOf('=');
    const key = dec(i === -1 ? part : part.slice(0, i));
    const value = i === -1 ? '' : dec(part.slice(i + 1));
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (Array.isArray(result[key])) result[key].push(value); else result[key] = [result[key], value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const da = a instanceof Date, db = b instanceof Date;
  if (da || db) return da && db && a.getTime() === b.getTime();
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function groupBy(items, keyFn) {
  const map = new Map();
  items.forEach((item, i) => {
    const k = keyFn(item, i);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  });
  return map;
}

function debounce(fn, wait) {
  let timer = null;
  let lastArgs, lastThis;
  const invoke = () => { timer = null; const a = lastArgs, t = lastThis; lastArgs = lastThis = undefined; return fn.apply(t, a); };
  function debounced(...args) {
    lastArgs = args; lastThis = this;
    clearTimeout(timer);
    timer = setTimeout(invoke, wait);
  }
  debounced.cancel = () => { clearTimeout(timer); timer = null; lastArgs = lastThis = undefined; };
  debounced.flush = () => {
    if (timer === null) return undefined;
    clearTimeout(timer);
    return invoke();
  };
  return debounced;
}

function chunk(arr, size) {
  if (!Number.isInteger(size) || size <= 0) throw new RangeError('size must be a positive integer');
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

module.exports = { parseQuery, deepEqual, groupBy, debounce, chunk };
