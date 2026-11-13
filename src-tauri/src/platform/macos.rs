use super::{InputSink, Permissions};
use crate::model::{Combo, InputMode, Target};
use objc2_app_kit::NSWorkspace;
use std::{
    ffi::{c_char, c_void},
    ptr,
    time::{Duration, Instant},
};

type CfRef = *const c_void;
struct OwnedCf(CfRef);
impl Drop for OwnedCf {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                CFRelease(self.0);
            }
        }
    }
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(value: CfRef);
    fn CFArrayGetCount(array: CfRef) -> isize;
    fn CFArrayGetValueAtIndex(array: CfRef, index: isize) -> CfRef;
    fn CFDictionaryGetValue(dictionary: CfRef, key: CfRef) -> CfRef;
    fn CFDictionaryCreate(
        allocator: CfRef,
        keys: *const CfRef,
        values: *const CfRef,
        count: isize,
        key_callbacks: CfRef,
        value_callbacks: CfRef,
    ) -> CfRef;
    fn CFNumberGetValue(number: CfRef, kind: i32, value: *mut c_void) -> bool;
    fn CFStringGetCString(string: CfRef, buffer: *mut c_char, size: isize, encoding: u32) -> bool;
    static kCFBooleanTrue: CfRef;
}
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: CfRef) -> bool;
    static kAXTrustedCheckOptionPrompt: CfRef;
}
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowListCopyWindowInfo(options: u32, relative_to: u32) -> CfRef;
    static kCGWindowOwnerPID: CfRef;
    static kCGWindowNumber: CfRef;
    static kCGWindowName: CfRef;
    static kCGWindowOwnerName: CfRef;
    static kCGWindowLayer: CfRef;
    fn CGEventCreateKeyboardEvent(source: CfRef, keycode: u16, down: bool) -> CfRef;
    fn CGEventSetFlags(event: CfRef, flags: u64);
    fn CGEventSetType(event: CfRef, kind: u32);
    fn CGEventPostToPid(pid: i32, event: CfRef);
    fn CGEventPost(tap: u32, event: CfRef);
    fn CGEventSourceFlagsState(state: i32) -> u64;
    fn CGPreflightPostEventAccess() -> bool;
    fn CGRequestPostEventAccess() -> bool;
}

unsafe fn cf_string(value: CfRef) -> String {
    if value.is_null() {
        return String::new();
    }
    let mut bytes = [0u8; 8192];
    if !CFStringGetCString(
        value,
        bytes.as_mut_ptr().cast(),
        bytes.len() as isize,
        0x08000100,
    ) {
        return String::new();
    }
    String::from_utf8_lossy(&bytes[..bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len())])
        .into_owned()
}
unsafe fn cf_number(dictionary: CfRef, key: CfRef) -> i64 {
    let value = CFDictionaryGetValue(dictionary, key);
    let mut result = 0i64;
    if !value.is_null() {
        CFNumberGetValue(value, 4, &mut result as *mut _ as *mut _);
    }
    result
}

pub fn list_targets() -> Result<Vec<Target>, String> {
    unsafe {
        // Window metadata only. No screen capture or screen-recording permission.
        let windows = OwnedCf(CGWindowListCopyWindowInfo(16, 0));
        if windows.0.is_null() {
            return Err("无法读取系统窗口列表".into());
        }
        let mut targets = vec![];
        for i in 0..CFArrayGetCount(windows.0) {
            let dict = CFArrayGetValueAtIndex(windows.0, i);
            let pid = cf_number(dict, kCGWindowOwnerPID) as u32;
            if pid == std::process::id() || cf_number(dict, kCGWindowLayer) != 0 {
                continue;
            }
            let id = cf_number(dict, kCGWindowNumber);
            let name = cf_string(CFDictionaryGetValue(dict, kCGWindowOwnerName));
            if name.is_empty() || name == "Window Server" || name == "Dock" {
                continue;
            }
            let title = cf_string(CFDictionaryGetValue(dict, kCGWindowName));
            targets.push(Target {
                id: id.to_string(),
                pid,
                title: if title.is_empty() {
                    format!("{name} · 窗口 {id}")
                } else {
                    title
                },
                process_name: name,
            });
        }
        Ok(targets)
    }
}

fn frontmost_pid() -> u32 {
    objc2::rc::autoreleasepool(|_| {
        NSWorkspace::sharedWorkspace()
            .frontmostApplication()
            .map(|app| app.processIdentifier() as u32)
            .unwrap_or(0)
    })
}
fn exists(target: &Target) -> bool {
    list_targets().is_ok_and(|all| all.iter().any(|t| t.id == target.id && t.pid == target.pid))
}

fn keycode(base: &str) -> Result<u16, String> {
    let code = match base {
        "A" => 0,
        "S" => 1,
        "D" => 2,
        "F" => 3,
        "H" => 4,
        "G" => 5,
        "Z" => 6,
        "X" => 7,
        "C" => 8,
        "V" => 9,
        "B" => 11,
        "Q" => 12,
        "W" => 13,
        "E" => 14,
        "R" => 15,
        "Y" => 16,
        "T" => 17,
        "1" => 18,
        "2" => 19,
        "3" => 20,
        "4" => 21,
        "6" => 22,
        "5" => 23,
        "9" => 25,
        "7" => 26,
        "8" => 28,
        "0" => 29,
        "U" => 32,
        "I" => 34,
        "O" => 31,
        "P" => 35,
        "L" => 37,
        "J" => 38,
        "K" => 40,
        "N" => 45,
        "M" => 46,
        "F1" => 122,
        "F2" => 120,
        "F3" => 99,
        "F4" => 118,
        "F5" => 96,
        "F6" => 97,
        "F7" => 98,
        "F8" => 100,
        "F9" => 101,
        "F10" => 109,
        "F11" => 103,
        "F12" => 111,
        _ => return Err(format!("macOS 不支持此按键：{base}")),
    };
    Ok(code)
}
const SHIFT: u64 = 1 << 17;
const CTRL: u64 = 1 << 18;
const ALT: u64 = 1 << 19;
struct MacInput {
    target: Target,
    mode: InputMode,
    down: Vec<(u16, u64)>,
    flags: u64,
    last_identity: Instant,
    first_press: bool,
}

