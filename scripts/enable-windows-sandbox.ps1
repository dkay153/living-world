# Run in an administrator PowerShell window. Never reboots automatically.
param([string]$StatusPath)
$ErrorActionPreference = 'Stop'
$isAdmin = [System.Security.Principal.WindowsPrincipal]::new([System.Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Windows requires an administrator PowerShell window to enable Windows Sandbox.' }
$result = Enable-WindowsOptionalFeature -Online -FeatureName 'Containers-DisposableClientVM' -All -NoRestart
if ($StatusPath) {
  @{ feature = 'Containers-DisposableClientVM'; restartNeeded = [bool]$result.RestartNeeded; checkedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $StatusPath
}
Write-Output "Windows Sandbox feature: $($result.State). Restart required: $($result.RestartNeeded)."
Write-Output 'After any required restart, open the prepared outputs/world-lab/sandbox/review-*/review.wsb file.'
