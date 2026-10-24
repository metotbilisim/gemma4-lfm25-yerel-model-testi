# Prevents idle sleep while the benchmark chain (PID passed as arg) is running. No settings are changed.
param([int]$ChainPid)
Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$ES_CONTINUOUS = [uint32]2147483648; $ES_SYSTEM_REQUIRED = [uint32]1
[Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null
while (Get-Process -Id $ChainPid -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 30 }
[Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null
