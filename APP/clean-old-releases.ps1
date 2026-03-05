# Clean old release files
# Keeps only the latest version, removes all older builds

param(
    [switch]$DryRun,
    [switch]$Force
)

Write-Host "`n🧹 Почистване на стари версии...`n" -ForegroundColor Cyan

# Get current version from package.json
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$currentVersion = $packageJson.version

Write-Host "📌 Текуща версия: v$currentVersion`n" -ForegroundColor Yellow

# Find all release files
$allFiles = @()
$allFiles += Get-ChildItem releases\*.apk -ErrorAction SilentlyContinue
$allFiles += Get-ChildItem releases\*.msi -ErrorAction SilentlyContinue
$allFiles += Get-ChildItem releases\*.exe -ErrorAction SilentlyContinue

# Filter out current version files
$oldFiles = $allFiles | Where-Object { $_.Name -notmatch "v$currentVersion-" }

if ($oldFiles.Count -eq 0) {
    Write-Host "✨ Няма стари файлове за изтриване!`n" -ForegroundColor Green
    exit 0
}

# Show files to be deleted
Write-Host "🗑️  Файлове за изтриване:" -ForegroundColor Yellow
$totalSize = 0
foreach ($file in $oldFiles) {
    $size = [math]::Round($file.Length / 1MB, 2)
    $totalSize += $file.Length
    Write-Host "   • $($file.Name) ($size MB)" -ForegroundColor White
}

$totalSizeMB = [math]::Round($totalSize / 1MB, 2)
Write-Host "`n💾 Общ размер: $totalSizeMB MB`n" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "ℹ️  DRY RUN режим - файловете НЕ са изтрити`n" -ForegroundColor Yellow
    exit 0
}

# Confirm deletion
if (-not $Force) {
    $response = Read-Host "Искате ли да изтриете тези файлове? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "`n❌ Отказано от потребителя`n" -ForegroundColor Red
        exit 0
    }
}

# Delete files
Write-Host ""
$deletedCount = 0
$deletedSize = 0

foreach ($file in $oldFiles) {
    try {
        $fileSize = $file.Length
        Remove-Item $file.FullName -Force
        Write-Host "  ✓ Изтрит: $($file.Name)" -ForegroundColor Green
        $deletedCount++
        $deletedSize += $fileSize
    } catch {
        Write-Host "  ✗ Грешка: $($file.Name) - $($_.Exception.Message)" -ForegroundColor Red
    }
}

$deletedSizeMB = [math]::Round($deletedSize / 1MB, 2)
Write-Host "`n✅ Изтрити $deletedCount файла, освободени $deletedSizeMB MB`n" -ForegroundColor Cyan

# Show remaining files
Write-Host "📦 Оставащи файлове в releases:" -ForegroundColor Green
Get-ChildItem releases\*.apk,releases\*.msi,releases\*.exe -ErrorAction SilentlyContinue | 
    Sort-Object LastWriteTime -Descending | 
    Format-Table Name, @{Name="Size MB";Expression={[math]::Round($_.Length/1MB, 2)}}, LastWriteTime -AutoSize

Write-Host ""
