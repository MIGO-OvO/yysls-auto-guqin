#![cfg(target_os = "macos")]
use guqin_lib::{model::InputMode, platform};
use std::{
    fs,
    path::Path,
    thread,
    time::{Duration, Instant},
};

#[test]
#[ignore = "requires the packaged app running in an isolated macOS CI desktop"]
fn window_identity_and_permission_boundary() {
    assert_eq!(std::env::var("GITHUB_ACTIONS").as_deref(), Ok("true"));
    let target_pid: u32 = std::env::var("GUQIN_NATIVE_TARGET_PID")
        .unwrap()
        .parse()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    let target = loop {
        let targets = platform::list_targets().unwrap();
        if let Some(target) = targets.into_iter().find(|target| target.pid == target_pid) {
            break target;
        }
        assert!(
            Instant::now() < deadline,
            "packaged application window was not enumerated"
        );
        thread::sleep(Duration::from_millis(100));
    };
    let permissions = platform::permissions(false);
    let allowed = permissions.accessibility && permissions.input_monitoring;
    let result = platform::connect(target.clone(), InputMode::Background);
    let (connected, permission_guard, foreground) = if allowed {
        let mut input = result.unwrap();
        input.check(false).unwrap();
        let foreground = match input.check(true) {
            Ok(()) => "matched".to_owned(),
            Err(error) => error,
        };
        (true, false, Some(foreground))
    } else {
        let error = match result {
            Ok(_) => panic!("input adapter opened without the required permissions"),
            Err(error) => error,
        };
        assert!(error.contains("权限"));
        (false, true, None)
    };
    // This probe opens/checks the adapter only; it never presses a key.
    let report = serde_json::json!({
        "observerProcess": "rust-probe",
        "observerVersion": env!("CARGO_PKG_VERSION"),
        "target": target,
        "permissions": permissions,
        "adapterConnected": connected,
        "permissionGuardVerified": permission_guard,
        "foregroundCheck": foreground,
        "keyboardEventsSent": 0,
        "gameVerified": false
    });
    let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("../artifacts");
    fs::create_dir_all(&directory).unwrap();
    fs::write(
        directory.join("macos-input-environment.json"),
        report.to_string(),
    )
    .unwrap();
    println!("{report}");
}
