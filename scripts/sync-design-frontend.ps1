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
New-Item -ItemType Directory -Force -Path (Join-Path $FrontendDesignDir "assets\fonts\ibm-plex") | Out-Null

function Copy-IfChanged {
    param([string]$Source, [string]$Destination)
    $same = (Test-Path -LiteralPath $Destination -PathType Leaf) -and
        ((Get-FileHash -Algorithm SHA256 -LiteralPath $Source).Hash -eq (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash)
    if (-not $same) {
        Copy-Item -LiteralPath $Source -Destination $Destination -Force
    }
}

Copy-IfChanged (Join-Path $DesignDir "styles.css") (Join-Path $FrontendDesignDir "styles.css")
# The application bundle is a tree-shaken runtime artifact generated separately
# by generate-design-bundle.mjs. Do not overwrite it with the larger authoring
# bundle used by the standalone design specimens.
Get-ChildItem -LiteralPath (Join-Path $DesignDir "tokens") -Filter "*.css" -File |
    ForEach-Object {
        Copy-IfChanged $_.FullName (Join-Path (Join-Path $FrontendDesignDir "tokens") $_.Name)
    }
Copy-IfChanged (Join-Path $DesignDir "tokens\schedule-palette.json") (Join-Path $FrontendDesignDir "tokens\schedule-palette.json")
Copy-IfChanged (Join-Path $DesignDir "tokens\schedule-palette.json") (Join-Path $RepoRoot "swimcrm\common\schedule_palette.json")
Copy-IfChanged (Join-Path $DesignDir "tokens\schedule-palette.json") (Join-Path $FrontendDesignDir "tokens\schedule-palette.json")
Copy-IfChanged (Join-Path $DesignDir "tokens\schedule-palette.json") (Join-Path $RepoRoot "swimcrm\common\schedule_palette.json")
Copy-IfChanged (Join-Path $DesignDir "ui_kits\shared\kit.css") (Join-Path $FrontendDesignDir "ui_kits\shared\kit.css")
Get-ChildItem -LiteralPath (Join-Path $DesignDir "assets\fonts\ibm-plex") -File |
    ForEach-Object {
        Copy-IfChanged $_.FullName (Join-Path (Join-Path $FrontendDesignDir "assets\fonts\ibm-plex") $_.Name)
    }

Write-Host "Synced design styles, tokens and fonts into frontend\src\design."
