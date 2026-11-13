use super::{InputSink, Permissions};
use crate::model::{Combo, InputMode, Target};
use std::{
    mem::{size_of, zeroed},
    path::Path,
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, FILETIME, HWND, LPARAM},
    Media::{timeBeginPeriod, timeEndPeriod},
    Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY},
    System::Threading::{
        GetCurrentProcess, GetCurrentProcessId, GetExitCodeProcess, GetProcessTimes, OpenProcess,
        OpenProcessToken, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    },
    UI::{
        Input::KeyboardAndMouse::{
            GetAsyncKeyState, MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD,
            KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC, VK_CONTROL, VK_MENU,
            VK_SHIFT,
        },
        WindowsAndMessaging::{
            EnumWindows, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
            GetWindowThreadProcessId, IsWindow, IsWindowVisible, PostMessageW, WM_KEYDOWN,
            WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
        },
    },
};

fn hwnd(target: &Target) -> Result<HWND, String> {
    usize::from_str_radix(target.id.split(':').next().unwrap_or(""), 16)
        .map(|v| v as HWND)
        .map_err(|_| "目标窗口标识无效".into())
}
fn pid(window: HWND) -> u32 {
    let mut value = 0;
    unsafe {
        GetWindowThreadProcessId(window, &mut value);
    }
    value
}
fn process(pid: u32) -> (String, u64) {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return (format!("PID {pid}"), 0);
        }
        let mut path = [0u16; 32768];
        let mut length = path.len() as u32;
        let name = if QueryFullProcessImageNameW(handle, 0, path.as_mut_ptr(), &mut length) != 0 {
            String::from_utf16_lossy(&path[..length as usize])
        } else {
            format!("PID {pid}")
        };
        let mut created: FILETIME = zeroed();
        let mut exit = zeroed();
        let mut kernel = zeroed();
        let mut user = zeroed();
        let stamp = if GetProcessTimes(handle, &mut created, &mut exit, &mut kernel, &mut user) != 0
        {
            ((created.dwHighDateTime as u64) << 32) | created.dwLowDateTime as u64
        } else {
            0
        };
        CloseHandle(handle);
        (
            Path::new(&name)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or(name),
            stamp,
        )
    }
}

pub fn list_targets() -> Result<Vec<Target>, String> {
    unsafe extern "system" fn callback(window: HWND, data: LPARAM) -> i32 {
        if IsWindowVisible(window) == 0 {
            return 1;
        }
        let length = GetWindowTextLengthW(window);
        let owner = pid(window);
        if length <= 0 || owner == GetCurrentProcessId() {
            return 1;
        }
        let mut text = vec![0u16; length as usize + 1];
        let count = GetWindowTextW(window, text.as_mut_ptr(), text.len() as i32);
        if count <= 0 {
            return 1;
        }
        let (name, stamp) = process(owner);
        if [
            "explorer.exe",
            "ShellExperienceHost.exe",
            "SearchHost.exe",
            "StartMenuExperienceHost.exe",
        ]
        .iter()
        .any(|n| n.eq_ignore_ascii_case(&name))
        {
            return 1;
        }
        let list = &mut *(data as *mut Vec<Target>);
        list.push(Target {
            id: format!("{:x}:{stamp}", window as usize),
            pid: owner,
            title: String::from_utf16_lossy(&text[..count as usize]),
            process_name: name,
        });
        1
    }
    let mut targets: Vec<Target> = vec![];
    if unsafe { EnumWindows(Some(callback), &mut targets as *mut _ as LPARAM) } == 0 {
        return Err(format!("读取窗口失败：{}", std::io::Error::last_os_error()));
    }
    targets.sort_by_key(|t| {
        (
            !t.process_name.to_lowercase().contains("yysls"),
            t.title.clone(),
        )
    });
    Ok(targets)
}

struct WindowsInput {
    target: Target,
    mode: InputMode,
    down: Vec<u16>,
    alt: bool,
    process_handle: usize,
    timer_active: bool,
    first_press: bool,
}

pub fn connect(target: Target, mode: InputMode) -> Result<Box<dyn InputSink>, String> {
    let mut input = WindowsInput {
        target,
        mode,
        down: vec![],
        alt: false,
        process_handle: 0,
        timer_active: false,
        first_press: true,
    };
    let expected = input
        .target
        .id
        .split(':')
        .nth(1)
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    if expected != 0 && process(input.target.pid).1 != expected {
        return Err("目标进程已重新启动，请重新选择窗口".into());
    }
    input.process_handle =
        unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, input.target.pid) } as usize;
    if input.process_handle == 0 {
        return Err("无法确认目标进程身份，请检查游戏与工具的权限".into());
    }
    input.check(false)?;
    unsafe {
        input.timer_active = timeBeginPeriod(1) == 0;
    }
    Ok(Box::new(input))
}

