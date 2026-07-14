[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DesignDir = Join-Path $RepoRoot "design"
$FrontendDesignDir = Join-Path $RepoRoot "frontend\src\design"

if (-not (Test-Path -LiteralPath $DesignDir)) {
    throw "Design source directory not found: $DesignDir"
}

New-Item -ItemType Directory -Force -Path $FrontendDesignDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $FrontendDesignDir "tokens") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $FrontendDesignDir "ui_kits\shared") | Out-Null

Copy-Item -LiteralPath (Join-Path $DesignDir "styles.css") -Destination (Join-Path $FrontendDesignDir "styles.css") -Force
Copy-Item -LiteralPath (Join-Path $DesignDir "_ds_bundle.js") -Destination (Join-Path $FrontendDesignDir "_ds_bundle.js") -Force
Copy-Item -LiteralPath (Join-Path $DesignDir "tokens\*.css") -Destination (Join-Path $FrontendDesignDir "tokens") -Force
Copy-Item -LiteralPath (Join-Path $DesignDir "ui_kits\shared\kit.css") -Destination (Join-Path $FrontendDesignDir "ui_kits\shared\kit.css") -Force

Write-Host "Synced design runtime assets into frontend\src\design."
