// PNG / WebP metadata readers (NovelAI stealth payloads, EXIF, iTXt).
import type { CharacterPrompt, ImportedImageMetadata, PngTextChunk } from "./types";
import { clampCoordinate, findBooleanByKeys, findByKeys, findNumberByKeys, findStringByKeys, isImageFile } from "./valueUtils";

export async function parseNovelAiImageMetadata(buffer: ArrayBuffer): Promise<ImportedImageMetadata> {
  const chunks = await readImageMetadataChunks(buffer);
  const texts = new Map<string, string>();

  for (const chunk of chunks) {
    texts.set(chunk.keyword.toLowerCase(), chunk.text);
  }

  const rawCandidates = [
    texts.get("comment"),
    texts.get("description"),
    texts.get("parameters"),
    texts.get("prompt"),
    ...texts.values(),
  ].filter(Boolean) as string[];

  const parsedObjects: unknown[] = [];
  const parsedJsonTexts = new Set<string>();
  for (const value of rawCandidates) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        parsedObjects.push(JSON.parse(trimmed));
        parsedJsonTexts.add(trimmed);
      } catch {
        // keep going with raw text candidates
      }
    }

    for (const jsonText of extractJsonCandidatesFromText(trimmed)) {
      if (parsedJsonTexts.has(jsonText)) {
        continue;
      }
      try {
        parsedObjects.push(JSON.parse(jsonText));
        parsedJsonTexts.add(jsonText);
      } catch {
        // keep going with other embedded candidates
      }
    }
  }

  const prompt =
    findStringInSources(parsedObjects, ["prompt", "input"]) ??
    findNestedCaptionText(parsedObjects, "v4_prompt") ??
    parsePromptTextFromMetadataStrings(rawCandidates) ??
    texts.get("comment") ??
    texts.get("description");
  const negativePrompt =
    findStringInSources(parsedObjects, ["negative_prompt", "negativeprompt", "uc", "negative"]) ??
    findNestedCaptionText(parsedObjects, "v4_negative_prompt") ??
    parseNegativePromptFromMetadataStrings(rawCandidates) ??
    undefined;
  const characters = findCharacterPromptsFromSources(parsedObjects);
  const useCharacterCoords = findBooleanInSources(parsedObjects, ["use_coords", "usecoords"]);

  const width = findNumberInSources(parsedObjects, ["width"]);
  const height = findNumberInSources(parsedObjects, ["height"]);
  const steps = findNumberInSources(parsedObjects, ["steps"]);
  const scale = findNumberInSources(parsedObjects, ["scale"]);
  const cfgRescale = findNumberInSources(parsedObjects, ["cfg_rescale", "cfgrescale"]);
  const seed = findNumberInSources(parsedObjects, ["seed"]);
  const sampler = findStringInSources(parsedObjects, ["sampler"]);
  const noiseSchedule = findStringInSources(parsedObjects, ["noise_schedule", "noiseschedule"]);
  const model = findStringInSources(parsedObjects, ["model"]) ?? parseNovelAiModelFromSource(texts.get("source"));
  const nSamples = findNumberInSources(parsedObjects, ["n_samples", "nsamples"]);

  return {
    prompt: extractPromptText(prompt),
    negativePrompt: extractPromptText(negativePrompt),
    characters,
    useCharacterCoords: characters.length > 0 ? (useCharacterCoords ?? hasCharacterCenters(characters)) : undefined,
    textChunkCount: chunks.length,
    textChunkKeywords: chunks.map((chunk) => chunk.keyword),
    width,
    height,
    steps,
    scale,
    cfgRescale,
    seed,
    sampler,
    noiseSchedule,
    model,
    nSamples,
  };
}

