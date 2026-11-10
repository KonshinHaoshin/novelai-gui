import { describe, expect, it } from "vitest";
import {
  emptyPresetStore,
  fromSharedPresets,
  mergePresetStores,
  snapshotPresetParams,
  toSharedPresets,
  type PresetStore,
  type SavedPreset,
} from "./presets";

function preset(overrides: Partial<SavedPreset> = {}): SavedPreset {
  return {
    id: "preset-1",
    kind: "params",
    name: "测试参数",
    group: "",
    payload: {},
    createdAt: 1,
    ...overrides,
  };
}

describe("toSharedPresets / fromSharedPresets", () => {
  it("round-trips camelCase parameter keys through the shared snake_case format", () => {
    const store: PresetStore = {
      params: [preset({ payload: { model: "nai-diffusion-4-5-full", cfgRescale: 0.2, smDyn: true } })],
      templates: [],
    };

    const shared = toSharedPresets(store);
    expect(shared[0].payload).toEqual({
      model: "nai-diffusion-4-5-full",
      prompt_guidance_rescale: 0.2,
      sm_dyn: true,
    });
    expect(shared[0].group).toBeNull();

    const restored = fromSharedPresets(shared);
    expect(restored.params[0].payload).toEqual({
      model: "nai-diffusion-4-5-full",
      cfgRescale: 0.2,
      smDyn: true,
    });
  });

  it("normalises style templates and falls back for missing fields", () => {
    const shared = fromSharedPresets([
      {
        id: "",
        kind: "prompt_template",
        name: "  ",
        group: null,
        payload: { prompt: "1girl", negative_prompt: "lowres" },
        thumbnail: null,
        created_at: 42,
      },
    ]);

    expect(shared.templates[0].id).toBe("shared-0");
    expect(shared.templates[0].name).toBe("未命名预设");
    expect(shared.templates[0].payload).toEqual({ prompt: "1girl", negativePrompt: "lowres" });
    expect(shared.templates[0].createdAt).toBe(42);
  });

  it("drops retired built-in templates", () => {
    const store = fromSharedPresets([
      {
        id: "default-template-1",
        kind: "prompt_template",
        name: "已下线",
        group: null,
        payload: { prompt: "", negative_prompt: "" },
        thumbnail: null,
        created_at: 1,
      },
    ]);

    expect(store.templates).toHaveLength(0);
  });
});

describe("mergePresetStores", () => {
  it("keeps local presets and skips shared duplicates", () => {
    const local = { params: [preset({ id: "a", name: "本地" })], templates: [] };
    const shared = {
      params: [preset({ id: "b", name: "本地" }), preset({ id: "c", name: "云端" })],
      templates: [],
    };

    const merged = mergePresetStores(local, shared);

    expect(merged.params.map((item) => item.id)).toEqual(["b", "c"]);
    expect(merged.params.filter((item) => item.name === "本地")).toHaveLength(1);
  });

  it("returns empty stores untouched", () => {
    expect(mergePresetStores(emptyPresetStore(), emptyPresetStore())).toEqual({
      params: [],
      templates: [],
    });
  });
});

describe("snapshotPresetParams", () => {
  it("keeps only known generation fields", () => {
    const snapshot = snapshotPresetParams({
      model: "nai-diffusion-4-5-full",
      steps: 28,
      prompt: "should be dropped",
      characters: [],
      seed: 0,
    });

    expect(snapshot).toEqual({ model: "nai-diffusion-4-5-full", steps: 28, seed: 0 });
  });

  it("omits undefined fields", () => {
    expect(snapshotPresetParams({ model: "x", steps: undefined })).toEqual({ model: "x" });
  });
});
