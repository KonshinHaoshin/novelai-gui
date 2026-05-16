use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Read};
use std::path::PathBuf;

const SERVICE_NAME: &str = "novel-gui";
const ACCOUNT_NAME: &str = "novelai-api-token";
const GENERATE_IMAGE_URL: &str = "https://image.novelai.net/ai/generate-image";
const USER_DATA_URL: &str = "https://api.novelai.net/user/data";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerateRequest {
    pub prompt: String,
    #[serde(default)]
    pub negative_prompt: String,
    pub model: String,
    pub action: String,
    pub width: u32,
    pub height: u32,
    pub n_samples: u32,
    pub steps: u32,
    pub scale: f32,
    pub cfg_rescale: f32,
    pub sampler: String,
    pub noise_schedule: String,
    pub image_format: String,
    pub quality_toggle: bool,
    pub uc_preset: u32,
    pub params_version: u32,
    pub dynamic_thresholding: bool,
    pub sm: bool,
    pub sm_dyn: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip_cfg_above_sigma: Option<f32>,
    pub deliberate_euler_ancestral_bug: bool,
    pub prefer_brownian: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedImage {
    pub file_name: String,
    pub mime_type: String,
    pub byte_len: usize,
    pub base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateImageResponse {
    pub content_type: String,
    pub images: Vec<GeneratedImage>,
}

#[tauri::command]
fn has_api_token() -> Result<bool, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, ACCOUNT_NAME).map_err(to_error)?;
    match entry.get_password() {
        Ok(token) => Ok(!token.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(err) => Err(to_error(err)),
    }
}

#[tauri::command]
fn save_api_token(token: String) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("API Token cannot be empty".to_string());
    }

    let entry = keyring::Entry::new(SERVICE_NAME, ACCOUNT_NAME).map_err(to_error)?;
    entry.set_password(trimmed).map_err(to_error)
}

#[tauri::command]
async fn generate_image(request: ImageGenerateRequest) -> Result<GenerateImageResponse, String> {
    if request.prompt.trim().is_empty() {
        return Err("Prompt cannot be empty".to_string());
    }

    let token = read_token()?;
    let mut parameters = serde_json::json!({
        "width": request.width,
        "height": request.height,
        "prompt": request.prompt,
        "negative_prompt": request.negative_prompt,
        "n_samples": request.n_samples,
        "steps": request.steps,
        "scale": request.scale,
        "cfg_rescale": request.cfg_rescale,
        "sampler": request.sampler,
        "noise_schedule": request.noise_schedule,
        "image_format": request.image_format,
        "qualityToggle": request.quality_toggle,
        "ucPreset": request.uc_preset,
        "params_version": request.params_version,
        "dynamic_thresholding": request.dynamic_thresholding,
        "sm": request.sm,
        "sm_dyn": request.sm_dyn,
        "deliberate_euler_ancestral_bug": request.deliberate_euler_ancestral_bug,
        "prefer_brownian": request.prefer_brownian,
    });

    if is_v4_image_model(&request.model) {
        parameters["legacy"] = serde_json::json!(false);
        parameters["legacy_uc"] = serde_json::json!(false);
        parameters["add_original_image"] = serde_json::json!(false);
        parameters["autoSmea"] = serde_json::json!(false);
        parameters["use_coords"] = serde_json::json!(false);
        parameters["v4_prompt"] = serde_json::json!({
            "caption": {
                "base_caption": request.prompt,
                "char_captions": []
            },
            "use_coords": false,
            "use_order": true
        });
        parameters["v4_negative_prompt"] = serde_json::json!({
            "caption": {
                "base_caption": request.negative_prompt,
                "char_captions": []
            },
            "legacy_uc": false
        });
    }

    if let Some(seed) = request.seed {
        parameters["seed"] = serde_json::json!(seed);
    }
    if let Some(value) = request.skip_cfg_above_sigma {
        parameters["skip_cfg_above_sigma"] = serde_json::json!(value);
    }

    let payload = serde_json::json!({
        "input": request.prompt,
        "model": request.model,
        "action": request.action,
        "parameters": parameters,
    });
    let client = reqwest::Client::new();
    let response = client
        .post(GENERATE_IMAGE_URL)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .json(&payload)
        .send()
        .await
        .map_err(to_error)?;

    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let body = response.bytes().await.map_err(to_error)?.to_vec();

    if !status.is_success() {
        return Err(format_api_error(status.as_u16(), &body));
    }

    let images = decode_generated_images(&content_type, body)?;
    Ok(GenerateImageResponse {
        content_type,
        images,
    })
}