function extractPromptText(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function findStringInSources(sources: unknown[], keys: string[]) {
  for (const source of sources) {
    const found = findStringByKeys(source, keys);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function findNumberInSources(sources: unknown[], keys: string[]) {
  for (const source of sources) {
    const found = findNumberByKeys(source, keys);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findBooleanInSources(sources: unknown[], keys: string[]) {
  for (const source of sources) {
    const found = findBooleanByKeys(source, keys);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findCharacterPromptsFromSources(sources: unknown[]): CharacterPrompt[] {
  const positive = findV4CharacterCaptions(sources, "v4_prompt");
  const negative = findV4CharacterCaptions(sources, "v4_negative_prompt");
  const count = Math.max(positive.length, negative.length);
  const characters: CharacterPrompt[] = [];

  for (let index = 0; index < count; index += 1) {
    const positiveCharacter = positive[index];
    const negativeCharacter = negative[index];
    const prompt = positiveCharacter?.prompt ?? "";
    const negativePrompt = negativeCharacter?.prompt ?? "";
    const center = positiveCharacter?.center ?? negativeCharacter?.center ?? defaultCharacterCenter(index);

    if (!prompt.trim() && !negativePrompt.trim()) {
      continue;
    }

    characters.push({
      id: crypto.randomUUID(),
      prompt,
      negativePrompt,
      x: clampCoordinate(center.x),
      y: clampCoordinate(center.y),
    });
  }

  return characters;
}

function findV4CharacterCaptions(sources: unknown[], key: string) {
  for (const source of sources) {
    const candidate = findByKeys(source, [key]);
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const caption = findByKeys(candidate, ["caption"]);
    if (!caption || typeof caption !== "object") {
      continue;
    }

    const rawCharacters = findByKeys(caption, ["char_captions", "charCaptions"]);
    if (!Array.isArray(rawCharacters)) {
      continue;
    }

    return rawCharacters
      .map((value, index) => parseV4CharacterCaption(value, index))
      .filter((value): value is { prompt: string; center: { x: number; y: number } } => value !== null);
  }

  return [];
}

function parseV4CharacterCaption(value: unknown, index: number) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const prompt = findStringByKeys(value, ["char_caption", "charCaption", "caption", "prompt"]) ?? "";
  const center = findCharacterCenter(value) ?? defaultCharacterCenter(index);
  return {
    prompt,
    center,
  };
}

function findCharacterCenter(value: unknown) {
  const centers = findByKeys(value, ["centers", "center"]);
  const firstCenter = Array.isArray(centers) ? centers[0] : centers;
  if (!firstCenter || typeof firstCenter !== "object") {
    return undefined;
  }

  const x = findNumberByKeys(firstCenter, ["x"]);
  const y = findNumberByKeys(firstCenter, ["y"]);
  if (x === undefined || y === undefined) {
    return undefined;
  }

  return { x, y };
}

function defaultCharacterCenter(index: number) {
  return {
    x: clampCoordinate(0.35 + index * 0.2),
    y: 0.5,
  };
}

function hasCharacterCenters(characters: CharacterPrompt[]) {
  return characters.some((character) => Number.isFinite(character.x) && Number.isFinite(character.y));
}

function parsePromptTextFromMetadataStrings(values: string[]) {
  for (const value of values) {
    const prompt = extractFieldFromText(value, ["prompt", "positive prompt"]);
    if (prompt) {
      return prompt;
    }
  }
  return undefined;
}

function parseNegativePromptFromMetadataStrings(values: string[]) {
  for (const value of values) {
    const negative = extractFieldFromText(value, ["negative prompt", "uc"]);
    if (negative) {
      return negative;
    }
  }
  return undefined;
}

function extractJsonCandidatesFromText(text: string) {
  const candidates: string[] = [];
  const stack: string[] = [];
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      if (stack.length === 0) {
        start = index;
      }
      stack.push(char);
      continue;
    }

    if (char !== "}" && char !== "]") {
      continue;
    }

    const open = stack.pop();
    if ((char === "}" && open !== "{") || (char === "]" && open !== "[")) {
      stack.length = 0;
      start = -1;
      continue;
    }

    if (stack.length === 0 && start >= 0) {
      candidates.push(text.slice(start, index + 1));
      start = -1;
    }
  }

  return candidates;
}

function parseNovelAiModelFromSource(source?: string) {
  if (!source) {
    return undefined;
  }

  const normalized = source.toLowerCase();
  if (normalized.includes("v5")) {
    return "nai-diffusion-5-full";
  }
  if (normalized.includes("v4.5")) {
    return "nai-diffusion-4-5-full";
  }
  if (normalized.includes("v4")) {
    return "nai-diffusion-4-full";
  }
  if (normalized.includes("v3")) {
    return "nai-diffusion-3";
  }
  if (normalized.includes("v2")) {
    return "nai-diffusion-2";
  }
  return undefined;
}

export function findImageFileFromClipboard(data: DataTransfer | null) {
  if (!data) {
    return null;
  }

  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") {
      continue;
    }

    const file = item.getAsFile();
    if (file && isImageFile(file)) {
      return ensureNamedClipboardImageFile(file);
    }
  }

  for (const file of Array.from(data.files)) {
    if (isImageFile(file)) {
      return ensureNamedClipboardImageFile(file);
    }
  }

  return null;
}

function ensureNamedClipboardImageFile(file: File) {
  if (file.name) {
    return file;
  }

  const mimeType = file.type || "image/png";
  const extension = mimeType === "image/webp" ? "webp" : "png";
  return new File([file], `clipboard.${extension}`, {
    type: mimeType,
    lastModified: file.lastModified || Date.now(),
  });
}

function extractFieldFromText(text: string, labels: string[]) {
  const normalized = text.replace(/\r\n/g, "\n");
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*[A-Za-z][A-Za-z _-]*\\s*:\\s*|$)`, "i");
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const value = match[1].trim();
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findNestedCaptionText(sources: unknown[], key: string) {
  for (const source of sources) {
    const candidate = findByKeys(source, [key]);
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const caption = findByKeys(candidate, ["caption"]);
    if (!caption || typeof caption !== "object") {
      continue;
    }

    const baseCaption = findStringByKeys(caption, ["base_caption"]);
    if (baseCaption) {
      return baseCaption;
    }
  }

  return undefined;
}

async function readImageMetadataChunks(buffer: ArrayBuffer): Promise<PngTextChunk[]> {
  if (isPngBuffer(buffer)) {
    return [
      ...readPngTextChunks(buffer),
      ...(await readStealthPngTextChunks(buffer)),
    ];
  }

  if (isWebpBuffer(buffer)) {
    return readWebpMetadataChunks(buffer);
  }

  throw new Error("仅支持 PNG 和 WebP 图片元数据导入");
}

function isPngBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((value, index) => bytes[index] === value);
}

function isWebpBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 12 && readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP";
}

function readPngTextChunks(buffer: ArrayBuffer): PngTextChunk[] {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) {
    throw new Error("不是有效的 PNG 文件");
  }

  const chunks: PngTextChunk[] = [];
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      break;
    }

    if (type === "tEXt") {
      const data = readBytes(bytes, dataStart, length);
      const separator = data.indexOf(0);
      if (separator > 0) {
        const keyword = decodeText(data.slice(0, separator));
        const text = decodeText(data.slice(separator + 1));
        chunks.push({ keyword, text });
      }
    } else if (type === "iTXt") {
      const data = readBytes(bytes, dataStart, length);
      const chunk = decodeItxtChunk(data);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    offset = dataEnd + 4;
  }

  return chunks;
}

async function readStealthPngTextChunks(buffer: ArrayBuffer): Promise<PngTextChunk[]> {
  const image = readPngRasterInfo(buffer);
  if (!image || image.bitDepth !== 8 || (image.colorType !== 2 && image.colorType !== 6)) {
    return [];
  }

  const bytesPerPixel = image.colorType === 6 ? 4 : 3;
  const inflated = await decompressBytes(concatBytes(image.idatChunks), "deflate");
  if (!inflated) {
    return [];
  }

  const pixels = unfilterPngPixels(inflated, image.width, image.height, bytesPerPixel);
  if (!pixels) {
    return [];
  }

  const attempts = image.colorType === 6
    ? [
        { channels: [3], columnFirst: true },
        { channels: [0, 1, 2], columnFirst: true },
        { channels: [3], columnFirst: false },
        { channels: [0, 1, 2], columnFirst: false },
      ]
    : [
        { channels: [0, 1, 2], columnFirst: true },
        { channels: [0, 1, 2], columnFirst: false },
      ];

  for (const attempt of attempts) {
    const stealth = await extractStealthPngPayload(
      pixels,
      image.width,
      image.height,
      bytesPerPixel,
      attempt.channels,
      attempt.columnFirst,
    );
    if (stealth.length > 0) {
      return stealth;
    }
  }

  return [];
}

function readPngRasterInfo(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) {
    return null;
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Uint8Array[] = [];
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      break;
    }

    if (type === "IHDR") {
      width = readUint32(bytes, dataStart);
      height = readUint32(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
    } else if (type === "IDAT") {
      idatChunks.push(readBytes(bytes, dataStart, length));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height || idatChunks.length === 0) {
    return null;
  }

  return { width, height, bitDepth, colorType, idatChunks };
}

function readWebpMetadataChunks(buffer: ArrayBuffer): PngTextChunk[] {
  const bytes = new Uint8Array(buffer);
  if (!isWebpBuffer(buffer)) {
    return [];
  }

  const chunks: PngTextChunk[] = [];
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const type = readAscii(bytes, offset, 4);
    const length = readUint32Le(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) {
      break;
    }

    const data = readBytes(bytes, dataStart, length);
    if (type === "EXIF") {
      chunks.push(...readExifMetadataChunks(data));
    } else if (type === "XMP ") {
      const text = decodeText(data);
      chunks.push({ keyword: "xmp", text });
      chunks.push(...parseTextMetadataObjectChunks(text));
    }

    offset = dataEnd + (length % 2);
  }

  return dedupeMetadataChunks(chunks);
}

function readExifMetadataChunks(data: Uint8Array): PngTextChunk[] {
  const tiffStart = startsWithAscii(data, 0, "Exif\0\0") ? 6 : 0;
  const chunks = parseTiffExifChunks(data, tiffStart);
  chunks.push(...extractPrintableMetadataChunks(data, "exif"));
  return dedupeMetadataChunks(chunks);
}

function parseTiffExifChunks(data: Uint8Array, tiffStart: number): PngTextChunk[] {
  if (tiffStart + 8 > data.length) {
    return [];
  }

  const littleEndian = readAscii(data, tiffStart, 2) === "II";
  const bigEndian = readAscii(data, tiffStart, 2) === "MM";
  if (!littleEndian && !bigEndian) {
    return [];
  }

  const magic = readUint16Endian(data, tiffStart + 2, littleEndian);
  if (magic !== 42) {
    return [];
  }

  const firstIfdOffset = readUint32Endian(data, tiffStart + 4, littleEndian);
  const visited = new Set<number>();
  const chunks: PngTextChunk[] = [];

  function parseIfd(relativeOffset: number) {
    if (!relativeOffset || visited.has(relativeOffset)) {
      return;
    }

    visited.add(relativeOffset);
    const ifdOffset = tiffStart + relativeOffset;
    if (ifdOffset + 2 > data.length) {
      return;
    }

    const count = readUint16Endian(data, ifdOffset, littleEndian);
    const entriesStart = ifdOffset + 2;
    for (let index = 0; index < count; index += 1) {
      const entryOffset = entriesStart + index * 12;
      if (entryOffset + 12 > data.length) {
        return;
      }

      const tag = readUint16Endian(data, entryOffset, littleEndian);
      const type = readUint16Endian(data, entryOffset + 2, littleEndian);
      const itemCount = readUint32Endian(data, entryOffset + 4, littleEndian);
      const valueOffset = entryValueOffset(data, tiffStart, entryOffset, type, itemCount, littleEndian);
      const byteLength = exifTypeByteLength(type) * itemCount;
      if (valueOffset < 0 || byteLength <= 0 || valueOffset + byteLength > data.length) {
        continue;
      }

      if (tag === 0x8769) {
        parseIfd(readUint32Endian(data, valueOffset, littleEndian));
        continue;
      }

      const keyword = exifTagKeyword(tag);
      if (!keyword) {
        continue;
      }

      const value = decodeExifValue(data.slice(valueOffset, valueOffset + byteLength), type, tag);
      if (value) {
        chunks.push({ keyword, text: value });
      }
    }

    const nextOffsetPosition = entriesStart + count * 12;
    if (nextOffsetPosition + 4 <= data.length) {
      parseIfd(readUint32Endian(data, nextOffsetPosition, littleEndian));
    }
  }

  parseIfd(firstIfdOffset);
  return chunks;
}

function entryValueOffset(
  data: Uint8Array,
  tiffStart: number,
  entryOffset: number,
  type: number,
  itemCount: number,
  littleEndian: boolean,
) {
  const byteLength = exifTypeByteLength(type) * itemCount;
  if (byteLength <= 4) {
    return entryOffset + 8;
  }

  return tiffStart + readUint32Endian(data, entryOffset + 8, littleEndian);
}

function exifTypeByteLength(type: number) {
  if (type === 1 || type === 2 || type === 7) {
    return 1;
  }
  if (type === 3) {
    return 2;
  }
  if (type === 4 || type === 9) {
    return 4;
  }
  if (type === 5 || type === 10) {
    return 8;
  }
  return 0;
}

function exifTagKeyword(tag: number) {
  if (tag === 0x010e) {
    return "Description";
  }
  if (tag === 0x0131) {
    return "Software";
  }
  if (tag === 0x9286) {
    return "Comment";
  }
  return undefined;
}

function decodeExifValue(value: Uint8Array, type: number, tag: number) {
  if (tag === 0x9286) {
    return decodeExifUserComment(value);
  }
  if (type === 2 || type === 7 || type === 1) {
    return trimMetadataText(decodeText(value));
  }
  return undefined;
}

function decodeExifUserComment(value: Uint8Array) {
  const prefix = decodeLatin1(value.slice(0, Math.min(8, value.length)));
  if (prefix.startsWith("UNICODE")) {
    return trimMetadataText(decodeUtf16Be(value.slice(8)));
  }
  if (prefix.startsWith("ASCII")) {
    return trimMetadataText(decodeText(value.slice(8)));
  }
  return trimMetadataText(decodeText(value));
}

function extractPrintableMetadataChunks(data: Uint8Array, prefix: string): PngTextChunk[] {
  const text = decodeText(data);
  const candidates = text.match(/[\x20-\x7e\t\r\n]{24,}/g) ?? [];
  const chunks: PngTextChunk[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const trimmed = trimMetadataText(candidate);
    if (!trimmed || !looksLikeUsefulMetadata(trimmed)) {
      continue;
    }
    chunks.push({ keyword: `${prefix}-${index + 1}`, text: trimmed });
    chunks.push(...parseTextMetadataObjectChunks(trimmed));
  }

  return chunks;
}

function parseTextMetadataObjectChunks(text: string): PngTextChunk[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }

    return Object.entries(parsed as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string")
      .map(([keyword, value]) => ({ keyword, text: value as string }));
  } catch {
    return [];
  }
}

function looksLikeUsefulMetadata(text: string) {
  const lower = text.toLowerCase();
  return lower.includes("novelai") ||
    lower.includes("prompt") ||
    lower.includes("description") ||
    lower.includes("uc") ||
    lower.includes("v4_prompt") ||
    lower.includes("nai-diffusion");
}

function trimMetadataText(value: string) {
  return value.replace(/\0/g, "").trim();
}

function dedupeMetadataChunks(chunks: PngTextChunk[]) {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const key = `${chunk.keyword}\0${chunk.text}`;
    if (!chunk.text.trim() || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function extractStealthPngPayload(
  pixels: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number,
  channels: number[],
  columnFirst: boolean,
): Promise<PngTextChunk[]> {
  const signatures = ["stealth_pnginfo", "stealth_pngcomp"];
  const headerLength = Math.max(...signatures.map((signature) => signature.length)) + 4;
  const header = readStealthBytes(pixels, width, height, bytesPerPixel, channels, columnFirst, headerLength);
  const headerText = decodeLatin1(header);
  const signature = signatures.find((value) => headerText.startsWith(value));
  if (!signature) {
    return [];
  }

  const bitLength = readBigEndianUint32(header, signature.length);
  const availableBits = width * height * channels.length - (signature.length + 4) * 8;
  if (bitLength <= 0 || bitLength > availableBits) {
    return [];
  }

  const payloadByteLength = Math.ceil(bitLength / 8);
  const allBytes = readStealthBytes(
    pixels,
    width,
    height,
    bytesPerPixel,
    channels,
    columnFirst,
    signature.length + 4 + payloadByteLength,
  );
  const payload = allBytes.slice(signature.length + 4, signature.length + 4 + payloadByteLength);
  const text = signature === "stealth_pngcomp"
    ? await decompressBytes(payload, "gzip").then((value) => value ? decodeText(value) : "")
    : decodeText(payload);

  return parseStealthMetadataText(text);
}

function readStealthBytes(
  pixels: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number,
  channels: number[],
  columnFirst: boolean,
  byteCount: number,
) {
  const output = new Uint8Array(byteCount);
  let bitIndex = 0;
  const targetBits = byteCount * 8;
  const pushPixel = (x: number, y: number) => {
    const offset = (y * width + x) * bytesPerPixel;
    for (const channel of channels) {
      if (bitIndex >= targetBits) {
        return;
      }
      const bit = pixels[offset + channel] & 1;
      output[Math.floor(bitIndex / 8)] |= bit << (7 - (bitIndex % 8));
      bitIndex += 1;
    }
  };

  if (columnFirst) {
    for (let x = 0; x < width && bitIndex < targetBits; x += 1) {
      for (let y = 0; y < height && bitIndex < targetBits; y += 1) {
        pushPixel(x, y);
      }
    }
  } else {
    for (let y = 0; y < height && bitIndex < targetBits; y += 1) {
      for (let x = 0; x < width && bitIndex < targetBits; x += 1) {
        pushPixel(x, y);
      }
    }
  }

  return output;
}

function parseStealthMetadataText(text: string): PngTextChunk[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string")
        .map(([keyword, value]) => ({ keyword, text: value as string }));
    }
  } catch {
    // Fall back to treating the payload as a raw metadata string.
  }

  return [{ keyword: "parameters", text: trimmed }];
}

function unfilterPngPixels(inflated: Uint8Array, width: number, height: number, bytesPerPixel: number) {
  const stride = width * bytesPerPixel;
  const expectedLength = height * (stride + 1);
  if (inflated.length < expectedLength) {
    return null;
  }

  const pixels = new Uint8Array(height * stride);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowStart = y * stride;
    const previousRowStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[previousRowStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[previousRowStart + x - bytesPerPixel] : 0;
      let value = raw;

      if (filter === 1) {
        value = raw + left;
      } else if (filter === 2) {
        value = raw + up;
      } else if (filter === 3) {
        value = raw + Math.floor((left + up) / 2);
      } else if (filter === 4) {
        value = raw + paethPredictor(left, up, upLeft);
      } else if (filter !== 0) {
        return null;
      }

      pixels[rowStart + x] = value & 255;
    }

    inputOffset += stride;
  }

  return pixels;
}

function paethPredictor(left: number, up: number, upLeft: number) {
  const predictor = left + up - upLeft;
  const leftDistance = Math.abs(predictor - left);
  const upDistance = Math.abs(predictor - up);
  const upLeftDistance = Math.abs(predictor - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

async function decompressBytes(bytes: Uint8Array, format: "deflate" | "gzip") {
  const ctor = (globalThis as typeof globalThis & {
    DecompressionStream?: new(format: "deflate" | "gzip") => TransformStream<Uint8Array, Uint8Array>;
  }).DecompressionStream;
  if (!ctor) {
    return null;
  }

  try {
    const payload = new Uint8Array(bytes);
    const stream = new Blob([payload.buffer as ArrayBuffer]).stream().pipeThrough(new ctor(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function concatBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function readBigEndianUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function decodeLatin1(bytes: Uint8Array) {
  return String.fromCharCode(...bytes);
}

function decodeItxtChunk(data: Uint8Array): PngTextChunk | null {
  let cursor = 0;
  const keywordEnd = indexOfZero(data, cursor);
  if (keywordEnd < 0) {
    return null;
  }
  const keyword = decodeText(data.slice(cursor, keywordEnd));
  cursor = keywordEnd + 1;
  if (cursor + 2 > data.length) {
    return null;
  }

  const compressionFlag = data[cursor];
  cursor += 1;
  cursor += 1; // compression method

  const languageEnd = indexOfZero(data, cursor);
  if (languageEnd < 0) {
    return null;
  }
  cursor = languageEnd + 1;

  const translatedEnd = indexOfZero(data, cursor);
  if (translatedEnd < 0) {
    return null;
  }
  cursor = translatedEnd + 1;

  const textData = data.slice(cursor);
  if (compressionFlag !== 0) {
    return null;
  }

  return {
    keyword,
    text: decodeText(textData),
  };
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function readUint32Le(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readUint16Endian(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32Endian(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  return littleEndian ? readUint32Le(bytes, offset) : readUint32(bytes, offset);
}

function readBytes(bytes: Uint8Array, offset: number, length: number) {
  return bytes.slice(offset, offset + length);
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function startsWithAscii(bytes: Uint8Array, offset: number, value: string) {
  if (offset + value.length > bytes.length) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function decodeText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return String.fromCharCode(...bytes);
  }
}

function decodeUtf16Be(bytes: Uint8Array) {
  const codeUnits: number[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    codeUnits.push((bytes[index] << 8) | bytes[index + 1]);
  }
  return String.fromCharCode(...codeUnits);
}

function indexOfZero(bytes: Uint8Array, start: number) {
  for (let i = start; i < bytes.length; i += 1) {
    if (bytes[i] === 0) {
      return i;
    }
  }
  return -1;
}
