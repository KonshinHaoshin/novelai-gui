// Official per-model data transcribed from docs.novelai.net
// (image/undesiredcontent, image/qualitytags, image/effort, image/tags, image/models)
// and the official OpenAPI spec at https://image.novelai.net/docs/doc.json.

export type UcPresetId = "heavy" | "light" | "humanFocus" | "furryFocus" | "none";

export type QualityPresetId = "standard" | "light" | "none";

/**
 * Official tag-hint ids shared by `tag_hint_qt` and `tag_hint_uc_preset`.
 * The backend never expands them; they hint the suggest-tags endpoint and
 * name the preset that was applied.
 */
export const TAG_HINT = {
  none: 0,
  standard: 1,
  heavy: 2,
  light: 3,
  humanFocus: 4,
  furryFocus: 5,
} as const;

export const UC_PRESET_LABEL: Record<UcPresetId, string> = {
  heavy: "Heavy",
  light: "Light",
  humanFocus: "Human Focus",
  furryFocus: "Furry Focus",
  none: "无默认 UC",
};

export const QUALITY_PRESET_LABEL: Record<QualityPresetId, string> = {
  standard: "Standard",
  light: "Light",
  none: "关闭",
};

/** Old UI numbering (0 None, 1 Light, 2 Heavy, 3 Human Focus) → preset id. */
const LEGACY_UC_INDEX_TO_ID: Record<number, UcPresetId> = {
  0: "none",
  1: "light",
  2: "heavy",
  3: "humanFocus",
};

const FURRY_FOCUS =
  "{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic";

const HEAVY_V5 =
  "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page";

const HUMAN_FOCUS_V5 = `${HEAVY_V5}, @_@, mismatched pupils, glowing eyes, bad anatomy`;

const HEAVY_V3 =
  "lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]";

export type ModelProfile = {
  /** Official quality tags; appended at the end unless qualityAtStart. */
  qualityTags?: { standard: string; light?: string };
  qualityAtStart?: boolean;
  /** Available Undesired Content presets with their official text. */
  ucPresets: Partial<Record<UcPresetId, string>>;
  /** Medium effort checkpoints; only NovelAI Diffusion V5 Full has one. */
  mediumEffort?: { id: string; inpaintingId: string; steps: number; sampler: string };
  maxCharacters: number;
  paramsVersion: number;
  defaultSteps?: number;
};

export const V5_FULL_MEDIUM = {
  id: "nai-diffusion-5-full-medium",
  inpaintingId: "nai-diffusion-5-full-medium-inpainting",
  steps: 14,
  sampler: "k_euler_ancestral",
} as const;

