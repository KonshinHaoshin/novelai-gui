// Presentational components shared by the workbench panels.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Braces, ChevronLeft, ChevronRight, Copy, Download, Eraser, FolderOpen, Heart, History as HistoryIcon, ImagePlus, Images, Loader2, MoreHorizontal, Pencil, RefreshCw, Trash2, WandSparkles, X } from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { ClipboardEvent as ReactClipboardEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type {
  CharacterPrompt,
  GeneratedImage,
  HistoryItem,
  ImageAsset,
  ImageRequest,
  Notice,
} from "./types";
import { isImageFile } from "./valueUtils";
import {
  clampHistoryLimit,
  effectivePrompt,
  featherMaskWeights,
  formatBytes,
  fullImageDataUrl,
  growMaskSelection,
  imageDataUrl,
  imageKey,
  isTauriRuntime,
} from "./helpers";

type GalleryEntry = { item: HistoryItem; image: GeneratedImage; imageIndex: number };

const GALLERY_CARD_MIN_WIDTH = 200;
const GALLERY_GAP = 10;
/** Card width plus the non-image part (info, action rows, borders), measured from the rendered card. */
const GALLERY_CARD_CHROME = 170;
const GALLERY_DEFAULT_ROW_HEIGHT = 390;
const GALLERY_OVERSCAN_ROWS = 2;

