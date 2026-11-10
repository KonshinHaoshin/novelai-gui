// Shared constants for the NovelAI GUI frontend.
import type { AppSettings, ImageRequest } from "./types";

export const TOKEN_NOT_CONFIGURED_ERROR = "API Token is not configured";

export const TOKEN_NOT_CONFIGURED_MESSAGE = "API Token 未配置，请在设置中重新保存。";

export const HISTORY_KEY = "novelai-gui-history";

export const SETTINGS_KEY = "novelai-gui-settings";

export const HISTORY_DB_NAME = "novelai-gui";

export const HISTORY_DB_VERSION = 4;

export const HISTORY_STORE_NAME = "history";

export const FAVORITES_STORE_NAME = "favorites";

export const MAX_HISTORY_ITEMS = 40;

export const LEGACY_DEFAULT_NOVELAI_PROXY_URL = "http://127.0.0.1:7897";

export const MODELS = [
  "nai-diffusion-5-full",
  "nai-diffusion-5-curated",
  "nai-diffusion-4-5-full",
  "nai-diffusion-4-5-curated",
  "nai-diffusion-4-5-full-inpainting",
  "nai-diffusion-4-5-curated-inpainting",
  "nai-diffusion-4-full",
  "nai-diffusion-4-full-inpainting",
  "nai-diffusion-3",
  "nai-diffusion-2",
  "nai-diffusion",
  "safe-diffusion",
  "nai-diffusion-furry",
  "nai-diffusion-inpainting",
  "nai-diffusion-3-inpainting",
  "safe-diffusion-inpainting",
  "furry-diffusion-inpainting",
  "kandinsky-vanilla",
  "custom",
];

export const SAMPLERS = [
  "k_euler_ancestral",
  "k_euler",
  "k_dpmpp_2m",
  "k_dpmpp_2s_ancestral",
  "k_dpmpp_sde",
  "ddim",
];

export const NOISE_SCHEDULES = ["native", "karras", "exponential", "polyexponential"];

export const SIZE_PRESETS = [
  { label: "1:1", width: 1024, height: 1024 },
  { label: "3:4", width: 832, height: 1216 },
  { label: "4:3", width: 1216, height: 832 },
  { label: "16:9", width: 1344, height: 768 },
  { label: "9:16", width: 768, height: 1344 },
];

export const UPSCALE_BLUR_SIGMAS = [0, 0.3, 0.35, 0.4, 0.45, 0.5] as const;

export const DIRECTOR_REFERENCE_CANVASES = [
  { width: 1024, height: 1536 },
  { width: 1472, height: 1472 },
  { width: 1536, height: 1024 },
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  showPayloadPreview: false,
  enableAppLogs: false,
  allowInvalidTls: false,
  useNovelAiProxy: false,
  novelAiProxyUrl: "",
  saveDirectory: "",
  historyDisplayLimit: 8,
  translationBaseUrl: "",
  translationApiKey: "",
  translationModel: "",
  useImageStream: true,
};

export const DEFAULT_REQUEST: ImageRequest = {
  stylePrompt: "",
  prompt: "",
  negativePrompt: "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy, multiple views, building, city, blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, bad quality, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts, nun, pov, pubic hair, wolf, animal, chibi, doll, milk, lowres, bad, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, abstract, very displeasing, displeasing, lowres, lowres, bad, text, error, missing, extra, fewer, cropped, jpeg artifacts, worst quality, bad quality, watermark, displeasing, unfinished, chromatic aberration, scan, scan artifacts, photo, deformed, realism, disfigured, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, nsfw, :(mutated hands and fingers, one hand with more than 5 fingers, one hand with less than 5 fingers):0.8, text,",
  characters: [],
  useCharacterCoords: false,
  model: "nai-diffusion-4-5-full",
  action: "generate",
  width: 832,
  height: 1216,
  nSamples: 1,
  steps: 28,
  scale: 5,
  cfgRescale: 0,
  sampler: "k_euler_ancestral",
  noiseSchedule: "karras",
  imageFormat: "png",
  qualityToggle: true,
  transparentBackground: false,
  ucPreset: 0,
  paramsVersion: 3,
  dynamicThresholding: false,
  sm: false,
  smDyn: false,
  deliberateEulerAncestralBug: false,
  preferBrownian: true,
  strength: 0.55,
  noise: 0,
  colorCorrect: true,
  vibeSourceImages: [],
  referenceStrength: 0.6,
  referenceInformationExtracted: 0.6,
  directorReferencePrompt: "",
  directorReferenceStrength: 0.6,
  directorReferenceSecondaryStrength: 0.4,
  directorReferenceInformationExtracted: 1.0,
  addOriginalImage: false,
  legacyV3Extend: false,
  upscaledEnhance: false,
  referenceImages: [],
  referenceStrengths: [],
  referenceInformationExtractedMultiple: [],
  directorReferenceImages: [],
  directorReferenceMode: "character",
  controlnetCondition: "",
  controlnetModel: "",
  controlnetStrength: 0.6,
  vibeCropToMask: false,
};
