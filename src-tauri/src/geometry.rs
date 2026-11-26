//! Pure, zero-dependency DPI coordinate & taskbar docking geometry core.
//! Shared directly by `hit_passthrough.rs` and `win_dock.rs`, and directly testable
//! via native `rustc --test` on Linux WSL2 as well as Windows `cargo xwin test`.

#[derive(Debug, Clone, PartialEq)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl HitRect {
    #[inline]
    pub fn contains(&self, lx: f64, ly: f64) -> bool {
        lx >= self.x && lx <= self.x + self.w && ly >= self.y && ly <= self.y + self.h
    }
}

#[derive(Debug, Clone, Default)]
pub struct HitMaskState {
    pub rects: Vec<HitRect>,
    pub force_capture: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DockGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Pure DPI-aware hit-mask evaluator tested across 1.0x / 1.25x / 1.5x / 2.0x Windows DPI scaling.
/// Returns `true` when the window MUST capture cursor events (passthrough = false),
/// and `false` when the cursor is over pure transparent sky (passthrough = true).
pub fn should_capture_cursor(
    cursor_phys: (i32, i32),
    window_phys_origin: (i32, i32),
    scale_factor: f64,
    state: &HitMaskState,
) -> bool {
    if state.force_capture {
        return true;
    }
    if state.rects.is_empty() {
        return false;
    }
    let safe_scale = if scale_factor.is_finite() && scale_factor > 0.1 {
        scale_factor
    } else {
        1.0
    };
    let lx = (cursor_phys.0 - window_phys_origin.0) as f64 / safe_scale;
    let ly = (cursor_phys.1 - window_phys_origin.1) as f64 / safe_scale;
    state.rects.iter().any(|r| r.contains(lx, ly))
}

/// Pure watchdog decision for auto-releasing `force_capture` if JS fails to send `set_drag_capture(false)`.
/// Releases when the physical left mouse button has been up for > 300ms OR total drag duration exceeds 10s.
pub fn should_release_drag(lbutton_down: bool, released_ms: u64, held_ms: u64) -> bool {
    if held_ms > 10_000 {
        return true;
    }
    if !lbutton_down && released_ms > 300 {
        return true;
    }
    false
}

/// Computes physical overlay window bounds docked strictly above the Windows taskbar
/// (using monitor `work_area` which automatically excludes the taskbar).
/// Caps width at `max_logical_width * scale` on ultrawide monitors while centering cleanly.
pub fn compute_dock_geometry(
    work_pos: (i32, i32),
    work_size: (u32, u32),
    scale_factor: f64,
    max_logical_width: u32,
) -> DockGeometry {
    let safe_scale = if scale_factor.is_finite() && scale_factor > 0.1 {
        scale_factor
    } else {
        1.0
    };
    let max_phys_w = ((max_logical_width as f64) * safe_scale).round() as u32;
    let width = work_size.0.min(max_phys_w).max(640);
    let height = work_size.1.max(360);
    let x = work_pos.0 + ((work_size.0.saturating_sub(width)) / 2) as i32;
    let y = work_pos.1 + (work_size.1.saturating_sub(height)) as i32;

    DockGeometry {
        x,
        y,
        width,
        height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_state() -> HitMaskState {
        HitMaskState {
            rects: vec![
                // Bottom 220px dungeon + HUD bar on a 1920x1036 logical work area
                HitRect {
                    x: 0.0,
                    y: 816.0,
                    w: 1920.0,
                    h: 220.0,
                },
                // Open gothic Portrait Drawer floating on the left
                HitRect {
                    x: 24.0,
                    y: 360.0,
                    w: 610.0,
                    h: 448.0,
                },
            ],
            force_capture: false,
        }
    }

    #[test]
    fn evaluates_hit_regions_accurately_across_windows_dpi_scales() {
        let state = sample_state();
        for scale in [1.0_f64, 1.25, 1.5, 2.0] {
            let win_origin = ((100.0 * scale) as i32, (40.0 * scale) as i32);

            // 1. Cursor in transparent sky (logical 1200, 120) -> MUST passthrough (false)
            let sky_phys = (
                win_origin.0 + (1200.0 * scale) as i32,
                win_origin.1 + (120.0 * scale) as i32,
            );
            assert!(
                !should_capture_cursor(sky_phys, win_origin, scale, &state),
                "sky should passthrough at scale={scale}"
            );

            // 2. Cursor inside bottom dungeon strip (logical 960, 950) -> MUST capture (true)
            let dungeon_phys = (
                win_origin.0 + (960.0 * scale) as i32,
                win_origin.1 + (950.0 * scale) as i32,
            );
            assert!(
                should_capture_cursor(dungeon_phys, win_origin, scale, &state),
                "dungeon strip should capture at scale={scale}"
            );

            // 3. Cursor inside floating gothic portrait drawer (logical 300, 500) -> MUST capture (true)
            let drawer_phys = (
                win_origin.0 + (300.0 * scale) as i32,
                win_origin.1 + (500.0 * scale) as i32,
            );
            assert!(
                should_capture_cursor(drawer_phys, win_origin, scale, &state),
                "portrait drawer should capture at scale={scale}"
            );
        }
    }

    #[test]
    fn drag_capture_lock_overrides_sky_passthrough() {
        let mut state = sample_state();
        state.force_capture = true;
        // Even far up in the transparent sky, dragging a dangling monster girl keeps capture active!
        assert!(should_capture_cursor((1200, 100), (0, 0), 1.5, &state));
        assert!(should_capture_cursor((10, 10), (0, 0), 2.0, &state));
    }

    #[test]
    fn mini_crystal_orb_only_captures_bottom_right_orb() {
        let state = HitMaskState {
            rects: vec![HitRect {
                x: 1830.0,
                y: 946.0,
                w: 72.0,
                h: 72.0,
            }],
            force_capture: false,
        };
        assert!(!should_capture_cursor((960, 950), (0, 0), 1.0, &state));
        assert!(should_capture_cursor((1860, 980), (0, 0), 1.0, &state));
        // Verify 150% & 200% DPI scaling on the same orb rect
        assert!(should_capture_cursor((2790, 1470), (0, 0), 1.5, &state));
        assert!(should_capture_cursor((3720, 1960), (0, 0), 2.0, &state));
    }

    #[test]
    fn docks_flush_on_1080p_and_4k_scaled_work_areas() {
        // 1920x1080 with 40px bottom taskbar -> work_area = 1920x1040 @ 1.0x
        let g1 = compute_dock_geometry((0, 0), (1920, 1040), 1.0, 2560);
        assert_eq!(g1.x, 0);
        assert_eq!(g1.y, 0);
        assert_eq!(g1.width, 1920);
        assert_eq!(g1.height, 1040);

        // Ultrawide 3440x1440 with 48px taskbar @ 1.0x -> centered 2560px wide
        let g2 = compute_dock_geometry((0, 0), (3440, 1392), 1.0, 2560);
        assert_eq!(g2.width, 2560);
        assert_eq!(g2.x, (3440 - 2560) / 2);
        assert_eq!(g2.height, 1392);

        // 4K 3840x2160 @ 1.5x DPI with 60px taskbar -> work_area = 3840x2100
        let g3 = compute_dock_geometry((0, 0), (3840, 2100), 1.5, 2560);
        assert_eq!(g3.width, 3840);
        assert_eq!(g3.height, 2100);
        assert_eq!(g3.x, 0);
    }

    #[test]
    fn drag_watchdog_releases_on_physical_lbutton_up_or_ttl() {
        // Actively held within 10s -> keep capture
        assert!(!should_release_drag(true, 0, 500));
        assert!(!should_release_drag(true, 0, 10_000));
        // Brief mouse-up glitch <= 300ms -> keep capture
        assert!(!should_release_drag(false, 250, 2_000));
        assert!(!should_release_drag(false, 300, 2_000));
        // Physical LBUTTON released > 300ms -> auto-release!
        assert!(should_release_drag(false, 301, 2_000));
        // Held longer than 10s TTL even if button state stuck -> auto-release!
        assert!(should_release_drag(true, 0, 10_001));
    }
}