#[tauri::command]
async fn get_account_status() -> Result<serde_json::Value, String> {
    let token = read_token()?;
    let client = reqwest::Client::new();
    let response = client
        .get(USER_DATA_URL)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .await
        .map_err(to_error)?;

    let status = response.status();
    let body = response.bytes().await.map_err(to_error)?.to_vec();

    if !status.is_success() {
        return Err(format_api_error(status.as_u16(), &body));
    }

    serde_json::from_slice(&body).map_err(to_error)
}

#[tauri::command]
fn save_generated_image(file_name: String, base64: String) -> Result<String, String> {
    let bytes = BASE64.decode(base64).map_err(to_error)?;
    let safe_name = sanitize_file_name(&file_name);
    let mut dir = dirs::picture_dir()
        .or_else(dirs::download_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    dir.push("NovelAI GUI");
    fs::create_dir_all(&dir).map_err(to_error)?;
    dir.push(safe_name);
    fs::write(&dir, bytes).map_err(to_error)?;
    Ok(dir.to_string_lossy().to_string())
}

fn read_token() -> Result<String, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, ACCOUNT_NAME).map_err(to_error)?;
    match entry.get_password() {
        Ok(token) if !token.trim().is_empty() => Ok(token),
        Ok(_) | Err(keyring::Error::NoEntry) => Err("API Token is not configured".to_string()),
        Err(err) => Err(to_error(err)),
    }
}

fn decode_generated_images(
    content_type: &str,
    body: Vec<u8>,
) -> Result<Vec<GeneratedImage>, String> {
    let lower = content_type.to_ascii_lowercase();
    if lower.contains("application/zip") || lower.contains("application/x-zip") {
        return decode_zip_images(body);
    }

    if lower.contains("image/png") || lower.contains("image/jpeg") || lower.contains("image/webp") {
        return Ok(vec![GeneratedImage {
            file_name: default_file_name(content_type, 0),
            mime_type: normalize_image_mime(content_type),
            byte_len: body.len(),
            base64: BASE64.encode(body),
        }]);
    }

    decode_zip_images(body.clone()).or_else(|_| {
        Ok(vec![GeneratedImage {
            file_name: "novelai-output.bin".to_string(),
            mime_type: "application/octet-stream".to_string(),
            byte_len: body.len(),
            base64: BASE64.encode(body),
        }])
    })
}

fn decode_zip_images(body: Vec<u8>) -> Result<Vec<GeneratedImage>, String> {
    let cursor = Cursor::new(body);
    let mut archive = zip::ZipArchive::new(cursor).map_err(to_error)?;
    let mut images = Vec::new();

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(to_error)?;
        if file.is_dir() {
            continue;
        }

        let name = file.name().to_string();
        let mime_type = mime_from_name(&name);
        if mime_type.is_none() {
            continue;
        }

        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(to_error)?;
        images.push(GeneratedImage {
            file_name: sanitize_file_name(&name),
            mime_type: mime_type.unwrap().to_string(),
            byte_len: bytes.len(),
            base64: BASE64.encode(bytes),
        });
    }

    if images.is_empty() {
        return Err("The API response did not contain any image files".to_string());
    }

    Ok(images)
}

fn format_api_error(status: u16, body: &[u8]) -> String {
    let text = String::from_utf8_lossy(body);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return format!("NovelAI API returned HTTP {status}");
    }

    let message = serde_json::from_str::<serde_json::Value>(trimmed)
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .or_else(|| value.get("error"))
                .and_then(|message| message.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| trimmed.chars().take(300).collect());

    format!("NovelAI API returned HTTP {status}: {message}")
}

fn default_file_name(content_type: &str, index: usize) -> String {
    let extension = if content_type.contains("jpeg") {
        "jpg"
    } else if content_type.contains("webp") {
        "webp"
    } else {
        "png"
    };
    format!("novelai-{index}.{extension}")
}

fn normalize_image_mime(content_type: &str) -> String {
    let lower = content_type.to_ascii_lowercase();
    if lower.contains("jpeg") {
        "image/jpeg".to_string()
    } else if lower.contains("webp") {
        "image/webp".to_string()
    } else {
        "image/png".to_string()
    }
}

fn mime_from_name(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".png") {
        Some("image/png")
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        Some("image/jpeg")
    } else if lower.ends_with(".webp") {
        Some("image/webp")
    } else {
        None
    }
}

fn sanitize_file_name(name: &str) -> String {
    let clean = name
        .replace('\\', "_")
        .replace('/', "_")
        .replace(':', "_")
        .replace('*', "_")
        .replace('?', "_")
        .replace('"', "_")
        .replace('<', "_")
        .replace('>', "_")
        .replace('|', "_");

    if clean.trim().is_empty() {
        "novelai-output.png".to_string()
    } else {
        clean
    }
}

fn to_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn is_v4_image_model(model: &str) -> bool {
    model.contains("diffusion-4")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            has_api_token,
            save_api_token,
            get_account_status,
            generate_image,
            save_generated_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
