import { invoke } from "@tauri-apps/api/core";
import {
  Braces,
  ChevronDown,
  Copy,
  Download,
  Eraser,
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
import type { ChangeEvent, ClipboardEvent } from "react";
import appIcon from "../icon.png";

type ImageAction = "generate" | "img2img" | "infill";
type ImageFormat = "png" | "webp";

type ImageRequest = {
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

type PersistedHistoryItem = {
  id: string;
  createdAt: string;
  request: ImageRequest;
};

type Notice = {
  type: "success" | "error" | "info";
  message: string;
};

type AppSettings = {
  showPayloadPreview: boolean;
  enableAppLogs: boolean;
  historyDisplayLimit: number;
  knowledgeServerUrl: string;
};

type AccountSummary = {
  tier?: string;
  points?: number;
  active?: boolean;
  expiresAt?: number;
  raw: unknown;
};

type PngTextChunk = {
  keyword: string;
  text: string;
};

type ImportedImageMetadata = {
  prompt?: string;
  negativePrompt?: string;
  characters?: CharacterPrompt[];
  useCharacterCoords?: boolean;
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

type PromptEntryType = "style" | "action" | "character";

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
};

const HISTORY_KEY = "novelai-gui-history";
const SETTINGS_KEY = "novelai-gui-settings";
const HISTORY_DB_NAME = "novelai-gui";
const HISTORY_DB_VERSION = 1;
const HISTORY_STORE_NAME = "history";
const MAX_HISTORY_ITEMS = 40;

const DEFAULT_SETTINGS: AppSettings = {
  showPayloadPreview: false,
  enableAppLogs: false,
  historyDisplayLimit: 8,
  knowledgeServerUrl: "http://127.0.0.1:8710",
};

const PROMPT_ENTRY_TYPES: Array<{ type: PromptEntryType; label: string }> = [
  { type: "style", label: "画风" },
  { type: "action", label: "动作" },
  { type: "character", label: "角色" },
];

const DEFAULT_REQUEST: ImageRequest = {
  prompt: "",
  negativePrompt: "lowres, blurry, bad anatomy, watermark, text",
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
};

const MODELS = [
  "nai-diffusion-4-5-full",
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
  const [activeImages, setActiveImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"generate" | "promptLibrary" | "settings">("generate");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [isRefreshingAccount, setIsRefreshingAccount] = useState(false);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [promptLibraryType, setPromptLibraryType] = useState<PromptEntryType>("style");
  const [promptLibraryQuery, setPromptLibraryQuery] = useState("");
  const [promptLibraryResults, setPromptLibraryResults] = useState<PromptLibraryEntry[]>([]);
  const [isSearchingPromptLibrary, setIsSearchingPromptLibrary] = useState(false);
  const [promptLibraryStatus, setPromptLibraryStatus] = useState<string | null>(null);
  const [selectedPromptEntries, setSelectedPromptEntries] = useState<
    Partial<Record<PromptEntryType, PromptLibraryEntry>>
  >({});
  const importInputRef = useRef<HTMLInputElement | null>(null);

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
    function onWindowPaste(event: globalThis.ClipboardEvent) {
      if (activePanel !== "generate") {
        return;
      }

      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (!imageItem) {
        return;
      }

      const file = imageItem.getAsFile();
      if (!file) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void importPngFile(file);
    }

    window.addEventListener("paste", onWindowPaste, true);
    return () => window.removeEventListener("paste", onWindowPaste, true);
  }, [activePanel]);

  useEffect(() => {
    if (activePanel !== "promptLibrary") {
      return;
    }

    void searchPromptLibrary({ type: promptLibraryType, query: "" });
  }, [activePanel, promptLibraryType]);

  const currentImage = activeImages[selectedImage];
  const visibleHistory = history.slice(0, settings.historyDisplayLimit);
  const canGenerate = useMemo(
    () => request.prompt.trim().length > 0 && hasToken && !isGenerating,
    [hasToken, isGenerating, request.prompt],
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
      const raw = await invoke<unknown>("get_account_status");
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
    writeAppLog("info", "generate", `开始生成：${request.model} · ${request.width}×${request.height} · ${request.action}`);
    const beforeAccount = await refreshAccountStatus(false);
    try {
      const response = await invoke<GenerateImageResponse>("generate_image", { request });
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

  function reuse(item: HistoryItem) {
    setRequest(normalizeImageRequest(item.request));
    setActiveImages(item.images);
    setSelectedImage(0);
    showNotice("info", "已恢复历史参数。");
  }

  function update<K extends keyof ImageRequest>(key: K, value: ImageRequest[K]) {
    setRequest((current) => ({ ...current, [key]: value }));
  }

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function searchPromptLibrary(options?: { type?: PromptEntryType; query?: string }) {
    const baseUrl = normalizeServerUrl(settings.knowledgeServerUrl);
    if (!baseUrl) {
      setPromptLibraryStatus("先在设置里配置素材库服务地址。");
      return;
    }

    const entryType = options?.type ?? promptLibraryType;
    const query = options?.query ?? promptLibraryQuery;

    setIsSearchingPromptLibrary(true);
    setPromptLibraryStatus(null);
    try {
      const params = new URLSearchParams({
        type: entryType,
        limit: "24",
      });
      if (query.trim()) {
        params.set("query", query.trim());
      }

      const response = await fetch(`${baseUrl}/api/entries?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`素材库请求失败：HTTP ${response.status}`);
      }

      const results = (await response.json()) as PromptLibraryEntry[];
      setPromptLibraryResults(results);
      setPromptLibraryStatus(results.length > 0 ? `找到 ${results.length} 条结果。` : "没有匹配结果。");
    } catch (error) {
      setPromptLibraryResults([]);
      setPromptLibraryStatus(String(error));
    } finally {
      setIsSearchingPromptLibrary(false);
    }
  }

  function togglePromptEntry(entry: PromptLibraryEntry) {
    const prompt = entry.prompt.trim();
    if (!prompt) {
      setPromptLibraryStatus("这个条目没有可用 prompt。");
      return;
    }

    const currentSelection = selectedPromptEntries[entry.entry_type];
    const isSameSelection = currentSelection?.slug === entry.slug;

    setSelectedPromptEntries((current) => {
      const next = { ...current };
      if (isSameSelection) {
        delete next[entry.entry_type];
      } else {
        next[entry.entry_type] = entry;
      }
      return next;
    });

    setRequest((current) => {
      let nextPrompt = current.prompt;
      if (currentSelection?.prompt) {
        nextPrompt = removePromptText(nextPrompt, currentSelection.prompt);
      }
      if (!isSameSelection) {
        nextPrompt = appendPromptText(nextPrompt, prompt);
      }
      return {
        ...current,
        prompt: nextPrompt,
      };
    });

    setPromptLibraryStatus(isSameSelection ? `已取消：${entry.title}` : `已选择：${entry.title}`);
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

  async function importPngFile(file: File) {
    try {
      const imported = parseNovelAiPngMetadata(await file.arrayBuffer());
      if (!imported.prompt && !imported.negativePrompt && (imported.characters ?? []).length === 0) {
        showNotice("info", "PNG 中没有识别到 NovelAI prompt。");
        writeAppLog("warning", "png-import", `${file.name} 没有识别到 NovelAI prompt。`);
        return;
      }

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
      showNotice("success", "已从 PNG 元数据导入 prompt 和生成参数。");
      writeAppLog("success", "png-import", `已导入 ${file.name} 的 PNG 元数据。`);
    } catch (error) {
      const message = `解析 PNG 元数据失败：${String(error)}`;
      showNotice("error", message);
      writeAppLog("error", "png-import", message);
    }
  }

  async function handlePaste(event: ClipboardEvent<HTMLElement>) {
    if (activePanel !== "generate") {
      return;
    }

    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (!imageItem) {
      return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return;
    }

    event.preventDefault();
    await importPngFile(file);
  }

  async function handleImportInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (file) {
      await importPngFile(file);
    }
  }

  function showNotice(type: Notice["type"], message: string) {
    setNotice({ type, message });
  }

  return (
    <main className="studio-shell">
      <input
        ref={importInputRef}
        accept="image/png"
        aria-hidden="true"
        className="hidden-file-input"
        onChange={handleImportInput}
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

        <section className="prompt-card primary">
          <div className="card-head">
            <div>
              <h2>正向提示词</h2>
            </div>
            <div className="prompt-actions">
              <button
                className="ghost-button"
                onClick={() => importInputRef.current?.click()}
                type="button"
              >
                <Upload aria-hidden="true" />
                从图片导入
              </button>
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
              <p>可选，排除不想要的内容</p>
            </div>
            <span>{request.negativePrompt.length}</span>
          </div>
          <textarea
            className="prompt-textarea"
            value={request.negativePrompt}
            onChange={(event) => update("negativePrompt", event.target.value)}
            rows={4}
          />
        </section>

        <section className={historyOpen ? "history-card open" : "history-card"}>
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
              <div className="mini-empty">
                <History aria-hidden="true" />
                <strong>暂无历史</strong>
                <span>生成后的记录会出现在这里。</span>
              </div>
            ) : (
              <>
              <button className="danger-button" onClick={clearHistory} type="button">
                <Eraser aria-hidden="true" />
                清除历史记录
              </button>
              <div className="history-list">
                {visibleHistory.map((item) => (
                  <button className="history-item" key={item.id} onClick={() => reuse(item)} type="button">
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    <strong>{item.request.prompt || "未命名提示词"}</strong>
                  </button>
                ))}
              </div>
              </>
            )
          ) : null}
        </section>
      </aside>

      <section className="canvas-stage" aria-label="Generated images">
        <header className="stage-card">
          <div>
            <h2>生图工作台</h2>
            <span>{currentImage ? `${currentImage.fileName} · ${formatBytes(currentImage.byteLen)}` : "等待生成结果"}</span>
          </div>
          <div className="toolbar-actions">
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

        <footer className="result-strip">
          {activeImages.length === 0 ? (
            <div className="thumb-placeholder">
              <ImagePlus aria-hidden="true" />
              <span>生成缩略图</span>
            </div>
          ) : (
            activeImages.map((image, index) => (
              <button
                className={selectedImage === index ? "thumb active" : "thumb"}
                key={`${image.fileName}-${index}`}
                onClick={() => setSelectedImage(index)}
                type="button"
              >
                <img src={`data:${image.mimeType};base64,${image.base64}`} alt="" />
              </button>
            ))
          )}
          <button className="more-tile" onClick={generate} disabled={!canGenerate} type="button">
            <Sparkles aria-hidden="true" />
            生成更多
          </button>
        </footer>

        <div className="status-bar">
          <span className={isGenerating ? "status-pill busy" : "status-pill ok"}>{isGenerating ? "生成中" : "就绪"}</span>
          <span>API 状态：{hasToken ? "已配置" : "未配置 Token"}</span>
          <span>账号点数：{formatOptionalPoints(account?.points)}</span>
          <span>Tier：{account?.tier ?? "未知"}</span>
          {notice ? <strong className={`status-message ${notice.type}`}>{notice.message}</strong> : null}
        </div>
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
          <div className="model-note">
            <ShieldCheck aria-hidden="true" />
            默认使用 NAI 4.5 full，后端会自动补齐 V4 prompt 结构。
          </div>
        </section>

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
                    {(request.characters ?? []).map((character, index) => (
                      <div className="character-item" key={character.id}>
                        <div className="character-head">
                          <strong>角色 {index + 1}</strong>
                          <button className="icon-button" onClick={() => removeCharacter(character.id)} title="删除角色" type="button">
                            <Eraser aria-hidden="true" />
                          </button>
                        </div>
                        <label className="field">
                          <span>角色提示词</span>
                          <textarea
                            value={character.prompt}
                            onChange={(event) => updateCharacter(character.id, "prompt", event.target.value)}
                            placeholder="1girl, pink hair, school uniform"
                            rows={3}
                          />
                        </label>
                        <label className="field">
                          <span>角色负向提示词</span>
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
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          ) : null}
        </section>

        <section className="parameter-card">
          <div className="section-head">
            <SlidersHorizontal aria-hidden="true" />
            <h2>图像尺寸</h2>
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
            <OptionalNumberField label="种子" value={request.seed} min={0} max={4294967295} onChange={(value) => update("seed", value)} />
          </div>
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
              <p className="eyebrow">Local Library</p>
              <h2>Prompt 助手</h2>
              <span>从本地素材库选择画风、动作和角色；同类型再次选择会替换当前项。</span>
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
            </div>

            {promptLibraryStatus ? <div className="prompt-library-status">{promptLibraryStatus}</div> : null}

            <div className="prompt-library-selection">
              {PROMPT_ENTRY_TYPES.map((item) => (
                <span key={item.type}>
                  {item.label}：{selectedPromptEntries[item.type]?.title ?? "未选择"}
                </span>
              ))}
            </div>

            <div className="prompt-library-results">
              {promptLibraryResults.map((entry) => (
                <button
                  className={selectedPromptEntries[entry.entry_type]?.slug === entry.slug ? "prompt-library-item active" : "prompt-library-item"}
                  key={entry.slug}
                  onClick={() => togglePromptEntry(entry)}
                  type="button"
                >
                  <strong>{entry.title}</strong>
                  <span>{entry.category?.name ?? promptEntryTypeLabel(entry.entry_type)} · {entry.source?.title ?? "本地素材库"}</span>
                  <em>{entry.prompt}</em>
                </button>
              ))}
            </div>
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
                <NumberField
                  label="历史显示上限"
                  value={settings.historyDisplayLimit}
                  min={1}
                  max={MAX_HISTORY_ITEMS}
                  onChange={(value) => updateSetting("historyDisplayLimit", clampHistoryLimit(value))}
                />
                <label className="field">
                  <span>素材库服务地址</span>
                  <input
                    value={settings.knowledgeServerUrl}
                    onChange={(event) => updateSetting("knowledgeServerUrl", event.target.value)}
                    placeholder="http://127.0.0.1:8710"
                  />
                </label>
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
      historyDisplayLimit: clampHistoryLimit(
        parsed.historyDisplayLimit ?? DEFAULT_SETTINGS.historyDisplayLimit,
      ),
      knowledgeServerUrl: parsed.knowledgeServerUrl ?? DEFAULT_SETTINGS.knowledgeServerUrl,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
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

  if (type === "action") {
    return "动作";
  }

  return "角色";
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
    prompt: request.prompt,
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
        base_caption: request.prompt,
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
    input: request.prompt,
    model: request.model,
    action: request.action,
    parameters,
  };
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
  };
}

function clampCoordinate(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5;
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

function parseNovelAiPngMetadata(buffer: ArrayBuffer): ImportedImageMetadata {
  const chunks = readPngTextChunks(buffer);
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
  for (const value of rawCandidates) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        parsedObjects.push(JSON.parse(trimmed));
      } catch {
        // keep going with raw text candidates
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
  const model = findStringInSources(parsedObjects, ["model"]);
  const nSamples = findNumberInSources(parsedObjects, ["n_samples", "nsamples"]);

  return {
    prompt: extractPromptText(prompt),
    negativePrompt: extractPromptText(negativePrompt),
    characters,
    useCharacterCoords: characters.length > 0 ? (useCharacterCoords ?? hasCharacterCenters(characters)) : undefined,
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

function readBytes(bytes: Uint8Array, offset: number, length: number) {
  return bytes.slice(offset, offset + length);
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function decodeText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return String.fromCharCode(...bytes);
  }
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
