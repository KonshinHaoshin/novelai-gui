import { copyFile, mkdir, writeFile } from "node:fs/promises";
import pngToIco from "png-to-ico";

await mkdir("src-tauri/icons", { recursive: true });
await copyFile("icon.png", "src-tauri/icons/icon.png");

const ico = await pngToIco("icon.png");
await writeFile("src-tauri/icons/icon.ico", ico);
