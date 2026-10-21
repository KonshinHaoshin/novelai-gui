//! Offline metadata inspection for the standalone CLI. No inference or network access.
use flate2::read::{GzDecoder, ZlibDecoder};
use serde_json::{json, Value};
use std::{io::Read, path::Path};

const LIMIT: usize = 16 * 1024 * 1024;
type Chunks = Vec<(String, String)>;

fn inflate(bytes: &[u8], gzip: bool) -> Result<Vec<u8>, String> {
    let reader: Box<dyn Read + '_> = if gzip {
        Box::new(GzDecoder::new(bytes))
    } else {
        Box::new(ZlibDecoder::new(bytes))
    };
    let mut output = Vec::new();
    reader
        .take((LIMIT + 1) as u64)
        .read_to_end(&mut output)
        .map_err(|e| format!("元数据解压失败：{e}"))?;
    if output.len() > LIMIT {
        return Err("图片元数据过大。".into());
    }
    Ok(output)
}
fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .trim_matches('\0')
        .trim()
        .to_string()
}
fn split_zero(bytes: &[u8]) -> Option<(&[u8], &[u8])> {
    let pos = bytes.iter().position(|&b| b == 0)?;
    Some((&bytes[..pos], &bytes[pos + 1..]))
}
fn expand(chunks: &mut Chunks, key: &str, value: String) {
    if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(&value) {
        for (k, v) in map {
            if let Some(s) = v.as_str() {
                chunks.push((k, s.into()));
            }
        }
    }
    chunks.push((key.into(), value));
}
fn png_chunks(bytes: &[u8]) -> Result<Chunks, String> {
    let mut chunks = Vec::new();
    let mut offset = 8;
    while offset + 12 <= bytes.len() {
        let len = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
        let end = offset
            .checked_add(8)
            .and_then(|v| v.checked_add(len))
            .filter(|&v| v <= bytes.len() - 4)
            .ok_or("PNG 数据块不完整。")?;
        let data = &bytes[offset + 8..end];
        match &bytes[offset + 4..offset + 8] {
            b"tEXt" => {
                if let Some((k, v)) = split_zero(data) {
                    chunks.push((text(k), text(v)));
                }
            }
            b"zTXt" => {
                if let Some((k, v)) = split_zero(data) {
                    if v.first() == Some(&0) {
                        chunks.push((text(k), text(&inflate(&v[1..], false)?)));
                    }
                }
            }
            b"iTXt" => {
                if let Some((k, v)) = split_zero(data) {
                    if v.len() < 2 {
                        return Err("iTXt 元数据不完整。".into());
                    }
                    let (_, rest) = split_zero(&v[2..]).ok_or("iTXt 语言字段不完整。")?;
                    let (_, payload) = split_zero(rest).ok_or("iTXt 翻译字段不完整。")?;
                    let value = match (v[0], v[1]) {
                        (0, 0) => text(payload),
                        (1, 0) => text(&inflate(payload, false)?),
                        _ => return Err("不支持的 iTXt 压缩格式。".into()),
                    };
                    chunks.push((text(k), value));
                }
            }
            b"IEND" => break,
            _ => (),
        }
        offset = end + 4;
    }
    Ok(chunks)
}

fn stealth(image: &image::DynamicImage, chunks: &mut Chunks) -> Result<(), String> {
    let rgba = image.to_rgba8();
    let (w, h) = rgba.dimensions();
    for column_first in [true, false] {
        for channels in [&[3usize][..], &[0, 1, 2][..]] {
            let total = w as usize * h as usize * channels.len();
            let byte_at = |index: usize| -> u8 {
                let mut byte = 0;
                for bit in index * 8..index * 8 + 8 {
                    let pixel = bit / channels.len();
                    let (x, y) = if column_first {
                        (pixel / h as usize, pixel % h as usize)
                    } else {
                        (pixel % w as usize, pixel / w as usize)
                    };
                    byte = (byte << 1)
                        | (rgba.get_pixel(x as u32, y as u32)[channels[bit % channels.len()]] & 1);
                }
                byte
            };
            if total < 19 * 8 {
                continue;
            }
            let header: Vec<u8> = (0..19).map(byte_at).collect();
            let signature = &header[..15];
            if signature != b"stealth_pnginfo" && signature != b"stealth_pngcomp" {
                continue;
            }
            let bits = u32::from_be_bytes(header[15..19].try_into().unwrap()) as usize;
            if bits == 0 || bits % 8 != 0 || bits > total - 19 * 8 || bits / 8 > LIMIT {
                return Err("PNG 隐写元数据长度无效。".into());
            }
            let payload: Vec<u8> = (19..19 + bits / 8).map(byte_at).collect();
            let payload = if signature == b"stealth_pngcomp" {
                inflate(&payload, true)?
            } else {
                payload
            };
            expand(chunks, "stealth", text(&payload));
            return Ok(());
        }
    }
    Ok(())
}

