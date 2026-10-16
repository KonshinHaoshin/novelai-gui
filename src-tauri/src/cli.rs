//! Terminal entry point; uses the same payload builder, credentials and API as the GUI.
use super::*;
use clap::{Args, Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "novelai-cli",
    version,
    about = "NovelAI image generation and local OpenAI-compatible text API"
)]
struct Cli {
    #[command(subcommand)]
    command: CliCommand,
}

#[derive(Subcommand)]
enum CliCommand {
    /// Serve a local OpenAI-compatible text API until Ctrl+C
    Serve(ServeArgs),
    /// Print the local gateway key (not the NovelAI account token)
    GatewayKey,
    /// Generate images, or edit an existing image with an optional mask
    Generate(Box<GenerateArgs>),
    /// Print account data, subscription and Anlas information as JSON
    Account(NetworkArgs),
    /// Browse presets saved by the GUI
    Presets {
        #[command(subcommand)]
        command: PresetCommand,
    },
    /// Manage the API token shared with the desktop GUI
    Token {
        #[command(subcommand)]
        command: TokenCommand,
    },
}

#[derive(Subcommand)]
enum TokenCommand {
    /// Report whether an environment or saved token is available (never prints it)
    Status,
    /// Save NOVELAI_API_TOKEN, or read a token from standard input with --stdin
    Set {
        #[arg(long)]
        stdin: bool,
    },
}

#[derive(Subcommand)]
enum PresetCommand {
    /// List preset names, IDs, types and groups as JSON
    List {
        #[command(flatten)]
        source: PresetSource,
        #[arg(long, value_parser = ["params", "prompt_template"])]
        kind: Option<String>,
    },
}

#[derive(Args, Default)]
struct PresetSource {
    /// Use a shared preset JSON document/array instead of the GUI's shared store
    #[arg(long)]
    presets_file: Option<PathBuf>,
}

#[derive(Args, Default)]
struct NetworkArgs {
    /// HTTP(S) proxy URL, independent of the GUI's saved settings
    #[arg(long)]
    proxy: Option<String>,
    /// Accept invalid TLS certificates
    #[arg(long)]
    allow_invalid_tls: bool,
}

#[derive(Args)]
struct ServeArgs {
    #[arg(long, default_value = "127.0.0.1")]
    host: String,
    #[arg(long, default_value_t = 18765)]
    port: u16,
    #[command(flatten)]
    network: NetworkArgs,
}

#[derive(Args, Default)]
struct GenerateArgs {
    /// Partial ImageGenerateRequest JSON (camelCase); flags override these values
    #[arg(long)]
    request: Option<PathBuf>,
    /// Apply a GUI preset by exact name or ID; repeat to combine presets
    #[arg(long)]
    preset: Vec<String>,
    #[command(flatten)]
    preset_source: PresetSource,
    /// Style tags placed before the main prompt; overrides preset style tags
    #[arg(long)]
    style_prompt: Option<String>,
    #[arg(short, long)]
    prompt: Option<String>,
    #[arg(long)]
    negative_prompt: Option<String>,
    /// Default: nai-diffusion-4-5-full
    #[arg(long)]
    model: Option<String>,
    /// Inferred from --image / --mask when omitted
    #[arg(long, value_parser = ["generate", "img2img", "infill"])]
    action: Option<String>,
    /// Source PNG/JPEG/WebP; dimensions are inferred unless explicitly supplied
    #[arg(long)]
    image: Option<PathBuf>,
    /// Opaque grayscale PNG, same size as the source; white selects areas to repaint
    #[arg(long)]
    mask: Option<PathBuf>,
    #[arg(long)]
    width: Option<u32>,
    #[arg(long)]
    height: Option<u32>,
    #[arg(long)]
    steps: Option<u32>,
    #[arg(long)]
    scale: Option<f32>,
    #[arg(long)]
    cfg_rescale: Option<f32>,
    #[arg(long)]
    seed: Option<u64>,
    #[arg(long)]
    samples: Option<u32>,
    #[arg(long)]
    sampler: Option<String>,
    #[arg(long)]
    noise_schedule: Option<String>,
    /// Default: 0.55 for img2img, 1 for infill
    #[arg(long)]
    strength: Option<f32>,
    #[arg(long)]
    noise: Option<f32>,
    #[arg(long)]
    extra_noise_seed: Option<u64>,
    #[arg(long, value_parser = ["png", "webp"])]
    format: Option<String>,
    #[arg(long)]
    params_version: Option<u32>,
    /// Disable automatic quality tags
    #[arg(long)]
    no_quality: bool,
    #[arg(long)]
    no_color_correct: bool,
    /// Request V5 alpha transparency; selects V5 Full if no model was specified
    #[arg(long, conflicts_with = "no_transparent_background")]
    transparent_background: bool,
    /// Disable transparency inherited from a preset or JSON request
    #[arg(long)]
    no_transparent_background: bool,
    /// Each generation is saved to a new subdirectory under this directory
    #[arg(short, long, default_value = "outputs")]
    output_dir: PathBuf,
    /// Validate and print the API payload without credentials, network calls or file writes
    #[arg(long)]
    dry_run: bool,
    #[command(flatten)]
    network: NetworkArgs,
}

