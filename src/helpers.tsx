// Pure helper functions for prompts, images, formatting, accounts and history storage.
import {
  DEFAULT_REQUEST,
  DEFAULT_SETTINGS,
  DIRECTOR_REFERENCE_CANVASES,
  HISTORY_DB_NAME,
  HISTORY_DB_VERSION,
  HISTORY_KEY,
  HISTORY_STORE_NAME,
  FAVORITES_STORE_NAME,
  LEGACY_DEFAULT_NEGATIVE_PROMPT,
  LEGACY_DEFAULT_NOVELAI_PROXY_URL,
  MAX_HISTORY_ITEMS,
  MODELS,
  SAMPLERS,
  SETTINGS_KEY,
  TOKEN_NOT_CONFIGURED_ERROR,
  SIZE_PRESETS,
  UPSCALE_BLUR_SIGMAS,
} from "./constants";
import {
  TAG_HINT,
  baseModelId,
  defaultStepsForModel,
  legacyUcIndexToOfficial,
  maxCharactersForModel,
  mediumEffortForModel,
  modelProfile,
  paramsVersionForModel,
  qualityAtStart,
  qualityTagsFor,
  ucPresetText,
} from "./modelProfiles";
import type {
  AccountSummary,
  AnlasEstimate,
  AppSettings,
  CharacterPrompt,
  FavoriteItem,
  GeneratedImage,
  HistoryItem,
  ImageAsset,
  ImageRequest,
  PersistedHistoryItem,
  TagSuggestion,
  TranslationDirection,
} from "./types";
import { clamp01, clampCoordinate, findBooleanByKeys, findNumberByKeys, findStringByKeys, isRecord } from "./valueUtils";
import { errorMessage, errorCode } from "./errors";

export function growMaskSelection(source: Uint8Array, width: number, height: number, radius: number) {
  const steps = Math.max(0, Math.round(radius));
  if (steps === 0) {
    return source;
  }

  const output = new Uint8Array(source);
  const radiusSquared = steps * steps;
  const offsets: Array<[number, number]> = [];
  for (let y = -steps; y <= steps; y += 1) {
    for (let x = -steps; x <= steps; x += 1) {
      if (x * x + y * y <= radiusSquared) {
        offsets.push([x, y]);
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!source[y * width + x]) {
        continue;
      }

      for (const [offsetX, offsetY] of offsets) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) {
          output[nextY * width + nextX] = 1;
        }
      }
    }
  }

  return output;
}

export function buildTranslationSystemPrompt(direction: TranslationDirection, kind: "positive" | "negative") {
  if (direction === "en-to-zh") {
    return [
      "你是图像生成 prompt 翻译器。",
      "把英文 NovelAI / Stable Diffusion / WebUI 风格 tag 翻译成自然、简洁的中文说明。",
      "保留专有名词、画师名、模型名和无法可靠翻译的英文 tag。",
      "不要解释，不要加前后缀，只输出翻译后的中文文本。",
    ].join("\n");
  }

  const examples =
    kind === "negative"
      ? [
          "中文：不要低清晰度，手指错误，水印，文字，畸形身体",
          "英文 tag：lowres, bad hands, extra fingers, missing fingers, watermark, text, bad anatomy, deformed body",
          "中文：不要模糊、jpeg 噪点、糟糕质量、脸崩",
          "英文 tag：blurry, jpeg artifacts, worst quality, bad quality, bad face, malformed face",
        ]
      : [
          "中文：一个穿白色连衣裙的少女坐在黄昏的湖边，柔和光线，远处有城市灯光",
          "英文 tag：1girl, white dress, sitting, lakeside, dusk, soft lighting, city lights, depth of field",
          "中文：赛博朋克街道，下雨的夜晚，霓虹灯，角色回头看镜头",
          "英文 tag：cyberpunk city, rainy night, neon lights, street, looking back, looking at viewer",
          "中文：黑发红眼女仆，精致发饰，半身像，动漫风，高质量",
          "英文 tag：1girl, black hair, red eyes, maid outfit, hair ornament, upper body, anime style, best quality",
        ];

  return [
    "You are a NovelAI / Stable Diffusion / WebUI prompt optimizer and translator.",
    "Task: translate Chinese natural-language image descriptions into concise English prompt tags.",
    "Convert sentence-like Chinese into AI-friendly comma-separated tags.",
    "Prefer concrete visual tags: subject, clothing, pose, scene, lighting, camera, style, quality.",
    "Keep existing English tags and artist names as-is.",
    "IMPORTANT: Use spaces between words in each tag. Do NOT merge words together like 'playtheguitar'.",
    "IMPORTANT: Always use English commas (,) followed by a space. Never output Chinese commas.",
    "Do not output Chinese. Do not explain. Do not wrap the result in quotes or markdown.",
    kind === "negative"
      ? "This is a negative prompt: use exclusion tags for unwanted artifacts, anatomy issues, quality problems, text, watermarks, and blur."
      : "This is a positive prompt: optimize for useful descriptive tags, not prose.",
    "Examples:",
    ...examples,
  ].join("\n");
}

export function buildTranslationUserPrompt(text: string, direction: TranslationDirection, kind: "positive" | "negative") {
  if (direction === "en-to-zh") {
    return `请把下面的${kind === "negative" ? "负向" : "正向"}prompt 翻译成中文，保留它的 tag 含义：\n${text}`;
  }

  return [
    `请把下面的中文${kind === "negative" ? "负向" : "正向"}prompt 翻译并优化成英文 AI 绘图 tag。`,
    "要求：逗号分隔，简洁，适合 NovelAI/WebUI，保留已有英文 tag。",
    text,
  ].join("\n");
}