// Read standard TIFF ImageDescription/UserComment fields in WebP EXIF.
fn exif(bytes: &[u8], chunks: &mut Chunks) {
    let bytes = bytes.strip_prefix(b"Exif\0\0").unwrap_or(bytes);
    let little = bytes.starts_with(b"II");
    if !little && !bytes.starts_with(b"MM") {
        return;
    }
    let number = |offset: usize, size: usize| -> Option<usize> {
        let value = bytes.get(offset..offset.checked_add(size)?)?;
        Some(if little {
            value
                .iter()
                .rev()
                .fold(0usize, |a, &b| (a << 8) | b as usize)
        } else {
            value.iter().fold(0usize, |a, &b| (a << 8) | b as usize)
        })
    };
    if number(2, 2) != Some(42) {
        return;
    }
    let mut queue = vec![number(4, 4).unwrap_or(0)];
    let mut seen = std::collections::HashSet::new();
    while let Some(offset) = queue.pop() {
        if offset == 0 || !seen.insert(offset) || seen.len() > 32 {
            continue;
        }
        let Some(count) = number(offset, 2) else {
            continue;
        };
        for i in 0..count.min(4096) {
            let entry = offset + 2 + i * 12;
            let (Some(tag), Some(kind), Some(count), Some(pointer)) = (
                number(entry, 2),
                number(entry + 2, 2),
                number(entry + 4, 4),
                number(entry + 8, 4),
            ) else {
                break;
            };
            if matches!(tag, 0x8769 | 0x8825) {
                queue.push(pointer);
                continue;
            }
            if !matches!(tag, 0x010e | 0x9286 | 0x9c9c) {
                continue;
            }
            let size = match kind {
                1 | 2 | 7 => 1,
                3 => 2,
                _ => continue,
            };
            let Some(len) = count.checked_mul(size).filter(|&n| n <= LIMIT) else {
                continue;
            };
            let start = if len <= 4 { entry + 8 } else { pointer };
            let Some(data) = start.checked_add(len).and_then(|end| bytes.get(start..end)) else {
                continue;
            };
            let value = if data.starts_with(b"UNICODE\0") || tag == 0x9c9c {
                let data = if tag == 0x9c9c { data } else { &data[8..] };
                let units: Vec<u16> = data
                    .chunks_exact(2)
                    .map(|v| {
                        if little {
                            u16::from_le_bytes([v[0], v[1]])
                        } else {
                            u16::from_be_bytes([v[0], v[1]])
                        }
                    })
                    .collect();
                String::from_utf16_lossy(&units)
                    .trim_matches('\0')
                    .to_string()
            } else {
                text(data.strip_prefix(b"ASCII\0\0\0").unwrap_or(data))
            };
            expand(
                chunks,
                if tag == 0x010e {
                    "Description"
                } else {
                    "Comment"
                },
                value,
            );
        }
    }
}
fn webp_chunks(bytes: &[u8]) -> Result<Chunks, String> {
    let mut chunks = Vec::new();
    let mut offset = 12usize;
    while offset + 8 <= bytes.len() {
        let len = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
        let end = offset
            .checked_add(8)
            .and_then(|v| v.checked_add(len))
            .filter(|&v| v <= bytes.len())
            .ok_or("WebP 数据块不完整。")?;
        let data = &bytes[offset + 8..end];
        match &bytes[offset..offset + 4] {
            b"EXIF" => exif(data, &mut chunks),
            b"XMP " => expand(&mut chunks, "xmp", text(data)),
            _ => (),
        }
        offset = end + len % 2;
    }
    Ok(chunks)
}

