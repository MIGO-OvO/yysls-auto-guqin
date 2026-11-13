param(
  [Parameter(Mandatory)][string]$Installer,
  [ValidateSet('engine', 'update')][string]$Scenario = 'engine',
  [Parameter(Mandatory)][string]$ExpectedVersion
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
  throw 'This harness runs only in an isolated GitHub Actions Windows runner.'
}
$testDirectory = Join-Path $env:RUNNER_TEMP "guqin-native-$Scenario"
$installedApp = Join-Path $testDirectory 'yysls-auto-guqin.exe'
$receiverProcess = $null
New-Item -ItemType Directory -Path artifacts -Force | Out-Null
try {
  $installation = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$testDirectory") -WindowStyle Hidden -PassThru -Wait
  if ($installation.ExitCode -ne 0) { throw "Installation failed: $($installation.ExitCode)" }
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9338'
  $null = Start-Process -FilePath $installedApp -WindowStyle Hidden -PassThru -RedirectStandardOutput 'artifacts/native-app.stdout.log' -RedirectStandardError 'artifacts/native-app.stderr.log'
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $null = Invoke-RestMethod 'http://127.0.0.1:9338/json/version' -TimeoutSec 1
      $ready = $true
      break
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw 'Installed WebView did not become ready.' }
  if ($Scenario -eq 'engine') {
    $receiverBinary = Get-ChildItem 'src-tauri/target/debug/deps/windows_input-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $receiverBinary) { throw 'Input receiver test executable is missing.' }
    $env:GUQIN_RECEIVER_TITLE = "Guqin CI receiver $env:GITHUB_RUN_ID"
    $env:GUQIN_RECEIVER_LOG = Join-Path (Get-Location).Path 'artifacts/native-receiver.jsonl'
    $receiverProcess = Start-Process -FilePath $receiverBinary.FullName -ArgumentList @('--ignored', '--exact', 'receiver_child', '--nocapture') -WindowStyle Hidden -PassThru -RedirectStandardOutput 'artifacts/native-receiver.stdout.log' -RedirectStandardError 'artifacts/native-receiver.stderr.log'
    node scripts/native-smoke.mjs http://127.0.0.1:9338 $env:GUQIN_RECEIVER_TITLE $env:GUQIN_RECEIVER_LOG
  } else {
    node scripts/native-update-smoke.mjs http://127.0.0.1:9338 $ExpectedVersion
  }
  if ($LASTEXITCODE -ne 0) { throw "Native $Scenario checks failed." }
  $installedVersion = (Get-Item -LiteralPath $installedApp).VersionInfo.ProductVersion
  if ($installedVersion -ne $ExpectedVersion) { throw "Installed $installedVersion, expected $ExpectedVersion." }
  [ordered]@{ scenario=$Scenario; version=$installedVersion; installationExit=0 } | ConvertTo-Json | Set-Content -Encoding utf8 "artifacts/native-$Scenario-install.json"
} finally {
  Get-Process yysls-auto-guqin -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $installedApp } | Select-Object Id,MainWindowTitle,Responding,Path | ConvertTo-Json | Set-Content -Encoding utf8 "artifacts/native-$Scenario-processes.json"
  if ($receiverProcess -and -not $receiverProcess.HasExited) {
    Stop-Process -Id $receiverProcess.Id -ErrorAction SilentlyContinue
  }
  Get-Process yysls-auto-guqin -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $installedApp } | ForEach-Object {
    Stop-Process -Id $_.Id -ErrorAction SilentlyContinue
  }
}
