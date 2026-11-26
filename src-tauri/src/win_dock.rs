use crate::geometry::{compute_dock_geometry, DockGeometry};
use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow};

/// Snaps the transparent overlay window flush to the primary monitor's work area right above the taskbar.
pub fn dock_to_taskbar(window: &WebviewWindow) -> Result<DockGeometry, String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "No monitor detected".to_string())?;

    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let geom = compute_dock_geometry(
        (area.position.x, area.position.y),
        (area.size.width, area.size.height),
        scale,
        2560,
    );

    window
        .set_size(PhysicalSize::new(geom.width, geom.height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(geom.x, geom.y))
        .map_err(|e| e.to_string())?;

    Ok(geom)
}

#[tauri::command]
pub fn redock_window(window: WebviewWindow) -> Result<(), String> {
    dock_to_taskbar(&window).map(|_| ())
}
