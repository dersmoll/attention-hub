fn main() {
    println!("cargo:rerun-if-env-changed=ATTENTION_HUB_DEV_IDENTITY");

    let attributes = if std::env::var_os("ATTENTION_HUB_DEV_IDENTITY").is_some() {
        let windows = tauri_build::WindowsAttributes::new()
            .app_manifest(include_str!("windows/app.manifest"));
        tauri_build::Attributes::new().windows_attributes(windows)
    } else {
        tauri_build::Attributes::new()
    };

    tauri_build::try_build(attributes).expect("failed to run Tauri build script");
}
