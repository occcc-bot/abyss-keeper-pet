pub mod geometry;
pub mod hit_passthrough;
pub mod tray;
pub mod win_dock;

use geometry::HitMaskState;
use hit_passthrough::{
    set_drag_capture, start_passthrough_poller, update_hit_regions, SharedHitMask,
};
use std::sync::{Arc, Mutex};
use tauri::Manager;
use win_dock::{dock_to_taskbar, redock_window};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_mask = Arc::new(Mutex::new(HitMaskState::default()));
    let managed_mask = SharedHitMask(Arc::clone(&shared_mask));

    tauri::Builder::default()
        .manage(managed_mask)
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = dock_to_taskbar(&window);
                let _ = window.set_always_on_top(true);
                start_passthrough_poller(window, Arc::clone(&shared_mask));
            }
            let _ = tray::setup_tray(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_hit_regions,
            set_drag_capture,
            redock_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running Abyss Keeper Pet");
}