pub async fn run() -> Result<(), String> {
    match Cli::parse().command {
        CliCommand::Serve(args) => {
            let server = gateway::spawn(
                gateway::GatewayConfig {
                    host: args.host,
                    port: args.port,
                    allow_invalid_tls: args.network.allow_invalid_tls,
                    proxy_url: args.network.proxy,
                },
                cli_token()?,
            )
            .await?;
            print_json(
                &serde_json::json!({ "listening": server.status, "authentication": "Bearer local gateway key", "keyCommand": "novelai-cli gateway-key", "stop": "Ctrl+C" }),
            )?;
            tokio::signal::ctrl_c().await.map_err(to_error)?;
            server.stop().await;
            Ok(())
        }
        CliCommand::GatewayKey => {
            println!("{}", gateway::get_gateway_key()?);
            Ok(())
        }
        CliCommand::Generate(args) => generate(*args).await,
        CliCommand::Account(args) => {
            let value = account_status_with_token(
                args.allow_invalid_tls,
                args.proxy.as_deref(),
                &cli_token()?,
            )
            .await?;
            print_json(&value)
        }
        CliCommand::Presets {
            command: PresetCommand::List { source, kind },
        } => {
            let presets = read_presets(&source)?;
            let entries: Vec<Value> = presets.iter()
                .filter(|preset| kind.as_ref().is_none_or(|kind| &preset.kind == kind))
                .map(|preset| serde_json::json!({
                    "id": preset.id, "name": preset.name, "kind": preset.kind, "group": preset.group,
                })).collect();
            print_json(&Value::Array(entries))
        }
        CliCommand::Token { command } => match command {
            TokenCommand::Status => print_json(&serde_json::json!({
                "environmentToken": std::env::var("NOVELAI_API_TOKEN")
                    .map(|token| !token.trim().is_empty()).unwrap_or(false),
                "savedToken": has_api_token()?,
            })),
            TokenCommand::Set { stdin } => {
                let token = if stdin {
                    let mut token = String::new();
                    std::io::stdin()
                        .read_to_string(&mut token)
                        .map_err(to_error)?;
                    token
                } else {
                    std::env::var("NOVELAI_API_TOKEN")
                        .map_err(|_| "Set NOVELAI_API_TOKEN or use token set --stdin".to_string())?
                };
                save_api_token(token)?;
                print_json(&serde_json::json!({ "saved": true }))
            }
        },
    }
}

fn cli_token() -> Result<String, String> {
    match std::env::var("NOVELAI_API_TOKEN") {
        Ok(token) if !token.trim().is_empty() => Ok(token.trim().to_string()),
        Ok(_) => Err("NOVELAI_API_TOKEN is empty".to_string()),
        Err(std::env::VarError::NotPresent) => read_token(),
        Err(error) => Err(to_error(error)),
    }
}

fn default_request() -> Value {
    let mut value = serde_json::json!({
        "prompt": "", "stylePrompt": "", "negativePrompt": "", "characters": [], "useCharacterCoords": false,
        "model": "nai-diffusion-4-5-full", "action": "generate",
        "width": 832, "height": 1216, "nSamples": 1, "steps": 28, "scale": 5,
        "cfgRescale": 0, "sampler": "k_euler_ancestral", "noiseSchedule": "karras",
        "imageFormat": "png", "qualityToggle": true, "transparentBackground": false,
        "ucPreset": 0, "paramsVersion": 3, "dynamicThresholding": false,
        "sm": false, "smDyn": false, "skipCfgAboveSigma": null,
        "deliberateEulerAncestralBug": false, "preferBrownian": true,
        "addOriginalImage": false, "legacyV3Extend": false, "tagHintQt": null,
        "upscaleBlurSigma": null, "upscaledEnhance": false, "seed": null,
    });
    let editing = serde_json::json!({
        "sourceImage": null, "maskImage": null, "strength": 0.55, "noise": 0,
        "extraNoiseSeed": null, "colorCorrect": true,
        "referenceImage": null, "referenceStrength": null, "referenceInformationExtracted": null,
        "referenceImages": [], "referenceStrengths": [], "referenceInformationExtractedMultiple": [],
        "directorReferenceImage": null, "directorReferencePrompt": null,
        "directorReferenceStrength": null, "directorReferenceSecondaryStrength": null,
        "directorReferenceInformationExtracted": 1.0, "directorReferenceImages": [],
        "directorReferenceMode": null, "controlnetCondition": null, "controlnetModel": null,
        "controlnetStrength": null, "allowInvalidTls": false, "proxyUrl": null,
    });
    value
        .as_object_mut()
        .unwrap()
        .extend(editing.as_object().unwrap().clone());
    value
}

