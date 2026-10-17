$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop 'Living World Studio.lnk'))
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\cmd.exe'
$shortcut.Arguments = '/c ""' + (Join-Path $project 'start.bat') + '""'
$shortcut.WorkingDirectory = $project
$shortcut.Description = 'Start or open Living World: local agent, Docker runtime and live AI Studio renderer.'
$shortcut.WindowStyle = 7
$shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',13'
$shortcut.Save()
Write-Output (Join-Path $desktop 'Living World Studio.lnk')