export const MODEL_PROFILES: Record<string, ModelProfile> = {
  "nai-diffusion-5-full": {
    qualityTags: {
      standard: "very aesthetic, masterpiece, no text",
      light: "very aesthetic, amazing quality, no text",
    },
    ucPresets: {
      heavy: HEAVY_V5,
      light:
        "lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::",
      humanFocus: HUMAN_FOCUS_V5,
      furryFocus: FURRY_FOCUS,
    },
    mediumEffort: V5_FULL_MEDIUM,
    maxCharacters: 22,
    // NovelAI does not document params_version anywhere; 4 is what the web
    // client sends for V5 and has not been verified against a live request.
    paramsVersion: 4,
    defaultSteps: 23,
  },
  "nai-diffusion-5-curated": {
    qualityTags: {
      standard: "very aesthetic, masterpiece, no text",
      light: "very aesthetic, amazing quality, no text",
    },
    ucPresets: {
      heavy: HEAVY_V5,
      light:
        "lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::",
      humanFocus: HUMAN_FOCUS_V5,
      furryFocus: FURRY_FOCUS,
    },
    maxCharacters: 22,
    paramsVersion: 4,
    defaultSteps: 23,
  },
  "nai-diffusion-4-5-full": {
    qualityTags: { standard: "location, very aesthetic, masterpiece, no text" },
    ucPresets: {
      heavy: HEAVY_V5,
      light:
        "lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page",
      humanFocus: HUMAN_FOCUS_V5,
      furryFocus: FURRY_FOCUS,
    },
    maxCharacters: 6,
    paramsVersion: 3,
    defaultSteps: 28,
  },
  "nai-diffusion-4-5-curated": {
    qualityTags: { standard: "location, masterpiece, no text, -0.8::feet::, rating:general" },
    ucPresets: {
      heavy:
        "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page",
      light:
        "blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page",
      humanFocus:
        "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page",
    },
    maxCharacters: 6,
    paramsVersion: 3,
    defaultSteps: 28,
  },
  "nai-diffusion-4-full": {
    qualityTags: { standard: "no text, best quality, very aesthetic, absurdres" },
    ucPresets: {
      heavy:
        "blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks",
      light: "blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing",
    },
    maxCharacters: 6,
    paramsVersion: 3,
  },
  "nai-diffusion-4-curated-preview": {
    qualityTags: { standard: "rating:general, amazing quality, very aesthetic, absurdres" },
    ucPresets: {
      heavy:
        "blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts",
      light:
        "blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature",
    },
    maxCharacters: 6,
    paramsVersion: 3,
  },
  "nai-diffusion-3": {
    qualityTags: { standard: "best quality, amazing quality, very aesthetic, absurdres" },
    ucPresets: {
      heavy: HEAVY_V3,
      light: "lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing",
      humanFocus: `${HEAVY_V3}, bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes`,
    },
    maxCharacters: 0,
    paramsVersion: 3,
  },
  "nai-diffusion-furry": {
    qualityTags: { standard: "{best quality}, {amazing quality}" },
    ucPresets: {
      heavy:
        "{{worst quality}}, [displeasing], {unusual pupils}, guide lines, {{unfinished}}, {bad}, url, artist name, {{tall image}}, mosaic, {sketch page}, comic panel, impact (font), [dated], {logo}, ych, {what}, {where is your god now}, {distorted text}, repeated text, {floating head}, {1994}, {widescreen}, absolutely everyone, sequence, {compression artifacts}, hard translated, {cropped}, {commissioner name}, unknown text, high contrast",
      light:
        "{worst quality}, guide lines, unfinished, bad, url, tall image, widescreen, compression artifacts, unknown text",
    },
    maxCharacters: 0,
    paramsVersion: 3,
  },
  "nai-diffusion-2": {
    qualityTags: { standard: "very aesthetic, best quality, absurdres", },
    qualityAtStart: true,
    ucPresets: {
      heavy:
        "lowres, bad, text, error, missing, extra, fewer, cropped, jpeg artifacts, worst quality, bad quality, watermark, displeasing, unfinished, chromatic aberration, scan, scan artifacts",
      light: "lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing",
    },
    maxCharacters: 0,
    paramsVersion: 3,
  },
  // Anime V1 Full / Curated. Quality tags go at the start of the prompt and the
  // UC presets are the old "Low Quality" pair rather than Heavy/Light.
  "nai-diffusion": {
    qualityTags: { standard: "masterpiece, best quality," },
    qualityAtStart: true,
    ucPresets: {
      heavy:
        "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
      light:
        "lowres, text, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
    },
    maxCharacters: 0,
    paramsVersion: 3,
  },
  "safe-diffusion": {
    qualityTags: { standard: "masterpiece, best quality," },
    qualityAtStart: true,
    ucPresets: {
      heavy:
        "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
      light:
        "lowres, text, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
    },
    maxCharacters: 0,
    paramsVersion: 3,
  },
};

/** Models without a dedicated profile (V1, safe-diffusion, custom, …). */
export function modelProfile(model: string): ModelProfile | undefined {
  return MODEL_PROFILES[baseModelId(model)];
}