fn prepare_request(args: &GenerateArgs) -> Result<ImageGenerateRequest, String> {
    let mut value = default_request();
    let preset_keys = if args.preset.is_empty() {
        HashSet::new()
    } else {
        apply_presets(
            &mut value,
            &args.preset,
            &read_presets(&args.preset_source)?,
        )?
    };
    let file = if let Some(path) = &args.request {
        let content = fs::read(path).map_err(|error| format!("{}: {error}", path.display()))?;
        serde_json::from_slice::<Value>(&content).map_err(to_error)?
    } else {
        serde_json::json!({})
    };
    let object = file
        .as_object()
        .ok_or("--request must contain a JSON object")?;
    for (key, field) in object {
        if value.get(key).is_none() {
            return Err(format!(
                "Unknown request field '{key}'; use camelCase ImageGenerateRequest fields"
            ));
        }
        value[key] = field.clone();
    }
    macro_rules! apply {
        ($($field:ident => $key:literal),* $(,)?) => {
            $(if let Some(field) = &args.$field { value[$key] = serde_json::json!(field); })*
        };
    }
    apply!(
        prompt => "prompt", style_prompt => "stylePrompt", negative_prompt => "negativePrompt", model => "model",
        action => "action", width => "width", height => "height", steps => "steps",
        scale => "scale", cfg_rescale => "cfgRescale", seed => "seed", samples => "nSamples",
        sampler => "sampler", noise_schedule => "noiseSchedule", strength => "strength",
        noise => "noise", extra_noise_seed => "extraNoiseSeed", format => "imageFormat",
        params_version => "paramsVersion",
    );
    if args.no_quality {
        value["qualityToggle"] = false.into();
    }
    if args.no_color_correct {
        value["colorCorrect"] = false.into();
    }
    if args.transparent_background {
        value["transparentBackground"] = true.into();
    }
    if args.no_transparent_background {
        value["transparentBackground"] = false.into();
    }
    if args.network.allow_invalid_tls {
        value["allowInvalidTls"] = true.into();
    }
    if let Some(proxy) = &args.network.proxy {
        value["proxyUrl"] = proxy.clone().into();
    }

    for (path, key) in [(&args.image, "sourceImage"), (&args.mask, "maskImage")] {
        if let Some(path) = path {
            let bytes = fs::read(path).map_err(|error| format!("{}: {error}", path.display()))?;
            value[key] = BASE64.encode(bytes).into();
        }
    }
    if args.action.is_none()
        && !object.contains_key("action")
        && (value["sourceImage"].is_string()
            || value["maskImage"].is_string()
            || !preset_keys.contains("action"))
    {
        value["action"] = if value["maskImage"].is_string() {
            "infill"
        } else if value["sourceImage"].is_string() {
            "img2img"
        } else {
            "generate"
        }
        .into();
    }
    if value["action"] == "infill"
        && args.strength.is_none()
        && !object.contains_key("strength")
        && !preset_keys.contains("strength")
    {
        value["strength"] = 1.into();
    }
    let source_dimensions = value["sourceImage"]
        .as_str()
        .map(|encoded| {
            decode_input_image(encoded, "sourceImage").map(|image| (image.width(), image.height()))
        })
        .transpose()?;
    if let Some((width, height)) = source_dimensions {
        if args.width.is_none() && !object.contains_key("width") && !preset_keys.contains("width") {
            value["width"] = width.into();
        }
        if args.height.is_none()
            && !object.contains_key("height")
            && !preset_keys.contains("height")
        {
            value["height"] = height.into();
        }
    }
    let style = value["stylePrompt"]
        .as_str()
        .ok_or("stylePrompt must be a string")?;
    let main = value["prompt"].as_str().ok_or("prompt must be a string")?;
    let mut prompt = join_prompt(style, main);
    if value["transparentBackground"] == true {
        if args.model.is_none() && !object.contains_key("model") && !preset_keys.contains("model") {
            value["model"] = "nai-diffusion-5-full".into();
        }
        let model = value["model"].as_str().ok_or("model must be a string")?;
        if !is_v5_image_model(model) {
            return Err("Alpha transparency requires V5; use --model nai-diffusion-5-full or --no-transparent-background".into());
        }
        if value["action"] == "infill" || model.contains("inpainting") {
            return Err(
                "Alpha transparency is not supported for infill; use --no-transparent-background"
                    .into(),
            );
        }
        let has_tag = prompt.split(',').any(|tag| {
            // Also recognize weighted tags such as 2.1::transparent background::.
            tag.split("::").any(|part| {
                part.trim()
                    .trim_matches(['{', '}', '[', ']'])
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .eq_ignore_ascii_case("transparent background")
            })
        });
        if !prompt.is_empty() && !has_tag {
            prompt = join_prompt(&prompt, "transparent background");
        }
    }
    value["prompt"] = prompt.into();
    let request: ImageGenerateRequest = serde_json::from_value(value).map_err(to_error)?;
    validate_request(&request, source_dimensions)?;
    Ok(request)
}

fn join_prompt(left: &str, right: &str) -> String {
    match (left.trim(), right.trim()) {
        ("", right) => right.to_string(),
        (left, "") => left.to_string(),
        (left, right) => format!("{left}, {right}"),
    }
}

fn read_presets(source: &PresetSource) -> Result<Vec<SharedPreset>, String> {
    let path = match &source.presets_file {
        Some(path) => path.clone(),
        None => dirs::data_dir()
            .ok_or("Cannot locate the user data directory")?
            .join(SHARED_PRESETS_DIR)
            .join(SHARED_PRESETS_FILE),
    };
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error)
            if error.kind() == std::io::ErrorKind::NotFound && source.presets_file.is_none() =>
        {
            return Ok(Vec::new())
        }
        Err(error) => return Err(format!("{}: {error}", path.display())),
    };
    let value: Value = serde_json::from_slice(&bytes).map_err(to_error)?;
    let mut presets: Vec<SharedPreset> = if value.is_array() {
        serde_json::from_value(value).map_err(to_error)?
    } else {
        serde_json::from_value::<SharedPresetDocument>(value)
            .map_err(to_error)?
            .presets
    };
    presets.retain(|preset| {
        !(preset.kind == "prompt_template" && preset.id.starts_with("default-template-"))
    });
    Ok(presets)
}

