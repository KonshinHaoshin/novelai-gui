use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use futures_util::StreamExt;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::fs::OpenOptions;
use std::io::{Cursor, Read, Write};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

const SERVICE_NAME: &str = "novelai-gui";
const ACCOUNT_NAME: &str = "novelai-api-token";
const GENERATE_IMAGE_URL: &str = "https://image.novelai.net/ai/generate-image";
const GENERATE_IMAGE_STREAM_URL: &str = "https://image.novelai.net/ai/generate-image-stream";
const AUGMENT_IMAGE_URL: &str = "https://image.novelai.net/ai/augment-image";
const ENCODE_VIBE_URL: &str = "https://image.novelai.net/ai/encode-vibe";
const SUGGEST_TAGS_URL: &str = "https://image.novelai.net/ai/generate-image/suggest-tags";
const UPSCALE_IMAGE_URL: &str = "https://image.novelai.net/ai/upscale";
const USER_DATA_URL: &str = "https://image.novelai.net/user/data";
const USER_INFORMATION_URL: &str = "https://image.novelai.net/user/information";
const USER_SUBSCRIPTION_URL: &str = "https://image.novelai.net/user/subscription";
const SHARED_PRESETS_DIR: &str = "IDLECLOUD";
const SHARED_PRESETS_FILE: &str = "shared-presets.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
struct SharedPreset {
    id: String,
    kind: String,
    name: String,
    group: Option<String>,
    payload: serde_json::Value,
    thumbnail: Option<String>,
    created_at: i64,
}