/** Map any model id (inpainting / medium variants) back to its base model. */
export function baseModelId(model: string): string {
  if (model === V5_FULL_MEDIUM.id || model === V5_FULL_MEDIUM.inpaintingId) {
    return "nai-diffusion-5-full";
  }
  const withoutInpainting = model.replace(/-inpainting$/, "");
  return INPAINTING_TO_BASE[withoutInpainting] ?? withoutInpainting;
}

const INPAINTING_TO_BASE: Record<string, string> = {
  "nai-diffusion-5-curated-inpainting": "nai-diffusion-5-curated",
  "nai-diffusion-4-5-full-inpainting": "nai-diffusion-4-5-full",
  "nai-diffusion-4-5-curated-inpainting": "nai-diffusion-4-5-curated",
  "nai-diffusion-4-full-inpainting": "nai-diffusion-4-full",
  "nai-diffusion-4-curated-preview-inpainting": "nai-diffusion-4-curated-preview",
  "nai-diffusion-3-inpainting": "nai-diffusion-3",
  "nai-diffusion-inpainting": "nai-diffusion",
  "safe-diffusion-inpainting": "safe-diffusion",
  "furry-diffusion-inpainting": "nai-diffusion-furry",
};

/** Official UC preset text for a model, or "" when unavailable. */
export function ucPresetText(model: string, preset: number | undefined): string {
  const profile = modelProfile(model);
  if (!profile) {
    return "";
  }
  const id = officialUcPresetId(preset);
  return id ? profile.ucPresets[id] ?? "" : "";
}

/** Translate an official tag-hint number into a preset id (undefined = none). */
export function officialUcPresetId(value: number | undefined): UcPresetId | undefined {
  switch (value) {
    case TAG_HINT.heavy:
      return "heavy";
    case TAG_HINT.light:
      return "light";
    case TAG_HINT.humanFocus:
      return "humanFocus";
    case TAG_HINT.furryFocus:
      return "furryFocus";
    default:
      return undefined;
  }
}

/** Legacy stored ucPreset index → official tag-hint number. */
export function legacyUcIndexToOfficial(value: number | undefined): number {
  const id = LEGACY_UC_INDEX_TO_ID[value ?? 0];
  return id ? TAG_HINT[id] : TAG_HINT.none;
}

/** Quality tags for the model and official qt hint number ("" = none). */
export function qualityTagsFor(model: string, qualityPreset: number | undefined): string {
  const profile = modelProfile(model);
  if (!profile?.qualityTags) {
    return "";
  }
  if (qualityPreset === TAG_HINT.light) {
    return profile.qualityTags.light ?? profile.qualityTags.standard;
  }
  if (qualityPreset === TAG_HINT.standard) {
    return profile.qualityTags.standard;
  }
  return "";
}

export function qualityAtStart(model: string): boolean {
  return modelProfile(model)?.qualityAtStart ?? false;
}

export function mediumEffortForModel(model: string) {
  return modelProfile(model)?.mediumEffort;
}

export function maxCharactersForModel(model: string): number {
  return modelProfile(model)?.maxCharacters ?? 0;
}

export function paramsVersionForModel(model: string): number {
  return modelProfile(model)?.paramsVersion ?? 3;
}

export function defaultStepsForModel(model: string): number | undefined {
  return modelProfile(model)?.defaultSteps;
}

/** UC preset options for a model, in stable display order ("none" last). */
export function availableUcPresets(model: string): UcPresetId[] {
  const profile = modelProfile(model);
  const order: UcPresetId[] = ["heavy", "light", "humanFocus", "furryFocus"];
  const available = order.filter((id) => Boolean(profile?.ucPresets[id]));
  return available.length > 0 ? [...available, "none"] : ["none"];
}

/** V5-only quick tags from the official Tagging page. */
export const V5_COMPLEXITY_TAGS = [
  "low complexity",
  "medium complexity",
  "high complexity",
  "ultra complexity",
] as const;
