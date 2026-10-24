const promisePool = function (taskFns, limit) {
    return new Promise((resolve, reject) => {
        // Validate limit: must be a positive integer
        if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) {
            return reject(new TypeError('limit must be a positive integer'));
        }

        const n = taskFns.length;
        if (n === 0) {
            resolve([]);
            return;
        }

        const results = new Array(n);
        let running = 0;
        let nextIndex = 0;
        let completed = 0;
        let outerRejected = false;

        async function executeTask(index) {
            running++;
            try {
                const result = await taskFns[index]();
                results[index] = result;
            } catch (err) {
                if (!outerRejected) {
                    outerRejected = true;
                    reject(err);
                }
            } finally {
                running--;
                completed++;
                // If all tasks finished without error, resolve the outer promise
                if (!outerRejected && completed === n) {
                    resolve(results);
                }
                // Start next task if there is capacity and no error has occurred yet
                if (!outerRejected && nextIndex < n && running < limit) {
                    executeTask(nextIndex);
                    nextIndex++;
                }
            }
        }

        // Kick off the initial batch of tasks up to the concurrency limit
        while (nextIndex < n && running < limit) {
            executeTask(nextIndex);
            nextIndex++;
        }
    });
};

const retry = async function (fn, options) {
    const { retries = 3, delayMs = 0, factor = 2, shouldRetry = () => true } = options || {};

    let attempt = 1;
    let lastError = null;

    while (true) {
        try {
            const result = await fn(attempt);
            return result;
        } catch (err) {
            lastError = err;
            // If we've used up all retries or the error isn't retryable, give up
            if (attempt > retries || !shouldRetry(err)) {
                throw lastError;
            }
            // Wait before the next attempt: delayMs * factor^(attempt - 1)
            const waitTime = delayMs * (factor ** (attempt - 1));
            await new Promise(resolve => setTimeout(resolve, waitTime));
            attempt++;
        }
    }
};

module.exports = {
    promisePool,
    retry
};
