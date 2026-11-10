// Generic value helpers shared by the UI and the metadata readers.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function findAllByKeys(value: unknown, keys: string[]): unknown[] {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [value];
  const matches: unknown[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (keySet.has(key.toLowerCase())) {
        matches.push(child);
      }
      if (child && typeof child === "object") {
        queue.push(child);
      }
    }
  }

  return matches;
}

export function findByKeys(value: unknown, keys: string[]): unknown {
  return findAllByKeys(value, keys)[0];
}

export function findStringByKeys(value: unknown, keys: string[]): string | undefined {
  for (const found of findAllByKeys(value, keys)) {
    if (typeof found === "string" && found.trim()) {
      return found;
    }
  }
  return undefined;
}

export function findNumberByKeys(value: unknown, keys: string[]): number | undefined {
  for (const found of findAllByKeys(value, keys)) {
    if (typeof found === "number" && Number.isFinite(found)) {
      return found;
    }
    if (typeof found === "string") {
      const parsed = Number(found);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

export function findBooleanByKeys(value: unknown, keys: string[]): boolean | undefined {
  const found = findByKeys(value, keys);
  return typeof found === "boolean" ? found : undefined;
}

export function clampCoordinate(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(Math.max(value, 0), 1);
}

export function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

export function isImageFile(file: File) {
  return file.type.startsWith("image/");
}
