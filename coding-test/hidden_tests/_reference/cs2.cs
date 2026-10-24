namespace Bench;

public class KvStore
{
    private readonly Dictionary<string, string> _data = new();
    private readonly Dictionary<string, int> _counts = new();
    private readonly Stack<Dictionary<string, string?>> _undo = new();

    public int TransactionDepth => _undo.Count;

    public string? Get(string key) { ArgumentNullException.ThrowIfNull(key); return _data.TryGetValue(key, out var v) ? v : null; }

    public int Count(string value) { ArgumentNullException.ThrowIfNull(value); return _counts.TryGetValue(value, out var c) ? c : 0; }

    public void Set(string key, string value)
    {
        ArgumentNullException.ThrowIfNull(key); ArgumentNullException.ThrowIfNull(value);
        Record(key);
        Raw(key, value);
    }

    public void Delete(string key)
    {
        ArgumentNullException.ThrowIfNull(key);
        if (!_data.ContainsKey(key)) return;
        Record(key);
        Raw(key, null);
    }

    public void Begin() => _undo.Push(new Dictionary<string, string?>());

    public bool Rollback()
    {
        if (_undo.Count == 0) return false;
        foreach (var (k, old) in _undo.Pop()) Raw(k, old);
        return true;
    }

    public bool Commit()
    {
        if (_undo.Count == 0) return false;
        _undo.Clear();
        return true;
    }

    private void Record(string key)
    {
        if (_undo.Count == 0) return;
        var top = _undo.Peek();
        if (!top.ContainsKey(key)) top[key] = _data.TryGetValue(key, out var v) ? v : null;
    }

    private void Raw(string key, string? value)
    {
        if (_data.TryGetValue(key, out var old)) { _counts[old]--; _data.Remove(key); }
        if (value != null) { _data[key] = value; _counts[value] = (_counts.TryGetValue(value, out var c) ? c : 0) + 1; }
    }
}
