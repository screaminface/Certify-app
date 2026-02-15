# CERTIFY - Clear Application Cache
# Use this script to manually clear all app data before reinstalling

$appDataPath = "$env:LOCALAPPDATA\bg.spi.certify"

Write-Host "CERTIFY Cache Cleaner" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host ""

if (Test-Path $appDataPath) {
    Write-Host "Found app data at: $appDataPath" -ForegroundColor Yellow
    Write-Host "This will delete ALL app data including:" -ForegroundColor Yellow
    Write-Host "  - localStorage cache" -ForegroundColor Yellow
    Write-Host "  - IndexedDB (participants, groups, settings)" -ForegroundColor Yellow
    Write-Host "  - Webview cache" -ForegroundColor Yellow
    Write-Host ""
    
    $confirmation = Read-Host "Are you sure you want to delete all app data? (yes/no)"
    
    if ($confirmation -eq "yes") {
        try {
            Remove-Item -Path $appDataPath -Recurse -Force
            Write-Host "✓ App data cleared successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "You can now reinstall CERTIFY with a fresh start." -ForegroundColor Green
        } catch {
            Write-Host "✗ Error clearing app data: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "Operation cancelled." -ForegroundColor Yellow
    }
} else {
    Write-Host "✓ No app data found. Cache is already clear." -ForegroundColor Green
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