fn find_preset<'a>(presets: &'a [SharedPreset], name: &str) -> Result<&'a SharedPreset, String> {
    let ids: Vec<_> = presets.iter().filter(|preset| preset.id == name).collect();
    let matches: Vec<_> = if ids.is_empty() {
        presets
            .iter()
            .filter(|preset| preset.name == name)
            .collect()
    } else {
        ids
    };
    match matches.as_slice() {
        [preset] => Ok(preset),
        [] => Err(format!("Preset '{name}' not found; run presets list")),
        _ => Err(format!(
            "Preset '{name}' is ambiguous; select an ID from presets list"
        )),
    }
}

// Keep in sync with CAMEL_TO_SHARED / snapshotPresetParams in src/presets.ts.
fn preset_parameter_key(key: &str) -> &str {
    match key {
        "n_samples" => "nSamples",
        "prompt_guidance_rescale" => "cfgRescale",
        "noise_schedule" => "noiseSchedule",
        "image_format" => "imageFormat",
        "quality_toggle" => "qualityToggle",
        "transparent_background" => "transparentBackground",
        "uc_preset" => "ucPreset",
        "params_version" => "paramsVersion",
        "dynamic_thresholding" => "dynamicThresholding",
        "sm_dyn" => "smDyn",
        "skip_cfg_above_sigma" => "skipCfgAboveSigma",
        "deliberate_euler_ancestral_bug" => "deliberateEulerAncestralBug",
        "prefer_brownian" => "preferBrownian",
        "extra_noise_seed" => "extraNoiseSeed",
        "color_correct" => "colorCorrect",
        "reference_strength" => "referenceStrength",
        "reference_information_extracted" => "referenceInformationExtracted",
        "director_reference_prompt" => "directorReferencePrompt",
        "director_reference_strength" => "directorReferenceStrength",
        "director_reference_secondary_strength" => "directorReferenceSecondaryStrength",
        "director_reference_information_extracted" => "directorReferenceInformationExtracted",
        _ => key,
    }
}

fn apply_presets(
    value: &mut Value,
    names: &[String],
    presets: &[SharedPreset],
) -> Result<HashSet<String>, String> {
    let mut keys = HashSet::new();
    let allowed = [
        "model",
        "action",
        "width",
        "height",
        "nSamples",
        "steps",
        "scale",
        "cfgRescale",
        "seed",
        "sampler",
        "noiseSchedule",
        "imageFormat",
        "qualityToggle",
        "transparentBackground",
        "ucPreset",
        "paramsVersion",
        "dynamicThresholding",
        "sm",
        "smDyn",
        "skipCfgAboveSigma",
        "deliberateEulerAncestralBug",
        "preferBrownian",
        "strength",
        "noise",
        "extraNoiseSeed",
        "colorCorrect",
        "referenceStrength",
        "referenceInformationExtracted",
        "directorReferencePrompt",
        "directorReferenceStrength",
        "directorReferenceSecondaryStrength",
        "directorReferenceInformationExtracted",
    ];
    for name in names {
        let preset = find_preset(presets, name)?;
        let payload = preset
            .payload
            .as_object()
            .ok_or_else(|| format!("Preset '{name}' payload must be an object"))?;
        match preset.kind.as_str() {
            "params" => {
                for (key, field) in payload {
                    let key = preset_parameter_key(key);
                    if !allowed.contains(&key) {
                        return Err(format!(
                            "Preset '{name}' contains unsupported parameter '{key}'"
                        ));
                    }
                    value[key] = field.clone();
                    keys.insert(key.to_string());
                }
            }
            "prompt_template" => {
                let style = payload
                    .get("stylePrompt")
                    .or_else(|| payload.get("prompt"))
                    .and_then(Value::as_str)
                    .ok_or_else(|| format!("Preset '{name}' requires a string prompt"))?;
                value["stylePrompt"] =
                    join_prompt(value["stylePrompt"].as_str().unwrap_or(""), style).into();
                keys.insert("stylePrompt".into());
                if let Some(negative) = payload
                    .get("negative_prompt")
                    .or_else(|| payload.get("negativePrompt"))
                {
                    if !negative.is_string() {
                        return Err(format!("Preset '{name}' negative prompt must be a string"));
                    }
                    value["negativePrompt"] = negative.clone();
                    keys.insert("negativePrompt".into());
                }
            }
            _ => {
                return Err(format!(
                    "Preset '{name}' has unsupported kind '{}'",
                    preset.kind
                ))
            }
        }
    }
    Ok(keys)
}

fn decode_input_image(encoded: &str, name: &str) -> Result<image::DynamicImage, String> {
    let bytes = BASE64
        .decode(encoded)
        .map_err(|error| format!("{name}: invalid Base64: {error}"))?;
    image::load_from_memory(&bytes)
        .map_err(|error| format!("{name}: invalid PNG/JPEG/WebP: {error}"))
}

