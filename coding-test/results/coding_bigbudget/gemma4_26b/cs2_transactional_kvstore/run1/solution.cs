using System;
using System.Collections.Generic;

namespace Bench
{
    public class KvStore
    {
        private readonly Dictionary<string, string> _mainStore = new();
        private readonly Dictionary<string, int> _valueCounts = new();
        private readonly Stack<List<(string key, string? oldValue)>> _transactionStack = new();

        /// <summary>
        /// Gets the number of currently open transactions.
        /// </summary>
        public int TransactionDepth => _transactionStack.Count;

        /// <summary>
        /// Sets the value for the specified key.
        /// </summary>
        public void Set(string key, string value)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));
            if (value == null) throw new ArgumentNullException(nameof(value));

            _mainStore.TryGetValue(key, out string? oldValue);

            // If the value is already the same, do nothing to maintain O(1) and simplify rollback.
            if (oldValue == value) return;

            // Update the value count for the old value.
            if (oldValue != null)
            {
                _valueCounts[oldValue]--;
            }

            // Update the main store and the count for the new value.
            _mainStore[key] = value;
            _valueCounts[value] = _valueCounts.GetValueOrDefault(value, 0) + 1;

            // If a transaction is active, record the change for potential rollback.
            if (_transactionStack.Count > 0)
            {
                _transactionStack.Peek().Add((key, oldValue));
            }
        }

        /// <summary>
        /// Gets the value associated with the specified key.
        /// </summary>
        public string? Get(string key)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));
            return _mainStore.TryGetValue(key, out string? value) ? value : null;
        }

        /// <summary>
        /// Removes the key from the store.
        /// </summary>
        public void Delete(string key)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));

            if (_mainStore.TryGetValue(key, out string? oldValue))
            {
                _mainStore.Remove(key);
                _valueCounts[oldValue]--;

                if (_transactionStack.Count > 0)
                {
                    _transactionStack.Peek().Add((key, oldValue));
                }
            }
        }

        /// <summary>
        /// Returns the number of keys whose current value is exactly the specified value.
        /// </summary>
        public int Count(string value)
        {
            if (value == null) throw new ArgumentNullException(nameof(value));
            return _valueCounts.GetValueOrDefault(value, 0);
        }

        /// <summary>
        /// Opens a new transaction level.
        /// </summary>
        public void Begin()
        {
            _transactionStack.Push(new List<(string, string?)>());
        }

        /// <summary>
        /// Discards all changes made in the innermost open transaction.
        /// </summary>
        public bool Rollback()
        {
            if (_transactionStack.Count == 0) return false;

            var changes = _transactionStack.Pop();

            // Undo changes in reverse order to correctly restore state.
            for (int i = changes.Count - 1; i >= 0; i--)
            {
                var (key, oldValue) = changes[i];

                // Decrement the count of the value that was currently in the store.
                if (_mainStore.TryGetValue(key, out string? currentValue))
                {
                    _valueCounts[currentValue]--;
                }

                // Restore the key to its previous state.
                if (oldValue == null)
                {
                    _mainStore.Remove(key);
                }
                else
                {
                    _mainStore[key] = oldValue;
                    _valueCounts[oldValue] = _valueCounts.GetValueOrDefault(oldValue, 0) + 1;
                }
            }

            return true;
        }

        /// <summary>
        /// Permanently applies all changes from all open transactions and closes them.
        /// </summary>
        public bool Commit()
        {
            if (_transactionStack.Count == 0) return false;

            // Since changes are applied to _mainStore immediately during Set/Delete,
            // committing simply means discarding the undo logs (the transaction stack).
            _transactionStack.Clear();
            return true;
        }
    }
}
