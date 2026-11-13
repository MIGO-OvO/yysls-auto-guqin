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
                    println!("{}", serde_json::json!({"version":update.version,"downloadedBytes":bytes.len(),"signatureVerified":true,"installed":false}));
                    Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
                }.await;
                if let Err(error) = result { eprintln!("{error}"); handle.exit(1); } else { handle.exit(0); }
            });
            Ok(())
        })
        .build(context).expect("Unable to start updater verification");
    app.run(|_, _| {});
}