export function loadSettings(): AppSettings {
  try {
    const value = localStorage.getItem(SETTINGS_KEY);
    if (!value) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(value) as Partial<AppSettings>;
    return {
      showPayloadPreview: parsed.showPayloadPreview ?? DEFAULT_SETTINGS.showPayloadPreview,
      enableAppLogs: parsed.enableAppLogs ?? DEFAULT_SETTINGS.enableAppLogs,
      allowInvalidTls: parsed.allowInvalidTls ?? DEFAULT_SETTINGS.allowInvalidTls,
      useNovelAiProxy:
        parsed.useNovelAiProxy ??
        (Boolean(parsed.novelAiProxyUrl?.trim()) && parsed.novelAiProxyUrl?.trim() !== LEGACY_DEFAULT_NOVELAI_PROXY_URL),
      novelAiProxyUrl:
        parsed.novelAiProxyUrl?.trim() === LEGACY_DEFAULT_NOVELAI_PROXY_URL
          ? ""
          : parsed.novelAiProxyUrl ?? DEFAULT_SETTINGS.novelAiProxyUrl,
      saveDirectory: parsed.saveDirectory ?? DEFAULT_SETTINGS.saveDirectory,
      historyDisplayLimit: clampHistoryLimit(
        parsed.historyDisplayLimit ?? DEFAULT_SETTINGS.historyDisplayLimit,
      ),
      translationBaseUrl: parsed.translationBaseUrl ?? DEFAULT_SETTINGS.translationBaseUrl,
      translationApiKey: parsed.translationApiKey ?? DEFAULT_SETTINGS.translationApiKey,
      translationModel: parsed.translationModel ?? DEFAULT_SETTINGS.translationModel,
      useImageStream: parsed.useImageStream ?? DEFAULT_SETTINGS.useImageStream,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function buildOpenAiChatCompletionsUrl(baseUrl: string) {
  const normalized = normalizeServerUrl(baseUrl);
  if (!normalized) {
    return "";
  }
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

export function parseOpenAiChatResponseText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    try {
      return extractOpenAiChoiceText(JSON.parse(trimmed));
    } catch {
      throw new Error("翻译接口返回了非 OpenAI JSON/SSE 格式。");
    }
  }

  const parts: string[] = [];
  let sawDataLine = false;

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (!line.startsWith("data:")) {
      continue;
    }

    sawDataLine = true;
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      const content = extractOpenAiChoiceText(JSON.parse(payload));
      if (content) {
        parts.push(content);
      }
    } catch {
      throw new Error("翻译接口返回了非 OpenAI JSON/SSE 格式。");
    }
  }

  if (!sawDataLine && trimmed.startsWith("[")) {
    throw new Error("翻译接口返回了非 OpenAI JSON/SSE 格式。");
  }

  return parts.join("").trim() || null;
}

export function extractOpenAiChoiceText(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return null;
  }

  const parts: string[] = [];
  for (const choice of value.choices) {
    if (!isRecord(choice)) {
      continue;
    }

    const messageContent = isRecord(choice.message) ? choice.message.content : undefined;
    const deltaContent = isRecord(choice.delta) ? choice.delta.content : undefined;
    const text = choice.text;

    if (typeof messageContent === "string") {
      parts.push(messageContent);
    } else if (typeof deltaContent === "string") {
      parts.push(deltaContent);
    } else if (typeof text === "string") {
      parts.push(text);
    }
  }

  return parts.join("").trim() || null;
}


export function normalizeServerUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function appendPromptText(current: string, addition: string) {
  const left = current.trim();
  const right = addition.trim();

  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return `${left}, ${right}`;
}

export function removePromptText(current: string, removal: string) {
  const removalParts = splitPromptParts(removal);
  if (removalParts.length === 0) {
    return current.trim();
  }

  const removalSet = new Set(removalParts.map((part) => normalizePromptPart(part)));
  return splitPromptParts(current)
    .filter((part) => !removalSet.has(normalizePromptPart(part)))
    .join(", ");
}

export function splitPromptParts(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizePromptPart(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function effectivePrompt(request: ImageRequest) {
  const style = request.stylePrompt.trim();
  const main = request.prompt.trim();
  let prompt = style && main ? `${style}, ${main}` : style || main;

  if (request.transparentBackground && request.action !== "infill" && isV5ImageModel(request.model) && prompt.trim()) {
    const hasTransparencyTag = splitPromptParts(prompt).some((part) => normalizePromptPart(part) === "transparent background");
    prompt = hasTransparencyTag ? prompt : appendPromptText(prompt, "transparent background");
  }

  const quality = qualityTagsFor(request.model, request.qualityPreset);
  if (quality) {
    prompt = qualityAtStart(request.model) && prompt
      ? `${quality}, ${prompt}`
      : prompt ? `${prompt}, ${quality}` : quality;
  }

  // Official in-image text rendering: a "Text:" block on its own line at the
  // very end of the prompt (V4+ models, see docs.novelai.net image/textrendering).
  const inImageText = request.inImageText?.trim();
  if (inImageText && isModernImageModel(request.model)) {
    prompt = `${prompt}\nText: ${inImageText}`;
  }

  return prompt;
}

/** UC preset text (hidden injection) plus the user's custom negative prompt. */
export function effectiveNegativePrompt(request: ImageRequest) {
  if (mediumEffortActive(request)) {
    // Medium effort pins the Heavy preset and forbids custom UC text.
    return ucPresetText(request.model, TAG_HINT.heavy);
  }
  const preset = ucPresetText(request.model, request.ucPreset);
  const custom = request.negativePrompt.trim();
  return preset && custom ? `${preset}, ${custom}` : preset || custom;
}

/** True when the request runs on a Medium effort checkpoint (V5 Full only). */
export function mediumEffortActive(request: Pick<ImageRequest, "model" | "effort">) {
  return request.effort === "medium" && Boolean(mediumEffortForModel(request.model));
}

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

/** Stable identity for a generated image, independent of its (possibly unloaded) payload. */
export function imageKey(image: GeneratedImage) {
  return image.id ?? image.persistedPath ?? image.savedPath ?? image.base64 ?? image.fileName;
}

/** Downscale a generated image so history can render it without keeping the full payload. */
export async function createThumbnailBase64(image: GeneratedImage, maxSize = 320): Promise<string | undefined> {
  if (!image.base64) {
    return undefined;
  }
  try {
    const bitmap = await createImageBitmap(base64ToBlob(image.base64, image.mimeType));
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/webp", 0.72);
  } catch {
    return undefined;
  }
}

export function imageDataUrl(image: GeneratedImage) {
  if (image.thumbBase64) {
    return image.thumbBase64;
  }
  return image.base64 ? `data:${image.mimeType};base64,${image.base64}` : "";
}

/** Full-resolution data URL, falling back to the thumbnail while the payload is being loaded. */
export function fullImageDataUrl(image: GeneratedImage) {
  return image.base64
    ? `data:${image.mimeType};base64,${image.base64}`
    : image.thumbBase64 ?? "";
}

export async function imageAssetFromFile(file: File): Promise<ImageAsset> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
  const marker = ";base64,";
  const markerIndex = dataUrl.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("图片不是 base64 data URL。");
  }
  const mimeType = dataUrl.slice("data:".length, markerIndex) || file.type || "image/png";
  return {
    name: file.name || `clipboard-${Date.now()}.png`,
    mimeType,
    base64: dataUrl.slice(markerIndex + marker.length),
  };
}

