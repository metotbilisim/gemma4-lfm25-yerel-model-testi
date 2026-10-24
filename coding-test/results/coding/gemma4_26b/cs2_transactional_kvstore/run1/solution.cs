using System;
using System.Collections.Generic;

namespace Bench
{
    public class KvStore
    {
        private readonly Dictionary<string, string> _store = new();
        private readonly Dictionary<string, int> _valueCounts = new();
        private readonly Stack<Transaction> _transactionStack = new();

        private readonly struct Change
        {
            public readonly string Key;
            public readonly string? OldValue;
            public readonly string? NewValue;

            public Change(string key, string? oldValue, string? newValue)
            {
                Key = key;
                OldValue = oldValue;
                NewValue = newValue;
            }
        }

        private class Transaction
        {
            public readonly List<Change> Log = new();
        }

        public int TransactionDepth => _transactionStack.Count;

        public void Set(string key, string value)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));
            if (value == null) throw new ArgumentNullException(nameof(value));

            string? oldValue = _store.TryGetValue(key, out var existingValue) ? existingValue : null;

            if (_transactionStack.Count > 0)
            {
                _transactionStack.Peek().Log.Add(new Change(key, oldValue, value));
            }

            _store[key] = value;
            UpdateCounts(oldValue, value);
        }

        public string? Get(string key)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));
            return _store.TryGetValue(key, out var value) ? value : null;
        }

        public void Delete(string key)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));

            string? oldValue = _store.TryGetValue(key, out var existingValue) ? existingValue : null;

            if (oldValue != null)
            {
                if (_transactionStack.Count > 0)
                {
                    _transactionStack.Peek().Log.Add(new Change(key, oldValue, null));
                }

                _store.Remove(key);
                UpdateCounts(oldValue, null);
            }
        }

        public int Count(string value)
        {
            if (value == null) throw new ArgumentNullException(nameof(value));
            return _valueCounts.GetValueOrDefault(value, 0);
        }

        public void Begin()
        {
            _transactionStack.Push(new Transaction());
        }

        public bool Rollback()
        {
            if (_transactionStack.Count == 0)
            {
                return false;
            }

            var transaction = _transactionStack.Pop();

            // Revert changes in reverse order of their occurrence in this transaction
            for (int i = transaction.Log.Count - 1; i >= 0; i--)
            {
                var change = transaction.Log[i];

                // Restore the store state
                if (change.OldValue == null)
                {
                    _store.Remove(change.Key);
                }
                else
                {
                    _store[change.Key] = change.OldValue;
                }

                // Revert the value counts: the 'NewValue' is removed, the 'OldValue' is restored
                UpdateCounts(change.NewValue, change.OldValue);
            }

            return true;
        }

        public bool Commit()
        {
            if (_transactionStack.Count == 0)
            {
                return false;
            }

            // Since _store and _valueCounts are updated in real-time, 
            // committing all transactions simply means clearing the rollback logs.
            _transactionStack.Clear();
            return true;
        }

        private void UpdateCounts(string? oldValue, string? newValue)
        {
            if (oldValue != null)
            {
                if (_valueCounts.TryGetValue(oldValue, out int count))
                {
                    if (count <= 1)
                    {
                        _valueCounts.Remove(oldValue);
                    }
                    else
                    {
                        _valueCounts[oldValue] = count - 1;
                    }
                }
            }

            if (newValue != null)
            {
                _valueCounts[newValue] = _valueCounts.GetValueOrDefault(newValue, 0) + 1;
            }
        }
    }
}