fn validate_request(
    request: &ImageGenerateRequest,
    source: Option<(u32, u32)>,
) -> Result<(), String> {
    if request.prompt.trim().is_empty() {
        return Err("A non-empty --prompt or request prompt is required".into());
    }
    if request.model.trim().is_empty() {
        return Err("model cannot be empty".into());
    }
    if request.width == 0
        || request.height == 0
        || request.width % 64 != 0
        || request.height % 64 != 0
    {
        return Err("width and height must be positive multiples of 64".into());
    }
    if request.n_samples == 0 || request.steps == 0 {
        return Err("samples and steps must be positive".into());
    }
    if !request.scale.is_finite() || request.scale <= 0.0 {
        return Err("scale must be positive".into());
    }
    for (name, field) in [
        ("cfgRescale", Some(request.cfg_rescale)),
        ("strength", request.strength),
        ("noise", request.noise),
    ] {
        if field.is_some_and(|field| !field.is_finite() || !(0.0..=1.0).contains(&field)) {
            return Err(format!("{name} must be between 0 and 1"));
        }
    }
    if !["png", "webp"].contains(&request.image_format.as_str()) {
        return Err("imageFormat must be png or webp".into());
    }
    match request.action.as_str() {
        "generate" => {
            if source.is_some() || request.mask_image.is_some() {
                return Err("Use img2img or infill when supplying an image or mask".into());
            }
        }
        "img2img" | "infill" => {
            if source != Some((request.width, request.height)) {
                return Err("Source image is required and must match width/height; omit dimensions to infer them".into());
            }
            if request.strength.is_none() || request.noise.is_none() {
                return Err("strength and noise are required for image editing".into());
            }
            if request.action == "infill" {
                let encoded = request
                    .mask_image
                    .as_deref()
                    .ok_or("infill requires --mask or maskImage")?;
                let bytes = BASE64.decode(encoded).map_err(to_error)?;
                if mime_from_bytes(&bytes) != Some("image/png") {
                    return Err("Mask must be a PNG".into());
                }
                let mask = decode_input_image(encoded, "maskImage")?.to_rgba8();
                if mask.dimensions() != (request.width, request.height) {
                    return Err("Mask and source image dimensions must match".into());
                }
                if mask
                    .pixels()
                    .any(|pixel| pixel[3] != 255 || pixel[0] != pixel[1] || pixel[1] != pixel[2])
                {
                    return Err("Mask must be opaque grayscale (white repaints, black preserves); do not supply the colored preview overlay".into());
                }
                if !mask.pixels().any(|pixel| pixel[0] > 0) {
                    return Err("Mask has no selected pixels".into());
                }
            } else if request.mask_image.is_some() {
                return Err("A mask requires action infill".into());
            }
        }
        _ => return Err("action must be generate, img2img or infill".into()),
    }
    Ok(())
}

// Payload previews and manifests retain settings, but never embedded image/reference bytes.
fn redact_images(value: &mut Value) {
    match value {
        Value::Object(object) => {
            for (key, field) in object {
                if matches!(
                    key.as_str(),
                    "image"
                        | "mask"
                        | "reference_image"
                        | "reference_image_multiple"
                        | "director_reference_images"
                        | "controlnet_condition"
                ) {
                    if let Value::Array(images) = field {
                        for image in images {
                            *image = "[encoded image omitted]".into();
                        }
                    } else {
                        *field = "[encoded image omitted]".into();
                    }
                } else {
                    redact_images(field);
                }
            }
        }
        Value::Array(array) => {
            for value in array {
                redact_images(value);
            }
        }
        _ => {}
    }
}

async fn generate(args: GenerateArgs) -> Result<(), String> {
    let request = prepare_request(&args)?;
    let mut payload = build_image_payload(&request, false)?;
    redact_images(&mut payload);
    if args.dry_run {
        return print_json(&payload);
    }
    let token = cli_token()?;
    let directory = create_output_directory(&args.output_dir)?;
    eprintln!(
        "Generating {} image(s) with {}…",
        request.n_samples,
        payload["model"].as_str().unwrap_or("NovelAI")
    );
    let response = generate_image_with_token(request, &token).await?;
    let manifest = save_response(&directory, &response, payload)?;
    print_json(&manifest)
}

fn create_output_directory(root: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(root).map_err(to_error)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(to_error)?
        .as_nanos();
    let directory = root.join(format!("novelai-{timestamp}-{}", std::process::id()));
    fs::create_dir(&directory).map_err(to_error)?;
    fs::canonicalize(directory).map_err(to_error)
}

fn save_response(
    directory: &Path,
    response: &GenerateImageResponse,
    payload: Value,
) -> Result<Value, String> {
    if response.images.is_empty() {
        return Err("API returned no images".into());
    }
    let mut files = Vec::new();
    for (index, image) in response.images.iter().enumerate() {
        let bytes = BASE64.decode(&image.base64).map_err(to_error)?;
        let mime = mime_from_bytes(&bytes).ok_or("API response is not a recognized image")?;
        // Do not trust filenames supplied inside the API ZIP.
        let path = directory.join(default_file_name(mime, index));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(to_error)?;
        file.write_all(&bytes).map_err(to_error)?;
        files.push(serde_json::json!({ "path": path, "mimeType": mime, "byteLen": bytes.len(), "seed": image.seed }));
    }
    let manifest = serde_json::json!({
        "directory": directory, "contentType": response.content_type,
        "request": payload, "images": files,
    });
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(directory.join("generation.json"))
        .map_err(to_error)?;
    file.write_all(&serde_json::to_vec_pretty(&manifest).map_err(to_error)?)
        .map_err(to_error)?;
    Ok(manifest)
}

