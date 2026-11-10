// Keep the version in sync across every manifest that ships or references it.
//
//   node scripts/bump-version.mjs 0.2.5   # rewrite all occurrences
//   node scripts/bump-version.mjs --check # verify they already agree (CI)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TARGETS = [
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
];

const argument = process.argv[2];
if (!argument) {
  console.error("用法: node scripts/bump-version.mjs <x.y.z> | --check");
  process.exit(2);
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  writeFileSync(join(root, relativePath), content, "utf8");
}

function bumpJson(relativePath, version) {
  const document = JSON.parse(read(relativePath));
  const previous = document.version;
  document.version = version;
  if (document.packages?.[""]) {
    document.packages[""].version = version;
  }
  write(relativePath, `${JSON.stringify(document, null, 2)}\n`);
  return previous;
}

function bumpCargoToml(relativePath, version) {
  const text = read(relativePath);
  const packageIndex = text.indexOf("[package]");
  if (packageIndex < 0) {
    throw new Error(`${relativePath} 缺少 [package] 段`);
  }
  const head = text.slice(0, packageIndex);
  const tail = text.slice(packageIndex);
  const match = tail.match(/version = "([^"]+)"/);
  if (!match) {
    throw new Error(`${relativePath} 的 [package] 段缺少 version`);
  }
  write(relativePath, head + tail.replace(/version = "([^"]+)"/, `version = "${version}"`));
  return match[1];
}

function bumpCargoLock(relativePath, version) {
  const text = read(relativePath);
  const pattern = /(name = "novelai-gui"\r?\nversion = ")([^"]+)(")/;
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`${relativePath} 中找不到 novelai-gui 的版本记录`);
  }
  write(relativePath, text.replace(pattern, `$1${version}$3`));
  return match[2];
}

const current = JSON.parse(read("package.json")).version;

if (argument === "--check") {
  const versions = {
    "package.json": current,
    "package-lock.json": JSON.parse(read("package-lock.json")).version,
    "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
    "src-tauri/Cargo.toml": bumpDetect(read("src-tauri/Cargo.toml")),
    "src-tauri/Cargo.lock": bumpDetect(read("src-tauri/Cargo.lock")),
  };
  const mismatch = Object.entries(versions).filter(([, value]) => value !== current);
  if (mismatch.length > 0) {
    for (const [file, value] of mismatch) {
      console.error(`${file}: ${value} != ${current}`);
    }
    process.exit(1);
  }
  console.log(`版本一致: ${current}`);
  process.exit(0);
}

if (!/^\d+\.\d+\.\d+$/.test(argument)) {
  console.error(`版本号必须形如 0.2.5，收到: ${argument}`);
  process.exit(2);
}

function bumpDetect(text) {
  const match = text.match(/name = "novelai-gui"\r?\nversion = "([^"]+)"/);
  return match?.[1];
}

const updates = [
  ["package.json", bumpJson("package.json", argument)],
  ["package-lock.json", bumpJson("package-lock.json", argument)],
  ["src-tauri/tauri.conf.json", bumpJson("src-tauri/tauri.conf.json", argument)],
  ["src-tauri/Cargo.toml", bumpCargoToml("src-tauri/Cargo.toml", argument)],
  ["src-tauri/Cargo.lock", bumpCargoLock("src-tauri/Cargo.lock", argument)],
];

for (const [file, previous] of updates) {
  console.log(`${relative(root, join(root, file))}: ${previous} -> ${argument}`);
}
console.log(`\n版本已更新为 ${argument}，别忘了提交并打 tag v${argument}`);
