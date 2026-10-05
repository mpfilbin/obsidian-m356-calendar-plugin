<#
.SYNOPSIS
  Builds the plugin and installs it into an Obsidian vault (PowerShell port of install.sh).

.EXAMPLE
  .\scripts\install.ps1 C:\Users\me\Documents\MyVault

.NOTES
  If script execution is blocked, run once per session:
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  or invoke it as:
    powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 <vault>
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$VaultPath
)

$ErrorActionPreference = 'Stop'

if (-not $VaultPath) {
  Write-Host "Usage: .\scripts\install.ps1 <path-to-obsidian-vault>"
  Write-Host ""
  Write-Host "Example: .\scripts\install.ps1 C:\Users\me\Documents\MyVault"
  exit 1
}

if (-not (Test-Path -LiteralPath $VaultPath -PathType Container)) {
  Write-Host "Error: Vault path does not exist: $VaultPath"
  exit 1
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Manifest = Get-Content -LiteralPath (Join-Path $RepoRoot 'manifest.json') -Raw | ConvertFrom-Json
$PluginId = $Manifest.id
if (-not $PluginId) {
  Write-Host "Error: manifest.json is missing a valid plugin id"
  exit 1
}

$PluginDir = Join-Path (Join-Path (Join-Path $VaultPath '.obsidian') 'plugins') $PluginId

Push-Location $RepoRoot
try {
  Write-Host "-> Building plugin..."
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }

  Write-Host "-> Installing to $PluginDir..."
  New-Item -ItemType Directory -Path $PluginDir -Force | Out-Null
  Copy-Item -LiteralPath 'main.js', 'manifest.json', 'styles.css' -Destination $PluginDir -Force
}
finally {
  Pop-Location
}

Write-Host "Done. In Obsidian: Settings -> Community Plugins -> reload and enable 'M365 Calendar'."
