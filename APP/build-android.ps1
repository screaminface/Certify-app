# Build Android APK and move to releases folder
# Usage: .\build-android.ps1 [debug|release]

param(
    [ValidateSet("debug", "release")]
    [string]$BuildType = "debug"
)

Write-Host "`n🔨 Building Android APK ($BuildType)...`n" -ForegroundColor Cyan

# Step 1: Build web assets
Write-Host "📦 Step 1/3: Building web assets (npm run build)..." -ForegroundColor Yellow
$env:CAPACITOR_PLATFORM = "android"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ npm run build failed!`n" -ForegroundColor Red
    exit 1
}

# Step 2: Copy web assets to Android
Write-Host "`n📋 Step 2/3: Copying assets to Android (npx cap copy android)..." -ForegroundColor Yellow
npx cap copy android
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ cap copy failed!`n" -ForegroundColor Red
    exit 1
}

Write-Host "`n🔧 Step 3/3: Building APK ($BuildType)...`n" -ForegroundColor Yellow

# Navigate to android directory and build
Push-Location android
try {
    if ($BuildType -eq "debug") {
        .\gradlew clean assembleDebug
    } else {
        .\gradlew clean assembleRelease
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Build successful!`n" -ForegroundColor Green
        
        # Show APK info
        $apkFiles = Get-ChildItem ..\releases\CERTIFY-v*-android-$BuildType.apk | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($apkFiles) {
            Write-Host "📦 APK Details:" -ForegroundColor Cyan
            $apkFiles | Format-Table @{
                Label="Name"; Expression={$_.Name}
            }, @{
                Label="Size (MB)"; Expression={[math]::Round($_.Length/1MB, 2)}
            }, @{
                Label="Created"; Expression={$_.LastWriteTime.ToString("dd.MM.yyyy HH:mm:ss")}
            } -AutoSize
            
            Write-Host "📂 Location: " -NoNewline -ForegroundColor Cyan
            Write-Host "$($apkFiles.FullName)`n" -ForegroundColor White
        }
    } else {
        Write-Host "`n❌ Build failed!`n" -ForegroundColor Red
    }
} finally {
    Pop-Location
}
