use crate::geometry::{should_capture_cursor, should_release_drag, HitMaskState, HitRect};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{State, WebviewWindow};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HitRectDto {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl From<HitRectDto> for HitRect {
    fn from(d: HitRectDto) -> Self {
        Self {
            x: d.x,
            y: d.y,
            w: d.w,
            h: d.h,
        }
    }
}

pub struct SharedHitMask(pub Arc<Mutex<HitMaskState>>);

#[tauri::command]
pub fn update_hit_regions(rects: Vec<HitRectDto>, state: State<'_, SharedHitMask>) {
    if let Ok(mut guard) = state.0.lock() {
        guard.rects = rects.into_iter().map(HitRect::from).collect();
    }
}

#[tauri::command]
pub fn set_drag_capture(capturing: bool, state: State<'_, SharedHitMask>) {
    if let Ok(mut guard) = state.0.lock() {
        guard.force_capture = capturing;
    }
}

#[cfg(windows)]
fn get_win32_cursor_pos() -> Option<(i32, i32)> {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut pt = POINT { x: 0, y: 0 };
    // SAFETY: `pt` is a valid stack-allocated Win32 POINT struct passed to GetCursorPos.
    let ok = unsafe { GetCursorPos(&mut pt) };
    if ok != 0 {
        Some((pt.x, pt.y))
    } else {
        None
    }
}

#[cfg(not(windows))]
fn get_win32_cursor_pos() -> Option<(i32, i32)> {
    None
}

#[cfg(windows)]
fn is_win32_lbutton_down() -> Option<bool> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON};
    // SAFETY: GetSystemMetrics & GetAsyncKeyState are pure Win32 queries with no pointer parameters.
    let swapped = unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0;
    let primary_vk = if swapped { VK_RBUTTON } else { VK_LBUTTON };
    let state = unsafe { GetAsyncKeyState(primary_vk as i32) };
    Some((state as u16 & 0x8000) != 0)
}

#[cfg(not(windows))]
fn is_win32_lbutton_down() -> Option<bool> {
    None
}

/// Spawns a lightweight 60Hz (16ms) hardware cursor poller (< 0.05% CPU).
/// Solves the WS_EX_TRANSPARENT dead-lock where WebView2 stops receiving mousemove once passthrough is active,
/// and enforces a Win32 LBUTTON + 10s TTL watchdog so `force_capture` can never lock the desktop.
pub fn start_passthrough_poller(window: WebviewWindow, shared: Arc<Mutex<HitMaskState>>) {
    std::thread::Builder::new()
        .name("kp-hit-passthrough-60hz".into())
        .spawn(move || {
            let mut last_ignore: Option<bool> = None;
            let mut drag_started_at: Option<Instant> = None;
            let mut lbutton_released_at: Option<Instant> = None;
            loop {
                std::thread::sleep(Duration::from_millis(16));

                let mut snapshot = match shared.lock() {
                    Ok(g) => g.clone(),
                    Err(_) => continue,
                };

                if snapshot.force_capture {
                    let now = Instant::now();
                    let started = *drag_started_at.get_or_insert(now);
                    let held_ms = now.saturating_duration_since(started).as_millis() as u64;
                    let lbutton_down = is_win32_lbutton_down().unwrap_or(true);
                    let released_ms = if lbutton_down {
                        lbutton_released_at = None;
                        0
                    } else {
                        let rel = *lbutton_released_at.get_or_insert(now);
                        now.saturating_duration_since(rel).as_millis() as u64
                    };

                    if should_release_drag(lbutton_down, released_ms, held_ms) {
                        snapshot.force_capture = false;
                        drag_started_at = None;
                        lbutton_released_at = None;
                        if let Ok(mut g) = shared.lock() {
                            g.force_capture = false;
                        }
                    }
                } else {
                    drag_started_at = None;
                    lbutton_released_at = None;
                }

                let should_capture = if snapshot.force_capture {
                    true
                } else if let Some(cursor_phys) = get_win32_cursor_pos() {
                    let origin = match window.outer_position() {
                        Ok(p) => (p.x, p.y),
                        Err(_) => continue,
                    };
                    let scale = window.scale_factor().unwrap_or(1.0);
                    should_capture_cursor(cursor_phys, origin, scale, &snapshot)
                } else {
                    true
                };

                let ignore_events = !should_capture;
                if last_ignore != Some(ignore_events) {
                    if window.set_ignore_cursor_events(ignore_events).is_ok() {
                        last_ignore = Some(ignore_events);
                    }
                }
            }
        })
        .ok();
}
