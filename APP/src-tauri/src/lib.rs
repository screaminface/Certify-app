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
        
        if stored_version != APP_VERSION {
            println!("Version changed from '{}' to '{}', clearing webview cache", stored_version, APP_VERSION);
            
            // Clear webview cache by removing data directory files
            if let Ok(data_dir) = app.path().app_data_dir() {
                let webview_dir = data_dir.join("webview");
                if webview_dir.exists() {
                    let _ = fs::remove_dir_all(&webview_dir);
                    println!("Cleared webview cache directory");
                }
            }
            
            // Store new version
            let _ = fs::write(&version_file, APP_VERSION);
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