pub fn connect(target: Target, mode: InputMode) -> Result<Box<dyn InputSink>, String> {
    if !unsafe { AXIsProcessTrusted() && CGPreflightPostEventAccess() } {
        return Err("请在系统设置中允许辅助功能与事件发送权限，然后重新检测".into());
    }
    if !exists(&target) || target.pid == std::process::id() {
        return Err("目标窗口已关闭或不可用于演奏".into());
    }
    Ok(Box::new(MacInput {
        target,
        mode,
        down: vec![],
        flags: 0,
        last_identity: Instant::now(),
        first_press: true,
    }))
}
impl MacInput {
    fn send(&self, code: u16, down: bool, modifier: bool) -> Result<(), String> {
        unsafe {
            let event = OwnedCf(CGEventCreateKeyboardEvent(ptr::null(), code, down));
            if event.0.is_null() {
                return Err("Quartz 无法创建键盘事件".into());
            }
            CGEventSetFlags(event.0, self.flags);
            if modifier {
                CGEventSetType(event.0, 12);
            }
            if self.mode == InputMode::Background {
                CGEventPostToPid(self.target.pid as i32, event.0);
            } else {
                CGEventPost(0, event.0);
            }
            Ok(())
        }
    }
}
impl InputSink for MacInput {
    fn check(&mut self, foreground_required: bool) -> Result<(), String> {
        if !unsafe { AXIsProcessTrusted() && CGPreflightPostEventAccess() } {
            return Err("输入权限已撤销，演奏停止并执行松键".into());
        }
        if self.last_identity.elapsed() >= Duration::from_millis(40) {
            if !exists(&self.target) {
                return Err("目标窗口已关闭，演奏已停止".into());
            }
            self.last_identity = Instant::now();
        }
        if foreground_required && frontmost_pid() != self.target.pid {
            return Err("前台应用已切换，演奏已停止并执行松键".into());
        }
        Ok(())
    }
    fn press(&mut self, combo: &Combo) -> Result<(), String> {
        if self.first_press
            && self.mode != InputMode::Background
            && unsafe { CGEventSourceFlagsState(1) } & (SHIFT | CTRL | ALT) != 0
        {
            return Err("请先松开 Shift、Ctrl、Option".into());
        }
        self.first_press = false;
        let mut keys = vec![];
        if combo.ctrl {
            keys.push((59, CTRL));
        }
        if combo.alt {
            keys.push((58, ALT));
        }
        if combo.shift {
            keys.push((56, SHIFT));
        }
        keys.push((keycode(&combo.base)?, 0));
        for (code, flag) in keys {
            self.down.push((code, flag));
            self.flags |= flag;
            self.send(code, true, flag != 0)?;
        }
        Ok(())
    }
    fn release_all(&mut self) -> Result<(), String> {
        if self.down.is_empty() {
            return Ok(());
        }
        if self.mode == InputMode::Background && !exists(&self.target) {
            self.down.clear();
            self.flags = 0;
            return Ok(());
        }
        let mut failed = vec![];
        let mut error = None;
        while let Some((code, flag)) = self.down.pop() {
            self.flags &= !flag;
            if let Err(e) = self.send(code, false, flag != 0) {
                failed.push((code, flag));
                error = Some(e);
            }
        }
        self.down = failed.into_iter().rev().collect();
        if let Some(error) = error {
            Err(error)
        } else {
            Ok(())
        }
    }
}
impl Drop for MacInput {
    fn drop(&mut self) {
        let _ = self.release_all();
    }
}

pub fn permissions(prompt: bool) -> Permissions {
    unsafe {
        if prompt {
            let options = OwnedCf(CFDictionaryCreate(
                ptr::null(),
                &kAXTrustedCheckOptionPrompt,
                &kCFBooleanTrue,
                1,
                ptr::null(),
                ptr::null(),
            ));
            AXIsProcessTrustedWithOptions(options.0);
            CGRequestPostEventAccess();
        }
        let accessibility = AXIsProcessTrusted();
        let events = CGPreflightPostEventAccess();
        Permissions {
            platform: "macos".into(),
            accessibility,
            input_monitoring: events,
            message: if accessibility && events {
                "辅助功能与事件发送权限已允许。后台游戏接收仍需实测。"
            } else {
                "在系统设置 > 隐私与安全性中允许本应用的辅助功能与事件发送，然后重新检测。"
            }
            .into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_legacy_base_has_a_mac_keycode() {
        for c in 'A'..='Z' {
            assert!(keycode(&c.to_string()).is_ok());
        }
        for n in 1..=12 {
            assert!(keycode(&format!("F{n}")).is_ok());
        }
        assert!(keycode("Return").is_err());
    }
}
