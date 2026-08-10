use std::{
    env, fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};

use super::{GraphEnvironmentReport, GraphEnvironmentStatus};

const PROTOCOL_VERSION: u32 = 1;
const HELPER_OVERRIDE_VARIABLE: &str = "ATTENTION_HUB_GRAPH_HELPER_PATH";
const HELPER_EXECUTABLE: &str = "attention-hub-graph-helper.exe";
const HELPER_TIMEOUT: Duration = Duration::from_secs(5);
const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(25);
const MAXIMUM_OUTPUT_BYTES: usize = 64 * 1024;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HelperRequest<'a> {
    protocol_version: u32,
    operation: &'a str,
    parent_window_handle: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HelperResponse {
    protocol_version: u32,
    operation: String,
    status: String,
    environment: Option<HelperEnvironment>,
    diagnostics: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HelperEnvironment {
    windows_supported: bool,
    client_id_configured: bool,
    tenant_id_configured: bool,
    dotnet_runtime_version: String,
    msal_version: String,
    broker_version: String,
}

struct ProcessOutput {
    success: bool,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

pub async fn get_environment() -> GraphEnvironmentReport {
    match tauri::async_runtime::spawn_blocking(get_environment_blocking).await {
        Ok(report) => report,
        Err(error) => error_report(format!(
            "The Graph helper environment task could not complete: {error}"
        )),
    }
}

fn get_environment_blocking() -> GraphEnvironmentReport {
    let helper_path = match resolve_helper_path() {
        Ok(path) => path,
        Err(diagnostic) => {
            return GraphEnvironmentReport {
                status: GraphEnvironmentStatus::Unavailable,
                helper_available: false,
                windows_supported: true,
                client_id_configured: false,
                tenant_id_configured: false,
                dotnet_runtime_version: None,
                msal_version: None,
                broker_version: None,
                diagnostics: vec![diagnostic],
            };
        }
    };
    let request = HelperRequest {
        protocol_version: PROTOCOL_VERSION,
        operation: "environment",
        parent_window_handle: None,
    };
    let request = match serde_json::to_vec(&request) {
        Ok(request) => request,
        Err(error) => {
            return error_report(format!(
                "Could not serialize the Graph helper environment request: {error}"
            ));
        }
    };
    let output = match run_helper(&helper_path, &request) {
        Ok(output) => output,
        Err(diagnostic) => return error_report(diagnostic),
    };

    if output.stdout.len() > MAXIMUM_OUTPUT_BYTES {
        return error_report("The Graph helper response exceeded the protocol size limit.".into());
    }

    let response: HelperResponse = match serde_json::from_slice(&output.stdout) {
        Ok(response) => response,
        Err(error) => {
            let mut diagnostics = vec![format!(
                "The Graph helper response was not valid protocol JSON: {error}"
            )];
            if !output.stderr.is_empty() {
                diagnostics.push(
                    "The Graph helper wrote sanitized diagnostic data to standard error.".into(),
                );
            }
            return GraphEnvironmentReport {
                diagnostics,
                ..error_report("The Graph helper protocol response could not be read.".into())
            };
        }
    };

    if response.protocol_version != PROTOCOL_VERSION || response.operation != "environment" {
        return error_report(
            "The Graph helper returned an unexpected protocol version or operation.".into(),
        );
    }

    let environment = match response.environment {
        Some(environment) => environment,
        None => {
            let mut report =
                error_report("The Graph helper did not return environment metadata.".into());
            report.diagnostics.extend(response.diagnostics);
            return report;
        }
    };
    let status = match response.status.as_str() {
        "ready" if output.success => GraphEnvironmentStatus::Ready,
        "notConfigured" if output.success => GraphEnvironmentStatus::NotConfigured,
        _ => GraphEnvironmentStatus::Error,
    };

    GraphEnvironmentReport {
        status,
        helper_available: true,
        windows_supported: environment.windows_supported,
        client_id_configured: environment.client_id_configured,
        tenant_id_configured: environment.tenant_id_configured,
        dotnet_runtime_version: Some(environment.dotnet_runtime_version),
        msal_version: Some(environment.msal_version),
        broker_version: Some(environment.broker_version),
        diagnostics: response.diagnostics,
    }
}

fn resolve_helper_path() -> Result<PathBuf, String> {
    let path = match env::var_os(HELPER_OVERRIDE_VARIABLE) {
        Some(path) if !path.is_empty() => PathBuf::from(path),
        _ => PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("graph-helper")
            .join(HELPER_EXECUTABLE),
    };

    if !path.is_absolute() {
        return Err(format!(
            "The Graph helper path must be absolute. Configure {HELPER_OVERRIDE_VARIABLE} or build the development helper."
        ));
    }

    match fs::metadata(&path) {
        Ok(metadata) if metadata.is_file() => Ok(path),
        Ok(_) => Err(format!(
            "The Graph helper path does not identify a file: {}",
            path.display()
        )),
        Err(error) => Err(format!(
            "The Graph helper executable is unavailable at {}: {error}",
            path.display()
        )),
    }
}

fn run_helper(path: &Path, request: &[u8]) -> Result<ProcessOutput, String> {
    use std::os::windows::process::CommandExt;

    let mut child = Command::new(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("Could not start the Graph helper process: {error}"))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "The Graph helper standard input pipe was unavailable.".to_owned())?;
    stdin
        .write_all(request)
        .map_err(|error| format!("Could not write the Graph helper request: {error}"))?;
    drop(stdin);

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "The Graph helper standard output pipe was unavailable.".to_owned())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "The Graph helper standard error pipe was unavailable.".to_owned())?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout));
    let stderr_reader = thread::spawn(move || read_bounded(stderr));
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < HELPER_TIMEOUT => {
                thread::sleep(PROCESS_POLL_INTERVAL);
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("The Graph helper process exceeded the five-second timeout.".into());
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "Could not observe the Graph helper process: {error}"
                ));
            }
        }
    };
    let stdout = join_reader(stdout_reader, "standard output")?;
    let stderr = join_reader(stderr_reader, "standard error")?;

    Ok(ProcessOutput {
        success: status.success(),
        stdout,
        stderr,
    })
}

