'use strict';

async function promisePool(taskFns, limit) {
    // Validate limit – must be a positive integer
    if (!Number.isInteger(limit) || limit <= 0) {
        return Promise.reject(new TypeError('limit must be a positive integer'));
    }

    const n = taskFns.length;
    const results = new Array(n);
    let nextIdx = 0;          // index of the next task to start
    let activeCount = 0;      // currently running tasks
    let hasError = false;
    let errorVal = null;

    return new Promise((resolve, reject) => {
        // Execute a single task and store its result (or throw)
        async function runTask(idx) {
            try {
                const ret = await taskFns[idx]();
                results[idx] = ret;
                return ret;
            } catch (e) {
                results[idx] = e;
                errorVal = e;
                hasError = true;
                reject(e);          // propagate error to the outer promise
                throw e;            // keep the stack trace intact
            }
        }

        // Start a new task if we can
        function startNext() {
            if (hasError || nextIdx >= n || activeCount >= limit) return;
            const idx = nextIdx++;
            activeCount++;
            runTask(idx)
                .then(() => {
                    activeCount--;
                    // As soon as one slot frees up, start the next pending task
                    if (nextIdx < n && activeCount < limit && !hasError) {
                        startNext();
                    }
                })
                .catch(() => {
                    // Task rejected – just decrement the counter
                    activeCount--;
                });
        }

        // Seed the initial batch of tasks (up to `limit`)
        for (let i = 0; i < Math.min(n, limit); i++) {
            startNext();
        }

        // Wait until all tasks have finished
        const timer = setInterval(() => {
            if (activeCount === 0 && nextIdx >= n) {
                clearInterval(timer);
                if (!hasError) {
                    resolve(results);
                }
                // If an error occurred the outer promise is already rejected
            }
        }, 10);

        // Empty task list resolves immediately
        if (n === 0) {
            clearInterval(timer);
            resolve(results);
        }
    });
}

async function retry(fn, options = {}) {
    const { retries = 3, delayMs = 0, factor = 2, shouldRetry = (err) => true } = options;
    let attempt = 1;
    let lastError = null;

    while (true) {
        try {
            const result = await fn(attempt);
            return result;
        } catch (e) {
            lastError = e;
            // No more retries or shouldRetry says stop
            if (attempt > retries || !shouldRetry(e)) {
                throw e;
            }
            // Wait before the next attempt: delayMs * factor^(attempt-1)
            const wait = delayMs * Math.pow(factor, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, wait));
            attempt++;
        }
    }
}

module.exports = { promisePool, retry };
