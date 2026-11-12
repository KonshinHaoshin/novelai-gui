//! Official quality-tag and Undesired Content presets used by the CLI.
//!
//! NovelAI does not expand `qualityToggle` / `ucPreset` server-side; the
//! official client appends these strings to the prompt before sending. Keep
//! this table in sync with `src/modelProfiles.ts`.

pub const TAG_HINT_NONE: u32 = 0;
pub const TAG_HINT_STANDARD: u32 = 1;
pub const TAG_HINT_HEAVY: u32 = 2;
pub const TAG_HINT_LIGHT: u32 = 3;
pub const TAG_HINT_HUMAN_FOCUS: u32 = 4;
pub const TAG_HINT_FURRY_FOCUS: u32 = 5;

struct ModelProfile {
    quality_standard: &'static str,
    quality_light: Option<&'static str>,
    quality_at_start: bool,
    heavy: &'static str,
    light: Option<&'static str>,
    human_focus: Option<&'static str>,
    furry_focus: Option<&'static str>,
}

const FURRY_FOCUS: &str = "{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic";
const HEAVY_V5: &str = "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page";
const HUMAN_FOCUS_V5: &str = "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy";
const HEAVY_V3: &str = "lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]";

const V5_FULL: ModelProfile = ModelProfile {
    quality_standard: "very aesthetic, masterpiece, no text",
    quality_light: Some("very aesthetic, amazing quality, no text"),
    quality_at_start: false,
    heavy: HEAVY_V5,
    light: Some("lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::"),
    human_focus: Some(HUMAN_FOCUS_V5),
    furry_focus: Some(FURRY_FOCUS),
};

const V5_CURATED: ModelProfile = ModelProfile {
    quality_standard: "very aesthetic, masterpiece, no text",
    quality_light: Some("very aesthetic, amazing quality, no text"),
    quality_at_start: false,
    heavy: HEAVY_V5,
    light: Some("lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::"),
    human_focus: Some(HUMAN_FOCUS_V5),
    furry_focus: Some(FURRY_FOCUS),
};

const V4_5_FULL: ModelProfile = ModelProfile {
    quality_standard: "location, very aesthetic, masterpiece, no text",
    quality_light: None,
    quality_at_start: false,
    heavy: HEAVY_V5,
    light: Some("lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page"),
    human_focus: Some(HUMAN_FOCUS_V5),
    furry_focus: Some(FURRY_FOCUS),
};

const V4_5_CURATED: ModelProfile = ModelProfile {
    quality_standard: "location, masterpiece, no text, -0.8::feet::, rating:general",
    quality_light: None,
    quality_at_start: false,
    heavy: "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page",
    light: Some("blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page"),
    human_focus: Some("blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page"),
    furry_focus: None,
};

const V4_FULL: ModelProfile = ModelProfile {
    quality_standard: "no text, best quality, very aesthetic, absurdres",
    quality_light: None,
    quality_at_start: false,
    heavy: "blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks",
    light: Some("blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing"),
    human_focus: None,
    furry_focus: None,
};

const V4_CURATED: ModelProfile = ModelProfile {
    quality_standard: "rating:general, amazing quality, very aesthetic, absurdres",
    quality_light: None,
    quality_at_start: false,
    heavy: "blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts",
    light: Some("blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature"),
    human_focus: None,
    furry_focus: None,
};

const V3: ModelProfile = ModelProfile {
    quality_standard: "best quality, amazing quality, very aesthetic, absurdres",
    quality_light: None,
    quality_at_start: false,
    heavy: HEAVY_V3,
    light: Some("lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing"),
    human_focus: Some("lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes"),
    furry_focus: None,
};

const FURRY: ModelProfile = ModelProfile {
    quality_standard: "{best quality}, {amazing quality}",
    quality_light: None,
    quality_at_start: false,
    heavy: "{{worst quality}}, [displeasing], {unusual pupils}, guide lines, {{unfinished}}, {bad}, url, artist name, {{tall image}}, mosaic, {sketch page}, comic panel, impact (font), [dated], {logo}, ych, {what}, {where is your god now}, {distorted text}, repeated text, {floating head}, {1994}, {widescreen}, absolutely everyone, sequence, {compression artifacts}, hard translated, {cropped}, {commissioner name}, unknown text, high contrast",
    light: Some("{worst quality}, guide lines, unfinished, bad, url, tall image, widescreen, compression artifacts, unknown text"),
    human_focus: None,
    furry_focus: None,
};

const V2: ModelProfile = ModelProfile {
    quality_standard: "very aesthetic, best quality, absurdres",
    quality_light: None,
    quality_at_start: true,
    heavy: "lowres, bad, text, error, missing, extra, fewer, cropped, jpeg artifacts, worst quality, bad quality, watermark, displeasing, unfinished, chromatic aberration, scan, scan artifacts",
    light: Some("lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing"),
    human_focus: None,
    furry_focus: None,
};

