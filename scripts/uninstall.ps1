<#
.SYNOPSIS
  Removes the plugin from an Obsidian vault (PowerShell port of uninstall.sh).

.EXAMPLE
  .\scripts\uninstall.ps1 C:\Users\me\Documents\MyVault

.NOTES
  If script execution is blocked, run once per session:
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  or invoke it as:
    powershell -ExecutionPolicy Bypass -File .\scripts\uninstall.ps1 <vault>
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$VaultPath
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Manifest = Get-Content -LiteralPath (Join-Path $RepoRoot 'manifest.json') -Raw | ConvertFrom-Json
$PluginId = $Manifest.id
if (-not $PluginId) {
  Write-Host "Error: manifest.json is missing a valid plugin id"
  exit 1
}

if (-not $VaultPath) {
  Write-Host "Usage: .\scripts\uninstall.ps1 <path-to-obsidian-vault>"
  Write-Host ""
  Write-Host "Example: .\scripts\uninstall.ps1 C:\Users\me\Documents\MyVault"
  exit 1
}

if (-not (Test-Path -LiteralPath $VaultPath -PathType Container)) {
  Write-Host "Error: Vault path does not exist: $VaultPath"
  exit 1
}

$ObsidianDir = Join-Path $VaultPath '.obsidian'
$PluginDir = Join-Path (Join-Path $ObsidianDir 'plugins') $PluginId
$CommunityPluginsFile = Join-Path $ObsidianDir 'community-plugins.json'

if (Test-Path -LiteralPath $PluginDir) {
  Write-Host "-> Removing plugin directory $PluginDir..."
  Remove-Item -LiteralPath $PluginDir -Recurse -Force
} else {
  Write-Host "-> Plugin directory not found at $PluginDir; nothing to delete."
}

if (-not (Test-Path -LiteralPath $ObsidianDir -PathType Container)) {
  Write-Host "-> Obsidian config directory not found at $ObsidianDir; skipping community plugin cleanup."
  Write-Host "Done."
  exit 0
}

if (-not (Test-Path -LiteralPath $CommunityPluginsFile -PathType Leaf)) {
  Write-Host "-> community-plugins.json not found at $CommunityPluginsFile; skipping plugin list cleanup."
  Write-Host "Done."
  exit 0
}

Write-Host "-> Removing '$PluginId' from $CommunityPluginsFile..."
try {
  $raw = Get-Content -LiteralPath $CommunityPluginsFile -Raw
  # ConvertFrom-Json unrolls arrays in the pipeline; wrap so an empty or single-entry list stays a list.
  $parsed = @(ConvertFrom-Json -InputObject $raw)
  $filtered = @($parsed | Where-Object { $_ -ne $PluginId })

  if ($filtered.Count -ne $parsed.Count) {
    # -InputObject keeps empty/single-element arrays as JSON arrays; write UTF-8 without BOM.
    $json = (ConvertTo-Json -InputObject $filtered) + "`n"
    [System.IO.File]::WriteAllText($CommunityPluginsFile, $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Done. Plugin files and community plugin entry removed."
  } else {
    Write-Host "Done. Plugin files removed; '$PluginId' was not listed in community-plugins.json."
  }
}
catch {
  Write-Host "Error: Failed to update $CommunityPluginsFile. The plugin directory has been removed, but the community plugin list may still reference '$PluginId'."
  Write-Host $_.Exception.Message
  exit 1
}