/** Windowed grid: only the rows near the viewport are mounted. */
function VirtualGrid<T>(props: {
  items: T[];
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({
    columns: 1,
    rowHeight: GALLERY_DEFAULT_ROW_HEIGHT,
    viewportHeight: 640,
    scrollTop: 0,
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const width = element.clientWidth || GALLERY_CARD_MIN_WIDTH;
      const columns = Math.max(
        1,
        Math.floor((width + GALLERY_GAP) / (GALLERY_CARD_MIN_WIDTH + GALLERY_GAP)),
      );
      const columnWidth = Math.max(
        GALLERY_CARD_MIN_WIDTH,
        (width - (columns - 1) * GALLERY_GAP) / columns,
      );
      setLayout({
        columns,
        rowHeight: Math.ceil(columnWidth + GALLERY_CARD_CHROME + GALLERY_GAP),
        viewportHeight: element.clientHeight || 640,
        scrollTop: element.scrollTop,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);

  const { columns, rowHeight, viewportHeight, scrollTop } = layout;
  const rowCount = Math.ceil(props.items.length / columns);
  const firstRow = Math.min(
    Math.max(0, rowCount - 1),
    Math.max(0, Math.floor(scrollTop / rowHeight) - GALLERY_OVERSCAN_ROWS),
  );
  const lastRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + GALLERY_OVERSCAN_ROWS,
  );
  const startIndex = firstRow * columns;
  const endIndex = Math.min(props.items.length, lastRow * columns);
  const visible = props.items.slice(startIndex, endIndex);

  return (
    <div className="virtual-grid-scroll" ref={scrollRef}>
      <div className="virtual-grid-spacer" style={{ height: rowCount * rowHeight }}>
        <div
          className="favorites-grid history-gallery-grid virtual-grid-window"
          style={{ transform: `translateY(${firstRow * rowHeight}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {visible.map((item, offset) => (
            <div key={props.itemKey(item, startIndex + offset)} className="virtual-grid-cell">
              {props.renderItem(item, startIndex + offset)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HistoryGalleryPage(props: {
  history: HistoryItem[];
  isFavorited: (image?: GeneratedImage) => boolean;
  onOpen: (item: HistoryItem, imageIndex: number) => void;
  onCopy: (image: GeneratedImage) => void | Promise<void>;
  onSave: (image: GeneratedImage) => void | Promise<void>;
  onToggleFavorite: (image: GeneratedImage) => void;
  onRemove: (itemId: string, imageIndex: number) => void;
  onRerun: (item: HistoryItem, imageIndex: number) => void;
  onSendToImage: (item: HistoryItem, imageIndex: number, action: "img2img" | "infill") => void;
  onClear: () => void;
  onStartGenerating: () => void;
}) {
  const entries: GalleryEntry[] = props.history.flatMap((item) =>
    item.images.map((image, imageIndex) => ({ item, image, imageIndex })),
  );
  const imageCount = entries.length;

  const renderCard = (entry: GalleryEntry) => {
    const { item, image, imageIndex } = entry;
    const prompt = item.request.prompt || item.request.stylePrompt || "未命名提示词";
    const model = item.request.model || "未知模型";
    const size = item.request.width && item.request.height
      ? `${item.request.width} × ${item.request.height}`
      : "尺寸未知";
    const favorited = props.isFavorited(image);

    return (
      <article className="favorite-card history-gallery-card">
        <button
          className="favorite-image history-gallery-image"
          onClick={() => props.onOpen(item, imageIndex)}
          aria-label={`打开历史图片：${prompt}`}
          type="button"
        >
          <img src={imageDataUrl(image)} alt={prompt} loading="lazy" />
        </button>
        <div className="favorite-info history-gallery-info">
          <strong title={prompt}>{prompt}</strong>
          <span>{new Date(item.createdAt).toLocaleString()}</span>
          <small>{model} · {size}{item.images.length > 1 ? ` · ${item.images.length} 张` : ""}</small>
        </div>
        <div className="history-action-row">
          <button
            className="history-action-button"
            onClick={() => props.onRerun(item, imageIndex)}
            aria-label="用此参数重跑"
            title="用此参数重跑"
            type="button"
          >
            <RefreshCw aria-hidden="true" />
            <span>重跑</span>
          </button>
          <button
            className="history-action-button"
            onClick={() => props.onSendToImage(item, imageIndex, "img2img")}
            aria-label="送入图生图"
            title="送入图生图"
            type="button"
          >
            <ImagePlus aria-hidden="true" />
            <span>图生图</span>
          </button>
          <button
            className="history-action-button"
            onClick={() => props.onSendToImage(item, imageIndex, "infill")}
            aria-label="送入局部重绘"
            title="送入局部重绘"
            type="button"
          >
            <WandSparkles aria-hidden="true" />
            <span>局部重绘</span>
          </button>
        </div>
        <div className="favorite-actions history-gallery-actions">
          <button className="icon-button" onClick={() => props.onCopy(image)} aria-label="复制图片" title="复制图片" type="button">
            <Copy aria-hidden="true" />
          </button>
          <button className="icon-button" onClick={() => props.onSave(image)} aria-label="保存图片" title="保存图片" type="button">
            <Download aria-hidden="true" />
          </button>
          <button
            className={favorited ? "icon-button favorite-action active" : "icon-button favorite-action"}
            onClick={() => props.onToggleFavorite(image)}
            aria-label={favorited ? "取消收藏" : "加入收藏"}
            title={favorited ? "取消收藏" : "加入收藏"}
            type="button"
          >
            <Heart aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            onClick={() => props.onRemove(item.id, imageIndex)}
            aria-label="删除历史图片"
            title="删除历史图片"
            type="button"
          >
            <Eraser aria-hidden="true" />
          </button>
        </div>
      </article>
    );
  };

  return (
    <section className="favorites-page history-gallery-page" aria-label="History gallery">
      <header className="settings-header gallery-header">
        <div>
          <p className="eyebrow">Gallery</p>
          <h2>历史画廊</h2>
          <span>集中查看所有生成结果，点击图片可回到生图工作台。</span>
        </div>
        {props.history.length > 0 ? (
          <button className="ghost-button" onClick={props.onClear} type="button">
            <Eraser aria-hidden="true" />
            清空历史
          </button>
        ) : null}
      </header>

      <section className="settings-panel favorites-panel history-gallery-panel">
        <div className="section-head">
          <HistoryIcon aria-hidden="true" />
          <h2>全部生成</h2>
          <span className="section-meta">{imageCount} 张 · {props.history.length} 次</span>
        </div>

        {imageCount === 0 ? (
          <div className="mini-empty favorites-empty">
            <HistoryIcon aria-hidden="true" />
            <strong>暂无历史图片</strong>
            <span>生成后的图片会自动保存在这里。</span>
            <button className="run-button" onClick={props.onStartGenerating} type="button">
              <Images aria-hidden="true" />
              开始生成
            </button>
          </div>
        ) : (
          <VirtualGrid
            items={entries}
            itemKey={(entry) => `${entry.item.id}-${entry.image.fileName}-${entry.imageIndex}`}
            renderItem={renderCard}
          />
        )}
      </section>
    </section>
  );
}

export function HistoryThumbnailMenu(props: {
  item: HistoryItem;
  image: GeneratedImage;
  imageIndex: number;
  onRerun: (item: HistoryItem, imageIndex: number) => void;
  onSendToImage: (item: HistoryItem, imageIndex: number, action: "img2img" | "infill") => void;
  onReveal: (image: GeneratedImage) => void | Promise<void>;
  onCopyPrompt: (item: HistoryItem) => void | Promise<void>;
  onRandomSeed: (item: HistoryItem, imageIndex: number) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 186;
      const menuHeight = 286;
      const top = rect.top > menuHeight + 12 ? rect.top - menuHeight - 8 : rect.bottom + 8;
      const left = Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.right - menuWidth));
      setPosition({ top, left });
    };

    const closeOnOutsideClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node) || triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function run(action: () => void | Promise<void>) {
    setOpen(false);
    void action();
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="history-thumb-menu-trigger"
        data-open={open ? "true" : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        aria-expanded={open}
        aria-label="打开历史图片菜单"
        title="更多操作"
        type="button"
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              className="history-thumb-menu"
              style={{ top: position.top, left: position.left }}
              role="menu"
            >
              <button onClick={() => run(() => props.onRerun(props.item, props.imageIndex))} role="menuitem" type="button">
                <RefreshCw aria-hidden="true" />
                用此参数重跑
              </button>
              <button onClick={() => run(() => props.onSendToImage(props.item, props.imageIndex, "img2img"))} role="menuitem" type="button">
                <ImagePlus aria-hidden="true" />
                送入图生图
              </button>
              <button onClick={() => run(() => props.onSendToImage(props.item, props.imageIndex, "infill"))} role="menuitem" type="button">
                <WandSparkles aria-hidden="true" />
                送入局部重绘
              </button>
              <button onClick={() => run(() => props.onReveal(props.image))} role="menuitem" type="button">
                <FolderOpen aria-hidden="true" />
                在 Finder 中显示
              </button>
              <button onClick={() => run(() => props.onCopyPrompt(props.item))} role="menuitem" type="button">
                <Copy aria-hidden="true" />
                复制 prompt
              </button>
              <button onClick={() => run(() => props.onRandomSeed(props.item, props.imageIndex))} role="menuitem" type="button">
                <RefreshCw aria-hidden="true" />
                复制并随机 seed
              </button>
              <div className="history-thumb-menu-separator" role="separator" />
              <button className="danger" onClick={() => run(props.onDelete)} role="menuitem" type="button">
                <Eraser aria-hidden="true" />
                删除记录
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function NumberField(props: {
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

export function OptionalNumberField(props: {
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

export function Toggle(props: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className={props.disabled ? "toggle disabled" : "toggle"}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

export function TranslateButtons(props: {
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

export function AssetPicker(props: {
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

export function MultiAssetPicker(props: {
  label: string;
  assets: ImageAsset[];
  dropHint?: string;
  onPick: () => void;
  onClear: () => void;
  onFiles?: (files: File[]) => void;
  onClipboardImage?: (file: File) => void;
  onPaths?: (paths: string[]) => void;
}) {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const canDrop = Boolean(props.onFiles || props.onPaths);

  useEffect(() => {
    if (!props.onPaths || !isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    const pending = getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "leave") {
        setDropActive(false);
        return;
      }

      const ratio = window.devicePixelRatio || 1;
      const x = (payload.position?.x ?? 0) / ratio;
      const y = (payload.position?.y ?? 0) / ratio;
      const bounds = zoneRef.current?.getBoundingClientRect();
      const inside = Boolean(bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom);
      const paths = payload.type === "enter" || payload.type === "drop" ? payload.paths : [];

      if (payload.type === "enter") {
        setDropActive(inside && paths.length > 0);
      } else if (payload.type === "over") {
        if (inside) {
          setDropActive(paths.length > 0);
        }
      } else if (payload.type === "drop") {
        setDropActive(false);
        if (inside && paths.length > 0) {
          props.onPaths?.(paths);
        }
      }
    });

    pending
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [props.onPaths]);

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!canDrop) {
      return;
    }
    event.preventDefault();
    setDropActive(true);
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    setDropActive(false);
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (!canDrop) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    const files = Array.from(event.dataTransfer.files).filter(isImageFile);
    if (files.length > 0) {
      props.onFiles?.(files);
    }
  }

  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    if (!props.onFiles) {
      return;
    }
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
      .filter(isImageFile);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (props.onClipboardImage) {
      props.onClipboardImage(files[0]);
    } else {
      props.onFiles?.(files);
    }
  }

  function handleZoneClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!canDrop || !props.onPick) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }
    props.onPick();
  }

  return (
    <div
      ref={zoneRef}
      className={`asset-picker multi-asset-picker${canDrop ? " asset-dropzone" : ""}${dropActive ? " drop-active" : ""}`}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleZoneClick}
      onPaste={handlePaste}
      role={canDrop ? "group" : undefined}
      tabIndex={canDrop ? 0 : undefined}
      aria-label={canDrop ? `${props.label}，支持点击、拖入或粘贴图片` : undefined}
    >
      <div className="multi-asset-thumbs">
        {props.assets.length > 0 ? props.assets.map((asset) => (
          <img key={`${asset.name}-${asset.base64.slice(0, 12)}`} src={`data:${asset.mimeType};base64,${asset.base64}`} alt={asset.name} />
        )) : <ImagePlus aria-hidden="true" />}
      </div>
      <div className="asset-picker-copy">
        <span>{props.label}</span>
        <strong>{props.assets.length > 0 ? `${props.assets.length} 张已选择` : "未选择"}</strong>
        {props.dropHint ? <small>{props.dropHint}</small> : null}
      </div>
      <button className="ghost-button" onClick={props.onPick} type="button">
        {props.assets.length > 0 ? "追加" : "选择"}
      </button>
      {props.assets.length > 0 ? (
        <button className="icon-button" onClick={props.onClear} title="清除图片" type="button">
          <Eraser aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function ClipboardImageChoiceModal(props: {
  file: File;
  hasMetadata: boolean;
  onCancel: () => void;
  onReadMetadata: () => void;
  onUseVibe: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(props.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [props.file]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.onCancel]);

  return (
    <div
      className="modal-backdrop clipboard-choice-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onCancel();
        }
      }}
    >
      <section className="clipboard-choice-modal" role="dialog" aria-modal="true" aria-labelledby="clipboard-choice-title">
        <div className="clipboard-choice-head">
          <div>
            <p className="eyebrow">Clipboard</p>
            <h2 id="clipboard-choice-title">粘贴图片</h2>
          </div>
          <button className="icon-button" onClick={props.onCancel} aria-label="取消粘贴" title="取消" type="button">
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="clipboard-choice-content">
          <div className="clipboard-choice-preview">
            {previewUrl ? <img src={previewUrl} alt="待粘贴图片" /> : <ImagePlus aria-hidden="true" />}
          </div>
          <div className="clipboard-choice-info">
            <strong>{props.file.name || "剪贴板图片"}</strong>
            <span>{props.hasMetadata ? "检测到 NovelAI 生成信息" : "未检测到可读取的 NovelAI 生成信息"}</span>
            <small>请选择这张图片的用途</small>
          </div>
        </div>
        <div className="clipboard-choice-actions">
          <button className="ghost-button" onClick={props.onReadMetadata} type="button">
            <Braces aria-hidden="true" />
            读取图片信息
          </button>
          <button className="run-button" onClick={props.onUseVibe} type="button">
            <WandSparkles aria-hidden="true" />
            使用 Vibe Transfer
          </button>
        </div>
        <button className="clipboard-choice-cancel" onClick={props.onCancel} type="button">取消</button>
      </section>
    </div>
  );
}

export function MaskEditorModal(props: {
  sourceImage: ImageAsset;
  initialMask?: ImageAsset;
  onCancel: () => void;
  onSave: (asset: ImageAsset) => void;
}) {
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const overlaySnapshotRef = useRef<ImageData | null>(null);
  const maskSnapshotRef = useRef<ImageData | null>(null);
  const [brushSize, setBrushSize] = useState(56);
  const [brushMode, setBrushMode] = useState<"paint" | "erase">("paint");
  const [maskTool, setMaskTool] = useState<"brush" | "rect">("brush");
  const [brushShape, setBrushShape] = useState<"round" | "square">("round");
  const [maskGrow, setMaskGrow] = useState(4);
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
          overlayPixels.data[index] = 34;
          overlayPixels.data[index + 1] = 188;
          overlayPixels.data[index + 2] = 202;
          overlayPixels.data[index + 3] = selected ? 184 : 0;
        }
        overlayContext.putImageData(overlayPixels, 0, 0);
      };
      image.src = `data:${props.initialMask.mimeType};base64,${props.initialMask.base64}`;
    }
  }

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>) {
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

    const halfBrush = brushSize / 2;
    for (const [canvas, visualAlpha] of [[overlay, 0.72], [mask, 1]] as const) {
      const context = canvas.getContext("2d");
      if (!context) {
        continue;
      }
      context.globalCompositeOperation = brushMode === "erase" ? "destination-out" : "source-over";

      const color = brushMode === "erase"
        ? "0, 0, 0"
        : canvas === overlay ? "34, 188, 202" : "255, 255, 255";
      if (brushShape === "square") {
        context.fillStyle = `rgba(${color}, ${visualAlpha})`;
        context.fillRect(point.x - halfBrush, point.y - halfBrush, brushSize, brushSize);
      } else {
        context.fillStyle = `rgba(${color}, ${visualAlpha})`;
        context.beginPath();
        context.arc(point.x, point.y, halfBrush, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawBetween(from: { x: number; y: number }, to: { x: number; y: number }) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(4, brushSize / 3)));
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      drawAt({
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      });
    }
  }

  function snapshotMaskCanvases() {
    const overlay = overlayCanvasRef.current;
    const mask = maskCanvasRef.current;
    overlaySnapshotRef.current = overlay?.getContext("2d")?.getImageData(0, 0, overlay.width, overlay.height) ?? null;
    maskSnapshotRef.current = mask?.getContext("2d")?.getImageData(0, 0, mask.width, mask.height) ?? null;
  }

  function restoreMaskCanvases() {
    const overlay = overlayCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (overlay && overlaySnapshotRef.current) {
      overlay.getContext("2d")?.putImageData(overlaySnapshotRef.current, 0, 0);
    }
    if (mask && maskSnapshotRef.current) {
      mask.getContext("2d")?.putImageData(maskSnapshotRef.current, 0, 0);
    }
  }

  function fillRectSelection(start: { x: number; y: number }, end: { x: number; y: number }) {
    const overlay = overlayCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!overlay || !mask) {
      return;
    }

    restoreMaskCanvases();
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    for (const [canvas, color, visualAlpha] of [
      [overlay, "34, 188, 202", 0.72],
      [mask, "255, 255, 255", 1],
    ] as const) {
      const context = canvas.getContext("2d");
      if (!context) {
        continue;
      }
      context.globalCompositeOperation = brushMode === "erase" ? "destination-out" : "source-over";
      context.fillStyle = `rgba(${color}, ${visualAlpha})`;
      context.fillRect(x, y, width, height);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = pointFromEvent(event);
    if (!point) {
      return;
    }
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    rectStartRef.current = point;
    lastPointRef.current = point;
    if (maskTool === "rect") {
      snapshotMaskCanvases();
      fillRectSelection(point, point);
    } else {
      drawAt(point);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) {
      return;
    }
    const point = pointFromEvent(event);
    if (point) {
      if (maskTool === "rect" && rectStartRef.current) {
        fillRectSelection(rectStartRef.current, point);
      } else if (lastPointRef.current) {
        drawBetween(lastPointRef.current, point);
        lastPointRef.current = point;
      } else {
        drawAt(point);
        lastPointRef.current = point;
      }
    }
  }

  function stopDrawing() {
    drawingRef.current = false;
    rectStartRef.current = null;
    lastPointRef.current = null;
    overlaySnapshotRef.current = null;
    maskSnapshotRef.current = null;
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
      const selected = new Uint8Array(mask.width * mask.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        selected[index / 4] =
          pixels.data[index + 3] > 16 &&
          (pixels.data[index] > 16 || pixels.data[index + 1] > 16 || pixels.data[index + 2] > 16)
            ? 1
            : 0;
      }

      const grownSelected = growMaskSelection(selected, mask.width, mask.height, maskGrow);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const value = grownSelected[index / 4] ? 255 : 0;
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
          <div className="mask-tool-grid">
            <button
              className={maskTool === "brush" ? "chip active" : "chip"}
              onClick={() => setMaskTool("brush")}
              type="button"
            >
              画笔
            </button>
            <button
              className={maskTool === "rect" ? "chip active" : "chip"}
              onClick={() => setMaskTool("rect")}
              type="button"
            >
              矩形填充
            </button>
            <button
              className={brushMode === "paint" ? "chip active" : "chip"}
              onClick={() => setBrushMode("paint")}
              type="button"
            >
              绘制
            </button>
            <button
              className={brushMode === "erase" ? "chip active" : "chip"}
              onClick={() => setBrushMode("erase")}
              type="button"
            >
              擦除
            </button>
            <button
              className={brushShape === "round" ? "chip active" : "chip"}
              onClick={() => setBrushShape("round")}
              type="button"
            >
              圆形
            </button>
            <button
              className={brushShape === "square" ? "chip active" : "chip"}
              onClick={() => setBrushShape("square")}
              type="button"
            >
              方形
            </button>
          </div>
          <label className="field compact">
            <span>大小</span>
            <input
              type="range"
              min={8}
              max={180}
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
            />
          </label>
          <label className="field compact">
            <span>边缘扩展</span>
            <input
              type="range"
              min={0}
              max={32}
              value={maskGrow}
              onChange={(event) => setMaskGrow(Number(event.target.value))}
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
