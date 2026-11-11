// Shared UI types for the NovelAI GUI frontend.

export type ImageAction = "generate" | "img2img" | "infill";

export type ImageFormat = "png" | "webp";

export type ImageRequest = {
  stylePrompt: string;
  prompt: string;
  negativePrompt: string;
  characters: CharacterPrompt[];
  useCharacterCoords: boolean;
  model: string;
  action: ImageAction;
  width: number;
  height: number;
  nSamples: number;
  steps: number;
  scale: number;
  cfgRescale: number;
  seed?: number;
  sampler: string;
  noiseSchedule: string;
  imageFormat: ImageFormat;
  qualityToggle: boolean;
  transparentBackground: boolean;
  ucPreset: number;
  paramsVersion: number;
  dynamicThresholding: boolean;
  sm: boolean;
  smDyn: boolean;
  skipCfgAboveSigma?: number;
  deliberateEulerAncestralBug: boolean;
  preferBrownian: boolean;
  addOriginalImage: boolean;
  legacyV3Extend: boolean;
  tagHintQt?: number;
  upscaleBlurSigma?: number;
  upscaledEnhance: boolean;
  sourceImage?: ImageAsset;
  maskImage?: ImageAsset;
  strength: number;
  noise: number;
  extraNoiseSeed?: number;
  colorCorrect: boolean;
  vibeSourceImage?: ImageAsset;
  vibeSourceImages: ImageAsset[];
  referenceImage?: string;
  referenceImages: string[];
  referenceStrengths: number[];
  referenceInformationExtractedMultiple: number[];
  referenceStrength: number;
  referenceInformationExtracted: number;
  directorReferenceImage?: ImageAsset;
  directorReferenceImages: ImageAsset[];
  directorReferenceMode: "character" | "character&style";
  directorReferencePrompt: string;
  directorReferenceStrength: number;
  directorReferenceSecondaryStrength: number;
  directorReferenceInformationExtracted: number;
  controlnetCondition: string;
  controlnetModel: string;
  controlnetStrength: number;
  vibeCropToMask: boolean;
  vibeFocusSeed?: number;
  vibeInfoExtractSeed?: number;
};

export type CharacterPrompt = {
  id: string;
  prompt: string;
  negativePrompt: string;
  x: number;
  y: number;
};

export type GeneratedImage = {
  id?: string;
  fileName: string;
  mimeType: string;
  byteLen: number;
  base64: string;
  savedPath?: string;
  persistedPath?: string;
  thumbBase64?: string;
  index?: number;
  seed?: number;
};

export type ImageAsset = {
  name: string;
  mimeType: string;
  base64: string;
};

export type GenerateImageResponse = {
  contentType: string;
  images: GeneratedImage[];
};

export type ImageStreamEvent = {
  kind: "progress" | "image" | "error" | "complete";
  message?: string;
  image?: GeneratedImage;
};

export type GenerationProgress = {
  received: number;
  total: number;
  phase: "connecting" | "receiving" | "complete";
};

export type HistoryItem = {
  id: string;
  createdAt: string;
  request: ImageRequest;
  images: GeneratedImage[];
};

export type FavoriteItem = {
  id: string;
  createdAt: string;
  request: ImageRequest;
  image: GeneratedImage;
};

export type PersistedHistoryItem = {
  id: string;
  createdAt: string;
  request: ImageRequest;
};

export type Notice = {
  type: "success" | "error" | "info";
  message: string;
};

export type TranslationDirection = "zh-to-en-tags" | "en-to-zh";

export type AppSettings = {
  showPayloadPreview: boolean;
  enableAppLogs: boolean;
  allowInvalidTls: boolean;
  useNovelAiProxy: boolean;
  novelAiProxyUrl: string;
  saveDirectory: string;
  historyDisplayLimit: number;
  translationBaseUrl: string;
  translationApiKey: string;
  translationModel: string;
  useImageStream: boolean;
};

export type AccountSummary = {
  tier?: string;
  points?: number;
  subscriptionPoints?: number;
  purchasedPoints?: number;
  trialImagesLeft?: number;
  trialActivated?: boolean;
  active?: boolean;
  expiresAt?: number;
  raw: unknown;
};

export type AnlasEstimate = {
  total: number;
  perImage: number;
  billableSamples: number;
  freeSamples: number;
  freeReason?: "paper-membership" | "paper-trial" | "opus";
  opusDiscountApplied: boolean;
  referenceSurcharge: number;
};

export type TagSuggestion = {
  tag: string;
  count?: number;
  confidence?: number;
};

export type DirectorToolType = "lineart" | "sketch" | "colorize" | "emotion" | "declutter";

export type PngTextChunk = {
  keyword: string;
  text: string;
};

export type ImportedImageMetadata = {
  prompt?: string;
  negativePrompt?: string;
  characters?: CharacterPrompt[];
  useCharacterCoords?: boolean;
  textChunkCount: number;
  textChunkKeywords: string[];
  width?: number;
  height?: number;
  steps?: number;
  scale?: number;
  cfgRescale?: number;
  seed?: number;
  sampler?: string;
  noiseSchedule?: string;
  model?: string;
  nSamples?: number;
};

export type PendingClipboardImage = {
  file: File;
  metadata: ImportedImageMetadata;
};
