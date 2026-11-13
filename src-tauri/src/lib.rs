pub mod engine;
pub mod model;
pub mod platform;
mod storage;

use engine::Engine;
use model::{Program, Target};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

struct Hotkeys(Mutex<(String, String)>);

#[tauri::command]
fn list_targets() -> Result<Vec<Target>, String> {
    platform::list_targets()
}
#[tauri::command]
fn permissions(prompt: bool) -> platform::Permissions {
    platform::permissions(prompt)
}
#[tauri::command]
fn prepare(engine: tauri::State<'_, Engine>, program: Program) -> Result<(), String> {
    engine.prepare(program)
}
#[tauri::command]
fn start(engine: tauri::State<'_, Engine>) -> Result<(), String> {
    engine.start()
}
#[tauri::command]
fn pause(engine: tauri::State<'_, Engine>) {
    engine.pause();
}
#[tauri::command]
fn resume(engine: tauri::State<'_, Engine>) {
    engine.resume();
}
#[tauri::command]
fn stop(engine: tauri::State<'_, Engine>) {
    engine.stop();
}

fn register(app: &tauri::AppHandle, first: Shortcut, second: Shortcut) -> Result<(), String> {
    app.global_shortcut()
        .on_shortcut(first, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                if let Err(error) = app.state::<Engine>().toggle() {
                    let _ = app.emit("player-error", error);
                }
            }
        })
        .map_err(|e| e.to_string())?;
    if let Err(error) = app.global_shortcut().on_shortcut(second, |app, _, event| {
        if event.state == ShortcutState::Pressed {
            app.state::<Engine>().stop();
        }
    }) {
        let _ = app.global_shortcut().unregister(first);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
fn configure_shortcuts(
    app: tauri::AppHandle,
    state: tauri::State<'_, Hotkeys>,
    start_shortcut: String,
    stop_shortcut: String,
) -> Result<(), String> {
    let first: Shortcut = start_shortcut.parse().map_err(|_| "演奏快捷键格式无效")?;
    let second: Shortcut = stop_shortcut.parse().map_err(|_| "停止快捷键格式无效")?;
    if first == second {
        return Err("演奏和停止快捷键需要不同的组合".into());
    }
    let mut old = state.0.lock().unwrap();
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    if let Err(error) = register(&app, first, second) {
        if let (Ok(a), Ok(b)) = (old.0.parse(), old.1.parse()) {
            if let Err(restore) = register(&app, a, b) {
                return Err(format!(
                    "快捷键被占用：{error}；恢复原快捷键失败：{restore}"
                ));
            }
        }
        return Err(format!("快捷键被占用，已保留原设置：{error}"));
    }
    *old = (start_shortcut, stop_shortcut);
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Hotkeys(Mutex::new((String::new(), String::new()))))
        .manage(storage::Storage::default())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(Engine::new(move |snapshot| {
                let _ = handle.emit("playback", snapshot);
            }));
            use tauri::{
                menu::{Menu, MenuItem},
                tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
            };
            let show = MenuItem::with_id(app, "show", "显示燕云琴笺", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "停止演奏", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &stop, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("燕云琴笺")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "stop" => app.state::<Engine>().stop(),
                    "quit" => {
                        app.state::<Engine>().stop();
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_targets,
            permissions,
            prepare,
            start,
            pause,
            resume,
            stop,
            configure_shortcuts,
            storage::load_workspace,
            storage::save_workspace
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if app.state::<storage::Storage>().close_to_tray() {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    app.state::<Engine>().stop();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("无法启动燕云琴笺");
    app.run(|app, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            app.state::<Engine>().stop();
        }
    });
}
fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
