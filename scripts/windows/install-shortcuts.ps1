# Fork: add MerveilleClip shortcuts to the Desktop and the Start menu, so it
# opens from Windows search like an installed app. Safe to run again.
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$launcher = Join-Path $PSScriptRoot 'launch-merveilleclip.vbs'
# Windows caches shortcut icons by file path, so a new logo at the same path
# keeps showing the old one. Point the shortcuts at a copy named after the
# icon's hash: a changed logo gets a new path and Windows draws it fresh.
$source = Join-Path $repo 'build\icon.ico'
$hash = (Get-FileHash $source -Algorithm SHA256).Hash.Substring(0, 12).ToLower()
$iconDir = Join-Path $env:LOCALAPPDATA 'MerveilleClip'
New-Item -ItemType Directory -Force $iconDir | Out-Null
Get-ChildItem $iconDir -Filter 'icon-*.ico' | Where-Object Name -ne "icon-$hash.ico" | Remove-Item -Force
$icon = Join-Path $iconDir "icon-$hash.ico"
Copy-Item $source $icon -Force
$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'MerveilleClip.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'MerveilleClip.lnk')
)
foreach ($path in $targets) {
  $link = $shell.CreateShortcut($path)
  $link.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $link.Arguments = '"' + $launcher + '"'
  $link.WorkingDirectory = $repo
  $link.IconLocation = "$icon,0"
  $link.Description = 'MerveilleClip: turn long videos into vertical clips'
  $link.Save()
  Write-Output "Created $path"
}
# Ask Explorer to redraw icons now instead of after the next sign-in.
& (Join-Path $env:WINDIR 'System32\ie4uinit.exe') -show