#[derive(Debug, Deserialize, Serialize)]
struct SharedPresetDocument {
    version: u32,
    presets: Vec<SharedPreset>,
}

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
    #[serde(default)]
    pub transparent_background: bool,
    pub uc_preset: u32,
    pub params_version: u32,
    pub dynamic_thresholding: bool,
    pub sm: bool,
    pub sm_dyn: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip_cfg_above_sigma: Option<f32>,
    pub deliberate_euler_ancestral_bug: bool,
    pub prefer_brownian: bool,
    #[serde(default)]
    pub add_original_image: bool,
    #[serde(default)]
    pub legacy_v3_extend: bool,
    #[serde(default)]
    pub tag_hint_qt: Option<u32>,
    #[serde(default)]
    pub upscale_blur_sigma: Option<f32>,
    #[serde(default)]
    pub upscaled_enhance: bool,
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
    pub reference_images: Vec<String>,
    #[serde(default)]
    pub reference_strengths: Vec<f32>,
    #[serde(default)]
    pub reference_information_extracted_multiple: Vec<f32>,
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
    pub director_reference_images: Vec<String>,
    #[serde(default)]
    pub director_reference_mode: Option<String>,
    #[serde(default)]
    pub controlnet_condition: Option<String>,
    #[serde(default)]
    pub controlnet_model: Option<String>,
    #[serde(default)]
    pub controlnet_strength: Option<f32>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedImage {
    pub file_name: String,
    pub mime_type: String,
    pub byte_len: usize,
    pub base64: String,
    pub index: Option<u32>,
    pub seed: Option<u64>,
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
    pub model: String,
    #[serde(default)]
    pub declared_blur_sigma: Option<f32>,
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
    pub mask: Option<String>,
    #[serde(default)]
    pub crop_to_mask: bool,
    #[serde(default)]
    pub focus_seed: Option<u64>,
    #[serde(default)]
    pub info_extract_seed: Option<u64>,
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

fn shared_presets_path() -> Result<PathBuf, String> {
    let mut directory = dirs::data_dir().ok_or_else(|| "无法定位用户数据目录".to_string())?;
    directory.push(SHARED_PRESETS_DIR);
    fs::create_dir_all(&directory).map_err(to_error)?;
    directory.push(SHARED_PRESETS_FILE);
    Ok(directory)
}

#[tauri::command]
fn load_shared_presets() -> Result<Option<Vec<SharedPreset>>, String> {
    let path = shared_presets_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(path).map_err(to_error)?;
    let value: serde_json::Value = serde_json::from_str(&contents).map_err(to_error)?;
    if let Some(document) = value.as_object() {
        let document: SharedPresetDocument =
            serde_json::from_value(serde_json::Value::Object(document.clone()))
                .map_err(to_error)?;
        return Ok(Some(document.presets));
    }

    // Accept an older/simple array export as well, so a hand-copied preset
    // file can be imported without a one-off migration.
    let presets: Vec<SharedPreset> = serde_json::from_value(value).map_err(to_error)?;
    Ok(Some(presets))
}

#[tauri::command]
fn save_shared_presets(presets: Vec<SharedPreset>) -> Result<(), String> {
    let path = shared_presets_path()?;
    let temporary_path = path.with_file_name(format!(".shared-presets.{}.tmp", std::process::id()));
    let document = SharedPresetDocument {
        version: 1,
        presets,
    };
    let contents = serde_json::to_vec_pretty(&document).map_err(to_error)?;
    fs::write(&temporary_path, contents).map_err(to_error)?;
    fs::rename(&temporary_path, &path).map_err(to_error)
}

fn build_image_payload(request: &ImageGenerateRequest, streaming: bool) -> Result<Value, String> {
    if request.prompt.trim().is_empty() {
        return Err("Prompt cannot be empty".to_string());
    }

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
        "tag_hint_uc_preset": request.uc_preset,
        "params_version": request.params_version,
        "dynamic_thresholding": request.dynamic_thresholding,
        "sm": request.sm,
        "sm_dyn": request.sm_dyn,
        "deliberate_euler_ancestral_bug": request.deliberate_euler_ancestral_bug,
        "prefer_brownian": request.prefer_brownian,
    });

    if is_modern_image_model(&api_model) {
        let character_captions = build_character_captions(&request.characters);
        let use_coords = request.use_character_coords && !character_captions.is_empty();
        parameters["legacy"] = serde_json::json!(false);
        parameters["legacy_uc"] = serde_json::json!(false);
        parameters["add_original_image"] = serde_json::json!(request.add_original_image);
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

    if request.legacy_v3_extend {
        parameters["legacy_v3_extend"] = serde_json::json!(true);
    }
    if request.transparent_background && is_v5_image_model(&api_model) {
        parameters["tag_hint_transparent_background"] = serde_json::json!(true);
        parameters["straight_alpha"] = serde_json::json!(true);
    }
    if let Some(tag_hint_qt) = request.tag_hint_qt {
        parameters["tag_hint_qt"] = serde_json::json!(tag_hint_qt);
    }
    if request.upscaled_enhance {
        parameters["upscaled_enhance"] = serde_json::json!(true);
    }
    if let Some(sigma) = request.upscale_blur_sigma {
        parameters["upscale"] = serde_json::json!({ "declared_blur_sigma": sigma });
    }
    if streaming {
        parameters["stream"] = serde_json::json!("sse");
    }

    if let Some(seed) = request.seed {
        parameters["seed"] = serde_json::json!(seed);
    }
    if let Some(value) = request.skip_cfg_above_sigma {
        parameters["skip_cfg_above_sigma"] = serde_json::json!(value);
    }
    if let Some(image) = request
        .source_image
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        parameters["image"] = serde_json::json!(image);
    }
    if let Some(mask) = request
        .mask_image
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
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

    let mut reference_images = request
        .reference_images
        .iter()
        .filter(|value| !value.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>();
    if reference_images.is_empty() {
        if let Some(image) = request
            .reference_image
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            reference_images.push(image.to_string());
        }
    }
    if reference_images.len() > 1 {
        let strengths = if request.reference_strengths.len() == reference_images.len() {
            request.reference_strengths.clone()
        } else {
            vec![request.reference_strength.unwrap_or(0.6); reference_images.len()]
        };
        let extracted =
            if request.reference_information_extracted_multiple.len() == reference_images.len() {
                request.reference_information_extracted_multiple.clone()
            } else {
                vec![request.reference_information_extracted.unwrap_or(0.6); reference_images.len()]
            };
        parameters["reference_image_multiple"] = serde_json::json!(reference_images);
        parameters["reference_strength_multiple"] = serde_json::json!(strengths);
        parameters["reference_information_extracted_multiple"] = serde_json::json!(extracted);
    } else if let Some(image) = reference_images.first() {
        parameters["reference_image"] = serde_json::json!(image);
        parameters["reference_strength"] =
            serde_json::json!(request.reference_strength.unwrap_or(0.6));
        parameters["reference_information_extracted"] =
            serde_json::json!(request.reference_information_extracted.unwrap_or(0.6));
    }

    let mut director_images = request
        .director_reference_images
        .iter()
        .filter(|value| !value.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>();
    if director_images.is_empty() {
        if let Some(image) = request
            .director_reference_image
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            director_images.push(image.to_string());
        }
    }
    if !director_images.is_empty() {
        let mode = request
            .director_reference_mode
            .as_deref()
            .filter(|value| *value == "character" || *value == "character&style")
            .unwrap_or("character");
        let helper_prompt = request
            .director_reference_prompt
            .as_deref()
            .filter(|value| !value.trim().is_empty());
        let descriptions = director_images
            .iter()
            .map(|_| {
                let char_captions = helper_prompt
                    .map(|prompt| {
                        serde_json::json!([{
                            "char_caption": prompt,
                            "centers": [{ "x": 0.5, "y": 0.5 }]
                        }])
                    })
                    .unwrap_or_else(|| serde_json::json!([]));
                serde_json::json!({
                    "caption": {
                        "base_caption": mode,
                        "char_captions": char_captions
                    },
                    "use_coords": false,
                    "use_order": true
                })
            })
            .collect::<Vec<_>>();
        parameters["director_reference_images"] = serde_json::json!(director_images);
        parameters["director_reference_descriptions"] = serde_json::json!(descriptions);
        parameters["director_reference_strength_values"] =
            serde_json::json!(vec![
                request.director_reference_strength.unwrap_or(0.6);
                descriptions.len()
            ]);
        parameters["director_reference_secondary_strength_values"] = serde_json::json!(vec![
                request
                    .director_reference_secondary_strength
                    .unwrap_or(0.4);
                descriptions.len()
            ]);
        parameters["director_reference_information_extracted"] = serde_json::json!(vec![
                request
                    .director_reference_information_extracted
                    .unwrap_or(0.6);
                descriptions.len()
            ]);
    }

    if let Some(condition) = request
        .controlnet_condition
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        parameters["controlnet_condition"] = serde_json::json!(condition);
        if let Some(model) = request
            .controlnet_model
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            parameters["controlnet_model"] = serde_json::json!(model);
        }
        if let Some(strength) = request.controlnet_strength {
            parameters["controlnet_strength"] = serde_json::json!(strength);
        }
    }

    Ok(serde_json::json!({
        "input": request.prompt,
        "model": api_model,
        "action": request.action,
        "parameters": parameters,
    }))
}

