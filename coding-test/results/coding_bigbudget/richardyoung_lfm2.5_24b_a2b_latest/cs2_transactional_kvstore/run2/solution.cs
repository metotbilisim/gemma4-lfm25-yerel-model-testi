using System;
using System.Collections.Generic;

namespace Bench
{
    public class KvStore
    {
        // Current state of the store (includes uncommitted changes)
        private readonly Dictionary<string, string> store = new();
        // Counts of keys for each value (reflects current state)
        private readonly Dictionary<string, int> valueCount = new();
        // Stack of open transactions
        private readonly Stack<Transaction> txnStack = new();

        public int TransactionDepth => txnStack.Count;

        /// <summary>
        /// Opens a new nested transaction.
        /// </summary>
        public void Begin()
        {
            txnStack.Push(new Transaction());
        }

        /// <summary>
        /// Sets the value for the given key within the current (innermost) transaction.
        /// </summary>
        public void Set(string key, string value)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));
            if (value == null) throw new ArgumentNullException(nameof(value));

            // Determine effective old value (including outer transactions and prior changes in this one)
            string? oldValue = null;
            if (store.TryGetValue(key, out var current))
                oldValue = current;

            if (value != null)
            {
                if (oldValue != null)
                    DecrementCount(oldValue);
                store[key] = value;
                IncrementCount(value);
            }
            else // deletion
            {
                if (oldValue != null)
                    DecrementCount(oldValue);
                if (store.ContainsKey(key))
                    store.Remove(key);
            }

            var top = txnStack.Peek();
            top.Changes.Add(new Change
            {
                Key = key,
                OldValue = oldValue,
                NewValue = value
            });
        }

        /// <summary>
        /// Retrieves the current value for the given key, or null if it does not exist.
        /// </summary>
        public string? Get(string key)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));
            store.TryGetValue(key, out var value);
            return value;
        }

        /// <summary>
        /// Deletes the key from the store (no‑op if it does not exist).
        /// </summary>
        public void Delete(string key)
        {
            if (key == null) throw new ArgumentNullException(nameof(key));

            string? oldValue = null;
            if (store.TryGetValue(key, out var current))
                oldValue = current;

            if (oldValue != null)
                DecrementCount(oldValue);
            if (store.ContainsKey(key))
                store.Remove(key);

            var top = txnStack.Peek();
            top.Changes.Add(new Change
            {
                Key = key,
                OldValue = oldValue,
                NewValue = null
            });
        }

        /// <summary>
        /// Returns the number of keys whose current value is exactly <paramref name="value"/>.
        /// </summary>
        public int Count(string value)
        {
            if (value == null) throw new ArgumentNullException(nameof(value));
            return valueCount.GetValueOrDefault(value, 0);
        }

        /// <summary>
        /// Discards all changes made in the innermost open transaction and closes it.
        /// </summary>
        public bool Rollback()
        {
            if (txnStack.Count == 0)
                return false;

            var txn = txnStack.Pop();
            // Process changes in reverse order to correctly undo nested modifications
            for (int i = txn.Changes.Count - 1; i >= 0; --i)
            {
                var ch = txn.Changes[i];
                if (ch.NewValue == null) // deletion
                {
                    // Restore the key with its previous value
                    store[ch.Key] = ch.OldValue;
                    IncrementCount(ch.OldValue);
                }
                else
                {
                    if (ch.OldValue == null)
                    {
                        // Key did not exist before this change; remove it
                        store.Remove(ch.Key);
                        DecrementCount(ch.NewValue);
                    }
                    else
                    {
                        // Replace with the old value
                        store[ch.Key] = ch.OldValue;
                        DecrementCount(ch.NewValue);
                        IncrementCount(ch.OldValue);
                    }
                }
            }
            return true;
        }

        /// <summary>
        /// Permanently applies all changes from open transactions and closes them.
        /// </summary>
        public bool Commit()
        {
            if (txnStack.Count == 0)
                return false;

            // All modifications have already been reflected in the store;
            // simply close all open transactions.
            while (txnStack.Count > 0)
                txnStack.Pop();

            return true;
        }

        // ---------- internal helpers ----------

        private class Transaction
        {
            public List<Change> Changes { get; } = new List<Change>();
        }

        private struct Change
        {
            public string Key;
            public string? OldValue;
            public string? NewValue; // null denotes deletion
        }

        private void IncrementCount(string value)
        {
            if (!valueCount.ContainsKey(value))
                valueCount[value] = 0;
            valueCount[value]++;
        }

        private void DecrementCount(string value)
        {
            if (!valueCount.TryGetValue(value, out int count))
                return; // should never happen
            if (count == 1)
                valueCount.Remove(value);
            else
                valueCount[value] = count - 1;
        }
    }
}