fn find<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    if let Some(map) = value.as_object() {
        for key in keys {
            if let Some(v) = map.get(*key).filter(|v| !v.is_null()) {
                return Some(v);
            }
        }
        for v in map.values() {
            if let Some(found) = find(v, keys) {
                return Some(found);
            }
        }
    } else if let Some(list) = value.as_array() {
        for v in list {
            if let Some(found) = find(v, keys) {
                return Some(found);
            }
        }
    }
    None
}
fn summarize(chunks: Chunks, width: u32, height: u32) -> Value {
    let objects: Vec<Value> = chunks
        .iter()
        .filter_map(|(_, s)| serde_json::from_str(s).ok())
        .collect();
    let mut out = json!({"found":false,"width":width,"height":height,"textChunkCount":chunks.len(),"textChunkKeywords":chunks.iter().map(|(k,_)| k).collect::<Vec<_>>(),"rawMetadata":chunks.iter().map(|(keyword,text)| json!({"keyword":keyword,"text":text})).collect::<Vec<_>>()});
    for (target, keys) in [
        ("prompt", vec!["prompt", "input"]),
        (
            "negativePrompt",
            vec!["negative_prompt", "negativePrompt", "uc", "negative"],
        ),
        ("seed", vec!["seed"]),
        ("steps", vec!["steps"]),
        ("scale", vec!["scale"]),
        ("cfgRescale", vec!["cfg_rescale", "cfgRescale"]),
        ("sampler", vec!["sampler"]),
        ("noiseSchedule", vec!["noise_schedule", "noiseSchedule"]),
        ("model", vec!["model"]),
        ("width", vec!["width"]),
        ("height", vec!["height"]),
        ("nSamples", vec!["n_samples", "nSamples"]),
        (
            "characterPrompts",
            vec!["characterPrompts", "character_prompts"],
        ),
    ] {
        if let Some(v) = objects.iter().find_map(|v| find(v, &keys)) {
            if target != "prompt" && target != "negativePrompt" || v.is_string() {
                out[target] = v.clone();
            }
        }
    }
    for (target, key) in [
        ("prompt", "v4_prompt"),
        ("negativePrompt", "v4_negative_prompt"),
    ] {
        if out.get(target).is_none() {
            if let Some(v) = objects.iter().find_map(|v| find(v, &[key])) {
                if let Some(caption) = v.pointer("/caption/base_caption").and_then(Value::as_str) {
                    out[target] = json!(caption);
                }
            }
        }
    }
    if out.get("prompt").is_none() {
        for key in ["prompt", "description", "comment"] {
            if let Some((_, s)) = chunks.iter().find(|(k, s)| {
                k.eq_ignore_ascii_case(key)
                    && !s.trim().starts_with(['{', '['])
                    && !s.trim().is_empty()
            }) {
                out["prompt"] = json!(s);
                break;
            }
        }
    }
    out["found"] = json!(out["prompt"].as_str().is_some_and(|s| !s.is_empty()));
    out
}
pub fn read(path: &Path) -> Result<Value, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let png = bytes.starts_with(b"\x89PNG\r\n\x1a\n");
    let webp = bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP");
    if !png && !webp {
        return Err("仅支持 PNG 和 WebP 图片元数据。".into());
    }
    let reader = image::ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut reader = reader;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|e| format!("图片解码失败：{e}"))?;
    let mut chunks = if png {
        png_chunks(&bytes)?
    } else {
        webp_chunks(&bytes)?
    };
    if png {
        stealth(&image, &mut chunks)?;
    }
    Ok(summarize(chunks, image.width(), image.height()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    fn png_chunk(kind: &[u8], data: &[u8]) -> Vec<u8> {
        let mut out = (data.len() as u32).to_be_bytes().to_vec();
        out.extend(kind);
        out.extend(data);
        let mut crc = !0u32;
        for &b in &out[4..] {
            crc ^= b as u32;
            for _ in 0..8 {
                crc = (crc >> 1) ^ (0xedb88320u32 & (0u32.wrapping_sub(crc & 1)));
            }
        }
        out.extend((!crc).to_be_bytes());
        out
    }
    fn inspect(bytes: &[u8]) -> Value {
        let path = std::env::temp_dir().join(format!("nai-metadata-{}.png", uuid::Uuid::new_v4()));
        std::fs::write(&path, bytes).unwrap();
        let result = read(&path);
        std::fs::remove_file(path).unwrap();
        result.unwrap()
    }
    fn png() -> Vec<u8> {
        let image = image::DynamicImage::new_rgba8(64, 64);
        let mut bytes = std::io::Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        bytes.into_inner()
    }
    #[test]
    fn reads_png_text_and_compressed_variants() {
        let comment = r#"{"prompt":"夜空, stars","uc":"blurry","seed":123,"steps":28,"v4_prompt":{"caption":{"base_caption":"fallback"}}}"#;
        let mut encoder =
            flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(comment.as_bytes()).unwrap();
        let compressed = encoder.finish().unwrap();
        for (kind, data) in [
            (
                b"tEXt",
                [b"Comment\0".as_slice(), comment.as_bytes()].concat(),
            ),
            (b"zTXt", [b"Comment\0\0".as_slice(), &compressed].concat()),
            (
                b"iTXt",
                [b"Comment\0\x01\0\0\0".as_slice(), &compressed].concat(),
            ),
            (
                b"iTXt",
                [b"Comment\0\0\0\0\0".as_slice(), comment.as_bytes()].concat(),
            ),
        ] {
            let mut bytes = png();
            let pos = bytes.len() - 12;
            bytes.splice(pos..pos, png_chunk(kind, &data));
            let result = inspect(&bytes);
            assert_eq!(result["prompt"], "夜空, stars");
            assert_eq!(result["negativePrompt"], "blurry");
            assert_eq!(result["seed"], 123);
            assert_eq!(result["found"], true);
        }
    }
    #[test]
    fn reads_stealth_alpha_and_rgb_compressed_and_plain() {
        for gzip in [false, true] {
            for rgb in [false, true] {
                let metadata=json!({"Comment":json!({"prompt":"hidden prompt","uc":"hidden negative"}).to_string()}).to_string();
                let payload = if gzip {
                    let mut encoder =
                        flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
                    encoder.write_all(metadata.as_bytes()).unwrap();
                    encoder.finish().unwrap()
                } else {
                    metadata.into_bytes()
                };
                let mut stream = if gzip {
                    b"stealth_pngcomp".to_vec()
                } else {
                    b"stealth_pnginfo".to_vec()
                };
                stream.extend(((payload.len() * 8) as u32).to_be_bytes());
                stream.extend(payload);
                let channels = if rgb { vec![0, 1, 2] } else { vec![3] };
                let mut image =
                    image::RgbaImage::from_pixel(64, 64, image::Rgba([128, 128, 128, 254]));
                for (i, b) in stream.iter().enumerate() {
                    for bit in 0..8 {
                        let index = i * 8 + bit;
                        let pixel = index / channels.len();
                        let value = &mut image
                            .get_pixel_mut((pixel / 64) as u32, (pixel % 64) as u32)
                            [channels[index % channels.len()]];
                        *value = (*value & !1) | ((b >> (7 - bit)) & 1);
                    }
                }
                let mut bytes = std::io::Cursor::new(Vec::new());
                image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
                assert_eq!(inspect(bytes.get_ref())["prompt"], "hidden prompt");
            }
        }
    }
    #[test]
    fn reads_webp_exif_and_handles_missing_metadata() {
        let metadata = b"{\"prompt\":\"webp prompt\",\"uc\":\"negative\"}\0";
        let mut tiff = b"II\x2a\0\x08\0\0\0\x01\0".to_vec();
        tiff.extend(0x010eu16.to_le_bytes());
        tiff.extend(2u16.to_le_bytes());
        tiff.extend((metadata.len() as u32).to_le_bytes());
        tiff.extend(26u32.to_le_bytes());
        tiff.extend(0u32.to_le_bytes());
        tiff.extend(metadata);
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(16, 16)
            .write_to(&mut bytes, image::ImageFormat::WebP)
            .unwrap();
        let mut bytes = bytes.into_inner();
        bytes.extend(b"EXIF");
        bytes.extend((tiff.len() as u32).to_le_bytes());
        bytes.extend(&tiff);
        if tiff.len() % 2 != 0 {
            bytes.push(0);
        }
        let len = bytes.len() as u32 - 8;
        bytes[4..8].copy_from_slice(&len.to_le_bytes());
        assert_eq!(inspect(&bytes)["prompt"], "webp prompt");
        assert_eq!(inspect(&png())["found"], false);
        assert!(png_chunks(b"\x89PNG\r\n\x1a\n\xff\xff\xff\xfftEXt1234").is_err());
    }
    #[test]
    fn reads_v4_caption_without_inventing_prompt() {
        let result=summarize(vec![("Comment".into(),json!({"v4_prompt":{"caption":{"base_caption":"v4 caption"}},"v4_negative_prompt":{"caption":{"base_caption":"v4 negative"}}}).to_string())],1,1);
        assert_eq!(result["prompt"], "v4 caption");
        assert_eq!(result["negativePrompt"], "v4 negative");
        assert_eq!(
            summarize(vec![("Comment".into(), "{\"seed\":123}".into())], 1, 1)["found"],
            false
        );
    }
}
