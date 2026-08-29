export type PresetKind = "params" | "prompt_template";

export type PresetPayload = Record<string, unknown>;

export type SavedPreset = {
  id: string;
  kind: PresetKind;
  name: string;
  group: string;
  payload: PresetPayload;
  createdAt: number;
  thumbnail?: string | null;
};

/** Wire format shared with cloudnai4. Keep this shape stable across apps. */
export type SharedPreset = {
  id: string;
  kind: PresetKind;
  name: string;
  group: string | null;
  payload: PresetPayload;
  thumbnail: string | null;
  created_at: number;
};

export type PresetStore = {
  params: SavedPreset[];
  templates: SavedPreset[];
};

export const PRESETS_STORAGE_KEY = "novelai-gui-presets";
export const SHARED_PRESETS_MIGRATED_KEY = "novelai-gui-shared-presets-migrated";

export function emptyPresetStore(): PresetStore {
  return {
    params: [],
    templates: [],
  };
}

export function loadPresetStore(): PresetStore {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) {
      return emptyPresetStore();
    }

    const parsed = JSON.parse(raw) as Partial<PresetStore>;
    const params = normalizePresets(parsed.params, "params");
    const templates = normalizePresets(parsed.templates, "prompt_template");
    return {
      params,
      templates,
    };
  } catch {
    return emptyPresetStore();
  }
}

export function savePresetStore(store: PresetStore) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(store));
}

/** Convert the local camelCase shape to cloudnai4's snake_case wire format. */
export function toSharedPresets(store: PresetStore): SharedPreset[] {
  return [...store.params, ...store.templates].map((preset) => ({
    id: preset.id,
    kind: preset.kind,
    name: preset.name,
    group: preset.group || null,
    payload: toSharedPayload(preset.kind, preset.payload),
    thumbnail: preset.thumbnail ?? null,
    created_at: preset.createdAt,
  }));
}

/** Convert cloudnai4's shared records into the local workbench shape. */
export function fromSharedPresets(items: SharedPreset[]): PresetStore {
  const presets = items.map((item, index) => ({
    id: typeof item.id === "string" && item.id ? item.id : `shared-${index}`,
    kind: item.kind === "params" ? ("params" as const) : ("prompt_template" as const),
    name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "未命名预设",
    group: typeof item.group === "string" ? item.group : "",
    payload: fromSharedPayload(item.kind, item.payload),
    createdAt: typeof item.created_at === "number" ? item.created_at : Date.now() - index,
    thumbnail: item.thumbnail ?? null,
  })).filter((preset) => !isRetiredBuiltInTemplate(preset));
  return {
    params: presets.filter((preset) => preset.kind === "params"),
    templates: presets.filter((preset) => preset.kind === "prompt_template"),
  };
}

/** Preserve pre-existing local records during the one-time shared import. */
export function mergePresetStores(local: PresetStore, shared: PresetStore): PresetStore {
  return {
    params: mergePresetList(shared.params, local.params),
    templates: mergePresetList(shared.templates, local.templates),
  };
}

/** Keep only JSON-safe scalar generation settings in a parameter preset. */
export function snapshotPresetParams(request: Record<string, unknown>): PresetPayload {
  const allowed = [
    "model",
    "action",
    "width",
    "height",
    "nSamples",
    "steps",
    "scale",
    "cfgRescale",
    "seed",
    "sampler",
    "noiseSchedule",
    "imageFormat",
    "qualityToggle",
    "transparentBackground",
    "ucPreset",
    "paramsVersion",
    "dynamicThresholding",
    "sm",
    "smDyn",
    "skipCfgAboveSigma",
    "deliberateEulerAncestralBug",
    "preferBrownian",
    "strength",
    "noise",
    "extraNoiseSeed",
    "colorCorrect",
    "referenceStrength",
    "referenceInformationExtracted",
    "directorReferencePrompt",
    "directorReferenceStrength",
    "directorReferenceSecondaryStrength",
    "directorReferenceInformationExtracted",
  ];

  return Object.fromEntries(
    allowed
      .filter((key) => request[key] !== undefined)
      .map((key) => [key, request[key]]),
  );
}

