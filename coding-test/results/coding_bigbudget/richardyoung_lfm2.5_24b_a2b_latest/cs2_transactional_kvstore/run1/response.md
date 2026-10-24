

```csharp
using System;
using System.Collections.Generic;

namespace Bench
{
    /// <summary>
    /// In‑memory key‑value store with nested transactions.
    /// All reads (Get, Count) reflect the current state including uncommitted changes.
    /// </summary>
    public class KvStore
    {
        private Dictionary<string, string> _base;          // committed state
        private Dictionary<string, string> _effective;     // current effective state (including open transactions)
        private Dictionary<string, int> _valueCount;       // counts of each value in the effective store
        private List<Transaction> _transactions = new List<Transaction>(); // stack of open transactions

        public int TransactionDepth => _transactions.Count;

        public KvStore()
        {
            _base = new Dictionary<string, string>();
            _effective = new Dictionary<string, string>();
            _valueCount = new Dictionary<string, int>();
        }

        #region Public API

        public void Set(string key, string value)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));
            if (value == null) throw new ArgumentNullException(nameof(value));

            // current effective value before the change
            string? oldValue = _effective.TryGetValue(key, out string v) ? v : null;

            // update value counts
            if (oldValue != null)
            {
                var cnt = _valueCount.GetValueOrDefault(oldValue);
                if (cnt == 1) _valueCount.Remove(oldValue);
                else _valueCount[oldValue] = cnt - 1;
            }
            if (value != null)
            {
                _valueCount[value] = _valueCount.GetValueOrDefault(value) + 1;
            }

            if (_transactions.Count == 0)
            {
                // top‑level change – affects the committed store directly
                _base[key] = value;
                _effective[key] = value;
            }
            else
            {
                // record the change for possible rollback
                var txn = _transactions[_transactions.Count - 1];
                txn.Modifications.Add(new Modification(key, oldValue, value));
            }
        }

        public string? Get(string key)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));
            return _effective.TryGetValue(key, out string val) ? val : null;
        }

        public void Delete(string key)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));

            string? oldValue = _effective.TryGetValue(key, out string v) ? v : null;
            if (oldValue == null) return; // no‑op

            // update value counts
            var cnt = _valueCount.GetValueOrDefault(oldValue);
            if (cnt == 1) _valueCount.Remove(oldValue);
            else _valueCount[oldValue] = cnt - 1;

            if (_transactions.Count == 0)
            {
                _base.Remove(key);
                _effective.Remove(key);
            }
            else
            {
                var txn = _transactions[_transactions.Count - 1];
                txn.Modifications.Add(new Modification(key, oldValue, null));
            }
        }

        public int Count(string value)
        {
            if (value == null) throw new ArgumentNullException(nameof(value));
            return _valueCount.GetValueOrDefault(value, 0);
        }

        public void Begin()
        {
            var txn = new Transaction();
            _transactions.Add(txn);
        }

        /// <summary>
        /// Discards all changes made in the innermost open transaction and closes it.
        /// Returns false if no transaction is open.
        /// </summary>
        public bool Rollback()
        {
            if (_transactions.Count == 0)
                return false;

            var txn = _transactions.RemoveAt(_transactions.Count - 1);

            // undo modifications in reverse order
            for (int i = txn.Modifications.Count - 1; i >= 0; i--)
            {
                var mod = txn.Modifications[i];
                string key = mod.Key;
                string? oldVal = mod.OldValue;
                string? newVal = mod.NewValue;

                // adjust value counts
                if (newVal != null)
                {
                    var cnt = _valueCount.GetValueOrDefault(newVal);
                    if (cnt == 1) _valueCount.Remove(newVal);
                    else _valueCount[newVal] = cnt + 1;
                }
                if (oldVal != null)
                {
                    var cnt = _valueCount.GetValueOrDefault(oldVal);
                    if (cnt == 1) _valueCount.Remove(oldVal);
                    else _valueCount[oldVal] = cnt - 1;
                }

                // restore effective value
                if (oldVal != null)
                    _effective[key] = oldVal;
                else
                    _effective.Remove(key);
            }

            return true;
        }

        /// <summary>
        /// Permanently applies the changes of all open transactions and closes them.
        /// Returns false if no transaction is open.
        /// </summary>
        public bool Commit()
        {
            if (_transactions.Count == 0)
                return false;

            // apply all modifications from outermost to innermost
            foreach (var txn in _transactions)
            {
                foreach (var mod in txn.Modifications)
                {
                    string key = mod.Key;
                    string? oldVal = mod.OldValue;
                    string? newVal = mod.NewValue;

                    if (newVal != null)
                    {
                        _base[key] = newVal;
                        _effective[key] = newVal;
                    }
                    else
                    {
                        _base.Remove(key);
                        _effective.Remove(key);
                    }
                }
            }

            // all transactions are now closed
            _transactions.Clear();
            return true;
        }

        #endregion

        #region Nested transaction support

        private class Transaction
        {
            /// <summary>
            /// Recorded changes inside a single transaction.
            /// </summary>
            public List<Modification> Modifications = new List<Modification>();
            /// <summary>
            /// Overwrites are stored here for possible future use (not strictly needed).
            /// </summary>
            public Dictionary<string, string> Overrides = new Dictionary<string, string>();
        }

        private class Modification
        {
            public string Key { get; }
            public string? OldValue { get; }
            public string? NewValue { get; }

            public Modification(string key, string? oldValue, string? newValue)
            {
                Key = key;
                OldValue = oldValue;
                NewValue = newValue;
            }
        }

        #endregion
    }
}
```