#[tauri::command]
async fn generate_image(request: ImageGenerateRequest) -> Result<GenerateImageResponse, String> {
    let token = read_token()?;
    let payload = build_image_payload(&request, false)?;
    let client = api_client(request.allow_invalid_tls, request.proxy_url.as_deref())?;
    let response = client
        .post(GENERATE_IMAGE_URL)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .json(&payload)
        .send()
        .await
        .map_err(|error| {
            format_request_error(error, GENERATE_IMAGE_URL, request.proxy_url.as_deref())
        })?;

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageStreamEvent {
    kind: String,
    message: Option<String>,
    image: Option<GeneratedImage>,
}

fn emit_image_stream_event(
    app: &AppHandle,
    kind: &str,
    message: Option<String>,
    image: Option<GeneratedImage>,
) {
    let _ = app.emit(
        "image-generation-event",
        ImageStreamEvent {
            kind: kind.to_string(),
            message,
            image,
        },
    );
}

#[tauri::command]
async fn generate_image_stream(
    app: AppHandle,
    request: ImageGenerateRequest,
) -> Result<GenerateImageResponse, String> {
    let token = read_token()?;
    let payload = build_image_payload(&request, true)?;
    let client = api_client(request.allow_invalid_tls, request.proxy_url.as_deref())?;
    emit_image_stream_event(
        &app,
        "progress",
        Some("已连接 NovelAI 流式生成。".to_string()),
        None,
    );
    let response = client
        .post(GENERATE_IMAGE_STREAM_URL)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .header("Accept", "text/event-stream")
        .json(&payload)
        .send()
        .await
        .map_err(|error| {
            format_request_error(
                error,
                GENERATE_IMAGE_STREAM_URL,
                request.proxy_url.as_deref(),
            )
        })?;

    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("text/event-stream")
        .to_string();
    if !status.is_success() {
        let body = response.bytes().await.map_err(to_error)?.to_vec();
        return Err(format_api_error(status.as_u16(), &body));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut event_data = Vec::<String>::new();
    let mut images = Vec::new();
    let mut seen = HashSet::new();
    let mut event_index = 0usize;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(to_error)?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(newline) = buffer.find('\n') {
            let line = buffer[..newline].trim_end_matches('\r').to_string();
            buffer.drain(..=newline);
            if line.is_empty() {
                if !event_data.is_empty() {
                    process_stream_event(
                        &event_data.join("\n"),
                        &app,
                        &mut images,
                        &mut seen,
                        &mut event_index,
                    )?;
                    event_data.clear();
                }
            } else if let Some(data) = line.strip_prefix("data:") {
                event_data.push(data.trim_start().to_string());
            }
        }
    }
    if !buffer.trim().is_empty() {
        for line in buffer.lines() {
            if let Some(data) = line.strip_prefix("data:") {
                event_data.push(data.trim_start().to_string());
            }
        }
    }
    if !event_data.is_empty() {
        process_stream_event(
            &event_data.join("\n"),
            &app,
            &mut images,
            &mut seen,
            &mut event_index,
        )?;
    }

    if images.is_empty() {
        return Err("NovelAI 流式响应未包含可识别的图片。".to_string());
    }
    emit_image_stream_event(
        &app,
        "complete",
        Some(format!("生成完成，共 {} 张图。", images.len())),
        None,
    );
    Ok(GenerateImageResponse {
        content_type,
        images,
    })
}

#[tauri::command]
async fn get_account_status(
    allow_invalid_tls: bool,
    proxy_url: Option<String>,
) -> Result<serde_json::Value, String> {
    let token = read_token()?;
    let client = api_client(allow_invalid_tls, proxy_url.as_deref())?;
    let data = get_json(&client, &token, USER_DATA_URL, proxy_url.as_deref()).await?;
    let information = get_json(&client, &token, USER_INFORMATION_URL, proxy_url.as_deref())
        .await
        .ok();
    let subscription = get_json(&client, &token, USER_SUBSCRIPTION_URL, proxy_url.as_deref())
        .await
        .ok();

    Ok(serde_json::json!({
        "data": data,
        "information": information,
        "subscription": subscription
    }))
}

#[tauri::command]
async fn suggest_tags(
    model: String,
    prompt: String,
    lang: Option<String>,
    allow_invalid_tls: bool,
    proxy_url: Option<String>,
) -> Result<serde_json::Value, String> {
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
        .map_err(|error| format_request_error(error, SUGGEST_TAGS_URL, proxy_url.as_deref()))?;

    response_json(response).await
}

#[tauri::command]
async fn upscale_image(request: UpscaleImageRequest) -> Result<GenerateImageResponse, String> {
    if request.image.trim().is_empty() {
        return Err("Upscale image cannot be empty".to_string());
    }
    if request.model.trim().is_empty() {
        return Err("Upscale model cannot be empty".to_string());
    }
    if let Some(sigma) = request.declared_blur_sigma {
        const ALLOWED_SIGMAS: [f32; 6] = [0.0, 0.30, 0.35, 0.40, 0.45, 0.50];
        if !sigma.is_finite()
            || !ALLOWED_SIGMAS
                .iter()
                .any(|allowed| (sigma - allowed).abs() < f32::EPSILON)
        {
            return Err(
                "declared_blur_sigma must be one of 0, 0.30, 0.35, 0.40, 0.45 or 0.50".to_string(),
            );
        }
    }

    let token = read_token()?;
    let mut payload = serde_json::json!({
        "image": request.image,
        "model": request.model,
    });
    if let Some(sigma) = request.declared_blur_sigma {
        payload["declared_blur_sigma"] = serde_json::json!(sigma);
    }
    post_zip_like(
        UPSCALE_IMAGE_URL,
        &token,
        payload,
        request.allow_invalid_tls,
        request.proxy_url.as_deref(),
    )
    .await
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
    post_zip_like(
        AUGMENT_IMAGE_URL,
        &token,
        payload,
        request.allow_invalid_tls,
        request.proxy_url.as_deref(),
    )
    .await
}

#[tauri::command]
async fn encode_vibe(request: EncodeVibeRequest) -> Result<String, String> {
    let token = read_token()?;
    let payload = serde_json::json!({
        "image": request.image,
        "model": request.model,
        "information_extracted": request.information_extracted,
        "mask": request.mask,
        "crop_to_mask": request.crop_to_mask,
        "focus_seed": request.focus_seed,
        "info_extract_seed": request.info_extract_seed,
    });
    let client = api_client(request.allow_invalid_tls, request.proxy_url.as_deref())?;
    let response = client
        .post(ENCODE_VIBE_URL)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .json(&payload)
        .send()
        .await
        .map_err(|error| {
            format_request_error(error, ENCODE_VIBE_URL, request.proxy_url.as_deref())
        })?;
    let status = response.status();
    let body = response.bytes().await.map_err(to_error)?.to_vec();

    if !status.is_success() {
        return Err(format_api_error(status.as_u16(), &body));
    }

    Ok(BASE64.encode(body))
}

#[tauri::command]
fn save_generated_image(
    file_name: String,
    base64: String,
    save_directory: Option<String>,
) -> Result<String, String> {
    let bytes = BASE64.decode(base64).map_err(to_error)?;
    let safe_name = sanitize_file_name(&file_name);
    let mut dir = save_directory
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(default_save_directory);
    fs::create_dir_all(&dir).map_err(to_error)?;
    dir.push(safe_name);
    fs::write(&dir, bytes).map_err(to_error)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn pick_save_directory(app: AppHandle) -> Result<Option<String>, String> {
    let default = default_save_directory();
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .set_title("选择图片保存目录")
        .set_directory(default)
        .pick_folder(move |folder| {
            let _ = tx.send(folder.and_then(|path| path.into_path().ok()));
        });

    let chosen = rx.await.unwrap_or(None);
    Ok(chosen.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    let target = PathBuf::from(path.trim());
    if !target.is_file() {
        return Err("图片文件不存在，请先重新保存图片。".to_string());
    }

    let target_string = target.to_string_lossy().to_string();
    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .args(["-R", target_string.as_str()])
        .status()
        .map_err(to_error)?;

    #[cfg(target_os = "windows")]
    let status = Command::new("explorer")
        .args(["/select,", target_string.as_str()])
        .status()
        .map_err(to_error)?;

    #[cfg(target_os = "linux")]
    let status = Command::new("xdg-open")
        .arg(target.parent().unwrap_or_else(|| std::path::Path::new(".")))
        .status()
        .map_err(to_error)?;

    if status.success() {
        Ok(())
    } else {
        Err("系统文件管理器无法打开该位置。".to_string())
    }
}

fn default_save_directory() -> PathBuf {
    let mut dir = dirs::picture_dir()
        .or_else(dirs::download_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    dir.push("NovelAI GUI");
    dir
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

async fn get_json(
    client: &reqwest::Client,
    token: &str,
    url: &str,
    proxy_url: Option<&str>,
) -> Result<serde_json::Value, String> {
    let response = client
        .get(url)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .await
        .map_err(|error| format_request_error(error, url, proxy_url))?;

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
        .map_err(|error| format_request_error(error, url, proxy_url))?;

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

fn process_stream_event(
    data: &str,
    app: &AppHandle,
    images: &mut Vec<GeneratedImage>,
    seen: &mut HashSet<String>,
    event_index: &mut usize,
) -> Result<(), String> {
    let trimmed = data.trim();
    if trimmed.is_empty() || trimmed == "[DONE]" {
        return Ok(());
    }

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if let Some(error) = value
            .get("error")
            .and_then(Value::as_str)
            .filter(|message| !message.trim().is_empty())
        {
            emit_image_stream_event(app, "error", Some(error.to_string()), None);
            return Err(error.to_string());
        }

        let mut found_image = false;
        collect_stream_images(&value, *event_index, &mut |image| {
            found_image = true;
            if seen.insert(image.base64.clone()) {
                let image = image.clone();
                emit_image_stream_event(
                    app,
                    "image",
                    Some(format!("收到第 {} 张图。", *event_index + 1)),
                    Some(image.clone()),
                );
                images.push(image);
                *event_index += 1;
            }
        });
        if found_image {
            return Ok(());
        }

        let label = ["event", "type", "eventType", "status", "phase", "message"]
            .iter()
            .find_map(|key| value.get(*key).and_then(Value::as_str))
            .map(str::to_string)
            .unwrap_or_else(|| "生成处理中…".to_string());
        emit_image_stream_event(app, "progress", Some(label), None);
        return Ok(());
    }

    if let Some(image) = decode_stream_image(trimmed, *event_index, None) {
        if seen.insert(image.base64.clone()) {
            emit_image_stream_event(
                app,
                "image",
                Some(format!("收到第 {} 张图。", *event_index + 1)),
                Some(image.clone()),
            );
            images.push(image);
            *event_index += 1;
        }
    } else {
        emit_image_stream_event(app, "progress", Some("生成处理中…".to_string()), None);
    }
    Ok(())
}

fn collect_stream_images<F>(value: &Value, fallback_index: usize, on_image: &mut F)
where
    F: FnMut(&GeneratedImage),
{
    if let Some(array) = value.as_array() {
        for item in array {
            collect_stream_images(item, fallback_index, on_image);
        }
        return;
    }

    if let Some(encoded) = value.as_str() {
        if let Some(image) = decode_stream_image(encoded, fallback_index, None) {
            on_image(&image);
        }
        return;
    }

    let Some(object) = value.as_object() else {
        return;
    };
    let index = object
        .get("index")
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(fallback_index);
    let seed = object.get("seed").and_then(Value::as_u64);

    for key in ["image", "images", "data", "output", "result"] {
        if let Some(child) = object.get(key) {
            if let Some(encoded) = child.as_str() {
                if let Some(image) = decode_stream_image(encoded, index, seed) {
                    on_image(&image);
                } else if let Ok(nested) = serde_json::from_str::<Value>(encoded) {
                    collect_stream_images(&nested, index, on_image);
                }
            } else {
                collect_stream_images(child, index, on_image);
            }
        }
    }
}

fn decode_stream_image(encoded: &str, index: usize, seed: Option<u64>) -> Option<GeneratedImage> {
    let encoded = encoded.trim();
    let (mime_type, payload) = if let Some(data) = encoded.strip_prefix("data:") {
        let (mime, base64) = data.split_once(";base64,")?;
        (mime.to_string(), base64)
    } else {
        (String::new(), encoded)
    };
    let bytes = BASE64.decode(payload.replace(['\n', '\r', ' '], "")).ok()?;
    let mime_type = if mime_type.is_empty() {
        mime_from_bytes(&bytes)?.to_string()
    } else {
        mime_type
    };
    Some(GeneratedImage {
        file_name: default_file_name(&mime_type, index),
        mime_type,
        byte_len: bytes.len(),
        base64: BASE64.encode(bytes),
        index: Some(index as u32),
        seed,
    })
}

fn decode_generated_images(
    content_type: &str,
    body: Vec<u8>,
) -> Result<Vec<GeneratedImage>, String> {
    let lower = content_type.to_ascii_lowercase();
    if lower.contains("application/zip") || lower.contains("application/x-zip") {
        return decode_zip_images(body);
    }

    if lower.contains("application/json") {
        let value = serde_json::from_slice::<serde_json::Value>(&body).map_err(to_error)?;
        return decode_json_images(&value);
    }

    if lower.contains("image/png") || lower.contains("image/jpeg") || lower.contains("image/webp") {
        return Ok(vec![GeneratedImage {
            file_name: default_file_name(content_type, 0),
            mime_type: normalize_image_mime(content_type),
            byte_len: body.len(),
            base64: BASE64.encode(body),
            index: Some(0),
            seed: None,
        }]);
    }

    decode_zip_images(body.clone()).or_else(|_| {
        Ok(vec![GeneratedImage {
            file_name: "novelai-output.bin".to_string(),
            mime_type: "application/octet-stream".to_string(),
            byte_len: body.len(),
            base64: BASE64.encode(body),
            index: Some(0),
            seed: None,
        }])
    })
}

fn decode_json_images(value: &serde_json::Value) -> Result<Vec<GeneratedImage>, String> {
    let entries = value
        .get("images")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "The API JSON response did not contain an images array".to_string())?;
    let mut images = Vec::with_capacity(entries.len());

    for (index, entry) in entries.iter().enumerate() {
        let encoded = entry
            .get("image")
            .and_then(serde_json::Value::as_str)
            .or_else(|| {
                entry
                    .get("image")
                    .and_then(serde_json::Value::as_object)
                    .and_then(|image| image.get("image"))
                    .and_then(serde_json::Value::as_str)
            })
            .filter(|image| !image.trim().is_empty())
            .ok_or_else(|| format!("The API JSON response image {index} was empty"))?;
        let (mime_type, payload) = if let Some(data) = encoded.strip_prefix("data:") {
            let (mime, base64) = data.split_once(";base64,").ok_or_else(|| {
                format!("The API JSON response image {index} was not valid base64")
            })?;
            (mime.to_string(), base64)
        } else {
            ("image/png".to_string(), encoded)
        };
        let bytes = BASE64.decode(payload).map_err(to_error)?;
        images.push(GeneratedImage {
            file_name: default_file_name(&mime_type, index),
            mime_type,
            byte_len: bytes.len(),
            base64: BASE64.encode(bytes),
            index: entry
                .get("index")
                .and_then(serde_json::Value::as_u64)
                .map(|value| value as u32),
            seed: entry.get("seed").and_then(serde_json::Value::as_u64),
        });
    }

    if images.is_empty() {
        return Err("The API JSON response did not contain any images".to_string());
    }

    Ok(images)
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
            index: Some(index as u32),
            seed: None,
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

fn mime_from_bytes(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
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

fn format_request_error(error: reqwest::Error, url: &str, proxy_url: Option<&str>) -> String {
    let proxy = proxy_url.map(str::trim).filter(|value| !value.is_empty());
    let target = proxy
        .map(|value| format!("代理 {value}"))
        .unwrap_or_else(|| "当前网络".to_string());

    if error.is_timeout() {
        return format!("连接 NovelAI 超时（{url}，使用{target}）。请检查网络或代理设置。",);
    }

    if error.is_connect() {
        return format!("无法连接 NovelAI（{url}，使用{target}）。请检查网络或代理地址是否可用。",);
    }

    format!("NovelAI 请求失败（{url}）：{}", error)
}

fn is_modern_image_model(model: &str) -> bool {
    model.contains("diffusion-4") || model.contains("diffusion-5")
}

fn is_v5_image_model(model: &str) -> bool {
    model.contains("diffusion-5")
}

fn effective_image_model(model: &str, action: &str) -> String {
    if action != "infill" || model.contains("inpainting") {
        return model.to_string();
    }

    match model {
        "nai-diffusion-5-full" => "nai-diffusion-5-full-inpainting",
        "nai-diffusion-5-curated" => "nai-diffusion-4-5-curated-inpainting",
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            has_api_token,
            save_api_token,
            get_account_status,
            generate_image,
            generate_image_stream,
            suggest_tags,
            upscale_image,
            augment_image,
            encode_vibe,
            save_generated_image,
            pick_save_directory,
            reveal_in_finder,
            append_app_log,
            load_shared_presets,
            save_shared_presets
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
