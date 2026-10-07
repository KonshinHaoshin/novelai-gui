import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [mode, ...args] = process.argv.slice(2);
const env = { ...process.env };
// macOS on exFAT: keep Cargo's permission files and artifacts on APFS.
if (process.platform === "darwin" && !env.CARGO_TARGET_DIR) {
  env.CARGO_TARGET_DIR = join(homedir(), ".cache", "novelai-gui-target");
}
const result = spawnSync("cargo", [
  mode === "build" ? "build" : "run",
  "--manifest-path", join(root, "src-tauri", "Cargo.toml"),
  "--features", "cli", "--bin", "novelai-cli",
  ...(mode === "build" ? args : ["--", ...args]),
], { cwd: root, env, stdio: "inherit" });
if (result.error) console.error(`Could not launch Cargo: ${result.error.message}`);
process.exit(result.status ?? 1);
