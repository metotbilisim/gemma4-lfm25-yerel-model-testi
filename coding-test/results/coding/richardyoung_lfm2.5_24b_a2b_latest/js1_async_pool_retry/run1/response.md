

```javascript
'use strict';

/**
 * Executes tasks with a concurrency limit.
 * @param {Function[]} taskFns - Array of zero‑argument functions.
 * @param {number} limit - Positive integer limiting concurrent tasks.
 * @returns {Promise<Array>} Resolves with results in original order, or rejects on error.
 */
async function promisePool(taskFns, limit) {
    // Validate limit – must be a positive integer
    if (!Number.isInteger(limit) || limit <= 0) {
        return Promise.reject(new TypeError('Limit must be a positive integer'));
    }

    const n = taskFns.length;
    if (n === 0) {
        return Promise.resolve([]);
    }

    const results = new Array(n);
    let nextIndex = 0;   // next task to start
    let running = 0;     // currently executing tasks
    let hasError = false;
    let finalError = null;

    /**
     * Runs a single task and stores its result or handles errors.
     */
    async function runTask(i) {
        try {
            const result = await taskFns[i]();
            if (!hasError) {
                results[i] = result;
            }
        } catch (err) {
            if (!hasError) {
                hasError = true;
                finalError = err;
                throw err; // reject the outer promise immediately
            }
        } finally {
            running--;
            // If no error and there are more tasks, start the next one
            if (!hasError && nextIndex < n && running < limit) {
                const next = nextIndex++;
                const p = runTask(next);
                running++;
            }
        }
    }

    // Launch up to `limit` initial tasks
    for (let i = 0; i < limit && nextIndex < n; ) {
        const p = runTask(nextIndex++);
        running++;
    }

    // Wait until all tasks finish or an error occurs
    return new Promise((resolve, reject) => {
        const check = () => {
            if (hasError) {
                reject(finalError);
            } else if (running === 0 && nextIndex >= n) {
                resolve(results);
            } else {
                // Small delay to avoid busy looping
                setTimeout(check, 10);
            }
        };
        check();
    });
}

/**
 * Retries a function with exponential backoff.
 * @param {Function} fn - Function that takes an attempt number (1‑based) and returns a promise or throws.
 * @param {Object} [options] - Options object.
 * @param {number} [options.retries=3] - Number of retries.
 * @param {number} [options.delayMs=0] - Base delay in milliseconds.
 * @param {number} [options.factor=2] - Exponential factor.
 * @param {Function} [options.shouldRetry=(err)=>true] - Predicate to decide whether to retry.
 * @returns {Promise<*>} Resolves with the function's return value, or rejects with the last error.
 */
async function retry(fn, options = {}) {
    const { retries = 3, delayMs = 0, factor = 2, shouldRetry = () => true } = options;
    let attempt = 1;

    while (true) {
        try {
            const result = await fn(attempt);
            return result;
        } catch (err) {
            if (attempt > retries) {
                throw err; // no more retries
            }
            if (!shouldRetry(err)) {
                throw err; // should not retry
            }
            const waitTime = delayMs * Math.pow(factor, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            attempt++;
        }
    }
}

module.exports = { promisePool, retry };
```