use crate::win_dock;
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle_orb = MenuItem::with_id(app, "toggle_orb", "展开 / 折叠魔心徽章 | Toggle Badge", true, None::<&str>)?;
    let toggle_mute = MenuItem::with_id(app, "toggle_mute", "静音 / 开启音画 | Toggle Audio", true, None::<&str>)?;
    let redock = MenuItem::with_id(app, "redock", "重新贴合任务栏 | Re-dock Taskbar", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "安全保存并退出 | Save & Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&toggle_orb, &toggle_mute, &redock, &quit])?;
    let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

    TrayIconBuilder::with_id("abyss-keeper-tray")
        .icon(icon)
        .tooltip("深渊饲主：桌底魔王城 | Abyss Keeper Pet")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle_orb" => {
                let _ = app.emit("tray-action", "toggle_orb");
            }
            "toggle_mute" => {
                let _ = app.emit("tray-action", "toggle_mute");
            }
            "redock" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win_dock::dock_to_taskbar(&win);
                }
            }
            "quit" => {
                let _ = app.emit("tray-action", "save_and_quit");
                let handle = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(160));
                    handle.exit(0);
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = tray.app_handle().emit("tray-action", "toggle_orb");
            }
        })
        .build(app)?;

    Ok(())
}
