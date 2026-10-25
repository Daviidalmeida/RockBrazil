$ErrorActionPreference = "Continue"
$sourceDir = "charts-import\Lisarb2-extracted"
$targetDir = "charts-import\lisarb2-unpacked"

if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$packages = Get-ChildItem -Recurse -Path $sourceDir -Filter "*.7z"
$total = $packages.Count
Write-Host "Iniciando extração de $total pacotes .7z para $targetDir..."

$successCount = 0
$failCount = 0
$index = 0

foreach ($pkg in $packages) {
    $index++
    $pkgName = [System.IO.Path]::GetFileNameWithoutExtension($pkg.Name)
    $dest = Join-Path $targetDir $pkgName

    if (!(Test-Path $dest)) {
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
    }

    try {
        & tar -xf $pkg.FullName -C $dest 2>$null
        $successCount++
    } catch {
        Write-Warning "Falha ao extrair $($pkg.Name): $_"
        $failCount++
    }

    if ($index % 10 -eq 0 -or $index -eq $total) {
        Write-Host "[$index/$total] Processados... ($successCount com sucesso, $failCount falhas)"
    }
}

Write-Host "Extração concluída: $successCount sucessos, $failCount falhas de $total pacotes."
