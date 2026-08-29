import {
  Check,
  Copy,
  Frame,
  Loader2,
  PencilLine,
  Plus,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { PresetKind, PresetPayload, PresetStore, SavedPreset } from "./presets";

type PresetTab = "params" | "templates";

type PresetsPageProps = {
  store: PresetStore;
  currentParams: PresetPayload;
  currentPrompt: string;
  currentNegativePrompt: string;
  onChange: (store: PresetStore) => void;
  onApplyParams: (preset: SavedPreset) => void;
  onApplyTemplate: (preset: SavedPreset) => void;
};

export function PresetsPage(props: PresetsPageProps) {
  const [tab, setTab] = useState<PresetTab>("params");
  const [editing, setEditing] = useState<SavedPreset | null>(null);
  const [creating, setCreating] = useState<PresetKind | null>(null);

  const items = tab === "params" ? props.store.params : props.store.templates;

  return (
    <section className="presets-page" aria-label="预设">
      <header className="presets-header">
        <div>
          <h1>预设</h1>
          <p>参数预设与提示词模板</p>
        </div>
        <button
          className="run-button preset-create-button"
          onClick={() => setCreating(tab === "params" ? "params" : "prompt_template")}
          type="button"
        >
          <Plus aria-hidden="true" />
          新建
        </button>
      </header>

      <div className="preset-tabs" role="tablist" aria-label="预设类型">
        <button
          className={tab === "params" ? "preset-tab active" : "preset-tab"}
          aria-selected={tab === "params"}
          onClick={() => setTab("params")}
          role="tab"
          type="button"
        >
          参数预设 <span>{props.store.params.length}</span>
        </button>
        <button
          className={tab === "templates" ? "preset-tab active" : "preset-tab"}
          aria-selected={tab === "templates"}
          onClick={() => setTab("templates")}
          role="tab"
          type="button"
        >
          提示词模板 <span>{props.store.templates.length}</span>
        </button>
      </div>

      <div className="presets-content" role="tabpanel">
        {items.length === 0 ? (
          <EmptyPreset kind={tab === "params" ? "params" : "prompt_template"} />
        ) : (
          <div className="preset-list">
            {items.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                onEdit={() => setEditing(preset)}
                onDelete={() => {
                  if (!window.confirm(`确定删除“${preset.name}”吗？`)) {
                    return;
                  }
                  props.onChange(removePreset(props.store, preset));
                }}
                onApply={() => {
                  if (preset.kind === "params") {
                    props.onApplyParams(preset);
                  } else {
                    props.onApplyTemplate(preset);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {creating ? (
        <PresetEditor
          kind={creating}
          currentParams={props.currentParams}
          currentPrompt={props.currentPrompt}
          currentNegativePrompt={props.currentNegativePrompt}
          onClose={() => setCreating(null)}
          onSave={(preset) => {
            props.onChange(addPreset(props.store, preset));
            setCreating(null);
          }}
        />
      ) : null}

      {editing ? (
        <PresetEditor
          kind={editing.kind}
          preset={editing}
          currentParams={props.currentParams}
          currentPrompt={props.currentPrompt}
          currentNegativePrompt={props.currentNegativePrompt}
          onClose={() => setEditing(null)}
          onSave={(preset) => {
            props.onChange(updatePreset(props.store, preset));
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function PresetCard(props: {
  preset: SavedPreset;
  onEdit: () => void;
  onDelete: () => void;
  onApply: () => void;
}) {
  const params = props.preset.payload;
  const isParams = props.preset.kind === "params";
  const details = isParams
    ? [
        typeof params.model === "string" ? modelLabel(String(params.model)) : "默认模型",
        typeof params.width === "number" && typeof params.height === "number"
          ? `${params.width} × ${params.height}`
          : null,
        typeof params.steps === "number" ? `${params.steps} steps` : null,
        typeof params.scale === "number" ? `CFG ${params.scale}` : null,
      ].filter(Boolean)
    : [];

  return (
    <article className="preset-card">
      <div className="preset-card-icon" aria-hidden="true">
        {isParams ? <Frame /> : <WandSparkles />}
      </div>
      <div className="preset-card-body">
        <div className="preset-card-title-row">
          <div>
            <h2>{props.preset.name}</h2>
            <span>{props.preset.group || (isParams ? "参数配置" : "提示词模板")}</span>
          </div>
          <div className="preset-card-actions">
            <button aria-label={`编辑 ${props.preset.name}`} onClick={props.onEdit} type="button">
              <PencilLine aria-hidden="true" />
            </button>
            <button
              aria-label={`删除 ${props.preset.name}`}
              className="danger"
              onClick={props.onDelete}
              type="button"
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        </div>

        {isParams ? (
          <p className="preset-card-preview">{details.join(" · ") || "空参数预设"}</p>
        ) : (
          <div className="preset-card-prompts">
            <p>{String(params.prompt ?? "（无正向提示词）")}</p>
            {params.negativePrompt ? <span>反向：{String(params.negativePrompt)}</span> : null}
          </div>
        )}

        <div className="preset-card-footer">
          <span>{new Date(props.preset.createdAt).toLocaleDateString()}</span>
          <button className="outline-button" onClick={props.onApply} type="button">
            {isParams ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {isParams ? "应用到工作台" : "填入提示词"}
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptyPreset({ kind }: { kind: PresetKind }) {
  return (
    <div className="preset-empty">
      <div className="preset-empty-icon" aria-hidden="true">
        <Frame />
      </div>
      <strong>还没有{kind === "params" ? "参数预设" : "提示词模板"}</strong>
      <span>点击右上角“新建”开始保存常用配置</span>
    </div>
  );
}

function PresetEditor(props: {
  kind: PresetKind;
  preset?: SavedPreset;
  currentParams: PresetPayload;
  currentPrompt: string;
  currentNegativePrompt: string;
  onClose: () => void;
  onSave: (preset: SavedPreset) => void;
}) {
  const existing = props.preset;
  const [name, setName] = useState(existing?.name ?? "");
  const [group, setGroup] = useState(existing?.group ?? "");
  const [payload, setPayload] = useState<PresetPayload>(
    existing?.payload ??
      (props.kind === "params"
        ? props.currentParams
        : { prompt: props.currentPrompt, negativePrompt: props.currentNegativePrompt }),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.onClose]);

  function save() {
    if (!name.trim()) {
      return;
    }
    setSaving(true);
    props.onSave({
      id: existing?.id ?? crypto.randomUUID(),
      kind: props.kind,
      name: name.trim(),
      group: group.trim(),
      payload,
      createdAt: existing?.createdAt ?? Date.now(),
      thumbnail: existing?.thumbnail ?? null,
    });
    setSaving(false);
  }

  return (
    <div className="preset-modal-backdrop" onMouseDown={props.onClose}>
      <section
        aria-labelledby="preset-editor-title"
        aria-modal="true"
        className="preset-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="preset-modal-header">
          <div>
            <p className="eyebrow">{props.kind === "params" ? "Parameter preset" : "Prompt template"}</p>
            <h2 id="preset-editor-title">
              {existing ? "编辑" : "新建"}{props.kind === "params" ? "参数预设" : "提示词模板"}
            </h2>
          </div>
          <button aria-label="关闭" className="icon-button" onClick={props.onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="preset-modal-content">
          <label className="field">
            <span>名称</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：人像 · 竖构图" />
          </label>
          <label className="field">
            <span>分组（可选）</span>
            <input value={group} onChange={(event) => setGroup(event.target.value)} placeholder="例如：人物 / 风格" />
          </label>

          {props.kind === "params" ? (
            <div className="preset-capture-box">
              <div>
                <strong>当前工作台参数</strong>
                <span>{formatParams(payload)}</span>
              </div>
              <button className="ghost-button" onClick={() => setPayload(props.currentParams)} type="button">
                <WandSparkles aria-hidden="true" />
                用当前工作台覆盖
              </button>
            </div>
          ) : (
            <div className="preset-prompt-fields">
              <label className="field">
                <span>正向提示词</span>
                <textarea
                  rows={5}
                  value={String(payload.prompt ?? "")}
                  onChange={(event) => setPayload((current) => ({ ...current, prompt: event.target.value }))}
                  placeholder="1girl, masterpiece..."
                />
              </label>
              <label className="field">
                <span>反向提示词</span>
                <textarea
                  rows={3}
                  value={String(payload.negativePrompt ?? "")}
                  onChange={(event) => setPayload((current) => ({ ...current, negativePrompt: event.target.value }))}
                  placeholder="lowres, bad anatomy..."
                />
              </label>
            </div>
          )}
        </div>

        <footer className="preset-modal-footer">
          <button className="ghost-button" onClick={props.onClose} type="button">取消</button>
          <button className="run-button" disabled={saving || !name.trim()} onClick={save} type="button">
            {saving ? <Loader2 className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
            保存
          </button>
        </footer>
      </section>
    </div>
  );
}

function addPreset(store: PresetStore, preset: SavedPreset): PresetStore {
  return preset.kind === "params"
    ? { ...store, params: [preset, ...store.params] }
    : { ...store, templates: [preset, ...store.templates] };
}

function updatePreset(store: PresetStore, preset: SavedPreset): PresetStore {
  return preset.kind === "params"
    ? { ...store, params: store.params.map((item) => (item.id === preset.id ? preset : item)) }
    : { ...store, templates: store.templates.map((item) => (item.id === preset.id ? preset : item)) };
}

function removePreset(store: PresetStore, preset: SavedPreset): PresetStore {
  return preset.kind === "params"
    ? { ...store, params: store.params.filter((item) => item.id !== preset.id) }
    : { ...store, templates: store.templates.filter((item) => item.id !== preset.id) };
}

function modelLabel(model: string) {
  return model
    .replace(/^nai-diffusion-/, "NAI ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatParams(payload: PresetPayload) {
  const values = [
    typeof payload.model === "string" ? modelLabel(payload.model) : null,
    typeof payload.width === "number" && typeof payload.height === "number"
      ? `${payload.width} × ${payload.height}`
      : null,
    typeof payload.steps === "number" ? `${payload.steps} steps` : null,
    typeof payload.scale === "number" ? `CFG ${payload.scale}` : null,
  ];
  return values.filter(Boolean).join(" · ") || "将当前工作台的参数保存下来";
}
