/**
 * Executes an array of task functions with a concurrency limit.
 * 
 * @param {Array<Function>} taskFns - Array of zero-argument functions.
 * @param {number} limit - Maximum number of concurrent tasks.
 * @returns {Promise<Array<any>>} - Resolves with results in the original order.
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
    let nextTaskIndex = 0;
    let completedCount = 0;
    let hasFailed = false;

    async function worker() {
      while (true) {
        let index;

        // Synchronous block to grab the next index. 
        // Since Node.js is single-threaded, this prevents race conditions 
        // between workers before the first 'await'.
        if (nextTaskIndex < taskFns.length && !hasFailed) {
          index = nextTaskIndex++;
        } else {
          break;
        }

        try {
          // Await handles both returned promises and synchronous values/throws
          const result = await taskFns[index]();

          // If a failure occurred in another worker while this one was awaiting, stop.
          if (hasFailed) return;

          results[index] = result;
          completedCount++;

          if (completedCount === taskFns.length) {
            resolve(results);
          }
        } catch (err) {
          if (!hasFailed) {
            hasFailed = true;
            reject(err);
          }
          return;
        }
      }
    }

    // Start the initial batch of workers up to the limit
    const workersToStart = Math.min(limit, taskFns.length);
    for (let i = 0; i < workersToStart; i++) {
      worker();
    }
  });
}

/**
 * Retries an asynchronous function with exponential backoff.
 * 
 * @param {Function} fn - The function to retry. Receives 'attempt' as an argument.
 * @param {Object} [options] - Retry configuration.
 * @param {number} [options.retries=3] - Number of retry attempts.
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

  // Total attempts = initial call + number of retries
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      // Check if we have retries left and if the error allows for a retry
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