export function generatedImageToAsset(image: GeneratedImage): ImageAsset {
  return {
    name: image.fileName,
    mimeType: image.mimeType,
    base64: image.base64,
  };
}

export function loadImageElement(asset: { mimeType: string; base64: string }): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败"));
    image.src = `data:${asset.mimeType};base64,${asset.base64}`;
  });
}

export function imageAssetFromCanvas(canvas: HTMLCanvasElement, name: string): ImageAsset {
  const dataUrl = canvas.toDataURL("image/png");
  const marker = ";base64,";
  const markerIndex = dataUrl.indexOf(marker);
  return { name, mimeType: "image/png", base64: dataUrl.slice(markerIndex + marker.length) };
}


export async function prepareDirectorReferenceImage(asset: ImageAsset): Promise<ImageAsset> {
  const image = await loadImageElement(asset);
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error(`无法读取角色参考图尺寸：${asset.name}`);
  }

  const aspectRatio = image.naturalWidth / image.naturalHeight;
  const canvasSize = DIRECTOR_REFERENCE_CANVASES.reduce((closest, candidate) => {
    const closestDistance = Math.abs(Math.log(aspectRatio / (closest.width / closest.height)));
    const candidateDistance = Math.abs(Math.log(aspectRatio / (candidate.width / candidate.height)));
    return candidateDistance < closestDistance ? candidate : closest;
  });
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法准备 NovelAI 角色参考图画布。");
  }

  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.fillStyle = "#000000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return imageAssetFromCanvas(canvas, asset.name);
}

// 重绘结果在遮罩边缘会带一圈半透明的灰色洞填充残留；用羽化后的遮罩把
// 原始源图贴回遮罩外的同时，在边界带内与结果图做渐变混合，把残留压掉。
export function featherMaskWeights(mask: ImageData, radius: number): Float32Array {
  const width = mask.width;
  const height = mask.height;
  const raw = new Float32Array(width * height);
  for (let index = 0; index < raw.length; index += 1) {
    raw[index] = mask.data[index * 4] / 255;
  }

  let current = raw;
  const passes = 2;
  for (let pass = 0; pass < passes; pass += 1) {
    const horizontal = new Float32Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let count = 0;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) {
            continue;
          }
          sum += current[y * width + nx];
          count += 1;
        }
        horizontal[y * width + x] = sum / count;
      }
    }
    const vertical = new Float32Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) {
            continue;
          }
          sum += horizontal[ny * width + x];
          count += 1;
        }
        vertical[y * width + x] = sum / count;
      }
    }
    current = vertical;
  }

  // 不让结果泄漏到遮罩之外：羽化权重与原始二值遮罩相乘。
  for (let index = 0; index < current.length; index += 1) {
    current[index] = Math.min(current[index], raw[index]);
  }
  return current;
}

