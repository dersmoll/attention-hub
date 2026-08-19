#[cfg(target_os = "windows")]
fn main() {
    attention_hub_lib::teams_mirror::run_manual_probe();
}

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("The taskbar DWM probe is available only on Windows.");
    std::process::exit(1);
}