fn print_json(value: &Value) -> Result<(), String> {
    let stdout = std::io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer_pretty(&mut output, value).map_err(to_error)?;
    writeln!(output).map_err(to_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    fn args(arguments: &[&str]) -> GenerateArgs {
        let parsed = Cli::try_parse_from(arguments).unwrap();
        let CliCommand::Generate(args) = parsed.command else {
            panic!("expected generate")
        };
        *args
    }

    fn png(width: u32, height: u32, color: [u8; 4]) -> String {
        let image = image::RgbaImage::from_pixel(width, height, image::Rgba(color));
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        BASE64.encode(bytes.into_inner())
    }

    #[test]
    fn command_definition_and_defaults() {
        Cli::command().debug_assert();
        let request = prepare_request(&args(&[
            "cli", "generate", "--prompt", "1girl", "--seed", "42",
        ]))
        .unwrap();
        let payload = build_image_payload(&request, false).unwrap();
        assert_eq!(payload["parameters"]["seed"], 42);
        assert_eq!(
            payload["parameters"]["v4_prompt"]["caption"]["base_caption"],
            "1girl"
        );
        assert!(prepare_request(&args(&["cli", "generate"])).is_err());
        assert!(Cli::try_parse_from(["cli", "generate", "--action", "typo"]).is_err());
    }

    #[test]
    fn director_references_override_legacy_extraction_values() {
        let mut value = default_request();
        value["prompt"] = "1girl".into();
        let mut request: ImageGenerateRequest = serde_json::from_value(value).unwrap();
        assert!(build_image_payload(&request, false).unwrap()["parameters"]
            .get("director_reference_information_extracted")
            .is_none());

        // Single-image legacy requests and multiple references must both follow
        // the upstream contract, regardless of the saved extraction value.
        for extracted in [None, Some(0.6), Some(0.0), Some(1.0)] {
            request.director_reference_information_extracted = extracted;
            request.director_reference_image = Some("single-reference".into());
            request.director_reference_images.clear();
            request.director_reference_strength = Some(0.5);
            request.director_reference_secondary_strength = Some(0.25);
            for streaming in [false, true] {
                let payload = build_image_payload(&request, streaming).unwrap();
                assert_eq!(
                    payload["parameters"]["director_reference_information_extracted"],
                    serde_json::json!([1.0])
                );
            }

            request.director_reference_images =
                vec!["first".into(), " ".into(), "second".into()];
            for streaming in [false, true] {
                let payload = build_image_payload(&request, streaming).unwrap();
                let parameters = &payload["parameters"];
                assert_eq!(
                    parameters["director_reference_information_extracted"],
                    serde_json::json!([1.0, 1.0])
                );
                assert_eq!(
                    parameters["director_reference_images"].as_array().unwrap().len(),
                    2
                );
                assert_eq!(
                    parameters["director_reference_strength_values"],
                    serde_json::json!([0.5, 0.5])
                );
                assert_eq!(
                    parameters["director_reference_secondary_strength_values"],
                    serde_json::json!([0.25, 0.25])
                );
            }
        }
    }

    #[test]
    fn image_editing_rejects_wrong_masks_and_dimensions() {
        let mut value = default_request();
        value["prompt"] = "smile".into();
        value["action"] = "infill".into();
        value["width"] = 64.into();
        value["height"] = 64.into();
        value["sourceImage"] = png(64, 64, [255, 255, 255, 255]).into();
        value["maskImage"] = png(64, 64, [255, 255, 255, 255]).into();
        let mut request: ImageGenerateRequest = serde_json::from_value(value).unwrap();
        validate_request(&request, Some((64, 64))).unwrap();
        assert_eq!(
            build_image_payload(&request, false).unwrap()["model"],
            "nai-diffusion-4-5-full-inpainting"
        );
        request.mask_image = Some(png(64, 64, [34, 188, 202, 255]));
        assert!(validate_request(&request, Some((64, 64)))
            .unwrap_err()
            .contains("grayscale"));
        request.mask_image = Some(png(128, 64, [255, 255, 255, 255]));
        assert!(validate_request(&request, Some((64, 64)))
            .unwrap_err()
            .contains("dimensions"));
        request.mask_image = Some(png(64, 64, [0, 0, 0, 255]));
        assert!(validate_request(&request, Some((64, 64)))
            .unwrap_err()
            .contains("selected"));
    }

    #[test]
    fn json_and_flags_merge_and_infer_dimensions() {
        let root = create_output_directory(&std::env::temp_dir()).unwrap();
        let config = root.join("request.json");
        fs::write(
            &config,
            serde_json::to_vec(&serde_json::json!({
                "prompt": "from json", "seed": 42, "steps": 12,
                "sourceImage": png(128, 64, [255, 255, 255, 255]),
                "maskImage": png(128, 64, [255, 255, 255, 255]),
            }))
            .unwrap(),
        )
        .unwrap();
        let request = prepare_request(&args(&[
            "cli",
            "generate",
            "--request",
            config.to_str().unwrap(),
            "--prompt",
            "override",
            "--seed",
            "123",
        ]))
        .unwrap();
        assert_eq!((request.width, request.height), (128, 64));
        assert_eq!(request.prompt, "override");
        assert_eq!(request.seed, Some(123));
        assert_eq!(request.steps, 12);
        assert_eq!(request.action, "infill");
        assert_eq!(request.strength, Some(1.0));
        fs::write(&config, r#"{"prompt":"test","unknownField":true}"#).unwrap();
        assert!(prepare_request(&args(&[
            "cli",
            "generate",
            "--request",
            config.to_str().unwrap()
        ]))
        .unwrap_err()
        .contains("Unknown request field"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preview_removes_input_and_reference_bytes() {
        let mut value = serde_json::json!({"parameters": {
            "image": "secret-source", "mask": "secret-mask", "reference_image": "secret-vibe",
            "reference_image_multiple": ["secret-vibe-1", "secret-vibe-2"],
            "director_reference_images": ["secret-character"], "controlnet_condition": "secret-control",
            "seed": 42,
        }});
        redact_images(&mut value);
        let output = value.to_string();
        assert!(!output.contains("secret-"));
        assert_eq!(value["parameters"]["seed"], 42);
    }

    #[tokio::test]
    async fn http_zip_response_is_decoded_and_saved() {
        use std::net::TcpListener;
        use std::time::Duration;

        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("image_0.png", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&BASE64.decode(png(64, 64, [255, 255, 255, 255])).unwrap())
            .unwrap();
        let body = zip.finish().unwrap().into_inner();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let proxy_url = format!("http://{}", listener.local_addr().unwrap());
        let url = format!("{proxy_url}/generate");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut received = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let count = stream.read(&mut buffer).unwrap();
                assert!(count > 0);
                received.extend_from_slice(&buffer[..count]);
                if let Some(end) = received.windows(4).position(|bytes| bytes == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&received[..end]).to_ascii_lowercase();
                    let length: usize = header
                        .lines()
                        .find_map(|line| line.strip_prefix("content-length: "))
                        .unwrap()
                        .parse()
                        .unwrap();
                    if received.len() >= end + 4 + length {
                        assert!(header.contains("authorization: bearer test-token"));
                        let value: Value = serde_json::from_slice(&received[end + 4..]).unwrap();
                        assert_eq!(value["input"], "test prompt");
                        break;
                    }
                }
            }
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/zip\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).unwrap();
            stream.write_all(&body).unwrap();
        });
        let request =
            prepare_request(&args(&["cli", "generate", "--prompt", "test prompt"])).unwrap();
        let payload = build_image_payload(&request, false).unwrap();
        // Explicit local proxy avoids inheriting the host's HTTP_PROXY in this fixture.
        let response = post_zip_like(&url, "test-token", payload.clone(), false, Some(&proxy_url))
            .await
            .unwrap();
        server.join().unwrap();
        let directory = create_output_directory(&std::env::temp_dir()).unwrap();
        let manifest = save_response(&directory, &response, payload).unwrap();
        assert_eq!(manifest["images"].as_array().unwrap().len(), 1);
        assert!(directory.join("generation.json").is_file());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn transparency_selects_v5_and_adds_tag_without_duplicates() {
        let request = prepare_request(&args(&[
            "cli",
            "generate",
            "--prompt",
            "1girl",
            "--transparent-background",
        ]))
        .unwrap();
        let payload = build_image_payload(&request, false).unwrap();
        assert_eq!(payload["model"], "nai-diffusion-5-full");
        assert_eq!(payload["input"], "1girl, transparent background");
        assert_eq!(
            payload["parameters"]["tag_hint_transparent_background"],
            true
        );
        assert_eq!(payload["parameters"]["straight_alpha"], true);
        assert_eq!(
            payload["parameters"]["v4_prompt"]["caption"]["base_caption"],
            payload["input"]
        );
        let request = prepare_request(&args(&[
            "cli",
            "generate",
            "--prompt",
            "1girl, 2.1::transparent background::",
            "--transparent-background",
        ]))
        .unwrap();
        assert_eq!(request.prompt.matches("transparent background").count(), 1);
        assert!(prepare_request(&args(&[
            "cli",
            "generate",
            "--prompt",
            "test",
            "--model",
            "nai-diffusion-4-5-full",
            "--transparent-background"
        ]))
        .unwrap_err()
        .contains("requires V5"));
        assert!(Cli::try_parse_from([
            "cli",
            "generate",
            "--transparent-background",
            "--no-transparent-background"
        ])
        .is_err());
    }

    fn preset(id: &str, name: &str, kind: &str, payload: Value) -> SharedPreset {
        SharedPreset {
            id: id.into(),
            name: name.into(),
            kind: kind.into(),
            payload,
            group: None,
            thumbnail: None,
            created_at: 0,
        }
    }

    #[test]
    fn presets_handle_style_tags_wire_keys_and_ambiguous_names() {
        let presets = vec![
            preset(
                "style-1",
                "画风",
                "prompt_template",
                serde_json::json!({"prompt":"anime style", "negative_prompt":"lowres"}),
            ),
            preset(
                "style-2",
                "画风",
                "prompt_template",
                serde_json::json!({"prompt":"watercolor"}),
            ),
            preset(
                "params",
                "参数",
                "params",
                serde_json::json!({"n_samples":2, "prompt_guidance_rescale":0.5,
                "transparent_background":true, "params_version":4}),
            ),
        ];
        assert!(find_preset(&presets, "画风")
            .unwrap_err()
            .contains("ambiguous"));
        assert!(find_preset(&presets, "missing")
            .unwrap_err()
            .contains("not found"));
        let mut value = default_request();
        let keys = apply_presets(
            &mut value,
            &["style-1".into(), "style-2".into(), "参数".into()],
            &presets,
        )
        .unwrap();
        assert_eq!(value["stylePrompt"], "anime style, watercolor");
        assert_eq!(value["negativePrompt"], "lowres");
        assert_eq!(value["cfgRescale"], 0.5);
        assert_eq!(value["nSamples"], 2);
        assert_eq!(value["transparentBackground"], true);
        assert!(keys.contains("paramsVersion"));
        let unsafe_preset = preset(
            "bad",
            "bad",
            "params",
            serde_json::json!({"proxyUrl":"http://example.com"}),
        );
        assert!(apply_presets(&mut value, &["bad".into()], &[unsafe_preset]).is_err());
    }

    #[test]
    fn preset_request_flags_precedence_and_inherited_transparency() {
        let root = create_output_directory(&std::env::temp_dir()).unwrap();
        let file = root.join("presets.json");
        let presets = vec![
            preset(
                "p",
                "参数",
                "params",
                serde_json::json!({"steps":12,"model":"nai-diffusion-5-full",
                "transparent_background":true,"params_version":4}),
            ),
            preset(
                "s",
                "画风",
                "prompt_template",
                serde_json::json!({"prompt":"anime style", "negative_prompt":"old negative"}),
            ),
        ];
        fs::write(
            &file,
            serde_json::to_vec(&SharedPresetDocument {
                version: 1,
                presets,
            })
            .unwrap(),
        )
        .unwrap();
        let config = root.join("request.json");
        fs::write(
            &config,
            r#"{"steps":16,"prompt":"test","negativePrompt":"json negative"}"#,
        )
        .unwrap();
        let request = prepare_request(&args(&[
            "cli",
            "generate",
            "--presets-file",
            file.to_str().unwrap(),
            "--preset",
            "参数",
            "--preset",
            "画风",
            "--request",
            config.to_str().unwrap(),
            "--steps",
            "20",
        ]))
        .unwrap();
        assert_eq!(request.steps, 20);
        assert_eq!(request.params_version, 4);
        assert_eq!(request.prompt, "anime style, test, transparent background");
        assert_eq!(request.negative_prompt, "json negative");
        let request = prepare_request(&args(&[
            "cli",
            "generate",
            "--presets-file",
            file.to_str().unwrap(),
            "--preset",
            "p",
            "--preset",
            "s",
            "--prompt",
            "smile",
            "--style-prompt",
            "new style",
            "--negative-prompt",
            "new negative",
            "--no-transparent-background",
        ]))
        .unwrap();
        assert_eq!(request.prompt, "new style, smile");
        assert_eq!(request.negative_prompt, "new negative");
        assert!(!request.transparent_background);
        // Also accept the GUI's legacy shared array format.
        let value: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        fs::write(&file, serde_json::to_vec(&value["presets"]).unwrap()).unwrap();
        assert_eq!(
            read_presets(&PresetSource {
                presets_file: Some(file)
            })
            .unwrap()
            .len(),
            2
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn transparency_is_rejected_for_infill() {
        let root = create_output_directory(&std::env::temp_dir()).unwrap();
        let file = root.join("request.json");
        fs::write(
            &file,
            serde_json::to_vec(&serde_json::json!({
                "prompt":"test", "sourceImage":png(64,64,[255,255,255,255]),
                "maskImage":png(64,64,[255,255,255,255]), "transparentBackground":true,
            }))
            .unwrap(),
        )
        .unwrap();
        assert!(prepare_request(&args(&[
            "cli",
            "generate",
            "--request",
            file.to_str().unwrap()
        ]))
        .unwrap_err()
        .contains("not supported for infill"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn output_ignores_archive_paths_and_never_overwrites() {
        let root = std::env::temp_dir().join(format!("novelai-cli-test-{}", std::process::id()));
        let directory = create_output_directory(&root).unwrap();
        let response = GenerateImageResponse {
            content_type: "application/zip".into(),
            images: vec![GeneratedImage {
                file_name: "../../escape.png".into(),
                mime_type: "image/png".into(),
                base64: png(64, 64, [255, 255, 255, 128]),
                byte_len: 0,
                index: None,
                seed: None,
            }],
        };
        let manifest = save_response(&directory, &response, serde_json::json!({})).unwrap();
        let path = PathBuf::from(manifest["images"][0]["path"].as_str().unwrap());
        assert_eq!(path.parent(), Some(directory.as_path()));
        assert!(path.is_file());
        assert_eq!(
            fs::read(&path).unwrap(),
            BASE64.decode(&response.images[0].base64).unwrap()
        );
        assert_eq!(
            image::open(&path).unwrap().to_rgba8().get_pixel(0, 0)[3],
            128
        );
        assert!(save_response(&directory, &response, serde_json::json!({})).is_err());
        fs::remove_dir_all(directory).unwrap();
        let _ = fs::remove_dir(root);
    }
}
