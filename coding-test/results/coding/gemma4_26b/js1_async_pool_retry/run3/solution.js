/**
 * Runs a collection of tasks with a concurrency limit.
 * 
 * @param {Array<Function>} taskFns - Array of zero-argument functions.
 * @param {number} limit - Maximum number of tasks to run simultaneously.
 * @returns {Promise<Array<any>>} - Resolves with an array of results in original order.
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
    let completedCount = 0;
    let nextTaskIndex = 0;
    let hasFailed = false;

    const runNext = async () => {
      // Stop if an error occurred in another task or no more tasks to pick up
      if (hasFailed || nextTaskIndex >= taskFns.length) {
        return;
      }

      const currentIndex = nextTaskIndex++;
      
      try {
        // Await handles both returned promises and synchronous values/throws
        const result = await taskFns[currentIndex]();

        // If a failure happened while this task was running, ignore its result
        if (hasFailed) return;

        results[currentIndex] = result;
        completedCount++;

        if (completedCount === taskFns.length) {
          resolve(results);
        } else {
          // Immediately start the next task in the queue
          runNext();
        }
      } catch (err) {
        if (!hasFailed) {
          hasFailed = true;
          reject(err);
        }
      }
    };

    // Start the initial batch of tasks up to the limit
    const initialBatchSize = Math.min(limit, taskFns.length);
    for (let i = 0; i < initialBatchSize; i++) {
      runNext();
    }
  });
}

/**
 * Retries an asynchronous function with exponential backoff.
 * 
 * @param {Function} fn - Function to retry, receives (attemptNumber).
 * @param {Object} [options] - Retry configuration.
 * @param {number} [options.retries=3] - Number of retry attempts.
 * @param {number} [options.delayMs=0] - Initial delay in milliseconds.
 * @param {number} [options.factor=2] - Exponential backoff factor.
 * @param {Function} [options.shouldRetry=(err)=>true] - Predicate to determine if error is retryable.
 * @returns {Promise<any>} - Resolves with the function result.
 */
async function retry(fn, options = {}) {
  const {
    retries = 3,
    delayMs = 0,
    factor = 2,
    shouldRetry = (err) => true
  } = options;

  let attempt = 1;

  while (true) {
    try {
      // fn is called with the current attempt number (starting at 1)
      return await fn(attempt);
    } catch (err) {
      // Check if we have exhausted retries or if the error shouldn't trigger a retry
      if (attempt > retries || !shouldRetry(err)) {
        throw err;
      }

      // Calculate delay: delayMs * factor ^ (attempt - 1)
      const waitTime = delayMs * Math.pow(factor, attempt - 1);
      
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      
      attempt++;
    }
  }
}

module.exports = { promisePool, retry };
