// Downloads from the configured HTTPS endpoint and runs the real updater's
// signature + signed-version checks. It never installs or starts playback.
use tauri_plugin_updater::UpdaterExt;
fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let result = async {
                    let updater = handle.updater_builder().version_comparator(|_, _| true).build()?;
                    let update = updater.check().await?.ok_or("No release available")?;
                    let bytes = update.download(|_, _| {}, || {}).await?;
                    Ok::<_, Box<dyn std::error::Error + Send + Sync>>(serde_json::json!({"version":update.version,"downloadedBytes":bytes.len(),"signatureVerified":true,"installed":false}))
                }.await;
                let report = match &result {
                    Ok(value) => value.clone(),
                    Err(error) => serde_json::json!({"error":error.to_string(),"signatureVerified":false,"installed":false}),
                };
                std::fs::create_dir_all("artifacts").expect("Create verification output directory");
                std::fs::write("artifacts/update-verification.json", report.to_string()).expect("Write verification result");
                println!("{report}");
                handle.exit(if result.is_ok() { 0 } else { 1 });
            });
            Ok(())
        })
        .build(context).expect("Unable to start updater verification");
    app.run(|_, _| {});
}
