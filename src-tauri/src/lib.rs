use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::{Cursor, Read, Write};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const SERVICE_NAME: &str = "novelai-gui";
const ACCOUNT_NAME: &str = "novelai-api-token";
const GENERATE_IMAGE_URL: &str = "https://image.novelai.net/ai/generate-image";
const AUGMENT_IMAGE_URL: &str = "https://image.novelai.net/ai/augment-image";
const ENCODE_VIBE_URL: &str = "https://image.novelai.net/ai/encode-vibe";
const SUGGEST_TAGS_URL: &str = "https://image.novelai.net/ai/generate-image/suggest-tags";
const UPSCALE_IMAGE_URL: &str = "https://api.novelai.net/ai/upscale";
const USER_DATA_URL: &str = "https://api.novelai.net/user/data";
const USER_INFORMATION_URL: &str = "https://api.novelai.net/user/information";
const USER_SUBSCRIPTION_URL: &str = "https://api.novelai.net/user/subscription";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerateRequest {
    pub prompt: String,
    #[serde(default)]
    pub negative_prompt: String,
    #[serde(default)]
    pub characters: Vec<CharacterPrompt>,
    #[serde(default)]
    pub use_character_coords: bool,
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
    #[serde(default)]
    pub source_image: Option<String>,
    #[serde(default)]
    pub mask_image: Option<String>,
    #[serde(default)]
    pub strength: Option<f32>,
    #[serde(default)]
    pub noise: Option<f32>,
    #[serde(default)]
    pub extra_noise_seed: Option<u64>,
    #[serde(default)]
    pub color_correct: bool,
    #[serde(default)]
    pub reference_image: Option<String>,
    #[serde(default)]
    pub reference_strength: Option<f32>,
    #[serde(default)]
    pub reference_information_extracted: Option<f32>,
    #[serde(default)]
    pub director_reference_image: Option<String>,
    #[serde(default)]
    pub director_reference_prompt: Option<String>,
    #[serde(default)]
    pub director_reference_strength: Option<f32>,
    #[serde(default)]
    pub director_reference_secondary_strength: Option<f32>,
    #[serde(default)]
    pub director_reference_information_extracted: Option<f32>,
    #[serde(default)]
    pub allow_invalid_tls: bool,
    #[serde(default)]
    pub proxy_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPrompt {
    pub prompt: String,
    #[serde(default)]
    pub negative_prompt: String,
    pub x: f32,
    pub y: f32,
}

struct CharacterCaptionPayload {
    prompt: String,
    negative_prompt: String,
    centers: Vec<serde_json::Value>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleImageRequest {
    pub image: String,
    pub width: u32,
    pub height: u32,
    pub scale: u32,
    #[serde(default)]
    pub allow_invalid_tls: bool,
    #[serde(default)]
    pub proxy_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AugmentImageRequest {
    pub image: String,
    pub prompt: String,
    pub width: u32,
    pub height: u32,
    pub req_type: String,
    pub defry: u32,
    #[serde(default)]
    pub allow_invalid_tls: bool,
    #[serde(default)]
    pub proxy_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodeVibeRequest {
    pub image: String,
    pub model: String,
    pub information_extracted: f32,
    #[serde(default)]
    pub allow_invalid_tls: bool,
    #[serde(default)]
    pub proxy_url: Option<String>,
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
    let api_model = effective_image_model(&request.model, &request.action);
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

    if is_v4_image_model(&api_model) {
        let character_captions = build_character_captions(&request.characters);
        let use_coords = request.use_character_coords && !character_captions.is_empty();
        parameters["legacy"] = serde_json::json!(false);
        parameters["legacy_uc"] = serde_json::json!(false);
        parameters["add_original_image"] = serde_json::json!(false);
        parameters["autoSmea"] = serde_json::json!(false);
        parameters["use_coords"] = serde_json::json!(use_coords);
        parameters["v4_prompt"] = serde_json::json!({
            "caption": {
                "base_caption": request.prompt,
                "char_captions": character_captions
                    .iter()
                    .map(|character| serde_json::json!({
                        "char_caption": &character.prompt,
                        "centers": &character.centers
                    }))
                    .collect::<Vec<_>>()
            },
            "use_coords": use_coords,
            "use_order": true
        });
        parameters["v4_negative_prompt"] = serde_json::json!({
            "caption": {
                "base_caption": request.negative_prompt,
                "char_captions": character_captions
                    .iter()
                    .map(|character| serde_json::json!({
                        "char_caption": &character.negative_prompt,
                        "centers": &character.centers
                    }))
                    .collect::<Vec<_>>()
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
    if let Some(image) = request.source_image.as_deref().filter(|value| !value.trim().is_empty()) {
        parameters["image"] = serde_json::json!(image);
    }
    if let Some(mask) = request.mask_image.as_deref().filter(|value| !value.trim().is_empty()) {
        parameters["mask"] = serde_json::json!(mask);
    }
    if let Some(value) = request.strength {
        parameters["strength"] = serde_json::json!(value);
    }
    if let Some(value) = request.noise {
        parameters["noise"] = serde_json::json!(value);
    }
    if let Some(value) = request.extra_noise_seed {
        parameters["extra_noise_seed"] = serde_json::json!(value);
    }
    if request.action == "img2img" || request.action == "infill" {
        parameters["color_correct"] = serde_json::json!(request.color_correct);
    }
    if let Some(image) = request.reference_image.as_deref().filter(|value| !value.trim().is_empty()) {
        parameters["reference_image"] = serde_json::json!(image);
        parameters["reference_strength"] = serde_json::json!(request.reference_strength.unwrap_or(0.6));
        parameters["reference_information_extracted"] =
            serde_json::json!(request.reference_information_extracted.unwrap_or(0.6));
    }
    if let Some(image) = request
        .director_reference_image
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        let description = request
            .director_reference_prompt
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(&request.prompt);
        parameters["director_reference_images"] = serde_json::json!([image]);
        parameters["director_reference_descriptions"] = serde_json::json!([{
            "caption": {
                "base_caption": description,
                "char_captions": []
            },
            "use_coords": false,
            "use_order": true
        }]);
        parameters["director_reference_strength_values"] =
            serde_json::json!([request.director_reference_strength.unwrap_or(0.6)]);
        parameters["director_reference_secondary_strength_values"] =
            serde_json::json!([request.director_reference_secondary_strength.unwrap_or(0.4)]);
        parameters["director_reference_information_extracted"] =
            serde_json::json!([request.director_reference_information_extracted.unwrap_or(0.6)]);
    }

    let payload = serde_json::json!({
        "input": request.prompt,
        "model": api_model,
        "action": request.action,
        "parameters": parameters,
    });
    let client = api_client(request.allow_invalid_tls, request.proxy_url.as_deref())?;
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
async fn get_account_status(allow_invalid_tls: bool, proxy_url: Option<String>) -> Result<serde_json::Value, String> {
    let token = read_token()?;
    let client = api_client(allow_invalid_tls, proxy_url.as_deref())?;
    let data = get_json(&client, &token, USER_DATA_URL).await?;
    let information = get_json(&client, &token, USER_INFORMATION_URL).await.ok();
    let subscription = get_json(&client, &token, USER_SUBSCRIPTION_URL).await.ok();

    Ok(serde_json::json!({
        "data": data,
        "information": information,
        "subscription": subscription
    }))
}

#[tauri::command]
async fn suggest_tags(model: String, prompt: String, lang: Option<String>, allow_invalid_tls: bool, proxy_url: Option<String>) -> Result<serde_json::Value, String> {
    let token = read_token()?;
    let client = api_client(allow_invalid_tls, proxy_url.as_deref())?;
    let response = client
        .get(SUGGEST_TAGS_URL)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .query(&[
            ("model", model.as_str()),
            ("prompt", prompt.as_str()),
            ("lang", lang.as_deref().unwrap_or("en")),
        ])
        .send()
        .await
        .map_err(to_error)?;

    response_json(response).await
}

#[tauri::command]
async fn upscale_image(request: UpscaleImageRequest) -> Result<GenerateImageResponse, String> {
    if request.scale != 2 && request.scale != 4 {
        return Err("Upscale scale must be 2 or 4".to_string());
    }

    let token = read_token()?;
    let payload = serde_json::json!({
        "image": request.image,
        "width": request.width,
        "height": request.height,
        "scale": request.scale,
    });
    post_zip_like(UPSCALE_IMAGE_URL, &token, payload, request.allow_invalid_tls, request.proxy_url.as_deref()).await
}

#[tauri::command]
async fn augment_image(request: AugmentImageRequest) -> Result<GenerateImageResponse, String> {
    let token = read_token()?;
    let payload = serde_json::json!({
        "image": request.image,
        "prompt": request.prompt,
        "width": request.width,
        "height": request.height,
        "req_type": request.req_type,
        "defry": request.defry,
    });
    post_zip_like(AUGMENT_IMAGE_URL, &token, payload, request.allow_invalid_tls, request.proxy_url.as_deref()).await
}

#[tauri::command]
async fn encode_vibe(request: EncodeVibeRequest) -> Result<String, String> {
    let token = read_token()?;
    let payload = serde_json::json!({
        "image": request.image,
        "model": request.model,
        "information_extracted": request.information_extracted,
        "crop_to_mask": false,
    });
    let client = api_client(request.allow_invalid_tls, request.proxy_url.as_deref())?;
    let response = client
        .post(ENCODE_VIBE_URL)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .json(&payload)
        .send()
        .await
        .map_err(to_error)?;
    let status = response.status();
    let body = response.bytes().await.map_err(to_error)?.to_vec();

    if !status.is_success() {
        return Err(format_api_error(status.as_u16(), &body));
    }

    Ok(BASE64.encode(body))
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

#[tauri::command]
fn append_app_log(level: String, source: String, message: String) -> Result<String, String> {
    let mut dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("novelai-gui");
    dir.push("logs");
    fs::create_dir_all(&dir).map_err(to_error)?;

    let mut file_path = dir;
    file_path.push("novelai-gui.log.txt");

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(to_error)?
        .as_secs();
    let level = sanitize_log_field(&level).to_ascii_uppercase();
    let source = sanitize_log_field(&source);
    let message = sanitize_log_message(&message);
    let line = format!("[{timestamp}] [{level}] [{source}] {message}\n");

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .map_err(to_error)?;
    file.write_all(line.as_bytes()).map_err(to_error)?;
    Ok(file_path.to_string_lossy().to_string())
}

fn read_token() -> Result<String, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, ACCOUNT_NAME).map_err(to_error)?;
    match entry.get_password() {
        Ok(token) if !token.trim().is_empty() => Ok(token),
        Ok(_) | Err(keyring::Error::NoEntry) => Err("API Token is not configured".to_string()),
        Err(err) => Err(to_error(err)),
    }
}

async fn get_json(client: &reqwest::Client, token: &str, url: &str) -> Result<serde_json::Value, String> {
    let response = client
        .get(url)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .await
        .map_err(to_error)?;

    response_json(response).await
}

async fn response_json(response: reqwest::Response) -> Result<serde_json::Value, String> {
    let status = response.status();
    let body = response.bytes().await.map_err(to_error)?.to_vec();

    if !status.is_success() {
        return Err(format_api_error(status.as_u16(), &body));
    }

    serde_json::from_slice(&body).map_err(to_error)
}

async fn post_zip_like(
    url: &str,
    token: &str,
    payload: serde_json::Value,
    allow_invalid_tls: bool,
    proxy_url: Option<&str>,
) -> Result<GenerateImageResponse, String> {
    let client = api_client(allow_invalid_tls, proxy_url)?;
    let response = client
        .post(url)
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

    Ok(GenerateImageResponse {
        content_type: content_type.clone(),
        images: decode_generated_images(&content_type, body)?,
    })
}

fn api_client(allow_invalid_tls: bool, proxy_url: Option<&str>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().danger_accept_invalid_certs(allow_invalid_tls);
    if let Some(url) = proxy_url.map(str::trim).filter(|url| !url.is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(url).map_err(to_error)?);
    }
    builder.build().map_err(to_error)
}

fn build_character_captions(characters: &[CharacterPrompt]) -> Vec<CharacterCaptionPayload> {
    characters
        .iter()
        .filter_map(|character| {
            let prompt = character.prompt.trim();
            if prompt.is_empty() {
                return None;
            }

            Some(CharacterCaptionPayload {
                prompt: prompt.to_string(),
                negative_prompt: character.negative_prompt.trim().to_string(),
                centers: vec![serde_json::json!({
                    "x": clamp_coordinate(character.x),
                    "y": clamp_coordinate(character.y)
                })],
            })
        })
        .collect()
}

fn clamp_coordinate(value: f32) -> f32 {
    if !value.is_finite() {
        return 0.5;
    }
    value.clamp(0.0, 1.0)
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

fn sanitize_log_field(value: &str) -> String {
    let cleaned = value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
        .collect::<String>();
    if cleaned.is_empty() {
        "app".to_string()
    } else {
        cleaned
    }
}

fn sanitize_log_message(value: &str) -> String {
    let collapsed = value.replace(['\r', '\n'], " ");
    collapsed.chars().take(4000).collect()
}

fn to_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn is_v4_image_model(model: &str) -> bool {
    model.contains("diffusion-4")
}

fn effective_image_model(model: &str, action: &str) -> String {
    if action != "infill" || model.contains("inpainting") {
        return model.to_string();
    }

    match model {
        "nai-diffusion-4-5-full" => "nai-diffusion-4-5-full-inpainting",
        "nai-diffusion-4-5-curated" => "nai-diffusion-4-5-curated-inpainting",
        "nai-diffusion-4-full" => "nai-diffusion-4-full-inpainting",
        "nai-diffusion-4-curated-preview" => "nai-diffusion-4-curated-preview-inpainting",
        "nai-diffusion-3" => "nai-diffusion-3-inpainting",
        "nai-diffusion" => "nai-diffusion-inpainting",
        "safe-diffusion" => "safe-diffusion-inpainting",
        "nai-diffusion-furry" => "furry-diffusion-inpainting",
        _ => model,
    }
    .to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            has_api_token,
            save_api_token,
            get_account_status,
            generate_image,
            suggest_tags,
            upscale_image,
            augment_image,
            encode_vibe,
            save_generated_image,
            append_app_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
