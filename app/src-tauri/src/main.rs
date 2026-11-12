// EgoCraft's desktop app: its own window around the same built app (dist/)
// as the web build and `npm run serve`. The app's files are built into this
// program and served to the window by Tauri itself, so there is no server,
// no port and no Node runtime, and nothing is reachable from outside the
// computer.
//
// Studies are kept where the app always keeps them, in its own storage
// (IndexedDB), which for this window is the app's own and always at the same
// address. Saved files (.egocraft studies, results, code) go to Downloads.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};

use tauri::webview::DownloadEvent;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// Where a downloaded file goes: the Downloads folder, never over a file already there.
fn download_target(downloads: &Path, suggested: &Path) -> PathBuf {
    let name = suggested
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "download".into());
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (name[..i].to_string(), name[i..].to_string()),
        _ => (name.clone(), String::new()),
    };
    let mut path = downloads.join(&name);
    let mut n = 2;
    while path.exists() {
        path = downloads.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    path
}

fn open_window(app: &tauri::AppHandle) -> Result<(), String> {
    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    let handle = app.clone();
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("EgoCraft")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        // Files dragged onto the window go to the page's own drop zones
        // (the ego, alter and tie files), not to Tauri.
        .disable_drag_drop_handler()
        // Saving a study, results or code is a download of a generated file:
        // save it in Downloads and say where it went.
        .on_download(move |_webview, event| {
            match event {
                DownloadEvent::Requested { destination, .. } => {
                    *destination = download_target(&downloads, destination);
                }
                DownloadEvent::Finished { path, success, .. } => {
                    let message = match (success, path) {
                        (true, Some(p)) => format!("Saved to {}", p.display()),
                        _ => "The file could not be saved.".to_string(),
                    };
                    handle
                        .dialog()
                        .message(message)
                        .title("EgoCraft")
                        .kind(if success { MessageDialogKind::Info } else { MessageDialogKind::Error })
                        .show(|_| {});
                }
                _ => {}
            }
            true
        })
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(message) = open_window(&handle) {
                handle
                    .dialog()
                    .message(format!("EgoCraft could not open its window.\n\n{message}"))
                    .title("EgoCraft")
                    .kind(MessageDialogKind::Error)
                    .blocking_show();
                std::process::exit(1);
            }
            Ok(())
        })
        .run(tauri::generate_context!());
    if let Err(e) = result {
        eprintln!("EgoCraft could not start: {e}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::download_target;
    use std::fs;

    #[test]
    fn a_download_never_replaces_a_file() {
        let dir = std::env::temp_dir().join(format!("egocraft-dl-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let first = download_target(&dir, "study.egocraft".as_ref());
        assert_eq!(first, dir.join("study.egocraft"));
        fs::write(&first, "x").unwrap();
        assert_eq!(download_target(&dir, "study.egocraft".as_ref()), dir.join("study (2).egocraft"));
        assert_eq!(download_target(&dir, "".as_ref()), dir.join("download"));
        assert_eq!(download_target(&dir, ".hidden".as_ref()), dir.join(".hidden"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
