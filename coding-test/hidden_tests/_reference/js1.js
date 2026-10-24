'use strict';

async function promisePool(taskFns, limit) {
  if (!Number.isInteger(limit) || limit <= 0) throw new TypeError('limit must be a positive integer');
  const results = new Array(taskFns.length);
  if (taskFns.length === 0) return results;
  return new Promise((resolve, reject) => {
    let next = 0, done = 0, failed = false;
    const launch = () => {
      if (failed || next >= taskFns.length) return;
      const i = next++;
      Promise.resolve().then(() => taskFns[i]()).then((v) => {
        results[i] = v;
        if (++done === taskFns.length) resolve(results); else launch();
      }, (e) => { failed = true; reject(e); });
    };
    for (let k = 0; k < Math.min(limit, taskFns.length); k++) launch();
  });
}

async function retry(fn, { retries = 3, delayMs = 0, factor = 2, shouldRetry = () => true } = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(attempt); } catch (e) {
      if (attempt > retries || !shouldRetry(e)) throw e;
      await new Promise((r) => setTimeout(r, delayMs * factor ** (attempt - 1)));
    }
  }
}

module.exports = { promisePool, retry };
