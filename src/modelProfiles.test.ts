import { describe, expect, it } from "vitest";
import {
  TAG_HINT,
  availableUcPresets,
  baseModelId,
  maxCharactersForModel,
  modelProfile,
  qualityTagsFor,
  ucPresetText,
  legacyUcIndexToOfficial,
} from "./modelProfiles";
import { DEFAULT_REQUEST } from "./constants";
import { effectiveImageModel, effectiveNegativePrompt, effectivePrompt } from "./helpers";
import type { ImageRequest } from "./types";

function request(overrides: Partial<ImageRequest> = {}): ImageRequest {
  return { ...DEFAULT_REQUEST, ...overrides };
}

describe("quality tags", () => {
  it("uses the official V5 texts", () => {
    expect(qualityTagsFor("nai-diffusion-5-full", TAG_HINT.standard)).toBe(
      "very aesthetic, masterpiece, no text",
    );
    expect(qualityTagsFor("nai-diffusion-5-full", TAG_HINT.light)).toBe(
      "very aesthetic, amazing quality, no text",
    );
    expect(qualityTagsFor("nai-diffusion-5-full", TAG_HINT.none)).toBe("");
  });

  it("keeps older checkpoints on their own texts", () => {
    expect(qualityTagsFor("nai-diffusion-4-5-full", TAG_HINT.standard)).toBe(
      "location, very aesthetic, masterpiece, no text",
    );
    expect(qualityTagsFor("nai-diffusion-3", TAG_HINT.standard)).toBe(
      "best quality, amazing quality, very aesthetic, absurdres",
    );
    expect(qualityTagsFor("kandinsky-vanilla", TAG_HINT.standard)).toBe("");
  });

  it("appends the tags at the end of the prompt", () => {
    expect(effectivePrompt(request({ prompt: "1girl", qualityPreset: TAG_HINT.standard }))).toBe(
      "1girl, very aesthetic, masterpiece, no text",
    );
    expect(effectivePrompt(request({ prompt: "1girl", qualityPreset: TAG_HINT.none }))).toBe("1girl");
  });

  it("injects V2 tags at the start of the prompt", () => {
    expect(
      effectivePrompt(
        request({ model: "nai-diffusion-2", prompt: "1girl", qualityPreset: TAG_HINT.standard }),
      ),
    ).toBe("very aesthetic, best quality, absurdres, 1girl");
  });
});

describe("undesired content presets", () => {
  it("returns the official V5 Heavy and Light texts", () => {
    expect(ucPresetText("nai-diffusion-5-full", TAG_HINT.heavy)).toBe(
      "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page",
    );
    expect(ucPresetText("nai-diffusion-5-full", TAG_HINT.light)).toContain("0::ai-generated::");
    expect(ucPresetText("nai-diffusion-5-full", TAG_HINT.none)).toBe("");
  });

  it("maps legacy UI numbering to official hint ids", () => {
    expect(legacyUcIndexToOfficial(0)).toBe(TAG_HINT.none);
    expect(legacyUcIndexToOfficial(1)).toBe(TAG_HINT.light);
    expect(legacyUcIndexToOfficial(2)).toBe(TAG_HINT.heavy);
    expect(legacyUcIndexToOfficial(3)).toBe(TAG_HINT.humanFocus);
  });

  it("only offers presets the model actually has", () => {
    expect(availableUcPresets("nai-diffusion-5-full")).toEqual([
      "heavy",
      "light",
      "humanFocus",
      "furryFocus",
      "none",
    ]);
    // V4.5 Curated has no Furry Focus preset in the official table.
    expect(availableUcPresets("nai-diffusion-4-5-curated")).not.toContain("furryFocus");
    expect(availableUcPresets("kandinsky-vanilla")).toEqual(["none"]);
  });

  it("combines the preset with the user's own UC text", () => {
    const value = effectiveNegativePrompt(
      request({ ucPreset: TAG_HINT.light, negativePrompt: "hat" }),
    );
    expect(value.startsWith("lowres, bad hands")).toBe(true);
    expect(value.endsWith(", hat")).toBe(true);
  });
});

describe("medium effort", () => {
  it("swaps in the distilled checkpoints", () => {
    const medium = request({ model: "nai-diffusion-5-full", effort: "medium" });
    expect(effectiveImageModel(medium)).toBe("nai-diffusion-5-full-medium");
    expect(effectiveImageModel(request({ ...medium, action: "infill" }))).toBe(
      "nai-diffusion-5-full-medium-inpainting",
    );
  });

  it("ignores the toggle on models without a medium checkpoint", () => {
    expect(effectiveImageModel(request({ model: "nai-diffusion-4-5-full", effort: "medium" }))).toBe(
      "nai-diffusion-4-5-full",
    );
  });

  it("pins the Heavy UC and drops custom UC text", () => {
    const medium = request({ effort: "medium", ucPreset: TAG_HINT.light, negativePrompt: "hat" });
    expect(effectiveNegativePrompt(medium)).toBe(ucPresetText("nai-diffusion-5-full", TAG_HINT.heavy));
  });

  it("maps inpainting ids back to their base model", () => {
    expect(baseModelId("nai-diffusion-5-full-medium-inpainting")).toBe("nai-diffusion-5-full");
    expect(baseModelId("nai-diffusion-4-5-curated-inpainting")).toBe("nai-diffusion-4-5-curated");
    expect(baseModelId("nai-diffusion-5-full")).toBe("nai-diffusion-5-full");
  });
});

describe("model limits", () => {
  it("knows the character caps", () => {
    expect(maxCharactersForModel("nai-diffusion-5-full")).toBe(22);
    expect(maxCharactersForModel("nai-diffusion-4-5-full")).toBe(6);
    expect(maxCharactersForModel("nai-diffusion-3")).toBe(0);
  });

  it("returns no profile for unknown models", () => {
    expect(modelProfile("kandinsky-vanilla")).toBeUndefined();
    expect(modelProfile("nai-diffusion-5-full-medium")).toBeDefined();
  });
});
