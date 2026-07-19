function Test-ProductionEnvironment {
    return $env:DJANGO_ENV -in @("prod", "production")
}

function Test-PathInside {
    param([string]$Child, [string]$Parent)
    if ([string]::IsNullOrWhiteSpace($Child) -or [string]::IsNullOrWhiteSpace($Parent)) {
        return $false
    }
    $childPath = [System.IO.Path]::GetFullPath($Child)
    $parentPath = [System.IO.Path]::GetFullPath($Parent)
    return $childPath.Equals($parentPath, [System.StringComparison]::OrdinalIgnoreCase) -or
        $childPath.StartsWith($parentPath.TrimEnd("\") + "\", [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-ProductionValue {
    param([string]$Name, [string]$Value)
    if ((Test-ProductionEnvironment) -and [string]::IsNullOrWhiteSpace($Value)) {
        throw "$Name is required when DJANGO_ENV=$env:DJANGO_ENV."
    }
}

function Assert-ProductionPassword {
    param([string]$Name, [string]$Value)
    Assert-ProductionValue -Name $Name -Value $Value
    if ((Test-ProductionEnvironment) -and $Value -eq "postgres") {
        throw "$Name must not use the development default in production."
    }
}

function Assert-ProductionPathOutsideRepo {
    param([string]$Name, [string]$Value, [string]$RepoRoot)
    Assert-ProductionValue -Name $Name -Value $Value
    if ((Test-ProductionEnvironment) -and (Test-PathInside -Child $Value -Parent $RepoRoot)) {
        throw "$Name must be outside the source tree in production."
    }
}
