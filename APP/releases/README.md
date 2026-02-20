# CERTIFY Release Builds

Тази папка съдържа всички build-нати версии на приложението.

## Структура

- `CERTIFY-X.X.X-android-debug.apk` - Android debug APK (за тестване)
- `CERTIFY-X.X.X-android-release-unsigned.apk` - Android release APK (неподписан)
- `CERTIFY_X.X.X_x64_bg-BG.msi` - Windows MSI installer
- `CERTIFY_X.X.X_x64-setup.exe` - Windows NSIS installer

## Автоматизация

### Android builds:
```bash
npm run android:build         # Debug APK → releases/
npm run android:build:debug   # Debug APK → releases/
npm run android:build:release # Release APK (unsigned) → releases/
```

### Windows builds:
```bash
npm run tauri:build           # MSI + NSIS → src-tauri/target/release/bundle/
```

След Windows build, копирайте файловете в `releases/` ръчно или автоматично.

## Текуща версия: 2.1.1

### Deployment статус:
- ✅ GitHub Pages: https://venvu.github.io/spi/
- ✅ Windows Desktop: MSI + NSIS инсталатори
- ✅ Android: Debug APK с Supabase credentials

## Забележки

**Android:**
- Debug APK е подписан с debug keystore (годен за тестване)
- Release APK е неподписан (не може да се инсталира директно)
- За Google Play Store трябва production keystore

**Windows:**
- MSI е по-голям но официален Windows installer
- NSIS е по-малък и по-бърз за инсталиране
- И двата са unsigned (Windows ще показва предупреждение)
