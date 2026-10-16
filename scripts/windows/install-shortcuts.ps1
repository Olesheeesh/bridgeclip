# Fork: add MerveilleClip shortcuts to the Desktop and the Start menu, so it
# opens from Windows search like an installed app. Safe to run again.
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$launcher = Join-Path $PSScriptRoot 'launch-merveilleclip.vbs'
$icon = Join-Path $repo 'build\icon.ico'
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
