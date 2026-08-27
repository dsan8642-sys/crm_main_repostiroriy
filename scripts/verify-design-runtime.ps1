[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$generator = Join-Path $repoRoot "scripts\generate-design-bundle.mjs"
& node $generator --check
if ($LASTEXITCODE -ne 0) {
    throw "Generated design bundles are stale. Run node scripts\generate-design-bundle.mjs from the repository root."
}

$pairs = @(
    @("design\styles.css", "frontend\src\design\styles.css"),
    @("design\tokens\colors.css", "frontend\src\design\tokens\colors.css"),
    @("design\tokens\fonts.css", "frontend\src\design\tokens\fonts.css"),
    @("design\tokens\typography.css", "frontend\src\design\tokens\typography.css"),
    @("design\tokens\schedule-palette.json", "frontend\src\design\tokens\schedule-palette.json"),
    @("design\tokens\schedule-palette.json", "swimcrm\common\schedule_palette.json"),
    @("design\ui_kits\shared\kit.css", "frontend\src\design\ui_kits\shared\kit.css"),
    @("design\assets\fonts\ibm-plex\IBMPlexSans-Variable.woff2", "frontend\src\design\assets\fonts\ibm-plex\IBMPlexSans-Variable.woff2"),
    @("design\assets\fonts\ibm-plex\IBMPlexSans-Regular.woff2", "frontend\src\design\assets\fonts\ibm-plex\IBMPlexSans-Regular.woff2"),
    @("design\assets\fonts\ibm-plex\IBMPlexSans-SemiBold.woff2", "frontend\src\design\assets\fonts\ibm-plex\IBMPlexSans-SemiBold.woff2"),
    @("design\assets\fonts\ibm-plex\IBMPlexMono-Regular.woff2", "frontend\src\design\assets\fonts\ibm-plex\IBMPlexMono-Regular.woff2"),
    @("design\assets\fonts\ibm-plex\OFL-1.1.txt", "frontend\src\design\assets\fonts\ibm-plex\OFL-1.1.txt"),
    @("design\assets\fonts\ibm-plex\PROVENANCE.md", "frontend\src\design\assets\fonts\ibm-plex\PROVENANCE.md")
)

$failed = $false
foreach ($pair in $pairs) {
    $canonical = Join-Path $repoRoot $pair[0]
    $runtime = Join-Path $repoRoot $pair[1]
    if (-not (Test-Path -LiteralPath $canonical -PathType Leaf)) {
        Write-Error "Missing canonical design asset: $canonical"
        $failed = $true
        continue
    }
    if (-not (Test-Path -LiteralPath $runtime -PathType Leaf)) {
        Write-Error "Missing runtime design asset: $runtime"
        $failed = $true
        continue
    }
    $canonicalHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $canonical).Hash
    $runtimeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $runtime).Hash
    $equal = $canonicalHash -eq $runtimeHash
    Write-Host ("DESIGN_PROVENANCE={0}|canonical={1}|runtime={2}|equal={3}" -f $pair[0], $canonicalHash, $runtimeHash, $equal)
    if (-not $equal) {
        $failed = $true
    }
}

if ($failed) {
    throw "Copied design assets differ. Run scripts\sync-design-frontend.ps1 from the repository root."
}

Write-Host "DESIGN_RUNTIME_EQUALITY=PASS"
