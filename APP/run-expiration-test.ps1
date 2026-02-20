#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Автоматизиран тест на Read-Only режим при изтичане на subscription

.DESCRIPTION
    Този скрипт автоматизира процеса на тестване на автоматичното
    превключване към read-only режим при изтичане на абонамента.

.PARAMETER SupabaseUrl
    URL на Supabase проекта (или използва VITE_SUPABASE_URL от .env)

.PARAMETER SupabaseKey
    Service Role Key на Supabase (или използва SUPABASE_SERVICE_ROLE_KEY от .env)

.PARAMETER WaitForExpiration
    Дали да изчака автоматично изтичането (70 секунди)

.PARAMETER SkipCleanup
    Пропуска автоматичното почистване след теста

.EXAMPLE
    .\run-expiration-test.ps1
    Стартира теста със стойности от .env файла

.EXAMPLE
    .\run-expiration-test.ps1 -WaitForExpiration
    Стартира теста и изчаква 70 секунди за изтичане

.EXAMPLE
    .\run-expiration-test.ps1 -SkipCleanup
    Стартира теста без да почиства тестовите данни след приключване
#>

[CmdletBinding()]
param(
    [string]$SupabaseUrl,
    [string]$SupabaseKey,
    [switch]$WaitForExpiration,
    [switch]$SkipCleanup
)

# Цветове за output
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Error-Custom { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Info { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning-Custom { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Step { param($Message) Write-Host "`n═══ $Message ═══" -ForegroundColor Magenta }

# Заглавие
Write-Host @"

╔═══════════════════════════════════════════════════════════════╗
║       ТЕСТ: Автоматично Read-Only при изтичане               ║
╚═══════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Yellow

# Проверка за Supabase CLI
Write-Step "Проверка на окръжението"

if (-not (Get-Command "supabase" -ErrorAction SilentlyContinue)) {
    Write-Error-Custom "Supabase CLI не е инсталиран"
    Write-Info "Инсталирайте от: https://supabase.com/docs/guides/cli"
    exit 1
}
Write-Success "Supabase CLI е инсталиран"

# Зареждане на .env файл
$envFile = Join-Path $PSScriptRoot ".env.local"
if (-not $SupabaseUrl -or -not $SupabaseKey) {
    if (Test-Path $envFile) {
        Write-Info "Зареждане на конфигурация от .env.local"
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^=]+)=(.*)$') {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                
                if ($key -eq "VITE_SUPABASE_URL" -and -not $SupabaseUrl) {
                    $SupabaseUrl = $value
                }
                if ($key -eq "SUPABASE_SERVICE_ROLE_KEY" -and -not $SupabaseKey) {
                    $SupabaseKey = $value
                }
            }
        }
    }
}

if (-not $SupabaseUrl -or -not $SupabaseKey) {
    Write-Error-Custom "Липсва конфигурация за Supabase"
    Write-Info "Задайте параметри или създайте .env.local файл"
    exit 1
}

Write-Success "Конфигурацията е заредена"

# Проверка на SQL файлове
Write-Step "Проверка на тестови файлове"

$sqlTestFile = Join-Path $PSScriptRoot "supabase" "TEST_expiration_readonly.sql"
$jwtTestFile = Join-Path $PSScriptRoot "supabase" "TEST_jwt_short_expiry.sql"

if (-not (Test-Path $sqlTestFile)) {
    Write-Error-Custom "Липсва $sqlTestFile"
    exit 1
}
Write-Success "SQL тестови файлове са налични"

# Стартиране на SQL теста
Write-Step "Стартиране на SQL тест"

try {
    Write-Info "Изпълнение на TEST_expiration_readonly.sql..."
    
    # Използваме supabase db execute или psql
    $output = & supabase db execute -f $sqlTestFile 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Грешка при изпълнение на SQL теста"
        Write-Host $output
        exit 1
    }
    
    Write-Success "SQL тестът е стартиран"
    Write-Host $output
    
} catch {
    Write-Error-Custom "Грешка: $_"
    exit 1
}

# Изчакване на изтичането
if ($WaitForExpiration) {
    Write-Step "Изчакване на изтичането"
    
    Write-Warning-Custom "Изчаква се 70 секунди за изтичане на subscription..."
    
    $seconds = 70
    for ($i = $seconds; $i -gt 0; $i--) {
        $percent = (($seconds - $i) / $seconds) * 100
        Write-Progress -Activity "Изчакване" -Status "Остават $i секунди..." -PercentComplete $percent
        Start-Sleep -Seconds 1
    }
    Write-Progress -Activity "Изчакване" -Completed
    
    Write-Success "Изчакването приключи"
    
    # Проверка на статуса
    Write-Step "Проверка на статуса след изтичане"
    
    $checkQuery = @"
SELECT * FROM app.test_check_expiration_status(
    (SELECT id FROM app.tenants WHERE code='test-expiry')
);
"@
    
    try {
        $result = $checkQuery | & supabase db execute 2>&1
        Write-Host $result
        
        if ($result -match "✓ Pass.*✓ Pass.*✓ Pass") {
            Write-Success "Всички проверки са успешни!"
        } else {
            Write-Warning-Custom "Някои проверки не са успешни. Вижте резултатите по-горе."
        }
        
    } catch {
        Write-Error-Custom "Грешка при проверка: $_"
    }
    
} else {
    Write-Info "Автоматичното изчакване е пропуснато"
    Write-Info "За ръчна проверка след 70 секунди изпълнете:"
    Write-Host @"
    
    SELECT * FROM app.test_check_expiration_status(
        (SELECT id FROM app.tenants WHERE code='test-expiry')
    );
    
"@ -ForegroundColor Yellow
}

# Почистване
if (-not $SkipCleanup) {
    Write-Step "Почистване на тестови данни"
    
    $answer = Read-Host "Искате ли да изтриете тестовите данни? (y/N)"
    
    if ($answer -eq 'y' -or $answer -eq 'Y') {
        try {
            $cleanupQuery = "SELECT app.test_cleanup_expiration();"
            $cleanupQuery | & supabase db execute 2>&1
            Write-Success "Тестовите данни са изтрити"
        } catch {
            Write-Error-Custom "Грешка при почистване: $_"
        }
    } else {
        Write-Info "Почистването е пропуснато"
        Write-Warning-Custom "Не забравяйте да изтриете тестовите данни ръчно:"
        Write-Host "    SELECT app.test_cleanup_expiration();" -ForegroundColor Yellow
    }
}

# Финал
Write-Host @"

╔═══════════════════════════════════════════════════════════════╗
║                     ТЕСТ ЗАВЪРШЕН                            ║
╚═══════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

Write-Info "За повече информация вижте TEST_README.md"

exit 0
