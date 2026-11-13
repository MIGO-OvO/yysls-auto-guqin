#![cfg(windows)]
use guqin_lib::{
    engine::Engine,
    model::{mapping, Combo, InputMode, Note, Program, Score, Timing},
    platform,
};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    process::{Child, Command, Stdio},
    sync::OnceLock,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    System::LibraryLoader::GetModuleHandleW,
    UI::{
        Input::KeyboardAndMouse::{GetKeyState, VK_CONTROL, VK_SHIFT},
        WindowsAndMessaging::*,
    },
};
static LOG: OnceLock<std::path::PathBuf> = OnceLock::new();

unsafe extern "system" fn receiver(
    window: HWND,
    message: u32,
    key: WPARAM,
    flags: LPARAM,
) -> LRESULT {
    if [WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP].contains(&message) {
        if let Some(path) = LOG.get() {
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                let _ = writeln!(
                    file,
                    "{}",
                    serde_json::json!({"message":message,"key":key,"flags":flags as u32,"shiftState":GetKeyState(VK_SHIFT as i32),"ctrlState":GetKeyState(VK_CONTROL as i32)})
                );
            }
        }
        return 0;
    }
    if message == WM_CLOSE {
        DestroyWindow(window);
        return 0;
    }
    if message == WM_DESTROY {
        PostQuitMessage(0);
        return 0;
    }
    DefWindowProcW(window, message, key, flags)
}

#[test]
#[ignore = "spawned by the parent integration test"]
fn receiver_child() {
    let Ok(path) = std::env::var("GUQIN_RECEIVER_LOG") else {
        return;
    };
    LOG.set(path.into()).unwrap();
    let title = std::env::var("GUQIN_RECEIVER_TITLE").unwrap();
    let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let class = wide("GuqinInputReceiver");
    let title = wide(&title);
    unsafe {
        let instance = GetModuleHandleW(std::ptr::null());
        let mut definition: WNDCLASSW = std::mem::zeroed();
        definition.lpfnWndProc = Some(receiver);
        definition.hInstance = instance;
        definition.lpszClassName = class.as_ptr();
        assert_ne!(RegisterClassW(&definition), 0);
        let window = CreateWindowExW(
            WS_EX_NOACTIVATE,
            class.as_ptr(),
            title.as_ptr(),
            WS_OVERLAPPEDWINDOW,
            20,
            20,
            260,
            120,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        assert!(!window.is_null());
        ShowWindow(window, SW_SHOWNOACTIVATE);
        let end = Instant::now() + Duration::from_secs(15);
        while Instant::now() < end {
            let mut message = std::mem::zeroed();
            while PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                if message.message == WM_QUIT {
                    return;
                }
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            thread::sleep(Duration::from_millis(1));
        }
        DestroyWindow(window);
    }
}
struct Receiver(Child);
impl Drop for Receiver {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn wait(mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(12);
    while !condition() {
        assert!(Instant::now() < deadline, "receiver timed out");
        thread::sleep(Duration::from_millis(5));
    }
}

#[test]
fn background_receiver_gets_all_36_keys_and_modifiers_without_activating() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../artifacts");
    fs::create_dir_all(&dir).unwrap();
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let title = format!("Guqin receiver {stamp}");
    let log = dir.join(format!("receiver-{stamp}.jsonl"));
    let foreground = unsafe { GetForegroundWindow() };
    let _child = Receiver(
        Command::new(std::env::current_exe().unwrap())
            .args(["--ignored", "--exact", "receiver_child", "--nocapture"])
            .env("GUQIN_RECEIVER_LOG", &log)
            .env("GUQIN_RECEIVER_TITLE", &title)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    let mut target = None;
    wait(|| {
        target = platform::list_targets()
            .unwrap()
            .into_iter()
            .find(|t| t.title == title);
        target.is_some()
    });
    let target = target.unwrap();
    let mut expected = Vec::new();
    let mut combos: Vec<Combo> = (48..=83).map(|n| mapping(n).unwrap()).collect();
    combos.push(Combo::parse("Ctrl+Alt+Shift+F12").unwrap());
    for combo in &combos {
        let mut keys = Vec::new();
        if combo.ctrl {
            keys.push(0x11);
        }
        if combo.alt {
            keys.push(0x12);
        }
        if combo.shift {
            keys.push(0x10);
        }
        keys.push(if combo.base.len() == 1 {
            combo.base.as_bytes()[0] as usize
        } else {
            0x70 + combo.base[1..].parse::<usize>().unwrap() - 1
        });
        expected.extend(keys.iter().map(|&key| (key, false)));
        expected.extend(keys.iter().rev().map(|&key| (key, true)));
    }
    let mut notes = (48..=83)
        .enumerate()
        .map(|(i, midi)| Note {
            id: i.to_string(),
            midi: Some(midi),
            col: i as f64 * 2.0,
            len: 1.0,
            keys: None,
        })
        .collect::<Vec<_>>();
    notes.push(Note {
        id: "combo".into(),
        midi: None,
        col: 72.0,
        len: 1.0,
        keys: Some("Ctrl+Alt+Shift+F12".into()),
    });
    let score = Score {
        id: "receiver".into(),
        title: "36-key fixture".into(),
        cols: 80.0,
        timing: Timing {
            bpm: 300.0,
            grid_factor: 32,
            default_len: 1.0,
        },
        notes,
        source: Some("commands".into()),
        end_col: None,
    };
    let engine = Engine::new(|_| {});
    engine
        .prepare(Program {
            score,
            target: Some(target),
            mode: InputMode::Background,
            warmup_ms: 0,
            start_col: 0.0,
        })
        .unwrap();
    engine.start().unwrap();
    wait(|| ["finished", "error"].contains(&engine.snapshot().status.as_str()));
    assert_eq!(
        engine.snapshot().status,
        "finished",
        "{}",
        engine.snapshot().message
    );
    engine.stop();
    let read = || {
        let text = fs::read_to_string(&log).unwrap_or_default();
        let end = text.rfind('\n').map_or(0, |index| index + 1);
        text[..end]
            .lines()
            .map(|l| serde_json::from_str::<serde_json::Value>(l).unwrap())
            .collect::<Vec<_>>()
    };
    wait(|| read().len() >= expected.len());
    let records = read();
    let actual = records
        .iter()
        .map(|r| {
            (
                r["key"].as_u64().unwrap() as usize,
                [WM_KEYUP as u64, WM_SYSKEYUP as u64].contains(&r["message"].as_u64().unwrap()),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(actual, expected);
    assert_eq!(
        unsafe { GetForegroundWindow() },
        foreground,
        "background input changed focus"
    );
    for record in &records {
        let flags = record["flags"].as_u64().unwrap();
        assert_ne!(flags & 0x00ff0000, 0);
        if [WM_KEYUP as u64, WM_SYSKEYUP as u64].contains(&record["message"].as_u64().unwrap()) {
            assert_eq!(flags & 0xc0000000, 0xc0000000);
        }
    }
    fs::write(dir.join("windows-input.json"), serde_json::to_vec_pretty(&serde_json::json!({"receiverNotes":37,"receivedMessages":records.len(),"focusUnchanged":true,"gameVerified":false,"events":records})).unwrap()).unwrap();
}
