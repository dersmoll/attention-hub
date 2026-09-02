use reqwest::Url;

pub const MAX_URL_CHARS: usize = 2_048;

pub fn normalize_url(value: &str, label: &str) -> Result<String, String> {
    if value.chars().count() > MAX_URL_CHARS {
        return Err(format!(
            "{label} must be {MAX_URL_CHARS} characters or fewer."
        ));
    }
    let parsed = Url::parse(value)
        .map_err(|_| format!("{label} must be a complete HTTP or HTTPS address."))?;
    if !matches!(parsed.scheme(), "http" | "https")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(format!(
            "{label} must use HTTP or HTTPS and must not contain embedded credentials."
        ));
    }
    Ok(parsed.to_string())
}

#[cfg(target_os = "windows")]
pub fn open_external_url(url: &str) -> Result<(), String> {
    use windows::{
        core::PCWSTR,
        Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
    };

    let action = "open\0".encode_utf16().collect::<Vec<_>>();
    let target = format!("{url}\0").encode_utf16().collect::<Vec<_>>();
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(action.as_ptr()),
            PCWSTR(target.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize > 32 {
        Ok(())
    } else {
        Err("Windows could not open the validated link.".to_owned())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn open_external_url(_url: &str) -> Result<(), String> {
    Err("Opening validated links is supported only on Windows.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_only_safe_http_urls() {
        assert_eq!(
            normalize_url("https://example.com/brief", "Link").unwrap(),
            "https://example.com/brief"
        );
        assert!(normalize_url("file:///C:/secret.txt", "Link").is_err());
        assert!(normalize_url("https://user:pass@example.com", "Link").is_err());
    }
}
