// Just enough of node:test and node:assert/strict to run the *.test.js files in a browser
// when Node isn't to hand (`node --test` is the usual way). Used by scripts/browser-tests.html only; not part of the app.

export const results = [];

export function test(name, fn) {
  results.push(Promise.resolve().then(fn).then(
    () => ({ name, ok: true }),
    (err) => ({ name, ok: false, error: err }),
  ));
}

class AssertionError extends Error {}

const show = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

function deepEq(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEq(a[k], b[k]));
}

const assert = {
  equal(actual, expected, msg) {
    if (!Object.is(actual, expected)) throw new AssertionError(msg || `${show(actual)} !== ${show(expected)}`);
  },
  deepEqual(actual, expected, msg) {
    if (!deepEq(actual, expected)) throw new AssertionError(msg || `${show(actual)} does not deep-equal ${show(expected)}`);
  },
  throws(fn, expected, msg) {
    try { fn(); } catch (err) {
      if (expected instanceof RegExp && !expected.test(err.message)) {
        throw new AssertionError(msg || `threw "${err.message}", expected ${expected}`);
      }
      return;
    }
    throw new AssertionError(msg || 'expected a throw');
  },
  ok(v, msg) { if (!v) throw new AssertionError(msg || `${show(v)} is not truthy`); },
};

export default assert;
