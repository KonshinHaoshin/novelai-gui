import { invoke } from "@tauri-apps/api/core";
import {
  Braces,
  ChevronDown,
  Copy,
  Download,
  Eraser,
  Heart,
  History,
  Images,
  ImagePlus,
  KeyRound,
  Loader2,
  Maximize2,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  RefreshCw,
  Upload,
  UserPlus,
  Users,
  WandSparkles,
  ZoomIn,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import appIcon from "../icon.png";

type ImageAction = "generate" | "img2img" | "infill";
type ImageFormat = "png" | "webp";

type ImageRequest = {
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
  ucPreset: number;
  paramsVersion: number;
  dynamicThresholding: boolean;
  sm: boolean;
  smDyn: boolean;
  skipCfgAboveSigma?: number;
  deliberateEulerAncestralBug: boolean;
  preferBrownian: boolean;
  sourceImage?: ImageAsset;
  maskImage?: ImageAsset;
  strength: number;
  noise: number;
  extraNoiseSeed?: number;
  colorCorrect: boolean;
  vibeSourceImage?: ImageAsset;
  referenceImage?: string;
  referenceStrength: number;
  referenceInformationExtracted: number;
  directorReferenceImage?: ImageAsset;
  directorReferencePrompt: string;
  directorReferenceStrength: number;
  directorReferenceSecondaryStrength: number;
  directorReferenceInformationExtracted: number;
};

type CharacterPrompt = {
  id: string;
  prompt: string;
  negativePrompt: string;
  x: number;
  y: number;
};

type GeneratedImage = {
  fileName: string;
  mimeType: string;
  byteLen: number;
  base64: string;
};

type ImageAsset = {
  name: string;
  mimeType: string;
  base64: string;
};

type GenerateImageResponse = {
  contentType: string;
  images: GeneratedImage[];
};

type HistoryItem = {
  id: string;
  createdAt: string;
  request: ImageRequest;
  images: GeneratedImage[];
};

type FavoriteItem = {
  id: string;
  createdAt: string;
  request: ImageRequest;
  image: GeneratedImage;
};

type PersistedHistoryItem = {
  id: string;
  createdAt: string;
  request: ImageRequest;
};

type Notice = {
  type: "success" | "error" | "info";
  message: string;
};

type TranslationDirection = "zh-to-en-tags" | "en-to-zh";

type AppSettings = {
  showPayloadPreview: boolean;
  enableAppLogs: boolean;
  allowInvalidTls: boolean;
  novelAiProxyUrl: string;
  historyDisplayLimit: number;
  knowledgeServerUrl: string;
  translationBaseUrl: string;
  translationApiKey: string;
  translationModel: string;
};

type AccountSummary = {
  tier?: string;
  points?: number;
  active?: boolean;
  expiresAt?: number;
  raw: unknown;
};

type TagSuggestion = {
  tag: string;
  count?: number;
  confidence?: number;
};

type DirectorToolType = "lineart" | "sketch" | "colorize" | "emotion" | "declutter";

type PngTextChunk = {
  keyword: string;
  text: string;
};

type ImportedImageMetadata = {
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

type PromptEntryType = "style" | "scene" | "clothing";

type PromptLibraryEntry = {
  id: number;
  slug: string;
  entry_type: PromptEntryType;
  title: string;
  summary: string;
  prompt: string;
  negative_prompt?: string;
  tags?: string[];
  category?: {
    slug: string;
    name: string;
  } | null;
  source?: {
    slug: string;
    title: string;
  } | null;
  examples?: Array<{
    id: number;
    label: string;
    kind: string;
    url: string;
    metadata?: Record<string, unknown>;
  }>;
};

type PromptLibraryCacheRecord = {
  type: PromptEntryType;
  entries: PromptLibraryEntry[];
  updatedAt: string;
  serverUrl: string;
};

const HISTORY_KEY = "novelai-gui-history";
const SETTINGS_KEY = "novelai-gui-settings";
const HISTORY_DB_NAME = "novelai-gui";
const HISTORY_DB_VERSION = 3;
const HISTORY_STORE_NAME = "history";
const PROMPT_LIBRARY_STORE_NAME = "prompt-library";
const FAVORITES_STORE_NAME = "favorites";
const MAX_HISTORY_ITEMS = 40;

const DEFAULT_SETTINGS: AppSettings = {
  showPayloadPreview: false,
  enableAppLogs: false,
  allowInvalidTls: false,
  novelAiProxyUrl: "http://127.0.0.1:7897",
  historyDisplayLimit: 8,
  knowledgeServerUrl: "https://prompt.apishelter.top",
  translationBaseUrl: "",
  translationApiKey: "",
  translationModel: "",
};

const PROMPT_ENTRY_TYPES: Array<{ type: PromptEntryType; label: string }> = [
  { type: "style", label: "画风" },
  { type: "scene", label: "场景" },
  { type: "clothing", label: "服装" },
];

const PROMPT_LIBRARY_MAX_RESULTS = 5000;
const PROMPT_LIBRARY_PAGE_SIZE = 80;

const DEFAULT_REQUEST: ImageRequest = {
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
  referenceStrength: 0.6,
  referenceInformationExtracted: 0.6,
  directorReferencePrompt: "",
  directorReferenceStrength: 0.6,
  directorReferenceSecondaryStrength: 0.4,
  directorReferenceInformationExtracted: 0.6,
};

const MODELS = [
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

const SAMPLERS = [
  "k_euler_ancestral",
  "k_euler",
  "k_dpmpp_2m",
  "k_dpmpp_2s_ancestral",
  "k_dpmpp_sde",
  "ddim",
];

const NOISE_SCHEDULES = ["native", "karras", "exponential", "polyexponential"];

const SIZE_PRESETS = [
  { label: "竖屏", width: 832, height: 1216 },
  { label: "正方形", width: 1024, height: 1024 },
  { label: "横屏", width: 1216, height: 832 },
];

function App() {
  const [request, setRequest] = useState<ImageRequest>(DEFAULT_REQUEST);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [activeImages, setActiveImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [apiToolsOpen, setApiToolsOpen] = useState(true);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);
  const [stylePromptOpen, setStylePromptOpen] = useState(true);
  const [sizePresetOpen, setSizePresetOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"generate" | "promptLibrary" | "settings" | "favorites">("generate");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [isRefreshingAccount, setIsRefreshingAccount] = useState(false);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [promptLibraryType, setPromptLibraryType] = useState<PromptEntryType>("style");
  const [promptLibraryQuery, setPromptLibraryQuery] = useState("");
  const [promptLibraryResults, setPromptLibraryResults] = useState<PromptLibraryEntry[]>([]);
  const [promptLibraryVisibleCount, setPromptLibraryVisibleCount] = useState(PROMPT_LIBRARY_PAGE_SIZE);
  const [isSearchingPromptLibrary, setIsSearchingPromptLibrary] = useState(false);
  const [promptLibraryStatus, setPromptLibraryStatus] = useState<string | null>(null);
  const [selectedPromptEntries, setSelectedPromptEntries] = useState<
    Partial<Record<PromptEntryType, PromptLibraryEntry>>
  >({});
  const [selectedPromptBoxes, setSelectedPromptBoxes] = useState<Record<Exclude<PromptEntryType, "style">, PromptLibraryEntry[]>>({
    scene: [],
    clothing: [],
  });
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const sourceImageInputRef = useRef<HTMLInputElement | null>(null);
  const maskImageInputRef = useRef<HTMLInputElement | null>(null);
  const vibeImageInputRef = useRef<HTMLInputElement | null>(null);
  const directorImageInputRef = useRef<HTMLInputElement | null>(null);
  const [translatingField, setTranslatingField] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [isEncodingVibe, setIsEncodingVibe] = useState(false);
  const [isToolRunning, setIsToolRunning] = useState(false);
  const [upscaleScale, setUpscaleScale] = useState<2 | 4>(2);
  const [directorToolType, setDirectorToolType] = useState<DirectorToolType>("lineart");
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) {
      showNotice("info", "浏览器预览模式：API Token 和生成命令需要在 Tauri 桌面环境中使用。");
      return;
    }

    invoke<boolean>("has_api_token")
      .then((configured) => {
        setHasToken(configured);
        if (configured) {
          refreshAccountStatus(false);
        }
      })
      .catch((error) => showNotice("error", String(error)));
  }, []);

  useEffect(() => {
    if (!historyReady) {
      return;
    }

    void saveHistoryToIndexedDb(history.slice(0, MAX_HISTORY_ITEMS)).catch((error) => {
      console.error(error);
      setNotice({ type: "error", message: "历史记录写入失败，请稍后重试。" });
    });
  }, [history, historyReady]);

  useEffect(() => {
    if (!favoritesReady) {
      return;
    }

    void saveFavoritesToIndexedDb(favorites).catch((error) => {
      console.error(error);
      setNotice({ type: "error", message: "收藏写入失败，请稍后重试。" });
    });
  }, [favorites, favoritesReady]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await loadHistoryFromIndexedDb();
      if (cancelled) {
        return;
      }
      setHistory(loaded);
      setHistoryReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await loadFavoritesFromIndexedDb();
      if (cancelled) {
        return;
      }
      setFavorites(loaded);
      setFavoritesReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activePanel !== "promptLibrary") {
      return;
    }

    void searchPromptLibrary({ type: promptLibraryType, query: "" });
  }, [activePanel, promptLibraryType]);

  const currentImage = activeImages[selectedImage];
  const visibleHistory = history.slice(0, settings.historyDisplayLimit);
  const canGenerate = useMemo(
    () => {
      const hasRequiredImage =
        request.action === "generate" ||
        (request.action === "img2img" && Boolean(request.sourceImage)) ||
        (request.action === "infill" && Boolean(request.sourceImage && request.maskImage));
      return effectivePrompt(request).length > 0 && hasToken && !isGenerating && hasRequiredImage;
    },
    [hasToken, isGenerating, request.action, request.maskImage, request.prompt, request.stylePrompt, request.sourceImage],
  );

  async function saveToken() {
    if (!isTauriRuntime()) {
      showNotice("info", "请在 Tauri 桌面窗口中保存 Token。");
      return;
    }

    try {
      await invoke("save_api_token", { token });
      setToken("");
      setHasToken(true);
      showNotice("success", "Token 已保存到系统凭据。");
      writeAppLog("success", "token", "API Token 已保存到系统凭据。");
      refreshAccountStatus(false);
    } catch (error) {
      const message = String(error);
      showNotice("error", message);
      writeAppLog("error", "token", message);
    }
  }

  async function refreshAccountStatus(showResult = true) {
    if (!isTauriRuntime()) {
      if (showResult) {
        showNotice("info", "请在 Tauri 桌面窗口中刷新账号状态。");
      }
      return null;
    }

    setIsRefreshingAccount(true);
    try {
      const raw = await invoke<unknown>("get_account_status", {
        allowInvalidTls: settings.allowInvalidTls,
        proxyUrl: settings.novelAiProxyUrl,
      });
      const summary = summarizeAccount(raw);
      setAccount(summary);
      writeAppLog("success", "account", describeAccountStatus(summary));
      if (showResult) {
        showNotice("success", "账号状态已刷新。");
      }
      return summary;
    } catch (error) {
      writeAppLog("error", "account", String(error));
      if (showResult) {
        showNotice("error", String(error));
      }
      return null;
    } finally {
      setIsRefreshingAccount(false);
    }
  }

  async function generate() {
    if (!isTauriRuntime()) {
      showNotice("info", "请在 Tauri 桌面窗口中发起生成。");
      return;
    }

    if (!canGenerate) {
      showNotice("info", hasToken ? "先输入 Prompt。" : "先保存 API Token。");
      return;
    }

    setIsGenerating(true);
    setNotice(null);
    writeAppLog("info", "generate", `开始生成：${effectiveImageModel(request)} · ${request.width}×${request.height} · ${request.action}`);
    const beforeAccount = await refreshAccountStatus(false);
    try {
      const response = await invoke<GenerateImageResponse>("generate_image", { request: buildBackendImageRequest(request, settings) });
      setActiveImages(response.images);
      setSelectedImage(0);
      setHistory((items) =>
        [
          {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            request,
            images: response.images,
          },
          ...items,
        ].slice(0, MAX_HISTORY_ITEMS),
      );
      writeAppLog(
        "success",
        "generate",
        `生成完成：${response.images.length} 张图，响应类型 ${response.contentType}。`,
      );
      const afterAccount = await refreshAccountStatus(false);
      const cost = calculateAccountCost(beforeAccount, afterAccount);
      setLastCost(cost);
      showNotice(
        "success",
        cost === null
          ? `收到 ${response.images.length} 张图，响应类型 ${response.contentType}。`
          : `收到 ${response.images.length} 张图，本次消耗 ${formatPoints(cost)} 点。`,
      );
    } catch (error) {
      const message = String(error);
      writeAppLog(
        message.includes("Concurrent generation is locked") ? "warning" : "error",
        "generate",
        message,
      );
      showNotice(
        "error",
        message.includes("Concurrent generation is locked")
          ? "当前账号已有一个并发生图任务正在运行，请等待它完成后再试。"
          : message,
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveImage(image: GeneratedImage) {
    if (!isTauriRuntime()) {
      showNotice("info", "请在 Tauri 桌面窗口中保存图片。");
      return;
    }

    try {
      const path = await invoke<string>("save_generated_image", {
        fileName: image.fileName,
        base64: image.base64,
      });
      showNotice("success", `已保存到 ${path}`);
      writeAppLog("success", "save-image", `已保存图片：${path}`);
    } catch (error) {
      const message = String(error);
      showNotice("error", message);
      writeAppLog("error", "save-image", message);
    }
  }

  async function copyImage(image: GeneratedImage) {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        showNotice("error", "当前 WebView 不支持直接复制图片。");
        return;
      }

      const blob = base64ToBlob(image.base64, image.mimeType);
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      showNotice("success", "图片已复制到剪贴板。");
      writeAppLog("success", "copy-image", `已复制图片：${image.fileName}`);
    } catch (error) {
      const message = String(error);
      showNotice("error", `复制图片失败：${message}`);
      writeAppLog("error", "copy-image", message);
    }
  }

  function isImageFavorited(image?: GeneratedImage) {
    if (!image) {
      return false;
    }
    return favorites.some((item) => item.image.base64 === image.base64);
  }

  function toggleFavorite(image: GeneratedImage) {
    const existing = favorites.find((item) => item.image.base64 === image.base64);
    if (existing) {
      setFavorites((items) => items.filter((item) => item.id !== existing.id));
      showNotice("info", "已取消收藏。");
      return;
    }

    const sourceHistory = history.find((item) =>
      item.images.some((historyImage) => historyImage.base64 === image.base64),
    );

    setFavorites((items) => [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        request: sourceHistory?.request ?? request,
        image,
      },
      ...items,
    ]);
    showNotice("success", "已加入收藏。");
  }

  function openFavorite(item: FavoriteItem) {
    setRequest(normalizeImageRequest(item.request));
    setActiveImages([item.image]);
    setSelectedImage(0);
    setActivePanel("generate");
    showNotice("info", "已打开收藏图片。");
  }

  function removeFavorite(id: string) {
    setFavorites((items) => items.filter((item) => item.id !== id));
    showNotice("info", "已移除收藏。");
  }

  async function suggestPromptTags() {
    if (!isTauriRuntime()) {
      showNotice("info", "请在 Tauri 桌面窗口中请求 tag 建议。");
      return;
    }

    const prompt = tagQuery.trim();
    if (!prompt) {
      showNotice("info", "先输入要补全的 tag。");
      return;
    }

    setIsSuggestingTags(true);
    try {
      const response = await invoke<unknown>("suggest_tags", {
        model: request.model,
        prompt,
        lang: "en",
        allowInvalidTls: settings.allowInvalidTls,
        proxyUrl: settings.novelAiProxyUrl,
      });
      const tags = extractTagSuggestions(response);
      setTagSuggestions(tags);
      showNotice(tags.length > 0 ? "success" : "info", tags.length > 0 ? `找到 ${tags.length} 个 tag 建议。` : "没有 tag 建议。");
    } catch (error) {
      showNotice("error", String(error));
    } finally {
      setIsSuggestingTags(false);
    }
  }

  function applyTagSuggestion(tag: string) {
    update("prompt", appendPromptText(request.prompt, tag));
  }

  async function encodeVibeTransfer() {
    if (!isTauriRuntime()) {
      showNotice("info", "请在 Tauri 桌面窗口中编码 Vibe。");
      return;
    }
    if (!request.vibeSourceImage) {
      showNotice("info", "先选择 Vibe 参考图。");
      return;
    }

    setIsEncodingVibe(true);
    try {
      const encoded = await invoke<string>("encode_vibe", {
        request: {
          image: request.vibeSourceImage.base64,
          model: request.model,
          informationExtracted: request.referenceInformationExtracted,
          allowInvalidTls: settings.allowInvalidTls,
          proxyUrl: settings.novelAiProxyUrl,
        },
      });
      update("referenceImage", encoded);
      showNotice("success", "Vibe 已编码并写入生成参数。");
    } catch (error) {
      showNotice("error", String(error));
    } finally {
      setIsEncodingVibe(false);
    }
  }

  async function upscaleCurrentImage() {
    if (!isTauriRuntime()) {
      showNotice("info", "请在 Tauri 桌面窗口中执行超分。");
      return;
    }
    if (!currentImage) {
      showNotice("info", "先选择一张生成结果。");
      return;
    }

    setIsToolRunning(true);
    try {
      const response = await invoke<GenerateImageResponse>("upscale_image", {
        request: {
          image: currentImage.base64,
          width: request.width,
          height: request.height,
          scale: upscaleScale,
          allowInvalidTls: settings.allowInvalidTls,
          proxyUrl: settings.novelAiProxyUrl,
        },
      });
      setActiveImages(response.images);
      setSelectedImage(0);
      showNotice("success", `超分完成，收到 ${response.images.length} 张图。`);
    } catch (error) {
      showNotice("error", String(error));
    } finally {
      setIsToolRunning(false);
    }
  }

  async function runDirectorTool() {
    if (!isTauriRuntime()) {
      showNotice("info", "请在 Tauri 桌面窗口中使用图像工具。");
      return;
    }

    const image = request.directorReferenceImage ?? (currentImage ? generatedImageToAsset(currentImage) : undefined);
    if (!image) {
      showNotice("info", "先选择 Director 输入图，或先选中一张生成结果。");
      return;
    }

    setIsToolRunning(true);
    try {
      const response = await invoke<GenerateImageResponse>("augment_image", {
        request: {
          image: image.base64,
          prompt: request.directorReferencePrompt || effectivePrompt(request),
          width: request.width,
          height: request.height,
          reqType: directorToolType,
          defry: 0,
          allowInvalidTls: settings.allowInvalidTls,
          proxyUrl: settings.novelAiProxyUrl,
        },
      });
      setActiveImages(response.images);
      setSelectedImage(0);
      showNotice("success", `Director Tool 完成，收到 ${response.images.length} 张图。`);
    } catch (error) {
      showNotice("error", String(error));
    } finally {
      setIsToolRunning(false);
    }
  }

  function reuse(item: HistoryItem, imageIndex = 0) {
    setRequest(normalizeImageRequest(item.request));
    setActiveImages(item.images);
    setSelectedImage(Math.min(Math.max(imageIndex, 0), Math.max(item.images.length - 1, 0)));
  }

  function update<K extends keyof ImageRequest>(key: K, value: ImageRequest[K]) {
    setRequest((current) => ({ ...current, [key]: value }));
  }

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function searchPromptLibrary(options?: { type?: PromptEntryType; query?: string; forceRefresh?: boolean }) {
    const baseUrl = normalizeServerUrl(DEFAULT_SETTINGS.knowledgeServerUrl);
    if (!baseUrl) {
      setPromptLibraryStatus("素材库服务地址不可用。");
      return;
    }

    const entryType = options?.type ?? promptLibraryType;
    const query = options?.query ?? promptLibraryQuery;
    const forceRefresh = options?.forceRefresh ?? false;

    setIsSearchingPromptLibrary(true);
    setPromptLibraryStatus(null);
    try {
      if (!forceRefresh) {
        const cached = await loadPromptLibraryCache(entryType);
        if (cached) {
          const results = sortPromptLibraryResults(filterPromptLibraryEntries(cached.entries, query), entryType);
          setPromptLibraryResults(results);
          setPromptLibraryVisibleCount(PROMPT_LIBRARY_PAGE_SIZE);
          setPromptLibraryStatus(
            query.trim()
              ? `本地缓存匹配 ${results.length} 条。`
              : `已从本地缓存载入 ${results.length} 条。`,
          );
          return;
        }
      }

      const entries = await fetchPromptLibraryEntries(entryType);
      await savePromptLibraryCache({
        type: entryType,
        entries,
        updatedAt: new Date().toISOString(),
        serverUrl: baseUrl,
      });
      const results = sortPromptLibraryResults(filterPromptLibraryEntries(entries, query), entryType);
      setPromptLibraryResults(results);
      setPromptLibraryVisibleCount(PROMPT_LIBRARY_PAGE_SIZE);
      setPromptLibraryStatus(
        forceRefresh
          ? `已刷新并保存 ${entries.length} 条，当前显示 ${results.length} 条。`
          : results.length > 0 ? `已载入并保存 ${entries.length} 条，当前显示 ${results.length} 条。` : "没有匹配结果。",
      );
    } catch (error) {
      const cached = await loadPromptLibraryCache(entryType);
      if (cached) {
        const results = sortPromptLibraryResults(filterPromptLibraryEntries(cached.entries, query), entryType);
        setPromptLibraryResults(results);
        setPromptLibraryVisibleCount(PROMPT_LIBRARY_PAGE_SIZE);
        setPromptLibraryStatus(`服务器不可用，已使用本地缓存 ${results.length} 条。`);
      } else {
        setPromptLibraryResults([]);
        setPromptLibraryStatus(String(error));
      }
    } finally {
      setIsSearchingPromptLibrary(false);
    }
  }

  const visiblePromptLibraryResults = promptLibraryResults.slice(0, promptLibraryVisibleCount);

  function togglePromptEntry(entry: PromptLibraryEntry) {
    const prompt = entry.prompt.trim();
    if (!prompt) {
      setPromptLibraryStatus("这个条目没有可用 prompt。");
      return;
    }

    if (entry.entry_type === "style") {
      const currentSelection = selectedPromptEntries.style;
      const isSameSelection = currentSelection?.slug === entry.slug;

      setSelectedPromptEntries((current) => {
        const next = { ...current };
        if (isSameSelection) {
          delete next.style;
        } else {
          next.style = entry;
        }
        return next;
      });

      setRequest((current) => ({
        ...current,
        stylePrompt: isSameSelection ? "" : prompt,
      }));

      setPromptLibraryStatus(isSameSelection ? `已取消画风：${entry.title}` : `已应用画风：${entry.title}`);
      return;
    }

    const type = entry.entry_type;
    setSelectedPromptBoxes((current) => {
      const exists = current[type].some((item) => item.slug === entry.slug);
      return {
        ...current,
        [type]: exists
          ? current[type].filter((item) => item.slug !== entry.slug)
          : [...current[type], entry],
      };
    });
    setPromptLibraryStatus(`已更新${promptEntryTypeLabel(type)}选择。`);
  }

  function updateMainPromptFromSelection() {
    const styleEntry = selectedPromptEntries.style;
    setRequest((current) => ({
      ...current,
      stylePrompt: styleEntry?.prompt?.trim() ?? "",
      prompt: buildPromptSelectionText(undefined, selectedPromptBoxes),
    }));
    setPromptLibraryStatus("已写入画风和主提示词。");
  }

  function addCharacter() {
    const characters = request.characters ?? [];
    const index = characters.length;
    const nextCharacter: CharacterPrompt = {
      id: crypto.randomUUID(),
      prompt: "",
      negativePrompt: "",
      x: clampCoordinate(0.35 + index * 0.2),
      y: 0.5,
    };
    update("characters", [...characters, nextCharacter]);
    if (characters.length >= 1 && !request.useCharacterCoords) {
      update("useCharacterCoords", true);
    }
  }

  function updateCharacter<K extends keyof CharacterPrompt>(
    id: string,
    key: K,
    value: CharacterPrompt[K],
  ) {
    update(
      "characters",
      (request.characters ?? []).map((character) =>
        character.id === id ? { ...character, [key]: value } : character,
      ),
    );
  }

  function removeCharacter(id: string) {
    update(
      "characters",
      (request.characters ?? []).filter((character) => character.id !== id),
    );
  }

  async function translatePromptField(field: "prompt" | "negativePrompt" | "stylePrompt", direction: TranslationDirection) {
    const text = request[field].trim();
    if (!text) {
      showNotice("info", "没有可翻译的提示词。");
      return;
    }

    const translationKey = `${field}:${direction}`;
    setTranslatingField(translationKey);
    try {
      const translated = await translatePromptText(text, field === "negativePrompt" ? "negative" : "positive", direction);
      update(field, translated as ImageRequest[typeof field]);
      showNotice("success", direction === "zh-to-en-tags" ? "提示词已转为英文 tag。" : "提示词已翻译为中文。");
    } catch (error) {
      showNotice("error", String(error));
    } finally {
      setTranslatingField(null);
    }
  }

  async function translateCharacterPrompt(id: string, field: "prompt" | "negativePrompt", direction: TranslationDirection) {
    const character = (request.characters ?? []).find((item) => item.id === id);
    const text = character?.[field]?.trim() ?? "";
    if (!text) {
      showNotice("info", "没有可翻译的角色提示词。");
      return;
    }

    const translationKey = `character:${id}:${field}:${direction}`;
    setTranslatingField(translationKey);
    try {
      const translated = await translatePromptText(text, field === "negativePrompt" ? "negative" : "positive", direction);
      updateCharacter(id, field, translated);
      showNotice("success", direction === "zh-to-en-tags" ? "角色提示词已转为英文 tag。" : "角色提示词已翻译为中文。");
    } catch (error) {
      showNotice("error", String(error));
    } finally {
      setTranslatingField(null);
    }
  }

  async function translatePromptText(text: string, kind: "positive" | "negative", direction: TranslationDirection) {
    const endpoint = buildOpenAiChatCompletionsUrl(settings.translationBaseUrl);
    if (!endpoint || !settings.translationApiKey.trim() || !settings.translationModel.trim()) {
      throw new Error("请先在设置里配置翻译模型的网址、API Key 和模型名。");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.translationApiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.translationModel.trim(),
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: buildTranslationSystemPrompt(direction, kind),
          },
          {
            role: "user",
            content: buildTranslationUserPrompt(text, direction, kind),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`翻译请求失败：HTTP ${response.status}`);
    }

    const responseText = await response.text();
    const translated = parseOpenAiChatResponseText(responseText);
    if (!translated) {
      throw new Error("翻译模型没有返回有效文本。");
    }
    return translated.replace(/^["'`]+|["'`]+$/g, "").trim();
  }

  function clearHistory() {
    setHistory([]);
    setActiveImages([]);
    setSelectedImage(0);
    void saveHistoryToIndexedDb([]);
    showNotice("success", "历史记录已清除。");
    writeAppLog("info", "history", "已清除历史记录。");
  }

  function writeAppLog(level: "info" | "success" | "warning" | "error", source: string, message: string) {
    if (!settings.enableAppLogs || !isTauriRuntime()) {
      return;
    }

    void invoke("append_app_log", { level, source, message }).catch((error) => {
      console.error("Failed to write app log", error);
    });
  }

  function describeAccountStatus(summary: AccountSummary) {
    const tier = summary.tier ?? "未知";
    const points = formatOptionalPoints(summary.points);
    const active = summary.active === undefined ? "未知" : summary.active ? "有效" : "无效";
    return `账号状态：Tier ${tier}，点数 ${points}，订阅 ${active}。`;
  }

  function hasNovelAiMetadata(imported: ImportedImageMetadata) {
    return Boolean(imported.prompt || imported.negativePrompt || (imported.characters ?? []).length > 0);
  }

  function applyImportedMetadata(imported: ImportedImageMetadata, fileName: string) {
    setRequest((current) => ({
      ...current,
      prompt: imported.prompt ?? current.prompt,
      negativePrompt: imported.negativePrompt ?? current.negativePrompt,
      characters: imported.characters ?? current.characters,
      useCharacterCoords: imported.useCharacterCoords ?? current.useCharacterCoords,
      width: imported.width ?? current.width,
      height: imported.height ?? current.height,
      steps: imported.steps ?? current.steps,
      scale: imported.scale ?? current.scale,
      cfgRescale: imported.cfgRescale ?? current.cfgRescale,
      seed: imported.seed ?? current.seed,
      sampler: imported.sampler ?? current.sampler,
      noiseSchedule: imported.noiseSchedule ?? current.noiseSchedule,
      model: imported.model ?? current.model,
      nSamples: imported.nSamples ?? current.nSamples,
    }));
    if ((imported.characters ?? []).length > 0) {
      setCharacterOpen(true);
    }
    showNotice("success", "已从图片元数据导入 prompt 和生成参数。");
    writeAppLog("success", "image-import", `已导入 ${fileName} 的图片元数据。`);
  }

  function reportMissingImageMetadata(file: File, imported: ImportedImageMetadata) {
    const message = `图片中没有识别到 NovelAI prompt。元数据块：${imported.textChunkKeywords.join(", ") || "无"}。`;
    showNotice("info", message);
    writeAppLog(
      "warning",
      "image-import",
      `${file.name} 没有识别到 NovelAI prompt。metadata_chunks=${imported.textChunkCount} keywords=${imported.textChunkKeywords.join("|")}`,
    );
  }

  async function importImageMetadataFile(file: File) {
    try {
      const imported = await parseNovelAiImageMetadata(await file.arrayBuffer());
      if (!hasNovelAiMetadata(imported)) {
        reportMissingImageMetadata(file, imported);
        return;
      }

      applyImportedMetadata(imported, file.name);
    } catch (error) {
      const message = `解析图片元数据失败：${String(error)}`;
      showNotice("error", message);
      writeAppLog("error", "image-import", message);
    }
  }

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = findMetadataImageFileFromClipboard(event.clipboardData);
      if (!file) {
        return;
      }

      event.preventDefault();
      void importImageMetadataFile(file);
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  });

  async function handleImportInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (file) {
      await importImageMetadataFile(file);
    }
  }

  async function handleAssetInput(
    event: ChangeEvent<HTMLInputElement>,
    key: "sourceImage" | "maskImage" | "vibeSourceImage" | "directorReferenceImage",
  ) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      update(key, await imageAssetFromFile(file));
    } catch (error) {
      showNotice("error", `读取图片失败：${String(error)}`);
    }
  }

  function showNotice(type: Notice["type"], message: string) {
    setNotice({ type, message });
  }

  return (
    <main className="studio-shell">
      <input
        ref={importInputRef}
        accept="image/png,image/webp"
        aria-hidden="true"
        className="hidden-file-input"
        onChange={handleImportInput}
        tabIndex={-1}
        type="file"
      />
      <input
        ref={sourceImageInputRef}
        accept="image/*"
        aria-hidden="true"
        className="hidden-file-input"
        onChange={(event) => void handleAssetInput(event, "sourceImage")}
        tabIndex={-1}
        type="file"
      />
      <input
        ref={maskImageInputRef}
        accept="image/*"
        aria-hidden="true"
        className="hidden-file-input"
        onChange={(event) => void handleAssetInput(event, "maskImage")}
        tabIndex={-1}
        type="file"
      />
      <input
        ref={vibeImageInputRef}
        accept="image/*"
        aria-hidden="true"
        className="hidden-file-input"
        onChange={(event) => void handleAssetInput(event, "vibeSourceImage")}
        tabIndex={-1}
        type="file"
      />
      <input
        ref={directorImageInputRef}
        accept="image/*"
        aria-hidden="true"
        className="hidden-file-input"
        onChange={(event) => void handleAssetInput(event, "directorReferenceImage")}
        tabIndex={-1}
        type="file"
      />
      <nav className="nav-rail" aria-label="Main navigation">
        <div className="nav-logo">
          <img src={appIcon} alt="NovelAI GUI" />
        </div>
        <button
          className={activePanel === "generate" ? "nav-button active" : "nav-button"}
          onClick={() => setActivePanel("generate")}
          title="图像生成"
          type="button"
        >
          <Images aria-hidden="true" />
        </button>
        <button
          className={activePanel === "promptLibrary" ? "nav-button active" : "nav-button"}
          onClick={() => setActivePanel("promptLibrary")}
          title="Prompt 助手"
          type="button"
        >
          <WandSparkles aria-hidden="true" />
        </button>
        <button
          className={activePanel === "settings" ? "nav-button active" : "nav-button"}
          onClick={() => setActivePanel("settings")}
          title="设置"
          type="button"
        >
          <Settings2 aria-hidden="true" />
        </button>
        <button
          className={activePanel === "favorites" ? "nav-button active" : "nav-button"}
          onClick={() => setActivePanel("favorites")}
          title="收藏画廊"
          type="button"
        >
          <Heart aria-hidden="true" />
        </button>
        <div className="nav-spacer" />
      </nav>

      {activePanel === "generate" ? (
        <>
      <aside className="prompt-rail" aria-label="Prompt workspace">
        <section className="brand-card">
          <div className="brand-icon">
            <Sparkles aria-hidden="true" />
          </div>
          <div>
            <h1>NovelAI GUI</h1>
            <p>AI Image Generation</p>
          </div>
        </section>

        {stylePromptOpen ? (
          <section className="prompt-card compact">
            <button className="section-toggle" onClick={() => setStylePromptOpen(false)} type="button">
              <span>
                <WandSparkles aria-hidden="true" />
                画风提示词
              </span>
              <ChevronDown className="open" aria-hidden="true" />
            </button>
            <div className="prompt-actions" style={{ padding: "0 0 8px 0" }}>
              <TranslateButtons
                disabled={translatingField !== null || !request.stylePrompt.trim()}
                enActive={translatingField === "stylePrompt:zh-to-en-tags"}
                zhActive={translatingField === "stylePrompt:en-to-zh"}
                onEnglish={() => void translatePromptField("stylePrompt", "zh-to-en-tags")}
                onChinese={() => void translatePromptField("stylePrompt", "en-to-zh")}
              />
              <span>{request.stylePrompt.length}</span>
            </div>
            <textarea
              className="prompt-textarea"
              value={request.stylePrompt}
              onChange={(event) => update("stylePrompt", event.target.value)}
              placeholder="year 2023, official art, anime style..."
              rows={3}
            />
          </section>
        ) : (
          <button className="section-toggle" onClick={() => setStylePromptOpen(true)} type="button" style={{ padding: "8px 14px" }}>
            <span>
              <WandSparkles aria-hidden="true" />
              画风提示词
            </span>
            <ChevronDown aria-hidden="true" />
          </button>
        )}

        <section className="prompt-card primary">
          <div className="card-head">
            <div>
              <h2>正向提示词</h2>
            </div>
            <div className="prompt-actions">
              <TranslateButtons
                disabled={translatingField !== null || !request.prompt.trim()}
                enActive={translatingField === "prompt:zh-to-en-tags"}
                zhActive={translatingField === "prompt:en-to-zh"}
                onEnglish={() => void translatePromptField("prompt", "zh-to-en-tags")}
                onChinese={() => void translatePromptField("prompt", "en-to-zh")}
              />
              <span>{request.prompt.length}</span>
            </div>
          </div>
          <textarea
            className="prompt-textarea primary"
            value={request.prompt}
            onChange={(event) => update("prompt", event.target.value)}
            placeholder="masterpiece, best quality, 1girl..."
            rows={10}
          />
        </section>

        <section className="prompt-card compact">
          <div className="card-head">
            <div>
              <h2>负向提示词</h2>
            </div>
            <div className="prompt-actions">
              <TranslateButtons
                disabled={translatingField !== null || !request.negativePrompt.trim()}
                enActive={translatingField === "negativePrompt:zh-to-en-tags"}
                zhActive={translatingField === "negativePrompt:en-to-zh"}
                onEnglish={() => void translatePromptField("negativePrompt", "zh-to-en-tags")}
                onChinese={() => void translatePromptField("negativePrompt", "en-to-zh")}
              />
              <span>{request.negativePrompt.length}</span>
            </div>
          </div>
          <textarea
            className="prompt-textarea"
            value={request.negativePrompt}
            onChange={(event) => update("negativePrompt", event.target.value)}
            rows={4}
          />
        </section>

      </aside>

      <section className="canvas-stage" aria-label="Generated images">
        <header className="stage-card">
          <div>
            <h2>生图工作台</h2>
            <span>{currentImage ? `${currentImage.fileName} · ${formatBytes(currentImage.byteLen)}` : "等待生成结果"}</span>
          </div>
          <div className="toolbar-actions">
            <button className="ghost-button" onClick={() => importInputRef.current?.click()} type="button">
              <Upload aria-hidden="true" />
              从图片导入
            </button>
            <button className="ghost-button" onClick={() => refreshAccountStatus()} disabled={isRefreshingAccount || !hasToken} type="button">
              <RefreshCw className={isRefreshingAccount ? "spin" : ""} aria-hidden="true" />
              刷新
            </button>
            <button className="ghost-button" onClick={() => setRequest(DEFAULT_REQUEST)} type="button">
              <RotateCcw aria-hidden="true" />
              重置
            </button>
            <button className="run-button" onClick={generate} disabled={!canGenerate} type="button">
              {isGenerating ? <Loader2 className="spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              生成
            </button>
          </div>
        </header>

        <section className="preview-card">
          <div className="preview-head">
            <div>
              <h2>预览</h2>
              <p>{request.width} × {request.height}</p>
            </div>
            <div className="preview-tools">
              <button className="icon-button" title="适应窗口" type="button">
                <Maximize2 aria-hidden="true" />
              </button>
              <button className="icon-button" title="缩放" type="button">
                <ZoomIn aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="image-viewer">
            {currentImage ? (
              <img
                src={`data:${currentImage.mimeType};base64,${currentImage.base64}`}
                alt={currentImage.fileName}
                onError={() => showNotice("error", `${currentImage.fileName} 无法被 WebView 解码。`)}
              />
            ) : (
              <div className="empty-state">
                <ImagePlus aria-hidden="true" />
                <strong>等待生成结果</strong>
                <span>输入提示词并点击生成。</span>
              </div>
            )}
          </div>

          <footer className="preview-footer">
            <span>{currentImage ? formatBytes(currentImage.byteLen) : "未生成"}</span>
            <div className="result-actions">
              <button
                className={currentImage && isImageFavorited(currentImage) ? "icon-button favorite active" : "icon-button favorite"}
                disabled={!currentImage}
                onClick={() => currentImage && toggleFavorite(currentImage)}
                title={currentImage && isImageFavorited(currentImage) ? "取消收藏" : "收藏图片"}
                type="button"
              >
                <Heart aria-hidden="true" />
              </button>
              <button
                className="icon-button"
                disabled={!currentImage}
                onClick={() => currentImage && copyImage(currentImage)}
                title="复制图片"
                type="button"
              >
                <Copy aria-hidden="true" />
              </button>
              <button
                className="icon-button filled"
                disabled={!currentImage}
                onClick={() => currentImage && saveImage(currentImage)}
                title="保存图片"
                type="button"
              >
                <Download aria-hidden="true" />
              </button>
            </div>
          </footer>
        </section>

        <section className={historyOpen ? "history-card stage-history-card open" : "history-card stage-history-card"}>
          <button className="section-toggle" onClick={() => setHistoryOpen((open) => !open)} type="button">
            <span>
              <History aria-hidden="true" />
              历史记录
            </span>
            {history.length > 0 ? (
              <span className="section-meta">
                {visibleHistory.length}/{history.length}
              </span>
            ) : null}
            <ChevronDown className={historyOpen ? "open" : ""} aria-hidden="true" />
          </button>
          {historyOpen ? (
            history.length === 0 ? (
              <div className="mini-empty history-empty-inline">
                <History aria-hidden="true" />
                <strong>暂无历史</strong>
                <span>生成后的图片会出现在这里。</span>
              </div>
            ) : (
              <div className="history-strip-wrap">
                <div className="history-list image-only">
                  {visibleHistory.flatMap((item) =>
                    item.images.map((image, imageIndex) => (
                      <button
                        className={currentImage?.base64 === image.base64 ? "history-thumb active" : "history-thumb"}
                        key={`${item.id}-${image.fileName}-${imageIndex}`}
                        onClick={() => reuse(item, imageIndex)}
                        title={new Date(item.createdAt).toLocaleString()}
                        type="button"
                      >
                        <img src={`data:${image.mimeType};base64,${image.base64}`} alt="" />
                      </button>
                    )),
                  )}
                </div>
                <button className="danger-button" onClick={clearHistory} type="button">
                  <Eraser aria-hidden="true" />
                  清除
                </button>
              </div>
            )
          ) : null}
        </section>

      </section>

      <aside className="parameter-rail" aria-label="Generation parameters">
        <section className="account-card">
          <div className="section-head">
            <ShieldCheck aria-hidden="true" />
            <h2>账号状态</h2>
          </div>
          <div className="account-pills" aria-label="Account status">
            <span>Tier：{account?.tier ?? "未知"}</span>
            <span>点数：{formatOptionalPoints(account?.points)}</span>
            <span>本次：{lastCost === null ? "未计算" : formatPoints(lastCost)}</span>
          </div>
        </section>

        <section className="parameter-card">
          <div className="section-head">
            <Images aria-hidden="true" />
            <h2>模型</h2>
          </div>

          <label className="field">
            <span>图像模型</span>
            <select value={request.model} onChange={(event) => update("model", event.target.value)}>
              {MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          {/* <div className="model-note">
            <ShieldCheck aria-hidden="true" />
            默认使用 NAI 4.5 full；局部重绘会自动切到对应 inpainting 模型。
          </div> */}
        </section>

        <section className="parameter-card">
          <div className="section-head">
            <ImagePlus aria-hidden="true" />
            <h2>输入模式</h2>
          </div>
          <div className="preset-row">
            {([
              ["generate", "文生图"],
              ["img2img", "图生图"],
              ["infill", "局部重绘"],
            ] as Array<[ImageAction, string]>).map(([action, label]) => (
              <button
                className={request.action === action ? "chip active" : "chip"}
                key={action}
                onClick={() => {
                  update("action", action);
                  if (action === "infill" && request.strength < 1) {
                    update("strength", 1);
                  }
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {request.action !== "generate" ? (
            <div className="tool-stack">
              <div className={request.action === "infill" ? "asset-picker-row" : undefined}>
                <AssetPicker
                  asset={request.sourceImage}
                  label="输入图"
                  onClear={() => update("sourceImage", undefined)}
                  onPick={() => sourceImageInputRef.current?.click()}
                />
                {request.action === "infill" ? (
                <AssetPicker
                  asset={request.maskImage}
                  label="遮罩图"
                  onClear={() => update("maskImage", undefined)}
                  onPick={() => {
                    if (!request.sourceImage) {
                      showNotice("info", "请先选择输入图。");
                      return;
                    }
                    setMaskEditorOpen(true);
                  }}
                  pickLabel={request.maskImage ? "编辑" : "涂抹"}
                />
                ) : null}
              </div>
              <div className="field-grid">
                <NumberField label="强度" value={request.strength} min={0} max={1} step={0.01} onChange={(value) => update("strength", clamp01(value))} />
                <NumberField label="噪声" value={request.noise} min={0} max={1} step={0.01} onChange={(value) => update("noise", clamp01(value))} />
              </div>
              <div className="field-grid">
                <OptionalNumberField label="额外噪声种子" value={request.extraNoiseSeed} min={0} max={4294967295} onChange={(value) => update("extraNoiseSeed", value)} />
                <Toggle label="颜色校正" checked={request.colorCorrect} onChange={(value) => update("colorCorrect", value)} />
              </div>
            </div>
          ) : null}
        </section>

        {false ? (
        <section className="parameter-card">
          <button className="section-toggle" onClick={() => setApiToolsOpen((open) => !open)} type="button">
            <span>
              <WandSparkles aria-hidden="true" />
              API 工具
            </span>
            <ChevronDown className={apiToolsOpen ? "open" : ""} aria-hidden="true" />
          </button>
          {apiToolsOpen ? (
            <div className="tool-stack">
              <div className="tool-box">
                <strong>Tag Suggestion</strong>
                <div className="prompt-library-search compact-search">
                  <input
                    value={tagQuery}
                    onChange={(event) => setTagQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void suggestPromptTags();
                      }
                    }}
                    placeholder="输入半个 tag"
                  />
                  <button className="icon-button filled" onClick={() => void suggestPromptTags()} disabled={isSuggestingTags || !hasToken} title="建议 tag" type="button">
                    {isSuggestingTags ? <Loader2 className="spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
                  </button>
                </div>
                {tagSuggestions.length > 0 ? (
                  <div className="tag-suggestion-row">
                    {tagSuggestions.map((item) => (
                      <button className="tag-suggestion" key={item.tag} onClick={() => applyTagSuggestion(item.tag)} type="button">
                        {item.tag}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="tool-box">
                <strong>Vibe Transfer</strong>
                <AssetPicker
                  asset={request.vibeSourceImage}
                  label="Vibe 图"
                  onClear={() => {
                    update("vibeSourceImage", undefined);
                    update("referenceImage", undefined);
                  }}
                  onPick={() => vibeImageInputRef.current?.click()}
                />
                <div className="field-grid">
                  <NumberField label="强度" value={request.referenceStrength} min={0} max={1} step={0.01} onChange={(value) => update("referenceStrength", clamp01(value))} />
                  <NumberField label="提取量" value={request.referenceInformationExtracted} min={0} max={1} step={0.01} onChange={(value) => update("referenceInformationExtracted", clamp01(value))} />
                </div>
                <button className="ghost-button wide-button" onClick={() => void encodeVibeTransfer()} disabled={isEncodingVibe || !hasToken || !request.vibeSourceImage} type="button">
                  {isEncodingVibe ? <Loader2 className="spin" aria-hidden="true" /> : <WandSparkles aria-hidden="true" />}
                  编码 Vibe
                </button>
              </div>

              <div className="tool-box">
                <strong>结果工具</strong>
                <div className="preset-row two">
                  {[2, 4].map((scale) => (
                    <button className={upscaleScale === scale ? "chip active" : "chip"} key={scale} onClick={() => setUpscaleScale(scale as 2 | 4)} type="button">
                      {scale}x
                    </button>
                  ))}
                </div>
                <button className="ghost-button wide-button" onClick={() => void upscaleCurrentImage()} disabled={isToolRunning || !hasToken || !currentImage} type="button">
                  <Maximize2 aria-hidden="true" />
                  超分当前图
                </button>
              </div>

              <div className="tool-box">
                <strong>Director Tools</strong>
                <AssetPicker
                  asset={request.directorReferenceImage}
                  label="输入图"
                  onClear={() => update("directorReferenceImage", undefined)}
                  onPick={() => directorImageInputRef.current?.click()}
                />
                <label className="field">
                  <span>工具类型</span>
                  <select value={directorToolType} onChange={(event) => setDirectorToolType(event.target.value as DirectorToolType)}>
                    <option value="lineart">lineart</option>
                    <option value="sketch">sketch</option>
                    <option value="colorize">colorize</option>
                    <option value="emotion">emotion</option>
                    <option value="declutter">declutter</option>
                  </select>
                </label>
                <label className="field">
                  <span>工具 Prompt</span>
                  <input value={request.directorReferencePrompt} onChange={(event) => update("directorReferencePrompt", event.target.value)} placeholder="留空则使用主 Prompt" />
                </label>
                <button className="ghost-button wide-button" onClick={() => void runDirectorTool()} disabled={isToolRunning || !hasToken || (!request.directorReferenceImage && !currentImage)} type="button">
                  {isToolRunning ? <Loader2 className="spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                  执行工具
                </button>
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        <section className="parameter-card character-card">
          <button className="section-toggle" onClick={() => setCharacterOpen((open) => !open)} type="button">
            <span>
              <Users aria-hidden="true" />
              Characters
            </span>
            {(request.characters ?? []).length > 0 ? (
              <span className="section-meta">{(request.characters ?? []).length}</span>
            ) : null}
            <ChevronDown className={characterOpen ? "open" : ""} aria-hidden="true" />
          </button>

          {characterOpen ? (
            !isV4ImageModel(request.model) ? (
              <div className="model-note">
                <ShieldCheck aria-hidden="true" />
                Character 仅对 NAI 4 / 4.5 模型生效。
              </div>
            ) : (
              <>
                <div className="character-toolbar">
                  <Toggle
                    label="使用角色坐标"
                    checked={request.useCharacterCoords}
                    onChange={(value) => update("useCharacterCoords", value)}
                  />
                  <button className="ghost-button" onClick={addCharacter} type="button">
                    <UserPlus aria-hidden="true" />
                    添加
                  </button>
                </div>
                {(request.characters ?? []).length === 0 ? (
                  <div className="character-empty">添加角色后，会写入 V4 char_captions。</div>
                ) : (
                  <div className="character-list">
                    {(request.characters ?? []).map((character, index) => {
                      const isExpanded = expandedCharacterId === character.id;
                      return (
                        <div className="character-item" key={character.id}>
                          <button
                            className="character-head"
                            onClick={() => setExpandedCharacterId(isExpanded ? null : character.id)}
                            type="button"
                          >
                            <strong>角色 {index + 1}</strong>
                            <span className="character-prompt-preview">
                              {character.prompt.trim() ? character.prompt.trim().split(",")[0].slice(0, 24) : "空"}
                            </span>
                            <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
                              <ChevronDown className={isExpanded ? "open" : ""} aria-hidden="true" style={{ width: 14, height: 14 }} />
                              <button
                                className="icon-button"
                                onClick={(event) => { event.stopPropagation(); removeCharacter(character.id); }}
                                title="删除角色"
                                type="button"
                                style={{ width: 24, height: 24 }}
                              >
                                <Eraser aria-hidden="true" />
                              </button>
                            </div>
                          </button>
                          {isExpanded ? (
                            <>
                              <label className="field">
                                <span className="field-label-row">
                                  角色提示词
                                  <TranslateButtons
                                    compact
                                    disabled={translatingField !== null || !character.prompt.trim()}
                                    enActive={translatingField === `character:${character.id}:prompt:zh-to-en-tags`}
                                    zhActive={translatingField === `character:${character.id}:prompt:en-to-zh`}
                                    onEnglish={() => void translateCharacterPrompt(character.id, "prompt", "zh-to-en-tags")}
                                    onChinese={() => void translateCharacterPrompt(character.id, "prompt", "en-to-zh")}
                                  />
                                </span>
                                <textarea
                                  value={character.prompt}
                                  onChange={(event) => updateCharacter(character.id, "prompt", event.target.value)}
                                  placeholder="1girl, pink hair, school uniform"
                                  rows={3}
                                />
                              </label>
                              <label className="field">
                                <span className="field-label-row">
                                  角色负向提示词
                                  <TranslateButtons
                                    compact
                                    disabled={translatingField !== null || !character.negativePrompt.trim()}
                                    enActive={translatingField === `character:${character.id}:negativePrompt:zh-to-en-tags`}
                                    zhActive={translatingField === `character:${character.id}:negativePrompt:en-to-zh`}
                                    onEnglish={() => void translateCharacterPrompt(character.id, "negativePrompt", "zh-to-en-tags")}
                                    onChinese={() => void translateCharacterPrompt(character.id, "negativePrompt", "en-to-zh")}
                                  />
                                </span>
                                <textarea
                                  value={character.negativePrompt}
                                  onChange={(event) => updateCharacter(character.id, "negativePrompt", event.target.value)}
                                  placeholder="bad hands, blurry"
                                  rows={2}
                                />
                              </label>
                              <div className="field-grid">
                                <NumberField
                                  label="X"
                                  value={character.x}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) => updateCharacter(character.id, "x", clampCoordinate(value))}
                                />
                                <NumberField
                                  label="Y"
                                  value={character.y}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) => updateCharacter(character.id, "y", clampCoordinate(value))}
                                />
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )
          ) : null}
        </section>

        <section className="parameter-card">
          <button className="section-toggle" onClick={() => setSizePresetOpen((open) => !open)} type="button">
            <span>
              <SlidersHorizontal aria-hidden="true" />
              图像尺寸
            </span>
            <span className="section-meta">{request.width}×{request.height}</span>
            <ChevronDown className={sizePresetOpen ? "open" : ""} aria-hidden="true" />
          </button>

          {sizePresetOpen ? (
            <>
              <div className="preset-row">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    className={request.width === preset.width && request.height === preset.height ? "chip active" : "chip"}
                    key={preset.label}
                    onClick={() => {
                      update("width", preset.width);
                      update("height", preset.height);
                    }}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="field-grid four">
                <NumberField label="宽度" value={request.width} min={64} max={2048} onChange={(value) => update("width", value)} />
                <NumberField label="高度" value={request.height} min={64} max={2048} onChange={(value) => update("height", value)} />
                <NumberField label="采样数" value={request.nSamples} min={1} max={8} onChange={(value) => update("nSamples", value)} />
              </div>
              <div className="field-grid">
                <OptionalNumberField label="种子" value={request.seed} min={0} max={4294967295} onChange={(value) => update("seed", value)} />
              </div>
            </>
          ) : null}
        </section>

        <section className="parameter-card">
          <button className="section-toggle" onClick={() => setAdvancedOpen((open) => !open)} type="button">
            <span>
              <Settings2 aria-hidden="true" />
              采样参数
            </span>
            <ChevronDown className={advancedOpen ? "open" : ""} aria-hidden="true" />
          </button>

          {advancedOpen ? (
            <div className="advanced-stack">
              <div className="field-grid four">
                <NumberField label="步数" value={request.steps} min={1} max={60} onChange={(value) => update("steps", value)} />
                <NumberField label="Scale" value={request.scale} min={1} max={20} step={0.5} onChange={(value) => update("scale", value)} />
                <NumberField label="CFG 重缩放" value={request.cfgRescale} min={0} max={1} step={0.01} onChange={(value) => update("cfgRescale", value)} />
                <OptionalNumberField label="Skip Sigma" value={request.skipCfgAboveSigma} min={0} max={100} step={0.1} onChange={(value) => update("skipCfgAboveSigma", value)} />
              </div>

              <div className="field-grid">
                <label className="field">
                  <span>采样器</span>
                  <select value={request.sampler} onChange={(event) => update("sampler", event.target.value)}>
                    {SAMPLERS.map((sampler) => (
                      <option key={sampler} value={sampler}>
                        {sampler}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>噪声调度</span>
                  <select value={request.noiseSchedule} onChange={(event) => update("noiseSchedule", event.target.value)}>
                    {NOISE_SCHEDULES.map((schedule) => (
                      <option key={schedule} value={schedule}>
                        {schedule}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="toggle-grid">
                <Toggle label="质量优化" checked={request.qualityToggle} onChange={(value) => update("qualityToggle", value)} />
                <Toggle label="SMEA" checked={request.sm} onChange={(value) => update("sm", value)} />
                <Toggle label="SMEA 动态" checked={request.smDyn} onChange={(value) => update("smDyn", value)} />
                <Toggle label="动态阈值" checked={request.dynamicThresholding} onChange={(value) => update("dynamicThresholding", value)} />
                <Toggle label="Euler Bug" checked={request.deliberateEulerAncestralBug} onChange={(value) => update("deliberateEulerAncestralBug", value)} />
                <Toggle label="布朗运动" checked={request.preferBrownian} onChange={(value) => update("preferBrownian", value)} />
              </div>
            </div>
          ) : null}
        </section>

        {settings.showPayloadPreview ? (
          <section className="payload-preview">
            <div className="section-head">
              <Braces aria-hidden="true" />
              <h2>请求体预览</h2>
            </div>
            <pre>{JSON.stringify(buildPayloadPreview(request), null, 2)}</pre>
          </section>
        ) : null}
      </aside>
        </>
      ) : activePanel === "promptLibrary" ? (
        <section className="prompt-library-page" aria-label="Prompt library">
          <header className="settings-header">
            <div>
              <p className="eyebrow">Prompt Library</p>
              <h2>Prompt 助手</h2>
              <span>画风单选替换，场景和服装会累积到下方已选框。</span>
            </div>
          </header>

          <section className="settings-panel prompt-library-panel">
            <div className="section-head">
              <WandSparkles aria-hidden="true" />
              <h2>素材查询</h2>
            </div>

            <div className="prompt-library-tabs">
              {PROMPT_ENTRY_TYPES.map((item) => (
                <button
                  className={promptLibraryType === item.type ? "chip active" : "chip"}
                  key={item.type}
                  onClick={() => {
                    setPromptLibraryType(item.type);
                    setPromptLibraryResults([]);
                    setPromptLibraryStatus(null);
                    setPromptLibraryQuery("");
                  }}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="prompt-library-search">
              <input
                value={promptLibraryQuery}
                onChange={(event) => setPromptLibraryQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void searchPromptLibrary();
                  }
                }}
                placeholder="搜索 wlop、坐姿、女仆..."
              />
              <button className="icon-button filled" onClick={() => void searchPromptLibrary()} disabled={isSearchingPromptLibrary} title="搜索" type="button">
                {isSearchingPromptLibrary ? <Loader2 className="spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
              </button>
              <button
                className="icon-button"
                onClick={() => void searchPromptLibrary({ forceRefresh: true })}
                disabled={isSearchingPromptLibrary}
                title="刷新并保存素材库"
                type="button"
              >
                <RefreshCw className={isSearchingPromptLibrary ? "spin" : ""} aria-hidden="true" />
              </button>
            </div>

            {promptLibraryStatus ? <div className="prompt-library-status">{promptLibraryStatus}</div> : null}

            <div className="prompt-library-selection">
              <span>画风：{selectedPromptEntries.style?.title ?? "未选择"}</span>
              <span>场景：{selectedPromptBoxes.scene.length > 0 ? String(selectedPromptBoxes.scene.length) + " 项" : "未选择"}</span>
              <span>服装：{selectedPromptBoxes.clothing.length > 0 ? String(selectedPromptBoxes.clothing.length) + " 项" : "未选择"}</span>
            </div>

            <div className="prompt-library-results">
              {visiblePromptLibraryResults.map((entry) => (
                <button
                  className={isPromptEntrySelected(entry, selectedPromptEntries, selectedPromptBoxes) ? "prompt-library-item active" : "prompt-library-item"}
                  key={entry.slug}
                  onClick={() => togglePromptEntry(entry)}
                  type="button"
                >
                  <strong>{entry.title}</strong>
                  <span>{entry.category?.name ?? promptEntryTypeLabel(entry.entry_type)} · {entry.source?.title ?? "本地素材库"}</span>
                  <PromptEntryImages entry={entry} />
                  <em>{entry.prompt}</em>
                </button>
              ))}
            </div>

            {promptLibraryVisibleCount < promptLibraryResults.length ? (
              <button
                className="ghost-button wide-button"
                onClick={() => setPromptLibraryVisibleCount((count) => Math.min(count + PROMPT_LIBRARY_PAGE_SIZE, promptLibraryResults.length))}
                type="button"
              >
                加载更多（{promptLibraryVisibleCount}/{promptLibraryResults.length}）
              </button>
            ) : null}

            <div className="prompt-library-output">
              <label className="field">
                <span>已选画风</span>
                <textarea readOnly rows={2} value={selectedPromptEntries.style?.prompt?.trim() ?? ""} placeholder="未选择画风" />
              </label>
              <label className="field">
                <span>已选场景/服装</span>
                <textarea readOnly rows={4} value={buildPromptSelectionText(undefined, selectedPromptBoxes)} placeholder="未选择场景或服装" />
              </label>
              <button className="ghost-button wide-button" onClick={() => updateMainPromptFromSelection()} type="button">
                写入提示词
              </button>
            </div>
          </section>

          {notice ? <div className={`notice settings-notice ${notice.type}`}>{notice.message}</div> : null}
        </section>
      ) : activePanel === "favorites" ? (
        <section className="favorites-page" aria-label="Favorite gallery">
          <header className="settings-header">
            <div>
              <p className="eyebrow">Gallery</p>
              <h2>收藏画廊</h2>
              <span>保存你想长期保留的生成结果，点击图片可回到生图工作台。</span>
            </div>
          </header>

          <section className="settings-panel favorites-panel">
            <div className="section-head">
              <Heart aria-hidden="true" />
              <h2>已收藏</h2>
              <span className="section-meta">{favorites.length}</span>
            </div>

            {favorites.length === 0 ? (
              <div className="mini-empty favorites-empty">
                <Heart aria-hidden="true" />
                <strong>暂无收藏</strong>
                <span>在预览图下方点击心形按钮收藏图片。</span>
              </div>
            ) : (
              <div className="favorites-grid">
                {favorites.map((item) => (
                  <article className="favorite-card" key={item.id}>
                    <button className="favorite-image" onClick={() => openFavorite(item)} type="button">
                      <img src={`data:${item.image.mimeType};base64,${item.image.base64}`} alt="" />
                    </button>
                    <div className="favorite-info">
                      <strong>{item.request.prompt || "未命名提示词"}</strong>
                      <span>{new Date(item.createdAt).toLocaleString()} · {formatBytes(item.image.byteLen)}</span>
                    </div>
                    <div className="favorite-actions">
                      <button className="icon-button" onClick={() => copyImage(item.image)} title="复制图片" type="button">
                        <Copy aria-hidden="true" />
                      </button>
                      <button className="icon-button" onClick={() => saveImage(item.image)} title="保存图片" type="button">
                        <Download aria-hidden="true" />
                      </button>
                      <button className="icon-button" onClick={() => removeFavorite(item.id)} title="移除收藏" type="button">
                        <Eraser aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {notice ? <div className={`notice settings-notice ${notice.type}`}>{notice.message}</div> : null}
        </section>
      ) : (
        <section className="settings-page" aria-label="Application settings">
          <header className="settings-header">
            <div>
              <p className="eyebrow">Application</p>
              <h2>设置</h2>
              <span>管理 API Token、显示选项和历史记录行为。</span>
            </div>
          </header>

          <div className="settings-grid">
            <section className="settings-panel">
              <div className="section-head">
                <KeyRound aria-hidden="true" />
                <h2>API Token</h2>
                <i className={hasToken ? "status-dot ok" : "status-dot"} />
              </div>
              <div className="token-row">
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  type="password"
                  placeholder={hasToken ? "Token 已配置" : "持久化 API Token"}
                />
                <button className="run-button" onClick={saveToken} type="button">
                  <Save aria-hidden="true" />
                  保存
                </button>
              </div>
            </section>

            <section className="settings-panel">
              <div className="section-head">
                <ShieldCheck aria-hidden="true" />
                <h2>账号状态</h2>
              </div>
              <div className="account-grid">
                <span>Tier<strong>{account?.tier ?? "未知"}</strong></span>
                <span>点数<strong>{formatOptionalPoints(account?.points)}</strong></span>
                <span>订阅<strong>{account?.active === undefined ? "未知" : account.active ? "有效" : "无效"}</strong></span>
                <span>本次消耗<strong>{lastCost === null ? "未计算" : formatPoints(lastCost)}</strong></span>
              </div>
              <button className="ghost-button wide-button" onClick={() => refreshAccountStatus()} disabled={isRefreshingAccount || !hasToken} type="button">
                <RefreshCw className={isRefreshingAccount ? "spin" : ""} aria-hidden="true" />
                刷新账号状态
              </button>
            </section>

            <section className="settings-panel">
              <div className="section-head">
                <Settings2 aria-hidden="true" />
                <h2>界面</h2>
              </div>
              <div className="settings-stack">
                <Toggle
                  label="显示请求体预览"
                  checked={settings.showPayloadPreview}
                  onChange={(value) => updateSetting("showPayloadPreview", value)}
                />
                <Toggle
                  label="启用应用日志"
                  checked={settings.enableAppLogs}
                  onChange={(value) => updateSetting("enableAppLogs", value)}
                />
                <Toggle
                  label="允许不安全 TLS"
                  checked={settings.allowInvalidTls}
                  onChange={(value) => updateSetting("allowInvalidTls", value)}
                />
                <label className="field">
                  <span>NovelAI 代理地址</span>
                  <input
                    value={settings.novelAiProxyUrl}
                    onChange={(event) => updateSetting("novelAiProxyUrl", event.target.value)}
                    placeholder="http://127.0.0.1:7897"
                  />
                </label>
                <NumberField
                  label="历史显示上限"
                  value={settings.historyDisplayLimit}
                  min={1}
                  max={MAX_HISTORY_ITEMS}
                  onChange={(value) => updateSetting("historyDisplayLimit", clampHistoryLimit(value))}
                />
              </div>
            </section>

            <section className="settings-panel">
              <div className="section-head">
                <Braces aria-hidden="true" />
                <h2>输出设置</h2>
              </div>
              <div className="settings-stack">
                <label className="field">
                  <span>格式</span>
                  <select value={request.imageFormat} onChange={(event) => update("imageFormat", event.target.value as ImageFormat)}>
                    <option value="png">png</option>
                    <option value="webp">webp</option>
                  </select>
                </label>
                <NumberField label="UC 预设" value={request.ucPreset} min={0} max={5} onChange={(value) => update("ucPreset", value)} />
                <NumberField label="参数版本" value={request.paramsVersion} min={1} max={4} onChange={(value) => update("paramsVersion", value)} />
              </div>
            </section>

            <section className="settings-panel wide">
              <div className="section-head">
                <WandSparkles aria-hidden="true" />
                <h2>AI 翻译</h2>
              </div>
              <div className="settings-stack">
                <label className="field">
                  <span>OpenAI 兼容接口地址</span>
                  <input
                    value={settings.translationBaseUrl}
                    onChange={(event) => updateSetting("translationBaseUrl", event.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label className="field">
                  <span>API Key</span>
                  <input
                    value={settings.translationApiKey}
                    onChange={(event) => updateSetting("translationApiKey", event.target.value)}
                    placeholder="sk-..."
                    type="password"
                  />
                </label>
                <label className="field">
                  <span>模型</span>
                  <input
                    value={settings.translationModel}
                    onChange={(event) => updateSetting("translationModel", event.target.value)}
                    placeholder="gpt-4o-mini 或其他兼容模型"
                  />
                </label>
              </div>
            </section>

            <section className="settings-panel wide">
              <div className="section-head">
                <ShieldCheck aria-hidden="true" />
                <h2>生成默认值</h2>
              </div>
              <div className="settings-summary">
                <span>模型：{DEFAULT_REQUEST.model}</span>
                <span>尺寸：{DEFAULT_REQUEST.width} × {DEFAULT_REQUEST.height}</span>
                <span>采样器：{DEFAULT_REQUEST.sampler}</span>
                <span>噪声调度：{DEFAULT_REQUEST.noiseSchedule}</span>
              </div>
            </section>
          </div>

          {notice ? <div className={`notice settings-notice ${notice.type}`}>{notice.message}</div> : null}
        </section>
      )}
      {maskEditorOpen && request.sourceImage ? (
        <MaskEditorModal
          sourceImage={request.sourceImage}
          initialMask={request.maskImage}
          onCancel={() => setMaskEditorOpen(false)}
          onSave={(asset) => {
            update("maskImage", asset);
            setMaskEditorOpen(false);
            showNotice("success", "遮罩已保存。");
          }}
        />
      ) : null}
    </main>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field compact">
      <span>{props.label}</span>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onChange={(event) => {
          props.onChange(Number(event.target.value));
        }}
      />
    </label>
  );
}

function OptionalNumberField(props: {
  label: string;
  value?: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="field compact">
      <span>{props.label}</span>
      <input
        type="number"
        value={props.value ?? ""}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onChange={(event) => {
          const value = event.target.value.trim();
          props.onChange(value === "" ? undefined : Number(value));
        }}
      />
    </label>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

function TranslateButtons(props: {
  disabled: boolean;
  enActive: boolean;
  zhActive: boolean;
  compact?: boolean;
  onEnglish: () => void;
  onChinese: () => void;
}) {
  return (
    <span className={props.compact ? "translate-mini compact" : "translate-mini"}>
      <button
        disabled={props.disabled}
        onClick={props.onEnglish}
        title="中译英 Tag"
        type="button"
      >
        {props.enActive ? <Loader2 className="spin" aria-hidden="true" /> : <WandSparkles aria-hidden="true" />}
        <b>EN</b>
      </button>
      <button
        disabled={props.disabled}
        onClick={props.onChinese}
        title="英译中"
        type="button"
      >
        {props.zhActive ? <Loader2 className="spin" aria-hidden="true" /> : <WandSparkles aria-hidden="true" />}
        <b>中</b>
      </button>
    </span>
  );
}

function AssetPicker(props: {
  label: string;
  asset?: ImageAsset;
  pickLabel?: string;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="asset-picker">
      <button className="asset-preview" onClick={props.onPick} type="button">
        {props.asset ? (
          <img src={`data:${props.asset.mimeType};base64,${props.asset.base64}`} alt="" />
        ) : (
          <ImagePlus aria-hidden="true" />
        )}
      </button>
      <div>
        <span>{props.label}</span>
        <strong>{props.asset?.name ?? "未选择"}</strong>
      </div>
      {props.asset ? (
        <button className="icon-button" onClick={props.onClear} title="清除图片" type="button">
          <Eraser aria-hidden="true" />
        </button>
      ) : (
        <button className="ghost-button" onClick={props.onPick} type="button">
          {props.pickLabel ?? "选择"}
        </button>
      )}
    </div>
  );
}

function MaskEditorModal(props: {
  sourceImage: ImageAsset;
  initialMask?: ImageAsset;
  onCancel: () => void;
  onSave: (asset: ImageAsset) => void;
}) {
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [brushSize, setBrushSize] = useState(56);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  function initializeMask(width: number, height: number) {
    setImageSize({ width, height });
    const overlay = overlayCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!overlay || !mask) {
      return;
    }

    overlay.width = width;
    overlay.height = height;
    mask.width = width;
    mask.height = height;
    const overlayContext = overlay.getContext("2d");
    const maskContext = mask.getContext("2d");
    overlayContext?.clearRect(0, 0, width, height);
    if (maskContext) {
      maskContext.fillStyle = "#000000";
      maskContext.fillRect(0, 0, width, height);
    }

    if (props.initialMask) {
      const image = new Image();
      image.onload = () => {
        const maskContext = mask.getContext("2d");
        const overlayContext = overlay.getContext("2d");
        if (!maskContext || !overlayContext) {
          return;
        }

        maskContext.drawImage(image, 0, 0, width, height);
        const pixels = maskContext.getImageData(0, 0, width, height);
        const overlayPixels = overlayContext.createImageData(width, height);
        for (let index = 0; index < pixels.data.length; index += 4) {
          const selected = pixels.data[index] > 16 || pixels.data[index + 1] > 16 || pixels.data[index + 2] > 16;
          overlayPixels.data[index] = 255;
          overlayPixels.data[index + 1] = 255;
          overlayPixels.data[index + 2] = 255;
          overlayPixels.data[index + 3] = selected ? 184 : 0;
        }
        overlayContext.putImageData(overlayPixels, 0, 0);
      };
      image.src = `data:${props.initialMask.mimeType};base64,${props.initialMask.base64}`;
    }
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = overlayCanvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function drawAt(point: { x: number; y: number }) {
    const overlay = overlayCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!overlay || !mask) {
      return;
    }

    for (const [canvas, color] of [[overlay, "rgba(255, 255, 255, 0.72)"], [mask, "#ffffff"]] as const) {
      const context = canvas.getContext("2d");
      if (!context) {
        continue;
      }
      context.globalCompositeOperation = "source-over";
      context.fillStyle = color;
      context.beginPath();
      context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const point = pointFromEvent(event);
    if (!point) {
      return;
    }
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawAt(point);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) {
      return;
    }
    const point = pointFromEvent(event);
    if (point) {
      drawAt(point);
    }
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function clearMask() {
    const overlay = overlayCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!overlay || !mask) {
      return;
    }
    overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
    const maskContext = mask.getContext("2d");
    if (maskContext) {
      maskContext.fillStyle = "#000000";
      maskContext.fillRect(0, 0, mask.width, mask.height);
    }
  }

  function saveMask() {
    const mask = maskCanvasRef.current;
    if (!mask || imageSize.width === 0 || imageSize.height === 0) {
      return;
    }

    const context = mask.getContext("2d");
    if (context) {
      const pixels = context.getImageData(0, 0, mask.width, mask.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const selected = pixels.data[index] > 16 || pixels.data[index + 1] > 16 || pixels.data[index + 2] > 16;
        const value = selected ? 255 : 0;
        pixels.data[index] = value;
        pixels.data[index + 1] = value;
        pixels.data[index + 2] = value;
        pixels.data[index + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
    }

    const dataUrl = mask.toDataURL("image/png");
    const marker = ";base64,";
    const markerIndex = dataUrl.indexOf(marker);
    props.onSave({
      name: `mask-${props.sourceImage.name.replace(/\.[^.]+$/, "")}.png`,
      mimeType: "image/png",
      base64: dataUrl.slice(markerIndex + marker.length),
    });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="遮罩编辑器">
      <section className="mask-editor">
        <header className="mask-editor-head">
          <div>
            <h2>涂抹局部重绘遮罩</h2>
            <span>白色区域会被重绘，黑色区域保持不变。</span>
          </div>
          <button className="icon-button" onClick={props.onCancel} title="关闭" type="button">
            ×
          </button>
        </header>

        <div className="mask-editor-canvas-wrap">
          <img
            src={`data:${props.sourceImage.mimeType};base64,${props.sourceImage.base64}`}
            alt=""
            onLoad={(event) => initializeMask(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
          />
          <canvas
            ref={overlayCanvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
          />
          <canvas ref={maskCanvasRef} hidden />
        </div>

        <footer className="mask-editor-footer">
          <label className="field compact">
            <span>画笔</span>
            <input
              type="range"
              min={8}
              max={180}
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
            />
          </label>
          <button className="ghost-button" onClick={clearMask} type="button">
            清空
          </button>
          <button className="ghost-button" onClick={props.onCancel} type="button">
            取消
          </button>
          <button className="run-button" onClick={saveMask} type="button">
            保存遮罩
          </button>
        </footer>
      </section>
    </div>
  );
}

function PromptEntryImages(props: { entry: PromptLibraryEntry }) {
  const images = getPromptEntryImages(props.entry);
  if (images.length === 0) {
    return null;
  }

  return (
    <div className="prompt-library-images" aria-hidden="true">
      {images.map((example) => (
        <img key={`${props.entry.slug}-${example.id}`} src={example.url} alt="" loading="lazy" />
      ))}
    </div>
  );
}

function buildTranslationSystemPrompt(direction: TranslationDirection, kind: "positive" | "negative") {
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
    "Do not output Chinese. Do not explain. Do not wrap the result in quotes or markdown.",
    kind === "negative"
      ? "This is a negative prompt: use exclusion tags for unwanted artifacts, anatomy issues, quality problems, text, watermarks, and blur."
      : "This is a positive prompt: optimize for useful descriptive tags, not prose.",
    "Examples:",
    ...examples,
  ].join("\n");
}

function buildTranslationUserPrompt(text: string, direction: TranslationDirection, kind: "positive" | "negative") {
  if (direction === "en-to-zh") {
    return `请把下面的${kind === "negative" ? "负向" : "正向"}prompt 翻译成中文，保留它的 tag 含义：\n${text}`;
  }

  return [
    `请把下面的中文${kind === "negative" ? "负向" : "正向"}prompt 翻译并优化成英文 AI 绘图 tag。`,
    "要求：逗号分隔，简洁，适合 NovelAI/WebUI，保留已有英文 tag。",
    text,
  ].join("\n");
}

function loadSettings(): AppSettings {
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
      novelAiProxyUrl: parsed.novelAiProxyUrl ?? DEFAULT_SETTINGS.novelAiProxyUrl,
      historyDisplayLimit: clampHistoryLimit(
        parsed.historyDisplayLimit ?? DEFAULT_SETTINGS.historyDisplayLimit,
      ),
      knowledgeServerUrl: DEFAULT_SETTINGS.knowledgeServerUrl,
      translationBaseUrl: parsed.translationBaseUrl ?? DEFAULT_SETTINGS.translationBaseUrl,
      translationApiKey: parsed.translationApiKey ?? DEFAULT_SETTINGS.translationApiKey,
      translationModel: parsed.translationModel ?? DEFAULT_SETTINGS.translationModel,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function buildOpenAiChatCompletionsUrl(baseUrl: string) {
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

function parseOpenAiChatResponseText(text: string) {
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

function extractOpenAiChoiceText(value: unknown) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeServerUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function appendPromptText(current: string, addition: string) {
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

function removePromptText(current: string, removal: string) {
  const removalParts = splitPromptParts(removal);
  if (removalParts.length === 0) {
    return current.trim();
  }

  const removalSet = new Set(removalParts.map((part) => normalizePromptPart(part)));
  return splitPromptParts(current)
    .filter((part) => !removalSet.has(normalizePromptPart(part)))
    .join(", ");
}

function splitPromptParts(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizePromptPart(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function promptEntryTypeLabel(type: PromptEntryType) {
  if (type === "style") {
    return "画风";
  }

  return type === "scene" ? "场景" : "服装";
}

function getPromptEntryImages(entry: PromptLibraryEntry) {
  return (entry.examples ?? [])
    .filter((example) => example.kind === "image" && example.url)
    .slice(0, 3);
}

function sortPromptLibraryResults(entries: PromptLibraryEntry[], type: PromptEntryType) {
  if (type !== "style") {
    return entries;
  }

  return [...entries].sort((left, right) => {
    const leftImages = getPromptEntryImages(left).length;
    const rightImages = getPromptEntryImages(right).length;
    return rightImages - leftImages;
  });
}

async function fetchPromptLibraryEntries(entryType: PromptEntryType) {
  const baseUrl = normalizeServerUrl(DEFAULT_SETTINGS.knowledgeServerUrl);
  const params = new URLSearchParams({
    type: entryType,
    limit: String(PROMPT_LIBRARY_MAX_RESULTS),
  });
  const response = await fetch(`${baseUrl}/api/entries?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`素材库请求失败：HTTP ${response.status}`);
  }
  return (await response.json()) as PromptLibraryEntry[];
}

function filterPromptLibraryEntries(entries: PromptLibraryEntry[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return entries;
  }

  return entries.filter((entry) => {
    const haystack = [
      entry.title,
      entry.summary,
      entry.prompt,
      entry.negative_prompt,
      entry.slug,
      entry.category?.name,
      entry.category?.slug,
      entry.source?.title,
      entry.source?.slug,
      ...(entry.tags ?? []),
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function isPromptEntrySelected(
  entry: PromptLibraryEntry,
  selectedStyle: Partial<Record<PromptEntryType, PromptLibraryEntry>>,
  selectedBoxes: Record<Exclude<PromptEntryType, "style">, PromptLibraryEntry[]>,
) {
  if (entry.entry_type === "style") {
    return selectedStyle.style?.slug === entry.slug;
  }
  return selectedBoxes[entry.entry_type].some((item) => item.slug === entry.slug);
}

function buildPromptSelectionText(
  styleEntry: PromptLibraryEntry | undefined,
  selectedBoxes: Record<Exclude<PromptEntryType, "style">, PromptLibraryEntry[]>,
) {
  const parts: string[] = [];
  if (styleEntry?.prompt.trim()) {
    parts.push(styleEntry.prompt.trim());
  }
  for (const item of selectedBoxes.scene) {
    if (item.prompt.trim()) {
      parts.push(item.prompt.trim());
    }
  }
  for (const item of selectedBoxes.clothing) {
    if (item.prompt.trim()) {
      parts.push(item.prompt.trim());
    }
  }
  return parts.join(", ");
}

function effectivePrompt(request: ImageRequest) {
  const style = request.stylePrompt.trim();
  const main = request.prompt.trim();
  if (style && main) {
    return `${style}, ${main}`;
  }
  return style || main;
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function imageAssetFromFile(file: File): Promise<ImageAsset> {
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
    name: file.name,
    mimeType,
    base64: dataUrl.slice(markerIndex + marker.length),
  };
}

function generatedImageToAsset(image: GeneratedImage): ImageAsset {
  return {
    name: image.fileName,
    mimeType: image.mimeType,
    base64: image.base64,
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(2)} MB`;
}

function buildPayloadPreview(request: ImageRequest) {
  const parameters: Record<string, unknown> = {
    width: request.width,
    height: request.height,
    prompt: effectivePrompt(request),
    negative_prompt: request.negativePrompt,
    n_samples: request.nSamples,
    steps: request.steps,
    scale: request.scale,
    cfg_rescale: request.cfgRescale,
    sampler: request.sampler,
    noise_schedule: request.noiseSchedule,
    seed: request.seed,
    image_format: request.imageFormat,
    qualityToggle: request.qualityToggle,
    ucPreset: request.ucPreset,
    params_version: request.paramsVersion,
    dynamic_thresholding: request.dynamicThresholding,
    sm: request.sm,
    sm_dyn: request.smDyn,
    skip_cfg_above_sigma: request.skipCfgAboveSigma,
    deliberate_euler_ancestral_bug: request.deliberateEulerAncestralBug,
    prefer_brownian: request.preferBrownian,
  };

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
  if (request.referenceImage) {
    parameters.reference_image = "[encoded vibe]";
    parameters.reference_strength = request.referenceStrength;
    parameters.reference_information_extracted = request.referenceInformationExtracted;
  }
  if (request.directorReferenceImage) {
    parameters.director_reference_images = [`[${request.directorReferenceImage.name}]`];
    parameters.director_reference_descriptions = [request.directorReferencePrompt || effectivePrompt(request)];
    parameters.director_reference_strength_values = [request.directorReferenceStrength];
    parameters.director_reference_secondary_strength_values = [request.directorReferenceSecondaryStrength];
    parameters.director_reference_information_extracted = [request.directorReferenceInformationExtracted];
  }

  if (isV4ImageModel(request.model)) {
    const characterCaptions = buildCharacterCaptions(request);
    const useCoords = request.useCharacterCoords && characterCaptions.length > 0;
    parameters.legacy = false;
    parameters.legacy_uc = false;
    parameters.add_original_image = false;
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

function buildBackendImageRequest(request: ImageRequest, settings: AppSettings) {
  return {
    ...request,
    prompt: effectivePrompt(request),
    allowInvalidTls: settings.allowInvalidTls,
    proxyUrl: settings.novelAiProxyUrl,
    model: effectiveImageModel(request),
    sourceImage: request.sourceImage?.base64,
    maskImage: request.maskImage?.base64,
    vibeSourceImage: undefined,
    referenceImage: request.referenceImage,
    directorReferenceImage: request.directorReferenceImage?.base64,
  };
}

function effectiveImageModel(request: ImageRequest) {
  if (request.action !== "infill" || request.model.includes("inpainting")) {
    return request.model;
  }

  const map: Record<string, string> = {
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

function isV4ImageModel(model: string) {
  return model.includes("diffusion-4");
}

function buildCharacterCaptions(request: ImageRequest) {
  return (request.characters ?? [])
    .map((character) => ({
      prompt: character.prompt.trim(),
      negativePrompt: character.negativePrompt.trim(),
      centers: [{ x: clampCoordinate(character.x), y: clampCoordinate(character.y) }],
    }))
    .filter((character) => character.prompt.length > 0);
}

function normalizeImageRequest(request: ImageRequest): ImageRequest {
  return {
    ...DEFAULT_REQUEST,
    ...request,
    characters: (request.characters ?? []).map((character) => ({
      id: character.id || crypto.randomUUID(),
      prompt: character.prompt ?? "",
      negativePrompt: character.negativePrompt ?? "",
      x: clampCoordinate(character.x),
      y: clampCoordinate(character.y),
    })),
    useCharacterCoords: request.useCharacterCoords ?? false,
    strength: clamp01(request.strength ?? DEFAULT_REQUEST.strength),
    noise: clamp01(request.noise ?? DEFAULT_REQUEST.noise),
    colorCorrect: request.colorCorrect ?? DEFAULT_REQUEST.colorCorrect,
    referenceStrength: clamp01(request.referenceStrength ?? DEFAULT_REQUEST.referenceStrength),
    referenceInformationExtracted: clamp01(request.referenceInformationExtracted ?? DEFAULT_REQUEST.referenceInformationExtracted),
    directorReferencePrompt: request.directorReferencePrompt ?? "",
    directorReferenceStrength: clamp01(request.directorReferenceStrength ?? DEFAULT_REQUEST.directorReferenceStrength),
    directorReferenceSecondaryStrength: clamp01(request.directorReferenceSecondaryStrength ?? DEFAULT_REQUEST.directorReferenceSecondaryStrength),
    directorReferenceInformationExtracted: clamp01(request.directorReferenceInformationExtracted ?? DEFAULT_REQUEST.directorReferenceInformationExtracted),
  };
}

function extractTagSuggestions(value: unknown): TagSuggestion[] {
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

function clampCoordinate(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

function summarizeAccount(raw: unknown): AccountSummary {
  return {
    tier: normalizeTier(findStringByKeys(raw, ["tier", "subscriptionTier", "plan", "accountTier", "accountType"])),
    points: extractAnlasPoints(raw),
    active: findBooleanByKeys(raw, ["active", "subscriptionActive", "isActive"]),
    expiresAt: findNumberByKeys(raw, ["expiresAt", "expires_at", "expirationTime"]),
    raw,
  };
}

function extractAnlasPoints(raw: unknown) {
  const direct = findNumberByKeys(raw, ["trainingStepsLeft", "anlas", "anlasBalance", "points"]);
  if (direct !== undefined) {
    return direct;
  }

  const fixed = findNumberByKeys(raw, ["fixedTrainingStepsLeft", "fixedAnlas"]);
  const purchased = findNumberByKeys(raw, ["purchasedTrainingSteps", "purchasedAnlas"]);
  if (fixed !== undefined || purchased !== undefined) {
    return (fixed ?? 0) + (purchased ?? 0);
  }

  return undefined;
}

function normalizeTier(value?: string) {
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

function calculateAccountCost(before: AccountSummary | null, after: AccountSummary | null) {
  if (before?.points === undefined || after?.points === undefined) {
    return null;
  }

  const diff = before.points - after.points;
  if (!Number.isFinite(diff) || diff < 0) {
    return null;
  }

  return diff;
}

function formatOptionalPoints(value?: number) {
  return value === undefined ? "未知" : formatPoints(value);
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function findStringByKeys(value: unknown, keys: string[]): string | undefined {
  const found = findByKeys(value, keys);
  if (typeof found === "string" && found.trim()) {
    return found;
  }
  if (typeof found === "number" && Number.isFinite(found)) {
    return String(found);
  }
  return undefined;
}

function findNumberByKeys(value: unknown, keys: string[]): number | undefined {
  for (const found of findAllByKeys(value, keys)) {
    if (typeof found === "number" && Number.isFinite(found)) {
      return found;
    }
    if (typeof found === "string") {
      const parsed = Number(found);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function findBooleanByKeys(value: unknown, keys: string[]): boolean | undefined {
  const found = findByKeys(value, keys);
  return typeof found === "boolean" ? found : undefined;
}

function findByKeys(value: unknown, keys: string[]): unknown {
  return findAllByKeys(value, keys)[0];
}

function findAllByKeys(value: unknown, keys: string[]): unknown[] {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [value];
  const matches: unknown[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (keySet.has(key.toLowerCase())) {
        matches.push(child);
      }
      if (child && typeof child === "object") {
        queue.push(child);
      }
    }
  }

  return matches;
}

function clampHistoryLimit(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.historyDisplayLimit;
  }

  return Math.min(MAX_HISTORY_ITEMS, Math.max(1, Math.round(value)));
}

async function loadHistoryFromIndexedDb(): Promise<HistoryItem[]> {
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
    }));
  } finally {
    db.close();
  }
}

async function loadPromptLibraryCache(type: PromptEntryType): Promise<PromptLibraryCacheRecord | null> {
  if (!("indexedDB" in window)) {
    return null;
  }

  const db = await openHistoryDatabase();
  try {
    const tx = db.transaction(PROMPT_LIBRARY_STORE_NAME, "readonly");
    const store = tx.objectStore(PROMPT_LIBRARY_STORE_NAME);
    const item = await requestToPromise<PromptLibraryCacheRecord | undefined>(store.get(type));
    if (!item || !Array.isArray(item.entries)) {
      return null;
    }
    return item;
  } finally {
    db.close();
  }
}

async function savePromptLibraryCache(record: PromptLibraryCacheRecord) {
  if (!("indexedDB" in window)) {
    return;
  }

  const db = await openHistoryDatabase();
  try {
    const tx = db.transaction(PROMPT_LIBRARY_STORE_NAME, "readwrite");
    const store = tx.objectStore(PROMPT_LIBRARY_STORE_NAME);
    await requestToPromise(store.put(record));
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

async function loadFavoritesFromIndexedDb(): Promise<FavoriteItem[]> {
  if (!("indexedDB" in window)) {
    return [];
  }

  const db = await openHistoryDatabase();
  try {
    const tx = db.transaction(FAVORITES_STORE_NAME, "readonly");
    const store = tx.objectStore(FAVORITES_STORE_NAME);
    const items = (await requestToPromise<FavoriteItem[]>(store.getAll())) ?? [];
    return items
      .map((item) => ({
        ...item,
        request: normalizeImageRequest(item.request),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally {
    db.close();
  }
}

async function saveFavoritesToIndexedDb(favorites: FavoriteItem[]) {
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

async function saveHistoryToIndexedDb(history: HistoryItem[]) {
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

function migrateLegacyHistoryFromLocalStorage() {
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

function openHistoryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        db.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PROMPT_LIBRARY_STORE_NAME)) {
        db.createObjectStore(PROMPT_LIBRARY_STORE_NAME, { keyPath: "type" });
      }
      if (!db.objectStoreNames.contains(FAVORITES_STORE_NAME)) {
        db.createObjectStore(FAVORITES_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

function requestToPromise<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function sortHistory(history: HistoryItem[]) {
  return [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function parseNovelAiImageMetadata(buffer: ArrayBuffer): Promise<ImportedImageMetadata> {
  const chunks = await readImageMetadataChunks(buffer);
  const texts = new Map<string, string>();

  for (const chunk of chunks) {
    texts.set(chunk.keyword.toLowerCase(), chunk.text);
  }

  const rawCandidates = [
    texts.get("comment"),
    texts.get("description"),
    texts.get("parameters"),
    texts.get("prompt"),
    ...texts.values(),
  ].filter(Boolean) as string[];

  const parsedObjects: unknown[] = [];
  const parsedJsonTexts = new Set<string>();
  for (const value of rawCandidates) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        parsedObjects.push(JSON.parse(trimmed));
        parsedJsonTexts.add(trimmed);
      } catch {
        // keep going with raw text candidates
      }
    }

    for (const jsonText of extractJsonCandidatesFromText(trimmed)) {
      if (parsedJsonTexts.has(jsonText)) {
        continue;
      }
      try {
        parsedObjects.push(JSON.parse(jsonText));
        parsedJsonTexts.add(jsonText);
      } catch {
        // keep going with other embedded candidates
      }
    }
  }

  const prompt =
    findStringInSources(parsedObjects, ["prompt", "input"]) ??
    findNestedCaptionText(parsedObjects, "v4_prompt") ??
    parsePromptTextFromMetadataStrings(rawCandidates) ??
    texts.get("comment") ??
    texts.get("description");
  const negativePrompt =
    findStringInSources(parsedObjects, ["negative_prompt", "negativeprompt", "uc", "negative"]) ??
    findNestedCaptionText(parsedObjects, "v4_negative_prompt") ??
    parseNegativePromptFromMetadataStrings(rawCandidates) ??
    undefined;
  const characters = findCharacterPromptsFromSources(parsedObjects);
  const useCharacterCoords = findBooleanInSources(parsedObjects, ["use_coords", "usecoords"]);

  const width = findNumberInSources(parsedObjects, ["width"]);
  const height = findNumberInSources(parsedObjects, ["height"]);
  const steps = findNumberInSources(parsedObjects, ["steps"]);
  const scale = findNumberInSources(parsedObjects, ["scale"]);
  const cfgRescale = findNumberInSources(parsedObjects, ["cfg_rescale", "cfgrescale"]);
  const seed = findNumberInSources(parsedObjects, ["seed"]);
  const sampler = findStringInSources(parsedObjects, ["sampler"]);
  const noiseSchedule = findStringInSources(parsedObjects, ["noise_schedule", "noiseschedule"]);
  const model = findStringInSources(parsedObjects, ["model"]) ?? parseNovelAiModelFromSource(texts.get("source"));
  const nSamples = findNumberInSources(parsedObjects, ["n_samples", "nsamples"]);

  return {
    prompt: extractPromptText(prompt),
    negativePrompt: extractPromptText(negativePrompt),
    characters,
    useCharacterCoords: characters.length > 0 ? (useCharacterCoords ?? hasCharacterCenters(characters)) : undefined,
    textChunkCount: chunks.length,
    textChunkKeywords: chunks.map((chunk) => chunk.keyword),
    width,
    height,
    steps,
    scale,
    cfgRescale,
    seed,
    sampler,
    noiseSchedule,
    model,
    nSamples,
  };
}

function extractPromptText(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function findStringInSources(sources: unknown[], keys: string[]) {
  for (const source of sources) {
    const found = findStringByKeys(source, keys);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function findNumberInSources(sources: unknown[], keys: string[]) {
  for (const source of sources) {
    const found = findNumberByKeys(source, keys);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findBooleanInSources(sources: unknown[], keys: string[]) {
  for (const source of sources) {
    const found = findBooleanByKeys(source, keys);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findCharacterPromptsFromSources(sources: unknown[]): CharacterPrompt[] {
  const positive = findV4CharacterCaptions(sources, "v4_prompt");
  const negative = findV4CharacterCaptions(sources, "v4_negative_prompt");
  const count = Math.max(positive.length, negative.length);
  const characters: CharacterPrompt[] = [];

  for (let index = 0; index < count; index += 1) {
    const positiveCharacter = positive[index];
    const negativeCharacter = negative[index];
    const prompt = positiveCharacter?.prompt ?? "";
    const negativePrompt = negativeCharacter?.prompt ?? "";
    const center = positiveCharacter?.center ?? negativeCharacter?.center ?? defaultCharacterCenter(index);

    if (!prompt.trim() && !negativePrompt.trim()) {
      continue;
    }

    characters.push({
      id: crypto.randomUUID(),
      prompt,
      negativePrompt,
      x: clampCoordinate(center.x),
      y: clampCoordinate(center.y),
    });
  }

  return characters;
}

function findV4CharacterCaptions(sources: unknown[], key: string) {
  for (const source of sources) {
    const candidate = findByKeys(source, [key]);
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const caption = findByKeys(candidate, ["caption"]);
    if (!caption || typeof caption !== "object") {
      continue;
    }

    const rawCharacters = findByKeys(caption, ["char_captions", "charCaptions"]);
    if (!Array.isArray(rawCharacters)) {
      continue;
    }

    return rawCharacters
      .map((value, index) => parseV4CharacterCaption(value, index))
      .filter((value): value is { prompt: string; center: { x: number; y: number } } => value !== null);
  }

  return [];
}

function parseV4CharacterCaption(value: unknown, index: number) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const prompt = findStringByKeys(value, ["char_caption", "charCaption", "caption", "prompt"]) ?? "";
  const center = findCharacterCenter(value) ?? defaultCharacterCenter(index);
  return {
    prompt,
    center,
  };
}

function findCharacterCenter(value: unknown) {
  const centers = findByKeys(value, ["centers", "center"]);
  const firstCenter = Array.isArray(centers) ? centers[0] : centers;
  if (!firstCenter || typeof firstCenter !== "object") {
    return undefined;
  }

  const x = findNumberByKeys(firstCenter, ["x"]);
  const y = findNumberByKeys(firstCenter, ["y"]);
  if (x === undefined || y === undefined) {
    return undefined;
  }

  return { x, y };
}

function defaultCharacterCenter(index: number) {
  return {
    x: clampCoordinate(0.35 + index * 0.2),
    y: 0.5,
  };
}

function hasCharacterCenters(characters: CharacterPrompt[]) {
  return characters.some((character) => Number.isFinite(character.x) && Number.isFinite(character.y));
}

function parsePromptTextFromMetadataStrings(values: string[]) {
  for (const value of values) {
    const prompt = extractFieldFromText(value, ["prompt", "positive prompt"]);
    if (prompt) {
      return prompt;
    }
  }
  return undefined;
}

function parseNegativePromptFromMetadataStrings(values: string[]) {
  for (const value of values) {
    const negative = extractFieldFromText(value, ["negative prompt", "uc"]);
    if (negative) {
      return negative;
    }
  }
  return undefined;
}

function extractJsonCandidatesFromText(text: string) {
  const candidates: string[] = [];
  const stack: string[] = [];
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      if (stack.length === 0) {
        start = index;
      }
      stack.push(char);
      continue;
    }

    if (char !== "}" && char !== "]") {
      continue;
    }

    const open = stack.pop();
    if ((char === "}" && open !== "{") || (char === "]" && open !== "[")) {
      stack.length = 0;
      start = -1;
      continue;
    }

    if (stack.length === 0 && start >= 0) {
      candidates.push(text.slice(start, index + 1));
      start = -1;
    }
  }

  return candidates;
}

function parseNovelAiModelFromSource(source?: string) {
  if (!source) {
    return undefined;
  }

  const normalized = source.toLowerCase();
  if (normalized.includes("v4.5")) {
    return "nai-diffusion-4-5-full";
  }
  if (normalized.includes("v4")) {
    return "nai-diffusion-4-full";
  }
  if (normalized.includes("v3")) {
    return "nai-diffusion-3";
  }
  if (normalized.includes("v2")) {
    return "nai-diffusion-2";
  }
  return undefined;
}

function findMetadataImageFileFromClipboard(data: DataTransfer | null) {
  if (!data) {
    return null;
  }

  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") {
      continue;
    }

    const file = item.getAsFile();
    if (file && isMetadataImageFile(file)) {
      return ensureNamedClipboardImageFile(file);
    }
  }

  for (const file of Array.from(data.files)) {
    if (isMetadataImageFile(file)) {
      return ensureNamedClipboardImageFile(file);
    }
  }

  return null;
}

function isMetadataImageFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type === "image/png" ||
    file.type === "image/webp" ||
    name.endsWith(".png") ||
    name.endsWith(".webp");
}

function ensureNamedClipboardImageFile(file: File) {
  if (file.name) {
    return file;
  }

  const mimeType = file.type || "image/png";
  const extension = mimeType === "image/webp" ? "webp" : "png";
  return new File([file], `clipboard.${extension}`, {
    type: mimeType,
    lastModified: file.lastModified || Date.now(),
  });
}

function extractFieldFromText(text: string, labels: string[]) {
  const normalized = text.replace(/\r\n/g, "\n");
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*[A-Za-z][A-Za-z _-]*\\s*:\\s*|$)`, "i");
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const value = match[1].trim();
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findNestedCaptionText(sources: unknown[], key: string) {
  for (const source of sources) {
    const candidate = findByKeys(source, [key]);
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const caption = findByKeys(candidate, ["caption"]);
    if (!caption || typeof caption !== "object") {
      continue;
    }

    const baseCaption = findStringByKeys(caption, ["base_caption"]);
    if (baseCaption) {
      return baseCaption;
    }
  }

  return undefined;
}

async function readImageMetadataChunks(buffer: ArrayBuffer): Promise<PngTextChunk[]> {
  if (isPngBuffer(buffer)) {
    return [
      ...readPngTextChunks(buffer),
      ...(await readStealthPngTextChunks(buffer)),
    ];
  }

  if (isWebpBuffer(buffer)) {
    return readWebpMetadataChunks(buffer);
  }

  throw new Error("仅支持 PNG 和 WebP 图片元数据导入");
}

function isPngBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((value, index) => bytes[index] === value);
}

function isWebpBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 12 && readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP";
}

function readPngTextChunks(buffer: ArrayBuffer): PngTextChunk[] {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) {
    throw new Error("不是有效的 PNG 文件");
  }

  const chunks: PngTextChunk[] = [];
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      break;
    }

    if (type === "tEXt") {
      const data = readBytes(bytes, dataStart, length);
      const separator = data.indexOf(0);
      if (separator > 0) {
        const keyword = decodeText(data.slice(0, separator));
        const text = decodeText(data.slice(separator + 1));
        chunks.push({ keyword, text });
      }
    } else if (type === "iTXt") {
      const data = readBytes(bytes, dataStart, length);
      const chunk = decodeItxtChunk(data);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    offset = dataEnd + 4;
  }

  return chunks;
}

async function readStealthPngTextChunks(buffer: ArrayBuffer): Promise<PngTextChunk[]> {
  const image = readPngRasterInfo(buffer);
  if (!image || image.bitDepth !== 8 || (image.colorType !== 2 && image.colorType !== 6)) {
    return [];
  }

  const bytesPerPixel = image.colorType === 6 ? 4 : 3;
  const inflated = await decompressBytes(concatBytes(image.idatChunks), "deflate");
  if (!inflated) {
    return [];
  }

  const pixels = unfilterPngPixels(inflated, image.width, image.height, bytesPerPixel);
  if (!pixels) {
    return [];
  }

  const attempts = image.colorType === 6
    ? [
        { channels: [3], columnFirst: true },
        { channels: [0, 1, 2], columnFirst: true },
        { channels: [3], columnFirst: false },
        { channels: [0, 1, 2], columnFirst: false },
      ]
    : [
        { channels: [0, 1, 2], columnFirst: true },
        { channels: [0, 1, 2], columnFirst: false },
      ];

  for (const attempt of attempts) {
    const stealth = await extractStealthPngPayload(
      pixels,
      image.width,
      image.height,
      bytesPerPixel,
      attempt.channels,
      attempt.columnFirst,
    );
    if (stealth.length > 0) {
      return stealth;
    }
  }

  return [];
}

function readPngRasterInfo(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) {
    return null;
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Uint8Array[] = [];
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      break;
    }

    if (type === "IHDR") {
      width = readUint32(bytes, dataStart);
      height = readUint32(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
    } else if (type === "IDAT") {
      idatChunks.push(readBytes(bytes, dataStart, length));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height || idatChunks.length === 0) {
    return null;
  }

  return { width, height, bitDepth, colorType, idatChunks };
}

function readWebpMetadataChunks(buffer: ArrayBuffer): PngTextChunk[] {
  const bytes = new Uint8Array(buffer);
  if (!isWebpBuffer(buffer)) {
    return [];
  }

  const chunks: PngTextChunk[] = [];
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const type = readAscii(bytes, offset, 4);
    const length = readUint32Le(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) {
      break;
    }

    const data = readBytes(bytes, dataStart, length);
    if (type === "EXIF") {
      chunks.push(...readExifMetadataChunks(data));
    } else if (type === "XMP ") {
      const text = decodeText(data);
      chunks.push({ keyword: "xmp", text });
      chunks.push(...parseTextMetadataObjectChunks(text));
    }

    offset = dataEnd + (length % 2);
  }

  return dedupeMetadataChunks(chunks);
}

function readExifMetadataChunks(data: Uint8Array): PngTextChunk[] {
  const tiffStart = startsWithAscii(data, 0, "Exif\0\0") ? 6 : 0;
  const chunks = parseTiffExifChunks(data, tiffStart);
  chunks.push(...extractPrintableMetadataChunks(data, "exif"));
  return dedupeMetadataChunks(chunks);
}

function parseTiffExifChunks(data: Uint8Array, tiffStart: number): PngTextChunk[] {
  if (tiffStart + 8 > data.length) {
    return [];
  }

  const littleEndian = readAscii(data, tiffStart, 2) === "II";
  const bigEndian = readAscii(data, tiffStart, 2) === "MM";
  if (!littleEndian && !bigEndian) {
    return [];
  }

  const magic = readUint16Endian(data, tiffStart + 2, littleEndian);
  if (magic !== 42) {
    return [];
  }

  const firstIfdOffset = readUint32Endian(data, tiffStart + 4, littleEndian);
  const visited = new Set<number>();
  const chunks: PngTextChunk[] = [];

  function parseIfd(relativeOffset: number) {
    if (!relativeOffset || visited.has(relativeOffset)) {
      return;
    }

    visited.add(relativeOffset);
    const ifdOffset = tiffStart + relativeOffset;
    if (ifdOffset + 2 > data.length) {
      return;
    }

    const count = readUint16Endian(data, ifdOffset, littleEndian);
    const entriesStart = ifdOffset + 2;
    for (let index = 0; index < count; index += 1) {
      const entryOffset = entriesStart + index * 12;
      if (entryOffset + 12 > data.length) {
        return;
      }

      const tag = readUint16Endian(data, entryOffset, littleEndian);
      const type = readUint16Endian(data, entryOffset + 2, littleEndian);
      const itemCount = readUint32Endian(data, entryOffset + 4, littleEndian);
      const valueOffset = entryValueOffset(data, tiffStart, entryOffset, type, itemCount, littleEndian);
      const byteLength = exifTypeByteLength(type) * itemCount;
      if (valueOffset < 0 || byteLength <= 0 || valueOffset + byteLength > data.length) {
        continue;
      }

      if (tag === 0x8769) {
        parseIfd(readUint32Endian(data, valueOffset, littleEndian));
        continue;
      }

      const keyword = exifTagKeyword(tag);
      if (!keyword) {
        continue;
      }

      const value = decodeExifValue(data.slice(valueOffset, valueOffset + byteLength), type, tag);
      if (value) {
        chunks.push({ keyword, text: value });
      }
    }

    const nextOffsetPosition = entriesStart + count * 12;
    if (nextOffsetPosition + 4 <= data.length) {
      parseIfd(readUint32Endian(data, nextOffsetPosition, littleEndian));
    }
  }

  parseIfd(firstIfdOffset);
  return chunks;
}

function entryValueOffset(
  data: Uint8Array,
  tiffStart: number,
  entryOffset: number,
  type: number,
  itemCount: number,
  littleEndian: boolean,
) {
  const byteLength = exifTypeByteLength(type) * itemCount;
  if (byteLength <= 4) {
    return entryOffset + 8;
  }

  return tiffStart + readUint32Endian(data, entryOffset + 8, littleEndian);
}

function exifTypeByteLength(type: number) {
  if (type === 1 || type === 2 || type === 7) {
    return 1;
  }
  if (type === 3) {
    return 2;
  }
  if (type === 4 || type === 9) {
    return 4;
  }
  if (type === 5 || type === 10) {
    return 8;
  }
  return 0;
}

function exifTagKeyword(tag: number) {
  if (tag === 0x010e) {
    return "Description";
  }
  if (tag === 0x0131) {
    return "Software";
  }
  if (tag === 0x9286) {
    return "Comment";
  }
  return undefined;
}

function decodeExifValue(value: Uint8Array, type: number, tag: number) {
  if (tag === 0x9286) {
    return decodeExifUserComment(value);
  }
  if (type === 2 || type === 7 || type === 1) {
    return trimMetadataText(decodeText(value));
  }
  return undefined;
}

function decodeExifUserComment(value: Uint8Array) {
  const prefix = decodeLatin1(value.slice(0, Math.min(8, value.length)));
  if (prefix.startsWith("UNICODE")) {
    return trimMetadataText(decodeUtf16Be(value.slice(8)));
  }
  if (prefix.startsWith("ASCII")) {
    return trimMetadataText(decodeText(value.slice(8)));
  }
  return trimMetadataText(decodeText(value));
}

function extractPrintableMetadataChunks(data: Uint8Array, prefix: string): PngTextChunk[] {
  const text = decodeText(data);
  const candidates = text.match(/[\x20-\x7e\t\r\n]{24,}/g) ?? [];
  const chunks: PngTextChunk[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const trimmed = trimMetadataText(candidate);
    if (!trimmed || !looksLikeUsefulMetadata(trimmed)) {
      continue;
    }
    chunks.push({ keyword: `${prefix}-${index + 1}`, text: trimmed });
    chunks.push(...parseTextMetadataObjectChunks(trimmed));
  }

  return chunks;
}

function parseTextMetadataObjectChunks(text: string): PngTextChunk[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }

    return Object.entries(parsed as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string")
      .map(([keyword, value]) => ({ keyword, text: value as string }));
  } catch {
    return [];
  }
}

function looksLikeUsefulMetadata(text: string) {
  const lower = text.toLowerCase();
  return lower.includes("novelai") ||
    lower.includes("prompt") ||
    lower.includes("description") ||
    lower.includes("uc") ||
    lower.includes("v4_prompt") ||
    lower.includes("nai-diffusion");
}

function trimMetadataText(value: string) {
  return value.replace(/\0/g, "").trim();
}

function dedupeMetadataChunks(chunks: PngTextChunk[]) {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const key = `${chunk.keyword}\0${chunk.text}`;
    if (!chunk.text.trim() || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function extractStealthPngPayload(
  pixels: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number,
  channels: number[],
  columnFirst: boolean,
): Promise<PngTextChunk[]> {
  const signatures = ["stealth_pnginfo", "stealth_pngcomp"];
  const headerLength = Math.max(...signatures.map((signature) => signature.length)) + 4;
  const header = readStealthBytes(pixels, width, height, bytesPerPixel, channels, columnFirst, headerLength);
  const headerText = decodeLatin1(header);
  const signature = signatures.find((value) => headerText.startsWith(value));
  if (!signature) {
    return [];
  }

  const bitLength = readBigEndianUint32(header, signature.length);
  const availableBits = width * height * channels.length - (signature.length + 4) * 8;
  if (bitLength <= 0 || bitLength > availableBits) {
    return [];
  }

  const payloadByteLength = Math.ceil(bitLength / 8);
  const allBytes = readStealthBytes(
    pixels,
    width,
    height,
    bytesPerPixel,
    channels,
    columnFirst,
    signature.length + 4 + payloadByteLength,
  );
  const payload = allBytes.slice(signature.length + 4, signature.length + 4 + payloadByteLength);
  const text = signature === "stealth_pngcomp"
    ? await decompressBytes(payload, "gzip").then((value) => value ? decodeText(value) : "")
    : decodeText(payload);

  return parseStealthMetadataText(text);
}

function readStealthBytes(
  pixels: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number,
  channels: number[],
  columnFirst: boolean,
  byteCount: number,
) {
  const output = new Uint8Array(byteCount);
  let bitIndex = 0;
  const targetBits = byteCount * 8;
  const pushPixel = (x: number, y: number) => {
    const offset = (y * width + x) * bytesPerPixel;
    for (const channel of channels) {
      if (bitIndex >= targetBits) {
        return;
      }
      const bit = pixels[offset + channel] & 1;
      output[Math.floor(bitIndex / 8)] |= bit << (7 - (bitIndex % 8));
      bitIndex += 1;
    }
  };

  if (columnFirst) {
    for (let x = 0; x < width && bitIndex < targetBits; x += 1) {
      for (let y = 0; y < height && bitIndex < targetBits; y += 1) {
        pushPixel(x, y);
      }
    }
  } else {
    for (let y = 0; y < height && bitIndex < targetBits; y += 1) {
      for (let x = 0; x < width && bitIndex < targetBits; x += 1) {
        pushPixel(x, y);
      }
    }
  }

  return output;
}

function parseStealthMetadataText(text: string): PngTextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string")
        .map(([keyword, value]) => ({ keyword, text: value as string }));
    }
  } catch {
    // Fall back to treating the payload as a raw metadata string.
  }

  return [{ keyword: "parameters", text: trimmed }];
}

function unfilterPngPixels(inflated: Uint8Array, width: number, height: number, bytesPerPixel: number) {
  const stride = width * bytesPerPixel;
  const expectedLength = height * (stride + 1);
  if (inflated.length < expectedLength) {
    return null;
  }

  const pixels = new Uint8Array(height * stride);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowStart = y * stride;
    const previousRowStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[previousRowStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[previousRowStart + x - bytesPerPixel] : 0;
      let value = raw;

      if (filter === 1) {
        value = raw + left;
      } else if (filter === 2) {
        value = raw + up;
      } else if (filter === 3) {
        value = raw + Math.floor((left + up) / 2);
      } else if (filter === 4) {
        value = raw + paethPredictor(left, up, upLeft);
      } else if (filter !== 0) {
        return null;
      }

      pixels[rowStart + x] = value & 255;
    }

    inputOffset += stride;
  }

  return pixels;
}

function paethPredictor(left: number, up: number, upLeft: number) {
  const predictor = left + up - upLeft;
  const leftDistance = Math.abs(predictor - left);
  const upDistance = Math.abs(predictor - up);
  const upLeftDistance = Math.abs(predictor - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

async function decompressBytes(bytes: Uint8Array, format: "deflate" | "gzip") {
  const ctor = (globalThis as typeof globalThis & {
    DecompressionStream?: new(format: "deflate" | "gzip") => TransformStream<Uint8Array, Uint8Array>;
  }).DecompressionStream;
  if (!ctor) {
    return null;
  }

  try {
    const payload = new Uint8Array(bytes);
    const stream = new Blob([payload.buffer as ArrayBuffer]).stream().pipeThrough(new ctor(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function concatBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function readBigEndianUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function decodeLatin1(bytes: Uint8Array) {
  return String.fromCharCode(...bytes);
}

function decodeItxtChunk(data: Uint8Array): PngTextChunk | null {
  let cursor = 0;
  const keywordEnd = indexOfZero(data, cursor);
  if (keywordEnd < 0) {
    return null;
  }
  const keyword = decodeText(data.slice(cursor, keywordEnd));
  cursor = keywordEnd + 1;
  if (cursor + 2 > data.length) {
    return null;
  }

  const compressionFlag = data[cursor];
  cursor += 1;
  cursor += 1; // compression method

  const languageEnd = indexOfZero(data, cursor);
  if (languageEnd < 0) {
    return null;
  }
  cursor = languageEnd + 1;

  const translatedEnd = indexOfZero(data, cursor);
  if (translatedEnd < 0) {
    return null;
  }
  cursor = translatedEnd + 1;

  const textData = data.slice(cursor);
  if (compressionFlag !== 0) {
    return null;
  }

  return {
    keyword,
    text: decodeText(textData),
  };
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function readUint32Le(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readUint16Endian(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32Endian(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  return littleEndian ? readUint32Le(bytes, offset) : readUint32(bytes, offset);
}

function readBytes(bytes: Uint8Array, offset: number, length: number) {
  return bytes.slice(offset, offset + length);
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function startsWithAscii(bytes: Uint8Array, offset: number, value: string) {
  if (offset + value.length > bytes.length) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function decodeText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return String.fromCharCode(...bytes);
  }
}

function decodeUtf16Be(bytes: Uint8Array) {
  const codeUnits: number[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    codeUnits.push((bytes[index] << 8) | bytes[index + 1]);
  }
  return String.fromCharCode(...codeUnits);
}

function indexOfZero(bytes: Uint8Array, start: number) {
  for (let i = start; i < bytes.length; i += 1) {
    if (bytes[i] === 0) {
      return i;
    }
  }
  return -1;
}

export default App;
