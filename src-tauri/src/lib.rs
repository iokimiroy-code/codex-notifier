use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

fn string_at(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(ToOwned::to_owned)
}

fn normalize(message: &Value) -> Option<Value> {
    let method = message.get("method")?.as_str()?;
    let params = message.get("params").cloned().unwrap_or_else(|| json!({}));
    let thread = params.get("thread").cloned().unwrap_or_else(|| json!({}));
    let turn = params.get("turn").cloned().unwrap_or_else(|| json!({}));
    let thread_id = string_at(&thread, "id").or_else(|| string_at(&params, "threadId")).or_else(|| string_at(&turn, "threadId"));
    let turn_id = string_at(&turn, "id").or_else(|| string_at(&params, "turnId"));
    let task_id = thread_id.clone().or_else(|| turn_id.clone())?;
    let name = string_at(&thread, "name").unwrap_or_else(|| format!("Codex · {}", &task_id[..task_id.len().min(8)]));
    let base = json!({
        "taskId": task_id,
        "threadId": thread_id,
        "turnId": turn_id,
        "name": name,
        "source": "app-server"
    });
    let event = |kind: &str, state: &str, progress: Option<u64>| {
        let mut result = base.clone();
        result["type"] = json!(kind);
        result["state"] = json!(state);
        if let Some(value) = progress { result["progress"] = json!(value); }
        result
    };

    if matches!(method, "thread/started" | "turn/started" | "item/started" | "item/agentMessage/delta") {
        return Some(event("TASK_RUNNING", "running", None));
    }
    if method == "serverRequest" || method.ends_with("/requestApproval") || method.ends_with("/requestUserInput") {
        return Some(event("TASK_WAITING", "waiting", None));
    }
    if method == "turn/completed" || method == "thread/closed" {
        let status = params.get("status").cloned().unwrap_or(Value::Null);
        let failed = params.get("error").is_some() || string_at(&status, "type").as_deref() == Some("systemError");
        return Some(if failed { event("TASK_FAILED", "failed", None) } else { event("TASK_COMPLETED", "completed", Some(100)) });
    }
    if method == "thread/status/changed" {
        let status_type = params.get("status").and_then(|value| value.get("type")).and_then(Value::as_str).or_else(|| params.get("status").and_then(Value::as_str));
        return match status_type {
            Some("active") => Some(event("TASK_RUNNING", "running", None)),
            Some("idle") | Some("notLoaded") => Some(event("TASK_COMPLETED", "completed", Some(100))),
            Some("systemError") => Some(event("TASK_FAILED", "failed", None)),
            _ => None,
        };
    }
    if method.contains("error") || method.contains("failed") {
        return Some(event("TASK_FAILED", "failed", None));
    }
    None
}

fn show_native_notification<R: tauri::Runtime>(app: &AppHandle<R>, payload: &Value) {
    let kind = payload.get("type").and_then(Value::as_str).unwrap_or_default();
    let body = payload.get("name").and_then(Value::as_str).unwrap_or("Codex task");
    let message = match kind {
        "TASK_COMPLETED" => "任务已完成",
        "TASK_WAITING" => "等待确认",
        "TASK_FAILED" => "任务失败",
        _ => return,
    };
    let _ = app.notification().builder().title("Codex 提示音").body(format!("{body} · {message}")).show();
}

fn start_codex<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let command = std::env::var("CODEX_BIN").unwrap_or_else(|_| if cfg!(windows) { "codex.exe".into() } else { "codex".into() });
    let mut child = Command::new(command)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    let mut input = child.stdin.take().ok_or_else(|| "Codex stdin unavailable".to_string())?;
    let output = child.stdout.take().ok_or_else(|| "Codex stdout unavailable".to_string())?;
    writeln!(input, "{}", json!({ "method": "initialize", "id": 0, "params": { "clientInfo": { "name": "codex_prompt_sound", "title": "Codex 提示音", "version": "1.0.0" } } })).map_err(|error| error.to_string())?;
    writeln!(input, "{}", json!({ "method": "initialized", "params": {} })).map_err(|error| error.to_string())?;
    let handle = app.clone();
    std::thread::spawn(move || {
        let _child = child;
        let _input = input;
        let reader = BufReader::new(output);
        for line in reader.lines().flatten() {
            let Ok(message) = serde_json::from_str::<Value>(&line) else { continue };
            if let Some(payload) = normalize(&message) {
                let _ = handle.emit("codex-event", payload.clone());
                show_native_notification(&handle, &payload);
            }
        }
        let _ = handle.emit("codex-status", json!({ "status": "disconnected" }));
    });
    Ok(())
}

#[tauri::command]
fn codex_connection_status() -> &'static str {
    "native"
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![codex_connection_status])
        .setup(|app| {
            if let Err(error) = start_codex(&app.handle()) {
                let _ = app.emit("codex-status", json!({ "status": "disconnected", "error": error }));
            } else {
                let _ = app.emit("codex-status", json!({ "status": "native" }));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Codex 提示音");
}