export async function restoreInpaintAlpha(
  result: GeneratedImage,
  source: ImageAsset,
  mask: ImageAsset,
): Promise<GeneratedImage> {
  try {
    const [resultImage, sourceImage, maskImage] = await Promise.all([
      loadImageElement({ mimeType: result.mimeType, base64: result.base64 }),
      loadImageElement(source),
      loadImageElement(mask),
    ]);
    const width = resultImage.naturalWidth;
    const height = resultImage.naturalHeight;
    if (
      width === 0 ||
      height === 0 ||
      sourceImage.naturalWidth !== width ||
      sourceImage.naturalHeight !== height ||
      maskImage.naturalWidth !== width ||
      maskImage.naturalHeight !== height
    ) {
      return result;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceContext = sourceCanvas.getContext("2d");
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskContext = maskCanvas.getContext("2d");
    if (!context || !sourceContext || !maskContext) {
      return result;
    }

    context.drawImage(resultImage, 0, 0);
    sourceContext.drawImage(sourceImage, 0, 0);
    maskContext.drawImage(maskImage, 0, 0);
    const output = context.getImageData(0, 0, width, height);
    const sourceData = sourceContext.getImageData(0, 0, width, height);
    const maskData = maskContext.getImageData(0, 0, width, height);
    const weights = featherMaskWeights(maskData, 4);

    for (let index = 0; index < output.data.length; index += 4) {
      const weight = weights[index / 4];
      if (weight >= 1) {
        continue;
      }
      // 洞填充残留的特征：贴在原本不透明的区域上、结果却是半透明像素。
      // 这种像素直接用原图替换，避免边界上出现半透明灰圈。
      if (sourceData.data[index + 3] > 250 && output.data[index + 3] < 250) {
        for (let channel = 0; channel < 4; channel += 1) {
          output.data[index + channel] = sourceData.data[index + channel];
        }
        continue;
      }
      for (let channel = 0; channel < 4; channel += 1) {
        const resultValue = output.data[index + channel];
        const sourceValue = sourceData.data[index + channel];
        output.data[index + channel] = weight <= 0
          ? sourceValue
          : Math.round(sourceValue * (1 - weight) + resultValue * weight);
      }
    }
    context.putImageData(output, 0, 0);
    const restored = imageAssetFromCanvas(canvas, result.fileName);
    return {
      ...result,
      mimeType: restored.mimeType,
      byteLen: Math.floor(restored.base64.length * 0.75),
      base64: restored.base64,
    };
  } catch {
    return result;
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(2)} MB`;
}

export function buildPayloadPreview(request: ImageRequest) {
  const medium = mediumEffortActive(request);
  const parameters: Record<string, unknown> = {
    width: request.width,
    height: request.height,
    prompt: effectivePrompt(request),
    negative_prompt: effectiveNegativePrompt(request),
    n_samples: request.nSamples,
    steps: medium ? 14 : request.steps,
    scale: request.scale,
    cfg_rescale: medium ? 0 : request.cfgRescale,
    sampler: medium ? "k_euler_ancestral" : request.sampler,
    noise_schedule: request.noiseSchedule,
    seed: request.seed,
    image_format: request.imageFormat,
    qualityToggle: request.qualityToggle,
    tag_hint_uc_preset: medium ? TAG_HINT.heavy : request.ucPreset,
    tag_hint_transparent_background: request.transparentBackground && request.action !== "infill",
    straight_alpha: request.transparentBackground && request.action !== "infill",
    ucPreset: medium ? TAG_HINT.heavy : request.ucPreset,
    params_version: request.paramsVersion,
    dynamic_thresholding: request.dynamicThresholding,
    sm: request.sm,
    sm_dyn: request.smDyn,
    skip_cfg_above_sigma: request.skipCfgAboveSigma,
    deliberate_euler_ancestral_bug: request.deliberateEulerAncestralBug,
    prefer_brownian: request.preferBrownian,
    add_original_image: request.addOriginalImage,
    legacy_v3_extend: request.legacyV3Extend,
    tag_hint_qt: request.qualityPreset,
    upscaled_enhance: request.upscaledEnhance,
  };

  if (request.upscaleBlurSigma !== undefined) {
    parameters.upscale = { declared_blur_sigma: request.upscaleBlurSigma };
  }

  if (request.action === "img2img" || request.action === "infill") {
    parameters.image = request.sourceImage ? `[${request.sourceImage.name}]` : undefined;
    parameters.strength = request.strength;
    parameters.noise = request.noise;
    parameters.extra_noise_seed = request.extraNoiseSeed;
    parameters.color_correct = request.colorCorrect;
  }
  if (request.action === "infill") {
    parameters.mask = request.maskImage ? `[${request.maskImage.name}]` : undefined;
  }
  const referenceCount = request.referenceImages.length || (request.referenceImage ? 1 : 0);
  if (referenceCount > 1) {
    parameters.reference_image_multiple = request.referenceImages.map(() => "[encoded vibe]");
    parameters.reference_strength_multiple = request.referenceStrengths.length === referenceCount
      ? request.referenceStrengths
      : request.referenceImages.map(() => request.referenceStrength);
    parameters.reference_information_extracted_multiple = request.referenceInformationExtractedMultiple.length === referenceCount
      ? request.referenceInformationExtractedMultiple
      : request.referenceImages.map(() => request.referenceInformationExtracted);
  } else if (request.referenceImage) {
    parameters.reference_image = "[encoded vibe]";
    parameters.reference_strength = request.referenceStrength;
    parameters.reference_information_extracted = request.referenceInformationExtracted;
  }
  const directorImages = request.directorReferenceImages.length > 0
    ? request.directorReferenceImages
    : request.directorReferenceImage
      ? [request.directorReferenceImage]
      : [];
  if (directorImages.length > 0) {
    parameters.director_reference_images = directorImages.map((image) => `[${image.name}]`);
    parameters.director_reference_descriptions = directorImages.map(() => ({
      caption: {
        base_caption: request.directorReferenceMode,
        char_captions: request.directorReferencePrompt ? [{ char_caption: request.directorReferencePrompt, centers: [{ x: 0.5, y: 0.5 }] }] : [],
      },
      use_coords: false,
      use_order: true,
    }));
    parameters.director_reference_strength_values = directorImages.map(() => request.directorReferenceStrength);
    parameters.director_reference_secondary_strength_values = directorImages.map(() => request.directorReferenceSecondaryStrength);
    parameters.director_reference_information_extracted = directorImages.map(() => 1.0);
  }
  if (request.controlnetCondition.trim()) {
    parameters.controlnet_condition = request.controlnetCondition;
    parameters.controlnet_model = request.controlnetModel || undefined;
    parameters.controlnet_strength = request.controlnetStrength;
  }

  if (isModernImageModel(request.model)) {
    const characterCaptions = buildCharacterCaptions(request);
    const useCoords = request.useCharacterCoords && characterCaptions.length > 0;
    parameters.legacy = false;
    parameters.legacy_uc = false;
    parameters.add_original_image = request.addOriginalImage;
    parameters.autoSmea = false;
    parameters.use_coords = useCoords;
    parameters.v4_prompt = {
      caption: {
        base_caption: effectivePrompt(request),
        char_captions: characterCaptions.map((character) => ({
          char_caption: character.prompt,
          centers: character.centers,
        })),
      },
      use_coords: useCoords,
      use_order: true,
    };
    parameters.v4_negative_prompt = {
      caption: {
        base_caption: request.negativePrompt,
        char_captions: characterCaptions.map((character) => ({
          char_caption: character.negativePrompt,
          centers: character.centers,
        })),
      },
      legacy_uc: false,
    };
  }

  return {
    input: effectivePrompt(request),
    model: effectiveImageModel(request),
    action: request.action,
    parameters,
  };
}

export async function buildBackendImageRequest(request: ImageRequest, settings: AppSettings) {
  const directorReferenceImages = await Promise.all(
    request.directorReferenceImages.map(prepareDirectorReferenceImage),
  );
  const directorReferenceImage = directorReferenceImages.length === 0 && request.directorReferenceImage
    ? await prepareDirectorReferenceImage(request.directorReferenceImage)
    : undefined;

  return {
    ...request,
    prompt: effectivePrompt(request),
    negativePrompt: effectiveNegativePrompt(request),
    // Hint ids are consumed by the tag-suggestion endpoint; the text itself is
    // already injected into prompt/negative above.
    tagHintQt: request.qualityPreset,
    allowInvalidTls: settings.allowInvalidTls,
    proxyUrl: activeNovelAiProxyUrl(settings),
    model: effectiveImageModel(request),
    sourceImage: request.sourceImage?.base64,
    maskImage: request.maskImage?.base64,
    vibeSourceImage: undefined,
    referenceImage: request.referenceImage,
    referenceImages: request.referenceImages,
    referenceStrengths: request.referenceImages.map(() => request.referenceStrength),
    referenceInformationExtractedMultiple: request.referenceImages.map(() => request.referenceInformationExtracted),
    directorReferenceImage: directorReferenceImage?.base64,
    directorReferenceImages: directorReferenceImages.map((image) => image.base64),
  };
}

export function activeNovelAiProxyUrl(settings: AppSettings) {
  return settings.useNovelAiProxy ? settings.novelAiProxyUrl.trim() : "";
}

export function effectiveImageModel(request: ImageRequest) {
  // Medium effort swaps in the distilled checkpoints before any infill mapping.
  if (mediumEffortActive(request)) {
    const medium = mediumEffortForModel(request.model);
    if (medium) {
      return request.action === "infill" ? medium.inpaintingId : medium.id;
    }
  }

  if (request.action !== "infill" || request.model.includes("inpainting")) {
    return request.model;
  }

  const map: Record<string, string> = {
    "nai-diffusion-5-full": "nai-diffusion-5-full-inpainting",
    "nai-diffusion-5-curated": "nai-diffusion-4-5-curated-inpainting",
    "nai-diffusion-4-5-full": "nai-diffusion-4-5-full-inpainting",
    "nai-diffusion-4-5-curated": "nai-diffusion-4-5-curated-inpainting",
    "nai-diffusion-4-full": "nai-diffusion-4-full-inpainting",
    "nai-diffusion-4-curated-preview": "nai-diffusion-4-curated-preview-inpainting",
    "nai-diffusion-3": "nai-diffusion-3-inpainting",
    "nai-diffusion": "nai-diffusion-inpainting",
    "safe-diffusion": "safe-diffusion-inpainting",
    "nai-diffusion-furry": "furry-diffusion-inpainting",
  };
  return map[request.model] ?? request.model;
}

export function isModernImageModel(model: string) {
  return model.includes("diffusion-4") || model.includes("diffusion-5");
}

export function isV5ImageModel(model: string) {
  return model.includes("diffusion-5");
}

export function defaultStepsForImageModel(model: string) {
  return defaultStepsForModel(model);
}

export { maxCharactersForModel };

export function getUpscaleModel(model: string) {
  const normalized = model.replace(/-inpainting$/, "");
  return normalized === "custom" || normalized.trim() === "" ? undefined : normalized;
}

export function buildCharacterCaptions(request: ImageRequest) {
  return (request.characters ?? [])
    .map((character) => ({
      prompt: character.prompt.trim(),
      negativePrompt: character.negativePrompt.trim(),
      centers: [{ x: clampCoordinate(character.x), y: clampCoordinate(character.y) }],
    }))
    .filter((character) => character.prompt.length > 0);
}

export function normalizeImageRequest(request: ImageRequest): ImageRequest {
  // Requests saved before the official tag-hint numbering / UC preset
  // injection carry legacy numbers and inline preset text.
  const legacyScheme = (request as { paramScheme?: unknown }).paramScheme !== 1;
  const model = baseModelId(request.model || DEFAULT_REQUEST.model);
  const profile = modelProfile(model);

  const negativePrompt = legacyScheme && request.negativePrompt === LEGACY_DEFAULT_NEGATIVE_PROMPT
    ? ""
    : request.negativePrompt;

  return {
    ...DEFAULT_REQUEST,
    ...request,
    model,
    negativePrompt,
    // Legacy requests were built before quality tags were injected client-side.
    qualityPreset: legacyScheme
      ? (request.qualityToggle === false ? TAG_HINT.none : TAG_HINT.standard)
      : request.qualityPreset ?? DEFAULT_REQUEST.qualityPreset,
    ucPreset: legacyScheme
      ? legacyUcIndexToOfficial(request.ucPreset)
      : request.ucPreset ?? DEFAULT_REQUEST.ucPreset,
    effort: request.effort === "medium" && mediumEffortForModel(model) ? "medium" : "high",
    paramScheme: 1,
    inImageText: request.inImageText ?? "",
    paramsVersion: legacyScheme
      ? profile?.paramsVersion ?? paramsVersionForModel(model)
      : request.paramsVersion ?? paramsVersionForModel(model),
    characters: (request.characters ?? []).map((character) => ({
      id: character.id || crypto.randomUUID(),
      prompt: character.prompt ?? "",
      negativePrompt: character.negativePrompt ?? "",
      x: clampCoordinate(character.x),
      y: clampCoordinate(character.y),
    })),
    useCharacterCoords: request.useCharacterCoords ?? false,
    transparentBackground: isV5ImageModel(model)
      ? request.transparentBackground ?? DEFAULT_REQUEST.transparentBackground
      : false,
    strength: clamp01(request.strength ?? DEFAULT_REQUEST.strength),
    noise: clamp01(request.noise ?? DEFAULT_REQUEST.noise),
    colorCorrect: request.colorCorrect ?? DEFAULT_REQUEST.colorCorrect,
    vibeSourceImages: request.vibeSourceImages ?? (request.vibeSourceImage ? [request.vibeSourceImage] : []),
    addOriginalImage: request.addOriginalImage ?? DEFAULT_REQUEST.addOriginalImage,
    legacyV3Extend: request.legacyV3Extend ?? DEFAULT_REQUEST.legacyV3Extend,
    upscaledEnhance: request.upscaledEnhance ?? DEFAULT_REQUEST.upscaledEnhance,
    referenceImages: request.referenceImages ?? (request.referenceImage ? [request.referenceImage] : []),
    referenceStrengths: request.referenceStrengths ?? (request.referenceImage ? [request.referenceStrength] : []),
    referenceInformationExtractedMultiple: request.referenceInformationExtractedMultiple ?? (request.referenceImage ? [request.referenceInformationExtracted] : []),
    referenceStrength: clamp01(request.referenceStrength ?? DEFAULT_REQUEST.referenceStrength),
    referenceInformationExtracted: clamp01(request.referenceInformationExtracted ?? DEFAULT_REQUEST.referenceInformationExtracted),
    directorReferenceImages: request.directorReferenceImages ?? (request.directorReferenceImage ? [request.directorReferenceImage] : []),
    directorReferenceMode: request.directorReferenceMode === "character&style" ? "character&style" : DEFAULT_REQUEST.directorReferenceMode,
    directorReferencePrompt: request.directorReferencePrompt ?? "",
    directorReferenceStrength: clamp01(request.directorReferenceStrength ?? DEFAULT_REQUEST.directorReferenceStrength),
    directorReferenceSecondaryStrength: clamp01(request.directorReferenceSecondaryStrength ?? DEFAULT_REQUEST.directorReferenceSecondaryStrength),
    // NovelAI currently requires exactly 1.0, including when restoring older presets.
    directorReferenceInformationExtracted: 1.0,
    controlnetCondition: request.controlnetCondition ?? DEFAULT_REQUEST.controlnetCondition,
    controlnetModel: request.controlnetModel ?? DEFAULT_REQUEST.controlnetModel,
    controlnetStrength: clamp01(request.controlnetStrength ?? DEFAULT_REQUEST.controlnetStrength),
    vibeCropToMask: request.vibeCropToMask ?? DEFAULT_REQUEST.vibeCropToMask,
  };
}

export function extractTagSuggestions(value: unknown): TagSuggestion[] {
  const source = isRecord(value) && Array.isArray(value.tags) ? value.tags : [];
  return source
    .filter(isRecord)
    .map((item) => ({
      tag: typeof item.tag === "string" ? item.tag : "",
      count: typeof item.count === "number" ? item.count : undefined,
      confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    }))
    .filter((item) => item.tag.trim())
    .slice(0, 12);
}



export function summarizeAccount(raw: unknown): AccountSummary {
  const anlas = extractAnlasBalance(raw);
  const trial = extractTrialImages(raw);
  return {
    tier: normalizeTier(findStringByKeys(raw, ["tier", "subscriptionTier", "plan", "accountTier", "accountType"])),
    points: anlas?.total,
    subscriptionPoints: anlas?.subscription,
    purchasedPoints: anlas?.purchased,
    trialImagesLeft: trial?.imagesLeft,
    trialActivated: trial?.activated,
    active: findBooleanByKeys(raw, ["active", "subscriptionActive", "isActive"]),
    expiresAt: findNumberByKeys(raw, ["expiresAt", "expires_at", "expirationTime"]),
    raw,
  };
}

export function extractTrialImages(raw: unknown) {
  // The current API exposes Paper trial state under account information.
  const sources = [
    isRecord(raw) ? raw.information : undefined,
    isRecord(raw) && isRecord(raw.data) ? raw.data.information : undefined,
  ];
  for (const source of sources) {
    if (!isRecord(source)) {
      continue;
    }
    const imagesLeft = readDirectNumber(source.trialImagesLeft);
    const activated = typeof source.trialActivated === "boolean" ? source.trialActivated : undefined;
    if (imagesLeft !== undefined || activated !== undefined) {
      return { imagesLeft, activated };
    }
  }

  const imagesLeft = findNumberByKeys(raw, ["trialImagesLeft"]);
  const activated = findBooleanByKeys(raw, ["trialActivated"]);
  return imagesLeft === undefined && activated === undefined ? undefined : { imagesLeft, activated };
}

export function extractAnlasBalance(raw: unknown) {
  // Current NovelAI responses expose the balance as:
  // subscription.trainingStepsLeft.{fixedTrainingStepsLeft,purchasedTrainingSteps}
  // Prefer this exact path so unrelated `points` fields cannot be mistaken for Anlas.
  const sources = [
    isRecord(raw) ? raw.subscription : undefined,
    isRecord(raw) && isRecord(raw.data) ? raw.data.subscription : undefined,
  ];
  for (const source of sources) {
    const balance = readTrainingStepsBalance(source);
    if (balance) {
      return balance;
    }
  }

  // Compatibility fallback for older proxy responses that returned the
  // trainingStepsLeft object at the root.
  const legacy = readTrainingStepsBalance(raw);
  if (legacy) {
    return legacy;
  }

  const direct = findNumberByKeys(raw, ["anlas", "anlasBalance", "imageAnlas"]);
  return direct === undefined
    ? undefined
    : { total: direct, subscription: undefined, purchased: undefined };
}

export function readTrainingStepsBalance(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const trainingSteps = isRecord(value.trainingStepsLeft) ? value.trainingStepsLeft : value;
  const subscription = readDirectNumber(trainingSteps.fixedTrainingStepsLeft);
  const purchased = readDirectNumber(trainingSteps.purchasedTrainingSteps);
  if (subscription === undefined && purchased === undefined) {
    return undefined;
  }

  return {
    total: (subscription ?? 0) + (purchased ?? 0),
    subscription,
    purchased,
  };
}

export function readDirectNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function normalizeTier(value?: string) {
  if (!value) {
    return undefined;
  }

  const map: Record<string, string> = {
    "0": "Paper",
    "1": "Tablet",
    "2": "Scroll",
    "3": "Opus",
  };
  return map[value] ?? value;
}

export function isTokenNotConfiguredError(error: unknown) {
  return errorCode(error) === "token_missing" || errorMessage(error).includes(TOKEN_NOT_CONFIGURED_ERROR);
}

export function estimateAnlasCost(request: ImageRequest, account: AccountSummary | null): AnlasEstimate | null {
  if (!isAnlasEstimateSupportedModel(request.model)) {
    return null;
  }

  const width = Number(request.width);
  const height = Number(request.height);
  const medium = mediumEffortActive(request);
  const steps = medium ? 14 : Number(request.steps);
  const samples = Math.max(1, Math.floor(Number(request.nSamples)));
  if (![width, height, steps].every(Number.isFinite) || width <= 0 || height <= 0 || steps <= 0) {
    return null;
  }

  const area = width * height;
  const baseCost = Math.ceil(
    2.951823174884865e-6 * area + 5.753298233447344e-7 * area * steps,
  );
  const smeaMultiplier = medium ? 1 : request.sm ? (request.smDyn ? 1.4 : 1.2) : 1;
  const strengthFactor =
    request.action === "infill" && request.maskImage
      ? 1
      : request.action === "img2img" && request.sourceImage
        ? clamp01(request.strength)
        : 1;
  const perImage = Math.max(Math.ceil(baseCost * smeaMultiplier * strengthFactor), 2);
  const tier = account?.tier?.trim().toLowerCase();
  const isOpus = tier === "opus" && account?.active !== false;
  const isPaperMembershipActive = tier === "paper" && account?.active === true;
  const standardSingleImage =
    request.action === "generate" &&
    !request.sourceImage &&
    samples === 1 &&
    area <= 1_048_576 &&
    steps <= 28;
  const opusDiscountApplied =
    isOpus &&
    standardSingleImage;
  const paperMembershipFree = isPaperMembershipActive && standardSingleImage;
  const opusFreeSamples = opusDiscountApplied ? samples : 0;
  const paperMembershipFreeSamples = paperMembershipFree ? samples : 0;
  const trialImagesLeft = account?.trialImagesLeft;
  const trialFreeSamples =
    standardSingleImage &&
    tier === "paper" &&
    trialImagesLeft !== undefined
      ? Math.min(Math.max(trialImagesLeft, 0), samples)
      : 0;
  const freeSamples = Math.min(
    samples,
    Math.max(paperMembershipFreeSamples, opusFreeSamples, trialFreeSamples),
  );
  const billableSamples = Math.max(samples - freeSamples, 0);
  const freeReason =
    paperMembershipFreeSamples > 0
      ? "paper-membership"
      : opusFreeSamples > 0
        ? "opus"
        : trialFreeSamples > 0
          ? "paper-trial"
          : undefined;

  // Current V4/V4.5 request shape supports one Vibe reference and one
  // Character/Precise Reference. Vibe costs only start at the fifth image;
  // Character Reference adds 5 Anlas per requested output image.
  const vibeReferenceSurcharge = request.referenceImage ? Math.max(1 - 4, 0) * 2 : 0;
  const referenceSurcharge = request.directorReferenceImage ? 5 * samples : 0;

  return {
    total: perImage * billableSamples + vibeReferenceSurcharge + referenceSurcharge,
    perImage,
    billableSamples,
    freeSamples,
    freeReason,
    opusDiscountApplied: opusFreeSamples > 0 && freeSamples > 0,
    referenceSurcharge: vibeReferenceSurcharge + referenceSurcharge,
  };
}

export function isAnlasEstimateSupportedModel(model: string) {
  return model === "custom" || /diffusion-(3|4|5)/.test(model);
}

export function calculateAccountCost(before: AccountSummary | null, after: AccountSummary | null) {
  if (before?.points === undefined || after?.points === undefined) {
    return null;
  }

  const diff = before.points - after.points;
  if (!Number.isFinite(diff) || diff < 0) {
    return null;
  }

  return diff;
}

export function formatEstimatedCost(estimate: AnlasEstimate | null) {
  return estimate === null ? "暂不可估算" : `${formatPoints(estimate.total)} Anlas`;
}

export function formatOptionalTrialImages(value?: number) {
  return value === undefined ? "未知" : `${Math.max(0, Math.floor(value))} 张`;
}

export function describeFreeGeneration(account: AccountSummary | null) {
  const tier = account?.tier?.trim().toLowerCase();
  if (tier === "paper" && account?.active === true) {
    return "会员期免费";
  }
  if (tier === "opus" && account?.active !== false) {
    return "Opus 条件免费";
  }
  if (tier === "paper" && account?.trialImagesLeft !== undefined) {
    return `试用 ${formatOptionalTrialImages(account.trialImagesLeft)}`;
  }
  return "无";
}

export function formatFreeGenerationReason(reason?: AnlasEstimate["freeReason"]) {
  switch (reason) {
    case "paper-membership":
      return "Paper 会员期免费";
    case "paper-trial":
      return "Paper 试用免费";
    case "opus":
      return "Opus 条件免费";
    default:
      return "免费";
  }
}

export function describeAnlasBalance(account: AccountSummary | null) {
  if (!account || account.points === undefined) {
    return "Image Anlas 余额暂不可用";
  }

  const subscription = account.subscriptionPoints === undefined ? "未知" : formatPoints(account.subscriptionPoints);
  const purchased = account.purchasedPoints === undefined ? "未知" : formatPoints(account.purchasedPoints);
  const trial = account.trialImagesLeft === undefined ? "未知" : `${Math.max(0, Math.floor(account.trialImagesLeft))} 张`;
  return `Image Anlas 总额 ${formatPoints(account.points)} · 固定池 ${subscription} · 购买池 ${purchased} · 免费试用 ${trial}`;
}

export function ApiStatusPill(props: { hasToken: boolean; account: AccountSummary | null }) {
  const className = props.hasToken
    ? props.account
      ? "api-status-pill"
      : "api-status-pill pending"
    : "api-status-pill missing";

  return (
    <div className={className}>
      <span className="api-status-dot" />
      <span>
        {props.hasToken
          ? props.account
            ? `API 已连接${props.account.tier ? ` · ${props.account.tier}` : ""}${props.account.points !== undefined ? ` · ${formatPoints(props.account.points)} Anlas` : ""} · ${describeFreeGeneration(props.account)}`
            : "API Token 已配置，待验证"
          : "未设置 API Token"}
      </span>
    </div>
  );
}

export function formatOptionalPoints(value?: number) {
  return value === undefined ? "未知" : formatPoints(value);
}

export function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}






export function clampHistoryLimit(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.historyDisplayLimit;
  }

  return Math.min(MAX_HISTORY_ITEMS, Math.max(1, Math.round(value)));
}

/**
 * History keeps a thumbnail and the cache path; the full payload stays on disk
 * (or in the original record for entries written before this change).
 */
export function historyToPersist(items: HistoryItem[]): HistoryItem[] {
  return items.map((item) => ({ ...item, images: stripImagePayloads(item.images) }));
}

export function ensureImageIds(images: GeneratedImage[]): GeneratedImage[] {
  return images.map((image) => (
    image.id || image.base64 ? image : { ...image, id: crypto.randomUUID() }
  ));
}

/** History keeps only a thumbnail and a cache path; the payload is reloaded on demand. */
export function stripImagePayloads(images: GeneratedImage[]): GeneratedImage[] {
  return images.map((image) => (
    image.persistedPath && image.thumbBase64 ? { ...image, base64: "" } : image
  ));
}

export async function loadHistoryFromIndexedDb(): Promise<HistoryItem[]> {
  const legacy = migrateLegacyHistoryFromLocalStorage();
  if (legacy) {
    await saveHistoryToIndexedDb(legacy);
    localStorage.removeItem(HISTORY_KEY);
    return sortHistory(legacy);
  }
  if (!("indexedDB" in window)) {
    return [];
  }

  const db = await openHistoryDatabase();
  try {
    const tx = db.transaction(HISTORY_STORE_NAME, "readonly");
    const store = tx.objectStore(HISTORY_STORE_NAME);
    const items = (await requestToPromise<HistoryItem[]>(store.getAll())) ?? [];
    return sortHistory(items).map((item) => ({
      ...item,
      request: normalizeImageRequest(item.request),
      images: ensureImageIds(item.images ?? []),
    }));
  } finally {
    db.close();
  }
}

export async function loadFavoritesFromIndexedDb(): Promise<FavoriteItem[]> {
  if (!("indexedDB" in window)) {
    return [];
  }

  const db = await openHistoryDatabase();
  try {
    if (!db.objectStoreNames.contains(FAVORITES_STORE_NAME)) {
      return [];
    }
    const tx = db.transaction(FAVORITES_STORE_NAME, "readonly");
    const store = tx.objectStore(FAVORITES_STORE_NAME);
    const items = (await requestToPromise<FavoriteItem[]>(store.getAll())) ?? [];
    return items
      .map((item) => ({
        ...item,
        request: normalizeImageRequest(item.request),
        image: ensureImageIds([item.image])[0],
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally {
    db.close();
  }
}

export async function saveFavoritesToIndexedDb(favorites: FavoriteItem[]) {
  if (!("indexedDB" in window)) {
    return;
  }

  const db = await openHistoryDatabase();
  try {
    const tx = db.transaction(FAVORITES_STORE_NAME, "readwrite");
    const store = tx.objectStore(FAVORITES_STORE_NAME);
    await requestToPromise(store.clear());
    for (const item of favorites) {
      await requestToPromise(store.put(item));
    }
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function saveHistoryToIndexedDb(history: HistoryItem[]) {
  if (!("indexedDB" in window)) {
    return;
  }

  const db = await openHistoryDatabase();
  try {
    const tx = db.transaction(HISTORY_STORE_NAME, "readwrite");
    const store = tx.objectStore(HISTORY_STORE_NAME);
    await requestToPromise(store.clear());
    for (const item of sortHistory(history)) {
      await requestToPromise(store.put(item));
    }
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export function migrateLegacyHistoryFromLocalStorage() {
  try {
    const value = localStorage.getItem(HISTORY_KEY);
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as PersistedHistoryItem[];
    return parsed.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      request: normalizeImageRequest(item.request),
      images: [],
    }));
  } catch {
    return null;
  }
}

export function openHistoryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        db.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FAVORITES_STORE_NAME)) {
        db.createObjectStore(FAVORITES_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

export function requestToPromise<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function sortHistory(history: HistoryItem[]) {
  return [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
