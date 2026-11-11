import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  Braces,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Download,
  Eraser,
  FolderOpen,
  Heart,
  History,
  Images,
  ImagePlus,
  KeyRound,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  RefreshCw,
  UserPlus,
  Users,
  WandSparkles,
  ZoomIn,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent as ReactClipboardEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import appIcon from "./assets/logo-128.png";
import { PresetsPage } from "./PresetsPage";
import { errorMessage } from "./errors";
import { clamp01, clampCoordinate, findAllByKeys, findBooleanByKeys, findByKeys, findNumberByKeys, findStringByKeys, isImageFile, isImagePath, isRecord } from "./valueUtils";
import { findImageFileFromClipboard, parseNovelAiImageMetadata } from "./imageMetadata";
import {
  HistoryGalleryPage,
  HistoryThumbnailMenu,
  NumberField,
  OptionalNumberField,
  Toggle,
  TranslateButtons,
  AssetPicker,
  MultiAssetPicker,
  ClipboardImageChoiceModal,
  MaskEditorModal,
} from "./components";
import {
  growMaskSelection,
  buildTranslationSystemPrompt,
  buildTranslationUserPrompt,
  loadSettings,
  buildOpenAiChatCompletionsUrl,
  parseOpenAiChatResponseText,
  extractOpenAiChoiceText,
  normalizeServerUrl,
  appendPromptText,
  removePromptText,
  splitPromptParts,
  normalizePromptPart,
  effectivePrompt,
  isTauriRuntime,
  base64ToBlob,
  imageKey,
  createThumbnailBase64,
  imageDataUrl,
  fullImageDataUrl,
  imageAssetFromFile,
  generatedImageToAsset,
  loadImageElement,
  imageAssetFromCanvas,
  prepareDirectorReferenceImage,
  featherMaskWeights,
  restoreInpaintAlpha,
  formatBytes,
  buildPayloadPreview,
  buildBackendImageRequest,
  activeNovelAiProxyUrl,
  effectiveImageModel,
  isModernImageModel,
  isV5ImageModel,
  defaultStepsForImageModel,
  getUpscaleModel,
  buildCharacterCaptions,
  normalizeImageRequest,
  extractTagSuggestions,
  summarizeAccount,
  extractTrialImages,
  extractAnlasBalance,
  readTrainingStepsBalance,
  readDirectNumber,
  normalizeTier,
  isTokenNotConfiguredError,
  estimateAnlasCost,
  isAnlasEstimateSupportedModel,
  calculateAccountCost,
  formatEstimatedCost,
  formatOptionalTrialImages,
  describeFreeGeneration,
  formatFreeGenerationReason,
  describeAnlasBalance,
  ApiStatusPill,
  formatOptionalPoints,
  formatPoints,
  clampHistoryLimit,
  historyToPersist,
  ensureImageIds,
  stripImagePayloads,
  loadHistoryFromIndexedDb,
  loadFavoritesFromIndexedDb,
  saveFavoritesToIndexedDb,
  saveHistoryToIndexedDb,
  migrateLegacyHistoryFromLocalStorage,
  openHistoryDatabase,
  requestToPromise,
  transactionDone,
  sortHistory,
  mediumEffortActive,
} from "./helpers";
import {
  QUALITY_PRESET_LABEL,
  TAG_HINT,
  UC_PRESET_LABEL,
  V5_COMPLEXITY_TAGS,
  availableUcPresets,
  maxCharactersForModel,
  mediumEffortForModel,
  type QualityPresetId,
} from "./modelProfiles";
import type {
  ImageAction,
  ImageFormat,
  ImageRequest,
  CharacterPrompt,
  GeneratedImage,
  ImageAsset,
  GenerateImageResponse,
  ImageStreamEvent,
  GenerationProgress,
  HistoryItem,
  FavoriteItem,
  PersistedHistoryItem,
  Notice,
  TranslationDirection,
  AppSettings,
  AccountSummary,
  AnlasEstimate,
  TagSuggestion,
  DirectorToolType,
  PngTextChunk,
  ImportedImageMetadata,
  PendingClipboardImage,
} from "./types";
import {
  DEFAULT_REQUEST,
  DEFAULT_SETTINGS,
  TOKEN_NOT_CONFIGURED_ERROR,
  TOKEN_NOT_CONFIGURED_MESSAGE,
  HISTORY_KEY,
  SETTINGS_KEY,
  HISTORY_DB_NAME,
  HISTORY_DB_VERSION,
  HISTORY_STORE_NAME,
  FAVORITES_STORE_NAME,
  MAX_HISTORY_ITEMS,
  LEGACY_DEFAULT_NOVELAI_PROXY_URL,
  MODELS,
  SAMPLERS,
  NOISE_SCHEDULES,
  SIZE_PRESETS,
  UPSCALE_BLUR_SIGMAS,
  DIRECTOR_REFERENCE_CANVASES,
} from "./constants";
import { WritingStudio } from "./WritingStudio";
import { LocalApiSettings } from "./LocalApiSettings";
import {
  fromSharedPresets,
  loadPresetStore,
  mergePresetStores,
  savePresetStore,
  SHARED_PRESETS_MIGRATED_KEY,
  toSharedPresets,
  type PresetStore,
  type SavedPreset,
  type SharedPreset,
} from "./presets";