const V1: ModelProfile = ModelProfile {
    quality_standard: "masterpiece, best quality,",
    quality_light: None,
    quality_at_start: true,
    heavy: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
    light: Some("lowres, text, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry"),
    human_focus: None,
    furry_focus: None,
};

/// Map a checkpoint id (including inpainting and medium variants) to its base.
pub fn base_model_id(model: &str) -> &str {
    if model == "nai-diffusion-5-full-medium" || model == "nai-diffusion-5-full-medium-inpainting" {
        return "nai-diffusion-5-full";
    }
    match model.strip_suffix("-inpainting").unwrap_or(model) {
        "nai-diffusion-5-curated" => "nai-diffusion-5-curated",
        "nai-diffusion-4-5-full" => "nai-diffusion-4-5-full",
        "nai-diffusion-4-5-curated" => "nai-diffusion-4-5-curated",
        "nai-diffusion-4-full" => "nai-diffusion-4-full",
        "nai-diffusion-4-curated-preview" => "nai-diffusion-4-curated-preview",
        "nai-diffusion-3" => "nai-diffusion-3",
        "nai-diffusion" => "nai-diffusion",
        "safe-diffusion" => "safe-diffusion",
        "furry-diffusion" => "nai-diffusion-furry",
        "nai-diffusion-5-full" => "nai-diffusion-5-full",
        other => other,
    }
}

fn profile(model: &str) -> Option<&'static ModelProfile> {
    match base_model_id(model) {
        "nai-diffusion-5-full" => Some(&V5_FULL),
        "nai-diffusion-5-curated" => Some(&V5_CURATED),
        "nai-diffusion-4-5-full" => Some(&V4_5_FULL),
        "nai-diffusion-4-5-curated" => Some(&V4_5_CURATED),
        "nai-diffusion-4-full" => Some(&V4_FULL),
        "nai-diffusion-4-curated-preview" => Some(&V4_CURATED),
        "nai-diffusion-3" => Some(&V3),
        "nai-diffusion-furry" => Some(&FURRY),
        "nai-diffusion-2" => Some(&V2),
        "nai-diffusion" | "safe-diffusion" => Some(&V1),
        _ => None,
    }
}

/// Quality tags for the official `tag_hint_qt` numbering.
pub fn quality_tags_for(model: &str, quality_preset: u32) -> &'static str {
    let Some(profile) = profile(model) else {
        return "";
    };
    if quality_preset == TAG_HINT_LIGHT {
        profile.quality_light.unwrap_or(profile.quality_standard)
    } else if quality_preset == TAG_HINT_STANDARD {
        profile.quality_standard
    } else {
        ""
    }
}

/// UC text for the official `tag_hint_uc_preset` numbering.
pub fn uc_preset_text(model: &str, uc_preset: u32) -> &'static str {
    let Some(profile) = profile(model) else {
        return "";
    };
    match uc_preset {
        TAG_HINT_HEAVY => profile.heavy,
        TAG_HINT_LIGHT => profile.light.unwrap_or(""),
        TAG_HINT_HUMAN_FOCUS => profile.human_focus.unwrap_or(""),
        TAG_HINT_FURRY_FOCUS => profile.furry_focus.unwrap_or(""),
        _ => "",
    }
}

pub fn quality_at_start(model: &str) -> bool {
    profile(model).is_some_and(|profile| profile.quality_at_start)
}

pub fn is_modern_image_model(model: &str) -> bool {
    let model = base_model_id(model);
    model.contains("diffusion-4") || model.contains("diffusion-5")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_official_quality_and_uc_text() {
        assert_eq!(
            quality_tags_for("nai-diffusion-5-full", TAG_HINT_STANDARD),
            "very aesthetic, masterpiece, no text"
        );
        assert_eq!(
            quality_tags_for("nai-diffusion-5-full", TAG_HINT_LIGHT),
            "very aesthetic, amazing quality, no text"
        );
        assert_eq!(
            quality_tags_for("nai-diffusion-5-full-medium-inpainting", TAG_HINT_NONE),
            ""
        );
        assert_eq!(
            quality_tags_for("nai-diffusion", TAG_HINT_STANDARD),
            "masterpiece, best quality,"
        );
        assert!(quality_at_start("nai-diffusion"));
        assert!(!quality_at_start("nai-diffusion-5-full"));
        assert!(
            uc_preset_text("nai-diffusion-5-full-inpainting", TAG_HINT_HEAVY)
                .contains("artistic error")
        );
        assert_eq!(
            uc_preset_text("nai-diffusion-4-5-curated", TAG_HINT_FURRY_FOCUS),
            ""
        );
        assert_eq!(
            base_model_id("nai-diffusion-5-full-medium-inpainting"),
            "nai-diffusion-5-full"
        );
        assert_eq!(
            base_model_id("furry-diffusion-inpainting"),
            "nai-diffusion-furry"
        );
    }
}
