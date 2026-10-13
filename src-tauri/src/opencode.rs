use crate::{gateway, to_error};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Integration {
    path: String,
    exists: bool,
    config: Value,
}

fn config_path() -> Result<PathBuf, String> {
    let root = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or(
            dirs::home_dir()
                .ok_or("无法定位用户目录。")?
                .join(".config"),
        );
    let dir = root.join("opencode");
    let jsonc = dir.join("opencode.jsonc");
    Ok(if jsonc.exists() {
        jsonc
    } else {
        dir.join("opencode.json")
    })
}
fn fragment(base_url: &str, model: &str, key_path: &Path, make_default: bool) -> Value {
    let mut value = json!({"$schema":"https://opencode.ai/config.json","provider":{"novelai":{"npm":"@ai-sdk/openai-compatible","name":"NovelAI Local","options":{"baseURL":base_url,"apiKey":format!("{{file:{}}}",key_path.to_string_lossy().replace('\\',"/"))},"models":{"glm-4-6":{"name":"GLM-4.6","tool_call":true,"limit":{"context":28672,"output":8192}},"xialong-v1":{"name":"Xialong","tool_call":true,"limit":{"context":28672,"output":8192}}}}},"agent":{"novelai":{"description":"NovelAI 工具适配模式","mode":"primary","model":format!("novelai/{model}"),"prompt":"使用工具时等待实际工具结果，不编造工具执行结果。"}}});
    if make_default {
        value["model"] = json!(format!("novelai/{model}"));
        value["default_agent"] = json!("novelai");
    }
    value
}
fn validate(model: &str, base_url: &str) -> Result<(), String> {
    if !["glm-4-6", "xialong-v1"].contains(&model) {
        return Err("模型无效。".into());
    }
    let url = reqwest::Url::parse(base_url).map_err(|_| "Base URL 无效。")?;
    if url.scheme() != "http"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/v1"
    {
        return Err("Base URL 必须是本地 HTTP /v1 地址。".into());
    }
    Ok(())
}
#[tauri::command]
pub fn opencode_integration(
    base_url: String,
    model: String,
    make_default: bool,
) -> Result<Integration, String> {
    validate(&model, &base_url)?;
    let path = config_path()?;
    Ok(Integration {
        exists: path.exists(),
        config: fragment(
            &base_url,
            &model,
            &path.parent().unwrap().join("novelai-gateway.key"),
            make_default,
        ),
        path: path.to_string_lossy().into(),
    })
}
fn merge(target: &mut Value, source: Value) -> Result<(), String> {
    let object = target
        .as_object_mut()
        .ok_or("配置节点必须为对象，未修改文件。")?;
    for (key, value) in source.as_object().ok_or("配置必须为对象。")? {
        if value.is_object() && object.contains_key(key) {
            merge(object.get_mut(key).unwrap(), value.clone())?;
        } else {
            object.insert(key.clone(), value.clone());
        }
    }
    Ok(())
}
fn private_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension(format!("tmp-{}", Uuid::new_v4().simple()));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = options.open(&tmp).map_err(to_error)?;
        file.write_all(bytes).map_err(to_error)?;
        file.sync_all().map_err(to_error)?;
        fs::rename(&tmp, path).map_err(to_error)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Written {
    path: String,
    backup_path: Option<String>,
}
fn write_at(
    path: &Path,
    base_url: &str,
    model: &str,
    make_default: bool,
    key: &str,
) -> Result<Written, String> {
    let original = match fs::read(path) {
        Ok(bytes) => Some(bytes),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(to_error(e)),
    };
    let mut config = match &original {
        Some(bytes) => json5::from_str::<Value>(
            std::str::from_utf8(bytes).map_err(|_| "配置不是 UTF-8，未修改文件。")?,
        )
        .map_err(|_| "现有 OpenCode 配置解析失败，未修改文件。")?,
        None => json!({}),
    };
    let dir = path.parent().ok_or("配置目录无效。")?;
    let key_path = dir.join("novelai-gateway.key");
    merge(
        &mut config,
        fragment(base_url, model, &key_path, make_default),
    )?;
    // A pure-text agent with another provider may use this model, but must not disable its tools.
    if let Some(disabled) = config
        .get_mut("disabled_providers")
        .and_then(Value::as_array_mut)
    {
        disabled.retain(|v| v != "novelai");
    }
    if let Some(enabled) = config
        .get_mut("enabled_providers")
        .and_then(Value::as_array_mut)
    {
        if !enabled.iter().any(|v| v == "novelai") {
            enabled.push(json!("novelai"));
        }
    }
    let output = serde_json::to_vec_pretty(&config).map_err(to_error)?;
    fs::create_dir_all(dir).map_err(to_error)?;
    if fs::read(path).ok() != original {
        return Err("OpenCode 配置已被其他程序修改，请重试。".into());
    }
    let backup = if let Some(bytes) = original {
        let backup = path.with_extension(format!("bak-{}", Uuid::new_v4().simple()));
        private_write(&backup, &bytes)?;
        Some(backup.to_string_lossy().into_owned())
    } else {
        None
    };
    private_write(&key_path, key.as_bytes())?;
    private_write(path, &output)?;
    Ok(Written {
        path: path.to_string_lossy().into(),
        backup_path: backup,
    })
}
#[tauri::command]
pub async fn write_opencode_config(
    manager: tauri::State<'_, gateway::GatewayManager>,
    model: String,
    make_default: bool,
) -> Result<Written, String> {
    let status = gateway::gateway_status(manager).await?;
    let mut url = reqwest::Url::parse(
        status
            .base_url
            .as_deref()
            .ok_or("请先启动本地 API 服务。")?,
    )
    .map_err(to_error)?;
    if matches!(url.host_str(), Some("0.0.0.0" | "[::]" | "::")) {
        url.set_host(Some("127.0.0.1")).map_err(to_error)?;
    }
    let base = url.as_str().trim_end_matches('/');
    validate(&model, base)?;
    write_at(
        &config_path()?,
        base,
        &model,
        make_default,
        &gateway::get_gateway_key()?,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn merges_backs_up_jsonc_and_keeps_other_providers_and_defaults() {
        let dir = std::env::temp_dir().join(format!("nai-opencode-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("opencode.jsonc");
        let bytes=b"{ // preserve in backup\n\"model\":\"other/model\",\"provider\":{\"other\":{\"options\":{\"apiKey\":\"test-secret\"}}},\"agent\":{\"text\":{\"tools\":{\"*\":false}}},}";
        fs::write(&path, bytes).unwrap();
        let result = write_at(
            &path,
            "http://127.0.0.1:18765/v1",
            "glm-4-6",
            false,
            "test-local-key",
        )
        .unwrap();
        let config: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(config["model"], "other/model");
        assert_eq!(
            config["provider"]["other"]["options"]["apiKey"],
            "test-secret"
        );
        assert_eq!(
            config["provider"]["novelai"]["models"]["glm-4-6"]["tool_call"],
            true
        );
        assert!(config["agent"]["novelai"].get("tools").is_none());
        assert_eq!(fs::read(result.backup_path.unwrap()).unwrap(), bytes);
        assert_eq!(
            fs::read(dir.join("novelai-gateway.key")).unwrap(),
            b"test-local-key"
        );
        write_at(
            &path,
            "http://127.0.0.1:18765/v1",
            "xialong-v1",
            true,
            "test-local-key",
        )
        .unwrap();
        let c: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(c["model"], "novelai/xialong-v1");
        assert_eq!(c["default_agent"], "novelai");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn refuses_invalid_config_without_writing_key() {
        let dir = std::env::temp_dir().join(format!("nai-opencode-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("opencode.json");
        fs::write(&p, "not json").unwrap();
        assert!(write_at(&p, "http://127.0.0.1:1/v1", "glm-4-6", false, "secret").is_err());
        assert!(!dir.join("novelai-gateway.key").exists());
        assert_eq!(fs::read_to_string(&p).unwrap(), "not json");
        fs::remove_dir_all(dir).unwrap();
    }
}
