# Googlant by antquu (github.com/antquu)
# SPDX-License-Identifier: GPL-3.0-or-later
param([switch]$Tunnel)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "==> Installation de pm2"
  npm install -g pm2
}

Write-Host "==> Build du site"
npm run build
if (-not $?) { throw "build en échec" }

Write-Host "==> Démarrage (site + crawler)"
pm2 delete googlant-web googlant-crawler 2>$null
pm2 start ecosystem.config.cjs
pm2 save

$pm2 = (Get-Command pm2).Source
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$pm2`" resurrect"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
Register-ScheduledTask -TaskName "Googlant (pm2)" -Action $action -Trigger $trigger -Description "Relance le site et le crawler Googlant" -Force | Out-Null
Write-Host "==> Relance automatique configurée (tâche planifiée « Googlant (pm2) »)"

if ($Tunnel) {
  if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "==> Installation de cloudflared"
    winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  }
  pm2 delete googlant-tunnel 2>$null
  pm2 start (Get-Command cloudflared).Source --name googlant-tunnel -- tunnel --no-autoupdate --url http://localhost:3000
  pm2 save
  Start-Sleep -Seconds 8
  $url = (pm2 logs googlant-tunnel --nostream --lines 60 2>&1 | Select-String -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -Last 1)
  Write-Host "==> Adresse publique : $url"
}

Write-Host ""
Write-Host "Googlant tourne : http://localhost:3000"
Write-Host "  journaux : pm2 logs googlant-crawler   ·   état : pm2 status   ·   index : npm run db:stats"