function normalizePresets(value: unknown, kind: PresetKind): SavedPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Partial<SavedPreset> => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id ? item.id : `${kind}-${index}`,
      kind,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "未命名预设",
      group: typeof item.group === "string" ? item.group : "",
      payload: item.payload && typeof item.payload === "object"
        ? fromSharedPayload(kind, item.payload)
        : {},
      createdAt:
        typeof item.createdAt === "number"
          ? item.createdAt
          : typeof (item as { created_at?: unknown }).created_at === "number"
            ? (item as { created_at: number }).created_at
            : Date.now() - index,
      thumbnail:
        typeof (item as { thumbnail?: unknown }).thumbnail === "string"
          ? (item as { thumbnail: string }).thumbnail
          : null,
    }))
    .filter((preset) => !isRetiredBuiltInTemplate(preset));
}

const CAMEL_TO_SHARED: Record<string, string> = {
  action: "action",
  nSamples: "n_samples",
  cfgRescale: "prompt_guidance_rescale",
  noiseSchedule: "noise_schedule",
  imageFormat: "image_format",
  qualityToggle: "quality_toggle",
  transparentBackground: "transparent_background",
  ucPreset: "uc_preset",
  paramsVersion: "params_version",
  dynamicThresholding: "dynamic_thresholding",
  smDyn: "sm_dyn",
  skipCfgAboveSigma: "skip_cfg_above_sigma",
  deliberateEulerAncestralBug: "deliberate_euler_ancestral_bug",
  preferBrownian: "prefer_brownian",
  extraNoiseSeed: "extra_noise_seed",
  colorCorrect: "color_correct",
  referenceStrength: "reference_strength",
  referenceInformationExtracted: "reference_information_extracted",
  directorReferencePrompt: "director_reference_prompt",
  directorReferenceStrength: "director_reference_strength",
  directorReferenceSecondaryStrength: "director_reference_secondary_strength",
  directorReferenceInformationExtracted: "director_reference_information_extracted",
};

const SHARED_TO_CAMEL: Record<string, string> = Object.fromEntries(
  Object.entries(CAMEL_TO_SHARED).map(([camel, shared]) => [shared, camel]),
);

function toSharedPayload(kind: PresetKind, payload: PresetPayload): PresetPayload {
  if (kind === "prompt_template") {
    return {
      prompt: typeof payload.prompt === "string" ? payload.prompt : "",
      negative_prompt:
        typeof payload.negativePrompt === "string"
          ? payload.negativePrompt
          : typeof payload.negative_prompt === "string"
            ? payload.negative_prompt
            : "",
    };
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [CAMEL_TO_SHARED[key] ?? key, value]),
  );
}

function fromSharedPayload(kind: PresetKind, payload: unknown): PresetPayload {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const entries = Object.entries(payload as Record<string, unknown>);
  if (kind === "prompt_template") {
    return {
      prompt: typeof (payload as Record<string, unknown>).prompt === "string"
        ? (payload as Record<string, unknown>).prompt
        : "",
      negativePrompt:
        typeof (payload as Record<string, unknown>).negative_prompt === "string"
          ? (payload as Record<string, unknown>).negative_prompt
          : typeof (payload as Record<string, unknown>).negativePrompt === "string"
            ? (payload as Record<string, unknown>).negativePrompt
            : "",
    };
  }

  return Object.fromEntries(
    entries.map(([key, value]) => [SHARED_TO_CAMEL[key] ?? key, value]),
  );
}

function mergePresetList(primary: SavedPreset[], secondary: SavedPreset[]): SavedPreset[] {
  const result = primary.filter((preset) => !isRetiredBuiltInTemplate(preset));
  for (const preset of secondary) {
    if (isRetiredBuiltInTemplate(preset)) {
      continue;
    }
    const duplicate = result.some(
      (item) => item.id === preset.id || (item.kind === preset.kind && item.name === preset.name),
    );
    if (!duplicate) {
      result.push(preset);
    }
  }
  return result;
}

function isRetiredBuiltInTemplate(preset: Pick<SavedPreset, "kind" | "id">): boolean {
  return preset.kind === "prompt_template" && preset.id.startsWith("default-template-");
}
