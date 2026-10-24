```javascript
/**
 * Runs at most `limit` tasks from `taskFns` concurrently.
 * 
 * @param {Function[]} taskFns - Array of zero-argument functions.
 * @param {number} limit - Maximum number of concurrent tasks.
 * @returns {Promise<any[]>} - Resolves with an array of results in original order.
 */
async function promisePool(taskFns, limit) {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new TypeError('limit must be a positive integer');
  }

  if (taskFns.length === 0) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const results = new Array(taskFns.length);
    let currentIndex = 0;
    let completedCount = 0;
    let failed = false;

    /**
     * Worker function that pulls tasks from the queue.
     */
    async function worker() {
      while (currentIndex < taskFns.length && !failed) {
        // Increment index synchronously to ensure unique task assignment
        // before the first 'await' yields control.
        const i = currentIndex++;
        
        try {
          // Await handles both synchronous throws and returned promises.
          const res = await taskFns[i]();
          
          // If another worker failed while this task was running, stop processing.
          if (failed) return;

          results[i] = res;
          completedCount++;

          if (completedCount === taskFns.length) {
            resolve(results);
          }
        } catch (err) {
          if (!failed) {
            failed = true;
            reject(err);
          }
          return;
        }
      }
    }

    // Start up to 'limit' workers.
    const workerCount = Math.min(limit, taskFns.length);
    for (let i = 0; i < workerCount; i++) {
      worker();
    }
  });
}

/**
 * Retries a function with exponential backoff.
 * 
 * @param {Function} fn - Function to retry, receives current attempt number (1-indexed).
 * @param {Object} [options] - Retry configuration.
 * @param {number} [options.retries=3] - Number of retry attempts allowed.
 * @param {number} [options.delayMs=0] - Initial delay in milliseconds.
 * @param {number} [options.factor=2] - Exponential backoff factor.
 * @param {Function} [options.shouldRetry=(err)=>true] - Predicate to determine if error warrants retry.
 * @returns {Promise<any>} - Resolves with the function result.
 */
async function retry(fn, options = {}) {
  const {
    retries = 3,
    delayMs = 0,
    factor = 2,
    shouldRetry = (err) => true
  } = options;

  let lastError;

  // Total possible calls is retries + 1 (the initial call).
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      const canRetry = attempt <= retries && shouldRetry(err);
      if (!canRetry) {
        throw lastError;
      }

      // Calculate delay: delayMs * factor^(attempt - 1)
      const waitTime = delayMs * Math.pow(factor, attempt - 1);
      if (waitTime > 0) {
        await new Promise((res) => setTimeout(res, waitTime));
      }
    }
  }
}

module.exports = { promisePool, retry };
```