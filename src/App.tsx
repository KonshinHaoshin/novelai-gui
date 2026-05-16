import { invoke } from "@tauri-apps/api/core";
import {
  Braces,
  ChevronDown,
  Copy,
  Download,
  History,
  Images,
  ImagePlus,
  KeyRound,
  Loader2,
  Maximize2,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  ZoomIn,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import appIcon from "../icon.png";

type ImageAction = "generate" | "img2img" | "infill";
type ImageFormat = "png" | "webp";

type ImageRequest = {
  prompt: string;
  negativePrompt: string;
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

type Notice = {
  type: "success" | "error" | "info";
  message: string;
};

type AppSettings = {
  showPayloadPreview: boolean;
  historyDisplayLimit: number;
};

const HISTORY_KEY = "novel-gui-history";
const SETTINGS_KEY = "novel-gui-settings";
const MAX_HISTORY_ITEMS = 40;

const DEFAULT_SETTINGS: AppSettings = {
  showPayloadPreview: false,
  historyDisplayLimit: 8,
};

const DEFAULT_REQUEST: ImageRequest = {
  prompt: "",
  negativePrompt: "lowres, blurry, bad anatomy, watermark, text",
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
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [activeImages, setActiveImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"generate" | "settings">("generate");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    if (!isTauriRuntime()) {
      showNotice("info", "浏览器预览模式：API Token 和生成命令需要在 Tauri 桌面环境中使用。");
      return;
    }

    invoke<boolean>("has_api_token")
      .then(setHasToken)
      .catch((error) => showNotice("error", String(error)));
  }, []);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_ITEMS)));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

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
    } catch (error) {
      showNotice("error", String(error));
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
      showNotice("success", `收到 ${response.images.length} 张图，响应类型 ${response.contentType}。`);
    } catch (error) {
      showNotice("error", String(error));
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
    } catch (error) {
      showNotice("error", String(error));
    }
  }

  function reuse(item: HistoryItem) {
    setRequest(item.request);
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

  function showNotice(type: Notice["type"], message: string) {
    setNotice({ type, message });
  }

  return (
    <main className="studio-shell">
      <nav className="nav-rail" aria-label="Main navigation">
        <div className="nav-logo">
          <img src={appIcon} alt="Novel GUI" />
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
            <h1>Novel GUI</h1>
            <p>AI Image Generation</p>
          </div>
        </section>

        <section className="prompt-card primary">
          <div className="card-head">
            <div>
              <h2>正向提示词</h2>
              <p>主要画面描述</p>
            </div>
            <span>{request.prompt.length}</span>
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
              <div className="history-list">
                {visibleHistory.map((item) => (
                  <button className="history-item" key={item.id} onClick={() => reuse(item)} type="button">
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    <strong>{item.request.prompt || "未命名提示词"}</strong>
                  </button>
                ))}
              </div>
            )
          ) : null}
        </section>
      </aside>

      <section className="canvas-stage" aria-label="Generated images">
        <header className="stage-card">
          <div>
            <p className="eyebrow">NovelAI V4.5</p>
            <h2>AI 图像生成工作台</h2>
            <span>{currentImage ? `${currentImage.fileName} · ${formatBytes(currentImage.byteLen)}` : "等待生成结果"}</span>
          </div>
          <div className="toolbar-actions">
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
                onClick={() => currentImage && navigator.clipboard.writeText(String(request.seed ?? ""))}
                title="复制种子"
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
          {notice ? <strong className={`status-message ${notice.type}`}>{notice.message}</strong> : null}
        </div>
      </section>

      <aside className="parameter-rail" aria-label="Generation parameters">
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

        <section className="parameter-card">
          <div className="section-head">
            <Braces aria-hidden="true" />
            <h2>输出设置</h2>
          </div>
          <div className="field-grid">
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
              <p className="settings-copy">Token 只通过 Tauri 后端保存到系统凭据，不写入前端本地存储。</p>
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
                <Settings2 aria-hidden="true" />
                <h2>界面</h2>
              </div>
              <div className="settings-stack">
                <Toggle
                  label="显示请求体预览"
                  checked={settings.showPayloadPreview}
                  onChange={(value) => updateSetting("showPayloadPreview", value)}
                />
                <NumberField
                  label="历史显示上限"
                  value={settings.historyDisplayLimit}
                  min={1}
                  max={MAX_HISTORY_ITEMS}
                  onChange={(value) => updateSetting("historyDisplayLimit", clampHistoryLimit(value))}
                />
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

function loadHistory(): HistoryItem[] {
  try {
    const value = localStorage.getItem(HISTORY_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
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
      historyDisplayLimit: clampHistoryLimit(
        parsed.historyDisplayLimit ?? DEFAULT_SETTINGS.historyDisplayLimit,
      ),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
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
    parameters.legacy = false;
    parameters.legacy_uc = false;
    parameters.add_original_image = false;
    parameters.autoSmea = false;
    parameters.use_coords = false;
    parameters.v4_prompt = {
      caption: {
        base_caption: request.prompt,
        char_captions: [],
      },
      use_coords: false,
      use_order: true,
    };
    parameters.v4_negative_prompt = {
      caption: {
        base_caption: request.negativePrompt,
        char_captions: [],
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

function clampHistoryLimit(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.historyDisplayLimit;
  }

  return Math.min(MAX_HISTORY_ITEMS, Math.max(1, Math.round(value)));
}

export default App;
