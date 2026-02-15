use tauri::Manager;
use std::fs;
use std::path::PathBuf;

const APP_VERSION: &str = "2.0.0";

fn get_version_file_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(".app_version"))
}

fn check_and_clear_cache_if_needed(app: &tauri::AppHandle) {
    if let Some(version_file) = get_version_file_path(app) {
        let stored_version = fs::read_to_string(&version_file).unwrap_or_default();
        let stored_version = stored_version.trim();
        
        // Clear cache if version changed OR if no version file exists (fresh install after uninstall)
        if stored_version.is_empty() || stored_version != APP_VERSION {
            let version_label = if stored_version.is_empty() {
                "none (fresh install or old cache)".to_string()
            } else {
                format!("'{}'", stored_version)
            };
            
            println!("Version changed from {} to '{}', clearing all cache", version_label, APP_VERSION);
            
            // Clear ALL cache directories in AppData
            if let Ok(data_dir) = app.path().app_data_dir() {
                // Clear webview cache (includes localStorage, IndexedDB, etc)
                let webview_dir = data_dir.join("webview");
                if webview_dir.exists() {
                    match fs::remove_dir_all(&webview_dir) {
                        Ok(_) => println!("✓ Cleared webview cache directory"),
                        Err(e) => println!("✗ Failed to clear webview cache: {}", e),
                    }
                }
                
                // Clear any other cache directories
                let cache_dir = data_dir.join("cache");
                if cache_dir.exists() {
                    let _ = fs::remove_dir_all(&cache_dir);
                    println!("✓ Cleared general cache directory");
                }
            }
            
            // Ensure parent directory exists before writing
            if let Some(parent) = version_file.parent() {
                let _ = fs::create_dir_all(parent);
            }
            
            // Store new version
            match fs::write(&version_file, APP_VERSION) {
                Ok(_) => println!("✓ Version file updated to {}", APP_VERSION),
                Err(e) => println!("✗ Failed to write version file: {}", e),
            }
        } else {
            println!("App version {} is current, no cache clear needed", APP_VERSION);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Check version and clear cache if needed
            check_and_clear_cache_if_needed(&app.handle());
            
            #[cfg(debug_assertions)]
            {
                #[cfg(not(mobile))]
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