fn read_bounded(mut reader: impl Read) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    let mut chunk = [0_u8; 4096];

    loop {
        let read = reader
            .read(&mut chunk)
            .map_err(|error| format!("Could not read helper process output: {error}"))?;
        if read == 0 {
            return Ok(output);
        }
        if output.len() + read > MAXIMUM_OUTPUT_BYTES {
            return Err("The helper process output exceeded the protocol size limit.".into());
        }
        output.extend_from_slice(&chunk[..read]);
    }
}

fn join_reader(
    reader: thread::JoinHandle<Result<Vec<u8>, String>>,
    stream: &str,
) -> Result<Vec<u8>, String> {
    reader
        .join()
        .map_err(|_| format!("The Graph helper {stream} reader panicked."))?
}

fn error_report(diagnostic: String) -> GraphEnvironmentReport {
    GraphEnvironmentReport {
        status: GraphEnvironmentStatus::Error,
        helper_available: false,
        windows_supported: true,
        client_id_configured: false,
        tenant_id_configured: false,
        dotnet_runtime_version: None,
        msal_version: None,
        broker_version: None,
        diagnostics: vec![diagnostic],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_request_contains_no_account_or_token_fields() {
        let request = serde_json::to_string(&HelperRequest {
            protocol_version: PROTOCOL_VERSION,
            operation: "environment",
            parent_window_handle: None,
        })
        .expect("request should serialize");

        assert_eq!(
            request,
            r#"{"protocolVersion":1,"operation":"environment","parentWindowHandle":null}"#
        );
        assert!(!request.contains("email"));
        assert!(!request.contains("token"));
    }

    #[test]
    fn oversized_reader_output_is_rejected() {
        let bytes = vec![b'x'; MAXIMUM_OUTPUT_BYTES + 1];
        let result = read_bounded(bytes.as_slice());

        assert!(result.is_err());
    }
}