function App() {
  const [request, setRequest] = useState<ImageRequest>(DEFAULT_REQUEST);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [activeImages, setActiveImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pendingClipboardImage, setPendingClipboardImage] = useState<PendingClipboardImage | null>(null);
  const [apiToolsOpen, setApiToolsOpen] = useState(true);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);
  const [stylePromptOpen, setStylePromptOpen] = useState(true);
  const [styleTemplatePage, setStyleTemplatePage] = useState(0);
  const [sizePresetOpen, setSizePresetOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<"generate" | "writing" | "history" | "presets" | "settings" | "favorites">("generate");
  const [writingVisited, setWritingVisited] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [presetStore, setPresetStore] = useState<PresetStore>(() => loadPresetStore());
  const [presetSyncReady, setPresetSyncReady] = useState(() => !isTauriRuntime());
  const [presetSyncAvailable, setPresetSyncAvailable] = useState(() => !isTauriRuntime());
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [isRefreshingAccount, setIsRefreshingAccount] = useState(false);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [favoritesReady, setFavoritesReady] = useState(false);
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
  const [upscaleBlurSigma, setUpscaleBlurSigma] = useState<number | undefined>(undefined);
  const [directorToolType, setDirectorToolType] = useState<DirectorToolType>("lineart");
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [parameterDrawerOpen, setParameterDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) {
      showNotice("info", "浏览器预览模式：API Token 和生成命令需要在 Tauri 桌面环境中使用。");
      return;
    }

    invoke<boolean>("has_api_token")
      .then((configured) => {
        setHasToken(configured);
        if (!configured) {
          setAccount(null);
        }
        if (configured) {
          refreshAccountStatus(false);
        }
      })
      .catch((error) => showNotice("error", errorMessage(error)));
  }, []);

  useEffect(() => {
    if (!historyReady) {
      return;
    }

    void saveHistoryToIndexedDb(historyToPersist(history.slice(0, MAX_HISTORY_ITEMS))).catch((error) => {
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
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    void invoke<SharedPreset[] | null>("load_shared_presets")
      .then((shared) => {
        if (cancelled) {
          return;
        }
        if (shared !== null) {
          const imported = fromSharedPresets(shared);
          const migrated = localStorage.getItem(SHARED_PRESETS_MIGRATED_KEY) === "1";
          setPresetStore(migrated ? imported : mergePresetStores(presetStore, imported));
        } else {
          // Also clean a hot-reloaded session that still held the old
          // built-in templates in React state.
          setPresetStore(loadPresetStore());
        }
        localStorage.setItem(SHARED_PRESETS_MIGRATED_KEY, "1");
        setPresetSyncAvailable(true);
        setPresetSyncReady(true);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error("共享预设读取失败", error);
        setPresetSyncReady(true);
        showNotice("error", "共享预设读取失败，本次只保留本地预设。");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!presetSyncReady) {
      return;
    }

    savePresetStore(presetStore);
    if (!isTauriRuntime() || !presetSyncAvailable) {
      return;
    }

    void invoke("save_shared_presets", { presets: toSharedPresets(presetStore) }).catch((error) => {
      console.error("共享预设写入失败", error);
      showNotice("error", "共享预设写入失败，请稍后重试。");
    });
  }, [presetStore, presetSyncAvailable, presetSyncReady]);

  useEffect(() => {
    if (!presetSyncAvailable || !isTauriRuntime()) {
      return;
    }

    const refreshSharedPresets = () => {
      void invoke<SharedPreset[] | null>("load_shared_presets")
        .then((shared) => {
          if (shared !== null) {
            setPresetStore(fromSharedPresets(shared));
          }
        })
        .catch((error) => console.error("共享预设刷新失败", error));
    };

    window.addEventListener("focus", refreshSharedPresets);
    return () => window.removeEventListener("focus", refreshSharedPresets);
  }, [presetSyncAvailable]);

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
    if (!parameterDrawerOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setParameterDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [parameterDrawerOpen]);

  useEffect(() => {
    if (activePanel !== "generate") {
      setParameterDrawerOpen(false);
    }
  }, [activePanel]);

  const currentImage = activeImages[selectedImage];
  const visibleHistory = history.slice(0, settings.historyDisplayLimit);
  const styleTemplatesPerPage = 12;
  const styleTemplatePageCount = Math.max(1, Math.ceil(presetStore.templates.length / styleTemplatesPerPage));
  const visibleStyleTemplates = presetStore.templates.slice(
    styleTemplatePage * styleTemplatesPerPage,
    (styleTemplatePage + 1) * styleTemplatesPerPage,
  );

  useEffect(() => {
    setStyleTemplatePage((page) => Math.min(page, styleTemplatePageCount - 1));
  }, [styleTemplatePageCount]);

  const estimatedCost = useMemo(() => estimateAnlasCost(request, account), [request, account]);
  // Medium effort pins steps/sampler/UC/CFG rescale, so the related controls lock.
  const mediumPinned = mediumEffortActive(request);
  const characterLimit = maxCharactersForModel(request.model);
  const generationProgressPercent = generationProgress
    ? Math.min(100, Math.round((generationProgress.received / Math.max(generationProgress.total, 1)) * 100))
    : 0;
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
      setAccount(null);
      writeAppLog("success", "token", "API Token 已保存到系统凭据。");
      const verification = await refreshAccountStatus(false);
      showNotice(
        verification.summary
          ? "success"
          : verification.tokenMissing
            ? "error"
            : "info",
        verification.summary
          ? "Token 已保存并验证成功。"
          : verification.tokenMissing
            ? TOKEN_NOT_CONFIGURED_MESSAGE
            : "Token 已保存，但账号状态暂时无法验证。",
      );
    } catch (error) {
      const message = errorMessage(error);
      showNotice("error", message);
      writeAppLog("error", "token", message);
    }
  }

  async function refreshAccountStatus(showResult = true) {
    if (!isTauriRuntime()) {
      if (showResult) {
        showNotice("info", "请在 Tauri 桌面窗口中刷新账号状态。");
      }
      return { summary: null, tokenMissing: false };
    }

    setIsRefreshingAccount(true);
    try {
      const raw = await invoke<unknown>("get_account_status", {
        allowInvalidTls: settings.allowInvalidTls,
        proxyUrl: activeNovelAiProxyUrl(settings),
      });
      const summary = summarizeAccount(raw);
      setAccount(summary);
      setHasToken(true);
      writeAppLog("success", "account", describeAccountStatus(summary));
      if (showResult) {
        showNotice("success", "账号状态已刷新。");
      }
      return { summary, tokenMissing: false };
    } catch (error) {
      const tokenMissing = isTokenNotConfiguredError(error);
      const message = tokenMissing ? TOKEN_NOT_CONFIGURED_MESSAGE : errorMessage(error);
      setAccount(null);
      if (tokenMissing) {
        setHasToken(false);
      }
      writeAppLog("error", "account", errorMessage(error));
      if (showResult) {
        showNotice("error", message);
      }
      return { summary: null, tokenMissing };
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
    const useStream = settings.useImageStream;
    setGenerationProgress(useStream ? { received: 0, total: request.steps, phase: "connecting" } : null);
    writeAppLog("info", "generate", `开始生成：${effectiveImageModel(request)} · ${request.width}×${request.height} · ${request.action}`);
    if (request.action === "infill") {
      writeAppLog(
        "info",
        "infill",
        `参数：强度 ${request.strength}，噪声 ${request.noise}，颜色校正 ${request.colorCorrect}，流式 ${useStream}`,
      );
    }
    const beforeAccountResult = await refreshAccountStatus(false);
    if (beforeAccountResult.tokenMissing) {
      setIsGenerating(false);
      setGenerationProgress(null);
      showNotice("error", TOKEN_NOT_CONFIGURED_MESSAGE);
      return;
    }
    const beforeAccount = beforeAccountResult.summary;
    const estimateBeforeGeneration = estimateAnlasCost(request, beforeAccount);
    let stopImageStream: (() => void) | undefined;
    try {
      if (useStream) {
        stopImageStream = await listen<ImageStreamEvent>("image-generation-event", ({ payload }) => {
          if (payload.kind === "image" && payload.image) {
            setActiveImages([payload.image]);
            setSelectedImage(0);
            setGenerationProgress((current) => ({
              received: Math.max(current?.received ?? 0, (payload.image?.index ?? (current?.received ?? 0)) + 1),
              total: current?.total ?? request.steps,
              phase: "receiving",
            }));
          }
          if (payload.kind === "error" && payload.message) {
            showNotice("error", payload.message);
          }
        });
      }
      const backendRequest = await buildBackendImageRequest(request, settings);
      const response = await invoke<GenerateImageResponse>(
        useStream ? "generate_image_stream" : "generate_image",
        { request: backendRequest },
      );
      const rawImages = useStream ? response.images.slice(-1) : response.images;
      let displayImages = rawImages;
      if (request.action === "infill" && request.sourceImage && request.maskImage) {
        const source = request.sourceImage;
        const mask = request.maskImage;
        displayImages = await Promise.all(
          displayImages.map((image) => restoreInpaintAlpha(image, source, mask)),
        );
        if (settings.enableAppLogs) {
          try {
            const path = await invoke<string>("save_inpaint_diagnostics", {
              diagnostic: {
                model: effectiveImageModel(request),
                width: request.width,
                height: request.height,
                strength: request.strength,
                noise: request.noise,
                colorCorrect: request.colorCorrect,
                streaming: useStream,
                responseContentType: response.contentType,
                source,
                mask,
                rawImages,
                compositedImages: displayImages,
              },
            });
            writeAppLog("success", "infill", `诊断图已保存：${path}`);
          } catch (error) {
            writeAppLog("warning", "infill", `诊断图保存失败：${errorMessage(error)}`);
          }
        }
      }
      displayImages = await persistGeneratedImages(displayImages);
      setActiveImages(displayImages);
      setSelectedImage(0);
      setHistory((items) =>
        [
          {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            request,
            images: stripImagePayloads(displayImages),
          },
          ...items,
        ].slice(0, MAX_HISTORY_ITEMS),
      );
      writeAppLog(
        "success",
        "generate",
        `生成完成：${response.images.length} 张图，响应类型 ${response.contentType}。`,
      );
      const afterAccountResult = await refreshAccountStatus(false);
      const cost = calculateAccountCost(beforeAccount, afterAccountResult.summary);
      setLastCost(cost);
      if (useStream) {
        setGenerationProgress({ received: request.steps, total: request.steps, phase: "complete" });
      } else {
        showNotice(
          "success",
          cost === null
            ? `收到 ${response.images.length} 张图，预计消耗 ${formatEstimatedCost(estimateBeforeGeneration)}，实际扣费暂未读取。`
            : `收到 ${response.images.length} 张图，本次消耗 ${formatPoints(cost)} Anlas。`,
        );
      }
    } catch (error) {
      const message = errorMessage(error);
      writeAppLog(
        message.includes("Concurrent generation is locked") ? "warning" : "error",
        "generate",
        message,
      );
      if (isTokenNotConfiguredError(error)) {
        setHasToken(false);
        setAccount(null);
      }
      showNotice(
        "error",
        isTokenNotConfiguredError(error)
          ? TOKEN_NOT_CONFIGURED_MESSAGE
          : message.includes("Concurrent generation is locked")
          ? "当前账号已有一个并发生图任务正在运行，请等待它完成后再试。"
          : message,
      );
    } finally {
      stopImageStream?.();
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  }

  useEffect(() => {
    const handleGenerateShortcut = (event: KeyboardEvent) => {
      if (activePanel !== "generate" || !(event.metaKey || event.ctrlKey) || event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      void generate();
    };

    window.addEventListener("keydown", handleGenerateShortcut);
    return () => window.removeEventListener("keydown", handleGenerateShortcut);
  }, [activePanel, canGenerate, request, settings]);

  /** Persist freshly generated images to disk so history only keeps a thumbnail and a path. */
  async function persistGeneratedImages(images: GeneratedImage[]): Promise<GeneratedImage[]> {
    const withIds = images.map((image) => ({ ...image, id: image.id ?? crypto.randomUUID() }));
    if (!isTauriRuntime()) {
      return withIds;
    }

    return Promise.all(
      withIds.map(async (image) => {
        if (image.persistedPath || !image.base64) {
          return image;
        }
        try {
          const [persisted, thumbBase64] = await Promise.all([
            invoke<{ path: string }>("persist_generated_image", {
              fileName: image.fileName,
              base64: image.base64,
            }),
            createThumbnailBase64(image),
          ]);
          return { ...image, persistedPath: persisted.path, thumbBase64 };
        } catch (error) {
          writeAppLog("warning", "persist", `缓存生成图失败：${errorMessage(error)}`);
          return image;
        }
      }),
    );
  }

  /** Load the full payload for images restored from history (thumbnail only). */
  async function withImageData(images: GeneratedImage[]): Promise<GeneratedImage[]> {
    if (!isTauriRuntime()) {
      return images;
    }

    return Promise.all(
      images.map(async (image) => {
        if (image.base64 || !image.persistedPath) {
          return image;
        }
        try {
          const asset = await invoke<ImageAsset>("read_image_file", { path: image.persistedPath });
          return { ...image, base64: asset.base64, byteLen: Math.floor(asset.base64.length * 0.75) };
        } catch (error) {
          writeAppLog("warning", "hydrate", `读取缓存图片失败：${errorMessage(error)}`);
          return image;
        }
      }),
    );
  }

  async function saveImage(image: GeneratedImage) {
    if (!isTauriRuntime()) {
      showNotice("info", "请在 Tauri 桌面窗口中保存图片。");
      return;
    }

    try {
      const now = new Date();
      const pad = (value: number) => String(value).padStart(2, "0");
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, "0")}`;
      const fileName = `${timestamp}-${image.fileName}`;
      const saveDirectory = settings.saveDirectory.trim() || null;
      const path = image.persistedPath
        ? await invoke<string>("save_persisted_image", {
          sourcePath: image.persistedPath,
          fileName,
          saveDirectory,
        })
        : await invoke<string>("save_generated_image", {
          fileName,
          base64: image.base64,
          saveDirectory,
        });
      markImageSaved(image, path);
      showNotice("success", `已保存到 ${path}`);
      writeAppLog("success", "save-image", `已保存图片：${path}`);
    } catch (error) {
      const message = errorMessage(error);
      showNotice("error", message);
      writeAppLog("error", "save-image", message);
    }
  }

  function markImageSaved(image: GeneratedImage, path: string) {
    const key = imageKey(image);
    const updateImage = (candidate: GeneratedImage) =>
      imageKey(candidate) === key ? { ...candidate, savedPath: path } : candidate;
    setActiveImages((items) => items.map(updateImage));
    setHistory((items) => items.map((item) => ({ ...item, images: item.images.map(updateImage) })));
    setFavorites((items) => items.map((item) => (
      imageKey(item.image) === key
        ? { ...item, image: updateImage(item.image) }
        : item
    )));
  }

  async function revealImageInFinder(image: GeneratedImage) {
    if (!image.savedPath) {
      showNotice("info", "请先保存图片，保存后才能在 Finder 中显示。");
      return;
    }

    if (!isTauriRuntime()) {
      showNotice("info", "请在 Tauri 桌面窗口中使用 Finder 操作。");
      return;
    }

    try {
      await invoke("reveal_in_finder", { path: image.savedPath });
    } catch (error) {
      const message = errorMessage(error);
      showNotice("error", `打开 Finder 失败：${message}`);
      writeAppLog("error", "reveal-image", message);
    }
  }

  async function chooseSaveDirectory() {
    if (!isTauriRuntime()) {
      showNotice("info", "请在 Tauri 桌面窗口中选择图片保存目录。");
      return;
    }

    try {
      const directory = await invoke<string | null>("pick_save_directory");
      if (!directory) {
        return;
      }
      updateSetting("saveDirectory", directory);
      showNotice("success", `图片保存目录已设置为 ${directory}`);
    } catch (error) {
      const message = errorMessage(error);
      showNotice("error", `选择保存目录失败：${message}`);
      writeAppLog("error", "save-directory", message);
    }
  }

  function resetSaveDirectory() {
    updateSetting("saveDirectory", "");
    showNotice("info", "已恢复默认图片保存目录。");
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
      const message = errorMessage(error);
      showNotice("error", `复制图片失败：${message}`);
      writeAppLog("error", "copy-image", message);
    }
  }

  function isImageFavorited(image?: GeneratedImage) {
    if (!image) {
      return false;
    }
    const key = imageKey(image);
    return favorites.some((item) => imageKey(item.image) === key);
  }

  async function toggleFavorite(image: GeneratedImage) {
    const key = imageKey(image);
    const existing = favorites.find((item) => imageKey(item.image) === key);
    if (existing) {
      setFavorites((items) => items.filter((item) => item.id !== existing.id));
      showNotice("info", "已取消收藏。");
      return;
    }

    const [hydrated] = await withImageData([image]);
    const sourceHistory = history.find((item) =>
      item.images.some((historyImage) => imageKey(historyImage) === key),
    );

    setFavorites((items) => [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        request: sourceHistory?.request ?? request,
        image: hydrated,
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
    if (!window.confirm("确定要移除这张收藏图片吗？")) {
      return;
    }
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
        proxyUrl: activeNovelAiProxyUrl(settings),
      });
      const tags = extractTagSuggestions(response);
      setTagSuggestions(tags);
      showNotice(tags.length > 0 ? "success" : "info", tags.length > 0 ? `找到 ${tags.length} 个 tag 建议。` : "没有 tag 建议。");
    } catch (error) {
      showNotice("error", errorMessage(error));
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
    const vibeImages = request.vibeSourceImages.length > 0
      ? request.vibeSourceImages
      : request.vibeSourceImage
        ? [request.vibeSourceImage]
        : [];
    if (vibeImages.length === 0) {
      showNotice("info", "先选择 Vibe 参考图。");
      return;
    }

    setIsEncodingVibe(true);
    try {
      const encodedImages: string[] = [];
      for (const [index, image] of vibeImages.entries()) {
        const encoded = await invoke<string>("encode_vibe", {
          request: {
            image: image.base64,
            model: request.model,
            informationExtracted: request.referenceInformationExtracted,
            mask: index === 0 && request.vibeCropToMask ? request.maskImage?.base64 : undefined,
            cropToMask: index === 0 && request.vibeCropToMask,
            focusSeed: request.vibeFocusSeed,
            infoExtractSeed: request.vibeInfoExtractSeed,
            allowInvalidTls: settings.allowInvalidTls,
            proxyUrl: activeNovelAiProxyUrl(settings),
          },
        });
        encodedImages.push(encoded);
      }
      update("referenceImage", encodedImages[0]);
      update("referenceImages", encodedImages);
      update("referenceStrengths", encodedImages.map(() => request.referenceStrength));
      update("referenceInformationExtractedMultiple", encodedImages.map(() => request.referenceInformationExtracted));
      showNotice("success", `Vibe 已编码 ${encodedImages.length} 张并写入生成参数。`);
    } catch (error) {
      showNotice("error", errorMessage(error));
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

    const upscaleModel = getUpscaleModel(request.model);
    if (!upscaleModel) {
      showNotice("info", "当前模型不能用于最新 Upscale，请先选择一个具体的 NovelAI 图像模型。");
      return;
    }

    setIsToolRunning(true);
    try {
      const response = await invoke<GenerateImageResponse>("upscale_image", {
        request: {
          image: currentImage.base64,
          model: upscaleModel,
          declaredBlurSigma: upscaleBlurSigma,
          allowInvalidTls: settings.allowInvalidTls,
          proxyUrl: activeNovelAiProxyUrl(settings),
        },
      });
      setActiveImages(response.images);
      setSelectedImage(0);
      showNotice("success", `超分完成，收到 ${response.images.length} 张图。`);
    } catch (error) {
      showNotice("error", errorMessage(error));
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
          proxyUrl: activeNovelAiProxyUrl(settings),
        },
      });
      setActiveImages(response.images);
      setSelectedImage(0);
      showNotice("success", `Director Tool 完成，收到 ${response.images.length} 张图。`);
    } catch (error) {
      showNotice("error", errorMessage(error));
    } finally {
      setIsToolRunning(false);
    }
  }

  async function reuse(item: HistoryItem, imageIndex = 0) {
    setRequest(normalizeImageRequest(item.request));
    setActiveImages(await withImageData(item.images));
    setSelectedImage(Math.min(Math.max(imageIndex, 0), Math.max(item.images.length - 1, 0)));
  }

  async function rerunHistoryItem(item: HistoryItem, imageIndex: number) {
    await reuse(item, imageIndex);
    setActivePanel("generate");
    showNotice("info", "已加载原参数，可直接重新生成。");
  }

  async function copyHistoryPrompt(item: HistoryItem) {
    const prompt = effectivePrompt(item.request);
    const negativePrompt = item.request.negativePrompt.trim();
    const text = negativePrompt ? `${prompt}\n\nNegative:\n${negativePrompt}` : prompt;
    try {
      await navigator.clipboard.writeText(text);
      showNotice("success", "Prompt 已复制到剪贴板。");
    } catch (error) {
      const message = errorMessage(error);
      showNotice("error", `复制 Prompt 失败：${message}`);
      writeAppLog("error", "copy-prompt", message);
    }
  }

  async function randomSeedHistoryItem(item: HistoryItem, imageIndex: number) {
    const nextRequest = normalizeImageRequest({
      ...item.request,
      seed: Math.floor(Math.random() * 4294967296),
    });
    setRequest(nextRequest);
    setActiveImages(await withImageData(item.images));
    setSelectedImage(imageIndex);
    setActivePanel("generate");
    showNotice("info", "已加载参数并随机生成新的 seed。");
  }

  async function sendHistoryToImageMode(item: HistoryItem, imageIndex: number, action: "img2img" | "infill") {
    const images = await withImageData(item.images);
    const image = images[imageIndex];
    if (!image) {
      return;
    }

    const nextRequest = normalizeImageRequest({
      ...item.request,
      action,
      sourceImage: generatedImageToAsset(image),
      maskImage: undefined,
      ...(action === "infill"
        ? {
            characters: [],
            useCharacterCoords: false,
            strength: 1,
            seed: undefined,
          }
        : {}),
    });
    setRequest(nextRequest);
    setActiveImages(images);
    setSelectedImage(imageIndex);
    setMaskEditorOpen(false);
    setActivePanel("generate");
    showNotice("info", action === "infill" ? "已送入局部重绘，请绘制遮罩。" : "已送入图生图，可继续调整参数。");
  }

  function update<K extends keyof ImageRequest>(key: K, value: ImageRequest[K]) {
    setRequest((current) => ({ ...current, [key]: value }));
  }

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function applyStylePreset(preset: SavedPreset) {
    const stylePrompt = typeof preset.payload.stylePrompt === "string"
      ? preset.payload.stylePrompt
      : typeof preset.payload.prompt === "string"
        ? preset.payload.prompt
        : "";
    update("stylePrompt", stylePrompt);
    setStylePromptOpen(true);
    setActivePanel("generate");
    showNotice("success", `已应用画风“${preset.name}”。`);
  }

  function addCharacter() {
    const characters = request.characters ?? [];
    // V5 allows 22 characters, V4/V4.5 allow 6, older checkpoints none.
    if (characterLimit <= 0) {
      showNotice("info", "当前模型不支持多角色提示词，请切换到 V4 / V4.5 / V5。");
      return;
    }
    if (characters.length >= characterLimit) {
      showNotice("info", `该模型最多支持 ${characterLimit} 个角色。`);
      return;
    }
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
    if (!window.confirm("确定要删除这个角色吗？")) {
      return;
    }
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
      showNotice("error", errorMessage(error));
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
      showNotice("error", errorMessage(error));
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
    return translated
      .replace(/[，、；]/g, ", ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
  }

  function clearHistory() {
    if (history.length > 0 && !window.confirm("确定要清空全部历史记录吗？此操作无法撤销。")) {
      return;
    }
    setHistory([]);
    setActiveImages([]);
    setSelectedImage(0);
    void saveHistoryToIndexedDb([]);
    writeAppLog("info", "history", "已清除历史记录。");
  }

  function removeHistoryItem(itemId: string, imageIndex: number) {
    const item = history.find((entry) => entry.id === itemId);
    const image = item?.images[imageIndex];
    if (!item || !image || !window.confirm(`确定删除“${image.fileName}”吗？`)) {
      return;
    }

    setHistory((items) => {
      const next = items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }
        const images = item.images.filter((_, index) => index !== imageIndex);
        return images.length > 0 ? { ...item, images } : null;
      }).filter((item): item is HistoryItem => item !== null);
      void saveHistoryToIndexedDb(next);
      return next;
    });
    if (activeImages.length > 0 && selectedImage >= activeImages.length - 1 && selectedImage > 0) {
      setSelectedImage((current) => current - 1);
    }
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
    const trial = formatOptionalTrialImages(summary.trialImagesLeft);
    return `账号状态：Tier ${tier}，Image Anlas ${points}，试用图片 ${trial}，免费生成 ${describeFreeGeneration(summary)}，订阅 ${active}。`;
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
      const message = `解析图片元数据失败：${errorMessage(error)}`;
      showNotice("error", message);
      writeAppLog("error", "image-import", message);
    }
  }

  async function prepareClipboardImage(file: File) {
    let metadata: ImportedImageMetadata = {
      textChunkCount: 0,
      textChunkKeywords: [],
    };
    try {
      metadata = await parseNovelAiImageMetadata(await file.arrayBuffer());
    } catch {
      // JPEG and ordinary screenshots do not contain the PNG/WebP metadata
      // understood by the importer, but they can still be used by Vibe.
    }
    setPendingClipboardImage({ file, metadata });
  }

  function readPendingClipboardMetadata() {
    const pending = pendingClipboardImage;
    setPendingClipboardImage(null);
    if (!pending) {
      return;
    }
    if (!hasNovelAiMetadata(pending.metadata)) {
      reportMissingImageMetadata(pending.file, pending.metadata);
      return;
    }
    applyImportedMetadata(pending.metadata, pending.file.name);
  }

  function usePendingClipboardForVibe() {
    const pending = pendingClipboardImage;
    setPendingClipboardImage(null);
    if (pending) {
      void handleMultipleAssetFiles([pending.file], "vibeSourceImages");
    }
  }

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const file = findImageFileFromClipboard(event.clipboardData);
      if (!file) {
        return;
      }

      event.preventDefault();
      void prepareClipboardImage(file);
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
      showNotice("error", `读取图片失败：${errorMessage(error)}`);
    }
  }

  async function handleMultipleAssetInput(
    event: ChangeEvent<HTMLInputElement>,
    key: "vibeSourceImages" | "directorReferenceImages",
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }

    await handleMultipleAssetFiles(files, key);
  }

  async function handleMultipleAssetFiles(
    files: File[],
    key: "vibeSourceImages" | "directorReferenceImages",
  ) {
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length === 0) {
      showNotice("info", "请提供 PNG、JPG 或 WEBP 图片。");
      return;
    }

    try {
      appendMultipleAssets(await Promise.all(imageFiles.map(imageAssetFromFile)), key);
    } catch (error) {
      showNotice("error", `读取图片失败：${errorMessage(error)}`);
    }
  }

  async function handleMultipleAssetPaths(
    paths: string[],
    key: "vibeSourceImages" | "directorReferenceImages",
  ) {
    const imagePaths = paths.filter(isImagePath);
    if (imagePaths.length === 0) {
      showNotice("info", "请拖入 PNG、JPG 或 WEBP 图片。");
      return;
    }

    try {
      const nextAssets = await Promise.all(
        imagePaths.slice(0, 4).map((path) => invoke<ImageAsset>("read_image_file", { path })),
      );
      appendMultipleAssets(nextAssets, key);
    } catch (error) {
      showNotice("error", `读取拖入图片失败：${errorMessage(error)}`);
    }
  }

  function appendMultipleAssets(nextAssets: ImageAsset[], key: "vibeSourceImages" | "directorReferenceImages") {
    const existingAssets = request[key] ?? [];
    const assets = [...existingAssets, ...nextAssets.filter((asset) => !existingAssets.some((item) => item.base64 === asset.base64))].slice(0, 4);
    update(key, assets);
    if (key === "vibeSourceImages") {
      update("vibeSourceImage", assets[0]);
      update("referenceImage", undefined);
      update("referenceImages", []);
      update("referenceStrengths", []);
      update("referenceInformationExtractedMultiple", []);
    } else {
      update("directorReferenceImage", assets[0]);
    }
  }

  function showNotice(type: Notice["type"], message: string) {
    setNotice({ type, message });
  }

  return (
    <main className={sidebarCollapsed ? "app-shell collapsed" : "app-shell"}>
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
        multiple
        onChange={(event) => void handleMultipleAssetInput(event, "vibeSourceImages")}
        tabIndex={-1}
        type="file"
      />
      <input
        ref={directorImageInputRef}
        accept="image/*"
        aria-hidden="true"
        className="hidden-file-input"
        multiple
        onChange={(event) => void handleMultipleAssetInput(event, "directorReferenceImages")}
        tabIndex={-1}
        type="file"
      />
      <header className={activePanel === "generate" ? "app-titlebar workbench-titlebar" : "app-titlebar"}>
        <div className="titlebar-spacer" />
        {activePanel !== "generate" ? <ApiStatusPill hasToken={hasToken} account={account} /> : null}
      </header>

      <div className="app-body">
      <nav className={sidebarCollapsed ? "app-sidebar collapsed" : "app-sidebar"} aria-label="Main navigation">
        <div className="nav-brand">
          <div className="nav-orb">
            <img src={appIcon} alt="NovelAI GUI" />
          </div>
          {!sidebarCollapsed ? <span className="nav-title">NOVELAI GUI</span> : null}
        </div>
        <div className="nav-list">
        <button
          className={activePanel === "generate" ? "nav-button active" : "nav-button"}
          onClick={() => setActivePanel("generate")}
          title="工作台"
          type="button"
        >
          <Images aria-hidden="true" />
          {!sidebarCollapsed ? <span className="nav-label">工作台</span> : null}
        </button>
        <button
          className={activePanel === "writing" ? "nav-button active" : "nav-button"}
          onClick={() => { setWritingVisited(true); setActivePanel("writing"); }}
          title="小说写作"
          type="button"
        >
          <BookOpen aria-hidden="true" />
          {!sidebarCollapsed ? <span className="nav-label">小说写作</span> : null}
        </button>
        <button
          className={activePanel === "presets" ? "nav-button active" : "nav-button"}
          onClick={() => setActivePanel("presets")}
          title="画风"
          type="button"
        >
          <WandSparkles aria-hidden="true" />
          {!sidebarCollapsed ? <span className="nav-label">画风</span> : null}
        </button>
        <button
          className={activePanel === "history" ? "nav-button active" : "nav-button"}
          onClick={() => setActivePanel("history")}
          title="历史画廊"
          type="button"
        >
          <History aria-hidden="true" />
          {!sidebarCollapsed ? <span className="nav-label">历史画廊</span> : null}
        </button>
        <button
          className={activePanel === "settings" ? "nav-button active" : "nav-button"}
          onClick={() => setActivePanel("settings")}
          title="设置"
          type="button"
        >
          <Settings2 aria-hidden="true" />
          {!sidebarCollapsed ? <span className="nav-label">设置</span> : null}
        </button>
        <button
          className={activePanel === "favorites" ? "nav-button active" : "nav-button"}
          onClick={() => setActivePanel("favorites")}
          title="收藏画廊"
          type="button"
        >
          <Heart aria-hidden="true" />
          {!sidebarCollapsed ? <span className="nav-label">收藏画廊</span> : null}
        </button>
        </div>
        <div className="nav-foot">
          <button className="nav-collapse" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} type="button" aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}>
            {sidebarCollapsed ? (
              <ChevronsRight aria-hidden="true" />
            ) : (
              <>
                <ChevronsLeft aria-hidden="true" />
                <span>收起</span>
              </>
            )}
          </button>
        </div>
      </nav>

      <div className="app-workspace">

      {writingVisited ? (
        <div className="writing-page-host" hidden={activePanel !== "writing"}>
          <WritingStudio
            hasToken={hasToken}
            allowInvalidTls={settings.allowInvalidTls}
            proxyUrl={activeNovelAiProxyUrl(settings)}
            onOpenSettings={() => setActivePanel("settings")}
          />
        </div>
      ) : null}

      {activePanel === "generate" ? (
        <div className="generate-workspace">
        <div className="workbench-topbar">
          <div className="workbench-tabs">
            {([
              ["generate", "文生图"],
              ["img2img", "图生图"],
              ["infill", "局部重绘"],
            ] as Array<[ImageAction, string]>).map(([action, label]) => (
              <button
                className={request.action === action ? "workbench-tab active" : "workbench-tab"}
                key={action}
                onClick={() => {
                  update("action", action);
                  if (action === "infill" && request.strength < 1) {
                    update("strength", 1);
                  }
                }}
                type="button"
              >
                <Images aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <ApiStatusPill hasToken={hasToken} account={account} />
        </div>
        <div className="workbench">
      <aside className="prompt-rail" aria-label="Prompt workspace">
        <div className="prompt-scroll">
        <section className="parameter-card model-card">
          <div className="section-head">
            <Images aria-hidden="true" />
            <h2>模型</h2>
          </div>

          <label className="field">
            <span>模型</span>
            <select
              value={request.model}
              onChange={(event) => {
                const model = event.target.value;
                update("model", model);
                const defaultSteps = defaultStepsForImageModel(model);
                if (defaultSteps !== undefined) {
                  update("steps", defaultSteps);
                }
                if (!isV5ImageModel(model)) {
                  update("transparentBackground", false);
                }
                if (!mediumEffortForModel(model)) {
                  update("effort", "high");
                }
              }}
            >
              {MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          {mediumEffortForModel(request.model) ? (
            <>
              <label className="field">
                <span>Effort 档位</span>
                <select
                  value={request.effort}
                  onChange={(event) => update("effort", event.target.value === "medium" ? "medium" : "high")}
                >
                  <option value="high">High · 完整模型</option>
                  <option value="medium">Medium · 省 42% Anlas</option>
                </select>
              </label>
              {request.effort === "medium" ? (
                <p className="field-note">
                  Medium 固定 14 步 + Euler Ancestral + Heavy UC，不支持自定义负向提示与 CFG 重缩放；需要移除元素时可用负向强调（如 -3::hat::）。
                </p>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="parameter-card size-card">
          <button
            className="section-toggle"
            onClick={() => setSizePresetOpen((open) => !open)}
            type="button"
            aria-expanded={sizePresetOpen}
          >
            <span>
              <SlidersHorizontal aria-hidden="true" />
              尺寸
            </span>
            <span className="section-meta">{request.width}×{request.height}</span>
            <ChevronDown className={sizePresetOpen ? "open" : ""} aria-hidden="true" />
          </button>

          {sizePresetOpen ? (
            <>
              <div className="field-grid four">
                <NumberField label="宽度" value={request.width} min={64} max={2048} onChange={(value) => update("width", value)} />
                <NumberField label="高度" value={request.height} min={64} max={2048} onChange={(value) => update("height", value)} />
              </div>
              <div className="preset-row">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    className={request.width === preset.width && request.height === preset.height ? "chip active" : "chip"}
                    key={preset.label}
                    onClick={() => {
                      update("width", preset.width);
                      update("height", preset.height);
                    }}
                    title={`${preset.label} · ${preset.width}×${preset.height}`}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <label className="range-field">
                <span>STEPS</span>
                <div className="range-control">
                  <input
                    aria-label="Steps"
                    type="range"
                    value={request.steps}
                    min={1}
                    max={60}
                    onChange={(event) => update("steps", Number(event.target.value))}
                  />
                  <output>{request.steps}</output>
                </div>
              </label>
              <label className="range-field">
                <span>CFG SCALE</span>
                <div className="range-control">
                  <input
                    aria-label="CFG Scale"
                    type="range"
                    value={request.scale}
                    min={1}
                    max={20}
                    step={0.5}
                    onChange={(event) => update("scale", Number(event.target.value))}
                  />
                  <output>{request.scale}</output>
                </div>
              </label>
              <label className="field compact">
                <span>种子</span>
                <div className="seed-control">
                  <input
                    type="number"
                    value={request.seed ?? ""}
                    min={0}
                    max={4294967295}
                    onChange={(event) => {
                      const v = event.target.value.trim();
                      update("seed", v === "" ? undefined : Number(v));
                    }}
                  />
                  <button
                    className="icon-button"
                    onClick={() => update("seed", Math.floor(Math.random() * 4294967296))}
                    aria-label="随机种子"
                    title="随机种子"
                    type="button"
                  >
                    <RefreshCw aria-hidden="true" />
                  </button>
                  {request.seed !== undefined ? (
                    <button
                      className="icon-button"
                      onClick={() => update("seed", undefined)}
                      aria-label="清除种子"
                      title="清除种子"
                      type="button"
                    >
                      <Eraser aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </label>
            </>
          ) : null}
        </section>

        {request.action !== "generate" ? (
          <section className="parameter-card mode-input-card">
            <div className="section-head">
              <ImagePlus aria-hidden="true" />
              <h2>输入模式</h2>
            </div>
            <p className="mode-hint">
              {request.action === "infill" ? "选择输入图并绘制遮罩。" : "选择一张输入图开始图生图。"}
            </p>
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
          </section>
        ) : null}

        {stylePromptOpen ? (
          <section className="prompt-card compact">
            <div className="style-prompt-head">
              <button className="section-toggle" onClick={() => setStylePromptOpen(false)} type="button" aria-expanded={stylePromptOpen}>
                <span>
                  <WandSparkles aria-hidden="true" />
                  画风提示词
                </span>
                <ChevronDown className="open" aria-hidden="true" />
              </button>
              <div className="prompt-actions style-prompt-actions">
                <TranslateButtons
                  disabled={translatingField !== null || !request.stylePrompt.trim()}
                  enActive={translatingField === "stylePrompt:zh-to-en-tags"}
                  zhActive={translatingField === "stylePrompt:en-to-zh"}
                  onEnglish={() => void translatePromptField("stylePrompt", "zh-to-en-tags")}
                  onChinese={() => void translatePromptField("stylePrompt", "en-to-zh")}
                />
                <span>{request.stylePrompt.length}</span>
              </div>
            </div>
            <section className="style-template-panel" aria-label="画风预设">
              <div className="template-head">
                <span>
                  <WandSparkles aria-hidden="true" />
                  画风
                </span>
                <div className="template-pagination" aria-label="画风模板分页">
                  <button
                    className="template-page-button"
                    onClick={() => setStyleTemplatePage((page) => Math.max(0, page - 1))}
                    disabled={styleTemplatePage === 0}
                    aria-label="上一页画风模板"
                    title="上一页"
                    type="button"
                  >
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <span>{styleTemplatePage + 1}/{styleTemplatePageCount}</span>
                  <button
                    className="template-page-button"
                    onClick={() => setStyleTemplatePage((page) => Math.min(styleTemplatePageCount - 1, page + 1))}
                    disabled={styleTemplatePage >= styleTemplatePageCount - 1}
                    aria-label="下一页画风模板"
                    title="下一页"
                    type="button"
                  >
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="template-chips">
                {visibleStyleTemplates.map((preset) => (
                  <button
                    className="template-chip"
                    key={preset.id}
                    onClick={() => applyStylePreset(preset)}
                    type="button"
                  >
                    {preset.name}
                  </button>
                ))}
                {presetStore.templates.length === 0 ? (
                  <div className="preset-inline-empty">
                    <span>暂无画风预设</span>
                    <button onClick={() => setActivePanel("presets")} type="button">去新建</button>
                  </div>
                ) : null}
              </div>
            </section>
            <textarea
              className="prompt-textarea"
              value={request.stylePrompt}
              onChange={(event) => update("stylePrompt", event.target.value)}
              placeholder="year 2023, official art, anime style..."
              rows={3}
            />
          </section>
        ) : (
          <button className="section-toggle" onClick={() => setStylePromptOpen(true)} type="button" style={{ padding: "8px 14px" }} aria-expanded={stylePromptOpen}>
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
          <div className="prompt-option-row">
            <Toggle
              label="透明背景"
              checked={request.transparentBackground}
              onChange={(value) => update("transparentBackground", value)}
              disabled={!isV5ImageModel(request.model)}
            />
            <span className="prompt-option-hint">
              {isV5ImageModel(request.model) ? "V5 专用" : "仅 V5 支持"}
            </span>
          </div>
          {isV5ImageModel(request.model) ? (
            <div className="tag-chip-row">
              <span className="tag-chip-label">复杂度</span>
              {V5_COMPLEXITY_TAGS.map((tag) => (
                <button
                  key={tag}
                  className="chip"
                  type="button"
                  onClick={() => update("prompt", appendPromptText(request.prompt, tag))}
                >
                  {tag}
                </button>
              ))}
            </div>
          ) : null}
          <label className="prompt-inline-field">
            <span>图内文字</span>
            <input
              value={request.inImageText ?? ""}
              onChange={(event) => update("inImageText", event.target.value)}
              placeholder="渲染到图里的文字，V4+ 支持英/日/中，例如 HELLO WORLD"
              maxLength={200}
            />
          </label>
          <p className="field-note">
            图内文字会以独立的 <code>Text:</code> 段追加到提示词末尾，约 750 token 上限。
          </p>
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
        </div>

        <div className="prompt-submit">
          <button className="run-button wide-button" onClick={generate} disabled={!canGenerate} type="button">
            {isGenerating ? <Loader2 className="spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {isGenerating ? "生成中" : "生成"}
          </button>
          <div className="prompt-submit-meta">
            <span>{request.width}×{request.height} · {request.steps} 步</span>
            <span>⌘⏎ 生成</span>
          </div>
          {isGenerating && settings.useImageStream && generationProgress ? (
            <div className="generation-progress" role="status" aria-live="polite">
              <div className="generation-progress-head">
                <span>{generationProgress.phase === "connecting" ? "连接中" : generationProgress.phase === "complete" ? "生成完成" : "流式生成"}</span>
                <span>{generationProgress.received}/{generationProgress.total}</span>
              </div>
              <div className="generation-progress-track" aria-hidden="true">
                <span style={{ width: `${generationProgressPercent}%` }} />
              </div>
            </div>
          ) : null}
          <div
            className={estimatedCost && account?.points !== undefined && estimatedCost.total > account.points ? "prompt-cost-summary warning" : "prompt-cost-summary"}
            title="这是根据当前 NovelAI WebUI 规则计算的估算值，实际扣费以生成后刷新到的账号状态为准。"
          >
            <span>
              预计消耗 <strong>{formatEstimatedCost(estimatedCost)}</strong>
              {estimatedCost && estimatedCost.freeSamples > 0
                ? ` · ${formatFreeGenerationReason(estimatedCost.freeReason)} ${estimatedCost.freeSamples} 张`
                : ""}
            </span>
            <span>
              {account?.points === undefined
                ? "余额未知"
                : `余额 ${formatPoints(account.points)} · 生成后约 ${formatPoints(Math.max(account.points - (estimatedCost?.total ?? 0), 0))}`}
            </span>
          </div>
          {notice ? (
            <div
              className={`notice prompt-notice ${notice.type}`}
              role={notice.type === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {notice.message}
            </div>
          ) : null}
        </div>

      </aside>

      <section className="canvas-stage" aria-label="Generated images">
        <section className="preview-card">
          <div className="preview-head">
            <div>
              <h2>预览</h2>
              <p>{request.width} × {request.height}{currentImage ? ` · ${formatBytes(currentImage.byteLen)}` : ""}</p>
            </div>
            <div className="preview-tools">
              {currentImage ? (
                <>
                  <button
                    className="icon-button"
                    onClick={() => {
                      const asset: ImageAsset = { name: currentImage.fileName, mimeType: currentImage.mimeType, base64: currentImage.base64 };
                      update("sourceImage", asset);
                      if (request.action === "generate") {
                        update("action", "infill");
                      }
                      setMaskEditorOpen(true);
                    }}
                    aria-label="局部重绘当前图片"
                    title="局部重绘当前图片"
                    type="button"
                  >
                    <Eraser aria-hidden="true" />
                  </button>
                  <button
                    className={isImageFavorited(currentImage) ? "icon-button favorite active" : "icon-button favorite"}
                    onClick={() => toggleFavorite(currentImage)}
                    aria-label={isImageFavorited(currentImage) ? "取消收藏" : "收藏图片"}
                    title={isImageFavorited(currentImage) ? "取消收藏" : "收藏图片"}
                    type="button"
                  >
                    <Heart aria-hidden="true" />
                  </button>
                  <button className="icon-button" onClick={() => copyImage(currentImage)} aria-label="复制图片" title="复制图片" type="button">
                    <Copy aria-hidden="true" />
                  </button>
                  <button className="icon-button filled" onClick={() => saveImage(currentImage)} aria-label="保存图片" title="保存图片" type="button">
                    <Download aria-hidden="true" />
                  </button>
                </>
              ) : null}
              <button
                className={parameterDrawerOpen ? "icon-button filled" : "icon-button"}
                onClick={() => {
                  setAdvancedOpen(true);
                  setParameterDrawerOpen(true);
                }}
                type="button"
                aria-expanded={parameterDrawerOpen}
                aria-controls="generation-parameters"
                aria-label="打开高级参数"
                title="高级参数"
              >
                <Settings2 aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="image-viewer">
            {currentImage ? (
              <img
                src={fullImageDataUrl(currentImage)}
                alt={currentImage.fileName}
                onError={() => showNotice("error", `${currentImage.fileName} 无法被 WebView 解码。`)}
              />
            ) : (
              <div className="empty-state">
                <Sparkles aria-hidden="true" />
                <strong>还没有生成</strong>
                <span>填写提示词后提交 ⌘↵</span>
              </div>
            )}
          </div>
        </section>

        <section className={historyOpen ? "history-card stage-history-card open" : "history-card stage-history-card"}>
          <button className="section-toggle" onClick={() => setHistoryOpen((open) => !open)} type="button" aria-expanded={historyOpen}>
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
                      <div className="history-thumb-wrap" key={`${item.id}-${image.fileName}-${imageIndex}`}>
                        <button
                          className={currentImage && imageKey(currentImage) === imageKey(image) ? "history-thumb active" : "history-thumb"}
                          onClick={() => reuse(item, imageIndex)}
                          title={new Date(item.createdAt).toLocaleString()}
                          type="button"
                        >
                          <img src={imageDataUrl(image)} alt="" />
                        </button>
                        <HistoryThumbnailMenu
                          item={item}
                          image={image}
                          imageIndex={imageIndex}
                          onRerun={rerunHistoryItem}
                          onSendToImage={sendHistoryToImageMode}
                          onReveal={revealImageInFinder}
                          onCopyPrompt={copyHistoryPrompt}
                          onRandomSeed={randomSeedHistoryItem}
                          onDelete={() => removeHistoryItem(item.id, imageIndex)}
                        />
                      </div>
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

      {parameterDrawerOpen ? (
        <>
          <button
            className="drawer-backdrop"
            onClick={() => setParameterDrawerOpen(false)}
            type="button"
            aria-label="关闭参数抽屉"
          />
          <aside id="generation-parameters" className="parameter-rail parameter-drawer" aria-label="生成参数">
            <div className="drawer-head">
              <div>
                <p className="eyebrow">Workbench</p>
                <h2>高级参数</h2>
              </div>
              <button className="icon-button" onClick={() => setParameterDrawerOpen(false)} type="button" aria-label="关闭参数抽屉">
                <X aria-hidden="true" />
              </button>
            </div>
        <section className="account-card">
          <div className="section-head">
            <ShieldCheck aria-hidden="true" />
            <h2>账号状态</h2>
          </div>
          <div className="account-pills" aria-label="Account status">
            <span>Tier：{account?.tier ?? "未知"}</span>
            <span title={describeAnlasBalance(account)}>Anlas：{formatOptionalPoints(account?.points)}</span>
            <span>免费：{describeFreeGeneration(account)}</span>
            <span>预计：{formatEstimatedCost(estimatedCost)}</span>
            <span>本次：{lastCost === null ? "未计算" : formatPoints(lastCost)}</span>
          </div>
        </section>

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
                <div className="tool-search compact-search">
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
                <MultiAssetPicker
                  assets={request.vibeSourceImages.length > 0 ? request.vibeSourceImages : request.vibeSourceImage ? [request.vibeSourceImage] : []}
                  label="Vibe 参考图（可多选）"
                  dropHint="点击、拖入或粘贴图片"
                  onClear={() => {
                    update("vibeSourceImage", undefined);
                    update("vibeSourceImages", []);
                    update("referenceImage", undefined);
                    update("referenceImages", []);
                    update("referenceStrengths", []);
                    update("referenceInformationExtractedMultiple", []);
                  }}
                  onFiles={(files) => void handleMultipleAssetFiles(files, "vibeSourceImages")}
                  onClipboardImage={(file) => void prepareClipboardImage(file)}
                  onPaths={(paths) => void handleMultipleAssetPaths(paths, "vibeSourceImages")}
                  onPick={() => vibeImageInputRef.current?.click()}
                />
                <div className="field-grid">
                  <NumberField label="强度" value={request.referenceStrength} min={0} max={1} step={0.01} onChange={(value) => update("referenceStrength", clamp01(value))} />
                  <NumberField label="提取量" value={request.referenceInformationExtracted} min={0} max={1} step={0.01} onChange={(value) => update("referenceInformationExtracted", clamp01(value))} />
                </div>
                <Toggle label="按当前遮罩裁剪" checked={request.vibeCropToMask} disabled={!request.maskImage} onChange={(value) => update("vibeCropToMask", value)} />
                <div className="field-grid">
                  <OptionalNumberField label="Focus Seed" value={request.vibeFocusSeed} min={0} max={4294967295} onChange={(value) => update("vibeFocusSeed", value)} />
                  <OptionalNumberField label="提取 Seed" value={request.vibeInfoExtractSeed} min={0} max={4294967295} onChange={(value) => update("vibeInfoExtractSeed", value)} />
                </div>
                <button className="ghost-button wide-button" onClick={() => void encodeVibeTransfer()} disabled={isEncodingVibe || !hasToken || (request.vibeSourceImages.length === 0 && !request.vibeSourceImage)} type="button">
                  {isEncodingVibe ? <Loader2 className="spin" aria-hidden="true" /> : <WandSparkles aria-hidden="true" />}
                  编码 Vibe
                </button>
              </div>

              <div className="tool-box">
                <strong>结果工具</strong>
                <span className="tool-helper">固定 4× 放大，不读取 Prompt 或其他生图设置。</span>
                <label className="field">
                  <span>模糊参考（可选）</span>
                  <select
                    value={upscaleBlurSigma ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setUpscaleBlurSigma(value === "" ? undefined : Number(value));
                    }}
                  >
                    <option value="">自动</option>
                    {UPSCALE_BLUR_SIGMAS.map((sigma) => (
                      <option key={sigma} value={sigma}>
                        {sigma.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="ghost-button wide-button" onClick={() => void upscaleCurrentImage()} disabled={isToolRunning || !hasToken || !currentImage} type="button">
                  {isToolRunning ? <Loader2 className="spin" aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                  超分当前图
                </button>
              </div>

              <div className="tool-box">
                <strong>Director Tools</strong>
                <MultiAssetPicker
                  assets={request.directorReferenceImages.length > 0 ? request.directorReferenceImages : request.directorReferenceImage ? [request.directorReferenceImage] : []}
                  label="输入图 / CR 参考图（可多选）"
                  onClear={() => {
                    update("directorReferenceImage", undefined);
                    update("directorReferenceImages", []);
                  }}
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
                  <span>CR 参考模式</span>
                  <select value={request.directorReferenceMode} onChange={(event) => update("directorReferenceMode", event.target.value as ImageRequest["directorReferenceMode"])}>
                    <option value="character">character · 角色</option>
                    <option value="character&style">character&style · 角色 + 画风</option>
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

              <div className="tool-box">
                <strong>ControlNet</strong>
                <span className="tool-helper">填写官方 ControlNet 条件数据后，生成时会一并提交。</span>
                <label className="field">
                  <span>条件数据</span>
                  <textarea
                    value={request.controlnetCondition}
                    onChange={(event) => update("controlnetCondition", event.target.value)}
                    placeholder="粘贴 ControlNet condition / base64"
                    rows={3}
                  />
                </label>
                <div className="field-grid">
                  <label className="field">
                    <span>模型</span>
                    <input value={request.controlnetModel} onChange={(event) => update("controlnetModel", event.target.value)} placeholder="可选" />
                  </label>
                  <NumberField label="强度" value={request.controlnetStrength} min={0} max={1} step={0.01} onChange={(value) => update("controlnetStrength", clamp01(value))} />
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="parameter-card character-card">
          <button className="section-toggle" onClick={() => setCharacterOpen((open) => !open)} type="button" aria-expanded={characterOpen}>
            <span>
              <Users aria-hidden="true" />
              Characters
            </span>
            {(request.characters ?? []).length > 0 ? (
              <span className="section-meta">
                {(request.characters ?? []).length}
                {characterLimit > 0 ? `/${characterLimit}` : ""}
              </span>
            ) : null}
            <ChevronDown className={characterOpen ? "open" : ""} aria-hidden="true" />
          </button>

          {characterOpen ? (
            !isModernImageModel(request.model) ? (
              <div className="model-note">
                <ShieldCheck aria-hidden="true" />
                Character 仅对 NAI 4 / 4.5 / 5 模型生效。
              </div>
            ) : (
              <>
                <div className="character-toolbar">
                  <Toggle
                    label="使用角色坐标"
                    checked={request.useCharacterCoords}
                    onChange={(value) => update("useCharacterCoords", value)}
                  />
                  <button
                    className="ghost-button"
                    onClick={addCharacter}
                    disabled={characterLimit > 0 && (request.characters ?? []).length >= characterLimit}
                    title={characterLimit > 0 ? `最多 ${characterLimit} 个角色` : undefined}
                    type="button"
                  >
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
                          <div
                            className="character-head"
                            onClick={() => setExpandedCharacterId(isExpanded ? null : character.id)}
                            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedCharacterId(isExpanded ? null : character.id); } }}
                            role="button"
                            tabIndex={0}
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
                          </div>
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
          <button className="section-toggle" onClick={() => setAdvancedOpen((open) => !open)} type="button" aria-expanded={advancedOpen}>
            <span>
              <Settings2 aria-hidden="true" />
              高级选项
            </span>
            <ChevronDown className={advancedOpen ? "open" : ""} aria-hidden="true" />
          </button>

          {advancedOpen ? (
            <div className="advanced-stack">
              <div className="advanced-fields">
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
                <label className="field">
                  <span>反向预设（UC）</span>
                  <select
                    value={request.ucPreset}
                    disabled={mediumPinned}
                    title={mediumPinned ? "Medium 固定使用 Heavy UC" : undefined}
                    onChange={(event) => update("ucPreset", Number(event.target.value))}
                  >
                    {availableUcPresets(request.model).map((id) => (
                      <option key={id} value={TAG_HINT[id]}>
                        {UC_PRESET_LABEL[id]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>质量标签</span>
                  <select
                    value={request.qualityPreset}
                    onChange={(event) => update("qualityPreset", Number(event.target.value))}
                  >
                    {([["standard", TAG_HINT.standard], ["light", TAG_HINT.light], ["none", TAG_HINT.none]] as [QualityPresetId, number][]).map(([id, value]) => (
                      <option key={id} value={value}>
                        {QUALITY_PRESET_LABEL[id]}
                      </option>
                    ))}
                  </select>
                </label>
                <NumberField label="CFG 重缩放" value={request.cfgRescale} min={0} max={1} step={0.01} disabled={mediumPinned} onChange={(value) => update("cfgRescale", value)} />
                <NumberField label="采样数" value={request.nSamples} min={1} max={8} onChange={(value) => update("nSamples", value)} />
                <OptionalNumberField label="Skip Sigma" value={request.skipCfgAboveSigma} min={0} max={100} step={0.1} onChange={(value) => update("skipCfgAboveSigma", value)} />
                <label className="field">
                  <span>生成时 Upscale 模糊参考</span>
                  <select value={request.upscaleBlurSigma ?? ""} onChange={(event) => update("upscaleBlurSigma", event.target.value === "" ? undefined : Number(event.target.value))}>
                    <option value="">关闭</option>
                    <option value="0">0</option>
                    {UPSCALE_BLUR_SIGMAS.map((sigma) => <option key={sigma} value={sigma}>{sigma.toFixed(2)}</option>)}
                  </select>
                </label>
              </div>

              <div className="toggle-grid">
                <Toggle label="SMEA" checked={request.sm} onChange={(value) => update("sm", value)} />
                <Toggle label="SMEA 动态" checked={request.smDyn} onChange={(value) => update("smDyn", value)} />
                <Toggle label="动态阈值" checked={request.dynamicThresholding} onChange={(value) => update("dynamicThresholding", value)} />
                <Toggle label="Euler Bug" checked={request.deliberateEulerAncestralBug} onChange={(value) => update("deliberateEulerAncestralBug", value)} />
                <Toggle label="布朗运动" checked={request.preferBrownian} onChange={(value) => update("preferBrownian", value)} />
                <Toggle label="保留原图" checked={request.addOriginalImage} onChange={(value) => update("addOriginalImage", value)} />
                <Toggle label="V3 Extend" checked={request.legacyV3Extend} onChange={(value) => update("legacyV3Extend", value)} />
                <Toggle label="Upscale Enhance" checked={request.upscaledEnhance} onChange={(value) => update("upscaledEnhance", value)} />
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
      ) : null}
        </div>
        </div>
      ) : activePanel === "writing" ? null : activePanel === "history" ? (
        <HistoryGalleryPage
          history={history}
          isFavorited={isImageFavorited}
          onOpen={(item, imageIndex) => {
            reuse(item, imageIndex);
            setActivePanel("generate");
            showNotice("info", "已打开历史图片。");
          }}
          onCopy={copyImage}
          onSave={saveImage}
          onToggleFavorite={toggleFavorite}
          onRemove={removeHistoryItem}
          onRerun={rerunHistoryItem}
          onSendToImage={sendHistoryToImageMode}
          onClear={clearHistory}
          onStartGenerating={() => setActivePanel("generate")}
        />
      ) : activePanel === "presets" ? (
        <PresetsPage
          store={presetStore}
          currentStylePrompt={request.stylePrompt}
          currentNegativePrompt={request.negativePrompt}
          onChange={setPresetStore}
          onApplyStyle={applyStylePreset}
        />
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
                      <img src={imageDataUrl(item.image)} alt="" />
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
            <div className="settings-column">
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
            <span title={describeAnlasBalance(account)}>Image Anlas<strong>{formatOptionalPoints(account?.points)}</strong></span>
            <span>试用图片<strong>{formatOptionalTrialImages(account?.trialImagesLeft)}</strong></span>
            <span>生成权益<strong>{describeFreeGeneration(account)}</strong></span>
            <span>订阅状态<strong>{account?.active === undefined ? "未知" : account.active ? "有效" : "无效"}</strong></span>
            <span title="根据当前生成参数和账户等级实时估算">
              预计本次<strong>{formatEstimatedCost(estimatedCost)}</strong>
            </span>
            <span>本次消耗<strong>{lastCost === null ? "未计算" : `${formatPoints(lastCost)} Anlas`}</strong></span>
          </div>
          {account?.points !== undefined && (account.subscriptionPoints !== undefined || account.purchasedPoints !== undefined) ? (
            <p className="account-balance-note">
              固定池 {account.subscriptionPoints === undefined ? "未知" : `${formatPoints(account.subscriptionPoints)} Anlas`}
              <span aria-hidden="true"> + </span>
              购买池 {account.purchasedPoints === undefined ? "未知" : `${formatPoints(account.purchasedPoints)} Anlas`}
              <span aria-hidden="true"> = </span>
              总计 {formatPoints(account.points)} Anlas
            </p>
          ) : null}
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
                  label="启用应用日志（局部重绘保存诊断图）"
                  checked={settings.enableAppLogs}
                  onChange={(value) => updateSetting("enableAppLogs", value)}
                />
                <Toggle
                  label="允许不安全 TLS"
                  checked={settings.allowInvalidTls}
                  onChange={(value) => updateSetting("allowInvalidTls", value)}
                />
                <Toggle
                  label="流式图像生成（实时进度）"
                  checked={settings.useImageStream}
                  onChange={(value) => updateSetting("useImageStream", value)}
                />
                <Toggle
                  label="使用 NovelAI 代理"
                  checked={settings.useNovelAiProxy}
                  onChange={(value) => updateSetting("useNovelAiProxy", value)}
                />
                <label className="field">
                  <span>NovelAI 代理地址（可选）</span>
                  <input
                    value={settings.novelAiProxyUrl}
                    onChange={(event) => updateSetting("novelAiProxyUrl", event.target.value)}
                    placeholder="http://127.0.0.1:7897"
                    disabled={!settings.useNovelAiProxy}
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

            </div>
            <div className="settings-column">
            <LocalApiSettings hasToken={hasToken} allowInvalidTls={settings.allowInvalidTls} proxyUrl={activeNovelAiProxyUrl(settings)} />
            <section className="settings-panel wide save-directory-panel">
              <div className="section-head">
                <FolderOpen aria-hidden="true" />
                <h2>图片保存位置</h2>
              </div>
              <p className="settings-copy">点击“保存图片”时使用此目录；留空则保存到系统图片目录下的 NovelAI GUI 文件夹。</p>
              <div className="save-directory-row">
                <input
                  value={settings.saveDirectory}
                  placeholder="默认：图片 / NovelAI GUI"
                  readOnly
                  aria-label="图片保存目录"
                />
                <button className="ghost-button" onClick={() => void chooseSaveDirectory()} type="button">
                  <FolderOpen aria-hidden="true" />
                  选择目录
                </button>
                {settings.saveDirectory ? (
                  <button className="icon-button" onClick={resetSaveDirectory} aria-label="恢复默认保存目录" title="恢复默认保存目录" type="button">
                    <Eraser aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </section>

            <section className="settings-panel wide settings-translation-panel">
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

            <section className="settings-panel wide settings-defaults-panel">
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
          </div>

          {notice ? <div className={`notice settings-notice ${notice.type}`}>{notice.message}</div> : null}
        </section>
      )}
      </div>
      </div>

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
      {pendingClipboardImage ? (
        <ClipboardImageChoiceModal
          file={pendingClipboardImage.file}
          hasMetadata={hasNovelAiMetadata(pendingClipboardImage.metadata)}
          onCancel={() => setPendingClipboardImage(null)}
          onReadMetadata={readPendingClipboardMetadata}
          onUseVibe={usePendingClipboardForVibe}
        />
      ) : null}
  </main>
);
}

export default App;
