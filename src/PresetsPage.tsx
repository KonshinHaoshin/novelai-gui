import {
  Check,
  Copy,
  Loader2,
  PencilLine,
  Plus,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { PresetKind, PresetPayload, PresetStore, SavedPreset } from "./presets";

type PresetsPageProps = {
  store: PresetStore;
  currentStylePrompt: string;
  currentNegativePrompt: string;
  onChange: (store: PresetStore) => void;
  onApplyStyle: (preset: SavedPreset) => void;
};

export function PresetsPage(props: PresetsPageProps) {
  const [editing, setEditing] = useState<SavedPreset | null>(null);
  const [creating, setCreating] = useState<PresetKind | null>(null);
  const items = props.store.templates;

  return (
    <section className="presets-page" aria-label="画风">
      <header className="presets-header">
        <div>
          <h1>画风</h1>
          <p>保存和管理常用画风提示词</p>
        </div>
        <button
          className="run-button preset-create-button"
          onClick={() => setCreating("prompt_template")}
          type="button"
        >
          <Plus aria-hidden="true" />
          新建
        </button>
      </header>

      <div className="presets-content">
        {items.length === 0 ? (
          <EmptyPreset />
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
                  props.onApplyStyle(preset);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {creating ? (
        <PresetEditor
          kind={creating}
          currentStylePrompt={props.currentStylePrompt}
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
          currentStylePrompt={props.currentStylePrompt}
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

  return (
    <article className="preset-card">
      <div className="preset-card-icon" aria-hidden="true">
        <WandSparkles />
      </div>
      <div className="preset-card-body">
        <div className="preset-card-title-row">
          <div>
            <h2>{props.preset.name}</h2>
            <span>{props.preset.group || "画风预设"}</span>
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

        <div className="preset-card-prompts">
          <p>{String(params.prompt ?? params.stylePrompt ?? "（无画风提示词）")}</p>
          {params.negativePrompt ? <span>反向：{String(params.negativePrompt)}</span> : null}
        </div>

        <div className="preset-card-footer">
          <span>{new Date(props.preset.createdAt).toLocaleDateString()}</span>
          <button className="outline-button" onClick={props.onApply} type="button">
            <Copy aria-hidden="true" />
            应用到画风
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptyPreset() {
  return (
    <div className="preset-empty">
      <div className="preset-empty-icon" aria-hidden="true">
        <WandSparkles />
      </div>
      <strong>还没有画风预设</strong>
      <span>点击右上角“新建”开始保存常用画风</span>
    </div>
  );
}

function PresetEditor(props: {
  kind: PresetKind;
  preset?: SavedPreset;
  currentStylePrompt: string;
  currentNegativePrompt: string;
  onClose: () => void;
  onSave: (preset: SavedPreset) => void;
}) {
  const existing = props.preset;
  const [name, setName] = useState(existing?.name ?? "");
  const [group, setGroup] = useState(existing?.group ?? "");
  const [payload, setPayload] = useState<PresetPayload>(
    existing?.payload ??
      { prompt: props.currentStylePrompt, negativePrompt: props.currentNegativePrompt },
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
            <p className="eyebrow">Style preset</p>
            <h2 id="preset-editor-title">
              {existing ? "编辑" : "新建"}画风预设
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

          <div className="preset-prompt-fields">
            <label className="field">
              <span>画风提示词</span>
              <textarea
                rows={5}
                value={String(payload.prompt ?? payload.stylePrompt ?? "")}
                onChange={(event) => setPayload((current) => ({ ...current, prompt: event.target.value }))}
                placeholder="official art, anime style, watercolor..."
              />
            </label>
            <label className="field">
              <span>反向提示词（可选）</span>
              <textarea
                rows={3}
                value={String(payload.negativePrompt ?? "")}
                onChange={(event) => setPayload((current) => ({ ...current, negativePrompt: event.target.value }))}
                placeholder="lowres, bad anatomy..."
              />
            </label>
          </div>
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
