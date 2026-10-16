# Fork: start MerveilleClip from this checkout, the way the desktop and Start
# menu shortcuts do (see install-shortcuts.ps1). Rebuilds first when any
# source file is newer than the last build, then opens the app without a
# console window. Settings and clips are the same ones `npm run dev` uses.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
# Editors built on Electron (VS Code) export this; it would start Electron as plain Node.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$built = Join-Path $repo 'out\main\index.js'
$log = Join-Path $repo 'out\launch.log'
$stale = -not (Test-Path $built)
if (-not $stale) {
  $builtAt = (Get-Item $built).LastWriteTimeUtc
  $newer = Get-ChildItem -Path (Join-Path $repo 'src'), (Join-Path $repo 'resources') -Recurse -File |
    Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1
  $stale = $null -ne $newer
}
if ($stale) {
  New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
  & npm.cmd run build *> $log
  if ($LASTEXITCODE -ne 0) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("MerveilleClip could not be built. Details: $log", 'MerveilleClip') | Out-Null
    exit 1
  }
}

$electron = Join-Path $repo 'node_modules\electron\dist\electron.exe'
Start-Process -FilePath $electron -ArgumentList '.' -WorkingDirectory $repo