impl WindowsInput {
    fn send(&self, key: u16, up: bool, alt: bool) -> Result<(), String> {
        let scan = unsafe { MapVirtualKeyW(key as u32, MAPVK_VK_TO_VSC) };
        if scan == 0 {
            return Err(format!("按键 {key} 没有扫描码"));
        }
        if self.mode == InputMode::Background {
            let message = match (up, alt) {
                (true, true) => WM_SYSKEYUP,
                (false, true) => WM_SYSKEYDOWN,
                (true, false) => WM_KEYUP,
                _ => WM_KEYDOWN,
            };
            let flags = 1u32
                | (scan << 16)
                | if up { 0xc0000000 } else { 0 }
                | if alt { 1 << 29 } else { 0 };
            if unsafe {
                PostMessageW(
                    hwnd(&self.target)?,
                    message,
                    key as usize,
                    flags as i32 as isize,
                )
            } == 0
            {
                return Err(format!(
                    "后台窗口消息被拒绝：{}",
                    std::io::Error::last_os_error()
                ));
            }
        } else {
            let scan_mode = self.mode == InputMode::ForegroundScan;
            let input = INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: if scan_mode { 0 } else { key },
                        wScan: if scan_mode { scan as u16 } else { 0 },
                        dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }
                            | if scan_mode { KEYEVENTF_SCANCODE } else { 0 },
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
            if unsafe { SendInput(1, &input, size_of::<INPUT>() as i32) } != 1 {
                return Err("Windows 拒绝输入，请让工具与游戏使用相同权限".into());
            }
        }
        Ok(())
    }
}
impl InputSink for WindowsInput {
    fn check(&mut self, foreground_required: bool) -> Result<(), String> {
        let window = hwnd(&self.target)?;
        if unsafe { IsWindow(window) } == 0 || pid(window) != self.target.pid {
            return Err("目标窗口已关闭或身份已变化，演奏已停止".into());
        }
        let mut exit_code = 0;
        if unsafe { GetExitCodeProcess(self.process_handle as _, &mut exit_code) } == 0
            || exit_code != 259
        {
            return Err("目标进程已重新启动，请重新选择窗口".into());
        }
        if self.target.pid == unsafe { GetCurrentProcessId() } {
            return Err("不能向本工具发送演奏按键".into());
        }
        if foreground_required && unsafe { GetForegroundWindow() } != window {
            return Err("前台窗口已切换，演奏已停止并执行松键".into());
        }
        Ok(())
    }
    fn press(&mut self, combo: &Combo) -> Result<(), String> {
        if self.first_press
            && self.mode != InputMode::Background
            && unsafe {
                [VK_CONTROL, VK_SHIFT, VK_MENU]
                    .iter()
                    .any(|&key| GetAsyncKeyState(key as i32) < 0)
            }
        {
            return Err("请松开 Ctrl、Shift、Alt 后再开始演奏".into());
        }
        self.first_press = false;
        let mut keys = vec![];
        if combo.ctrl {
            keys.push(VK_CONTROL);
        }
        if combo.alt {
            keys.push(VK_MENU);
        }
        if combo.shift {
            keys.push(VK_SHIFT);
        }
        let key = if let Some(number) = combo.base.strip_prefix('F') {
            if combo.base.len() > 1 {
                0x70 + number.parse::<u16>().map_err(|_| "F 键无效")? - 1
            } else {
                b'F' as u16
            }
        } else {
            combo.base.as_bytes()[0] as u16
        };
        keys.push(key);
        for key in keys {
            self.down.push(key);
            self.alt |= key == VK_MENU;
            self.send(key, false, self.alt)?;
        }
        Ok(())
    }
    fn release_all(&mut self) -> Result<(), String> {
        let mut failed = Vec::new();
        let mut error = None;
        while let Some(key) = self.down.pop() {
            // Dead/reused HWNDs must never receive stale key-ups. Global SendInput
            // still needs owned key-up events after a foreground switch.
            if self.mode == InputMode::Background
                && (unsafe { IsWindow(hwnd(&self.target)?) } == 0
                    || pid(hwnd(&self.target)?) != self.target.pid)
            {
                continue;
            }
            if let Err(e) = self.send(key, true, self.alt) {
                failed.push(key);
                error = Some(e);
            }
            if key == VK_MENU {
                self.alt = false;
            }
        }
        self.down = failed.into_iter().rev().collect();
        if let Some(error) = error {
            Err(format!("松键未完成：{error}"))
        } else {
            Ok(())
        }
    }
}
impl Drop for WindowsInput {
    fn drop(&mut self) {
        for _ in 0..3 {
            if self.release_all().is_ok() {
                break;
            }
        }
        unsafe {
            if self.timer_active {
                timeEndPeriod(1);
            }
            if self.process_handle != 0 {
                CloseHandle(self.process_handle as _);
            }
        }
    }
}

pub fn permissions(_: bool) -> Permissions {
    let elevated = unsafe {
        let mut token = std::ptr::null_mut();
        let mut elevation: TOKEN_ELEVATION = zeroed();
        let mut size = 0;
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            false
        } else {
            let ok = GetTokenInformation(
                token,
                TokenElevation,
                &mut elevation as *mut _ as *mut _,
                size_of::<TOKEN_ELEVATION>() as u32,
                &mut size,
            );
            CloseHandle(token);
            ok != 0 && elevation.TokenIsElevated != 0
        }
    };
    Permissions {
        platform: "windows".into(),
        accessibility: true,
        input_monitoring: true,
        message: if elevated {
            "当前以管理员权限运行。"
        } else {
            "当前为普通权限。游戏若以管理员运行，工具也需要相同权限。"
        }
        .into(),
    }
}
