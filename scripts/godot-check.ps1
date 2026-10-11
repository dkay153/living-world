param(
  [string]$Godot = $env:GODOT_BIN
)

$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot '..\client-godot'
$toolchain = Get-Content (Join-Path $PSScriptRoot '..\config\godot-toolchain.json') -Raw | ConvertFrom-Json
$expectedVersion = $toolchain.godot.version
$expectedExecutable = $toolchain.godot.windowsConsoleExecutable

if (-not $Godot) {
  $command = Get-Command godot -ErrorAction SilentlyContinue
  if ($command) { $Godot = $command.Source }
}

if (-not $Godot) {
  $packages = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  $candidate = Get-ChildItem -Path $packages -Filter $expectedExecutable -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($candidate) { $Godot = $candidate.FullName }
}

if (-not $Godot -or -not (Test-Path -LiteralPath $Godot)) {
  throw 'Godot was not found. Install the pinned project toolchain or set GODOT_BIN to the Godot console executable.'
}

 $reportedVersion = ((& $Godot --headless --version) | Select-Object -First 1).Trim()
if (-not $reportedVersion.StartsWith($expectedVersion)) {
  throw "Godot $expectedVersion is required by config/godot-toolchain.json; found $reportedVersion."
}

& $Godot --headless --path $project --editor --import --quit
if ($LASTEXITCODE -ne 0) { throw "Godot import failed with exit code $LASTEXITCODE." }

& $Godot --headless --path $project --script res://scripts/smoke.gd
if ($LASTEXITCODE -ne 0) { throw "Godot smoke test failed with exit code $LASTEXITCODE." }
