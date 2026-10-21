# NovelAI GUI

NovelAI GUI 是一个面向 NovelAI 图像生成 API 的桌面客户端，基于 Tauri 2、React 和 TypeScript 构建。当前重点支持 NAI 4.5 图像生成工作流，提供提示词编辑、参数配置、生成预览、图片保存和历史记录管理。

## 功能

- 默认使用 `nai-diffusion-4-5-full`
- 支持正向提示词和负向提示词
- 支持常用尺寸预设、采样器、步数、Guidance、种子等参数
- 自动为 V4/V4.5 模型构造 `v4_prompt` 与 `v4_negative_prompt`
- 解析 NovelAI 图像 API 返回的 ZIP 图片包
- 下载图片时文件名会附带时间戳；极短时间内发生重名时会再追加序号，避免覆盖已有图片
- 支持生成历史恢复和历史显示上限设置
- Token 通过 Tauri 后端保存到系统凭据，不写入前端本地存储
- 请求体预览默认关闭，可在设置页开启
- CLI 支持账户查询、文生图、图生图、局部重绘、V5 透明底、应用共享预设及 JSON 请求配置

## 项目结构

```text
src/                 React 前端界面
src/App.tsx          主界面、状态和交互逻辑
src/styles.css       应用样式
src-tauri/           Tauri/Rust 后端
src-tauri/src/lib.rs NovelAI API 调用、Token 存储、图片保存
scripts/             图标生成等辅助脚本
src-tauri/src/cli.rs 命令行参数、校验和图片输出
icon.png             应用图标源文件
NovelAI-API-Docs.md  NovelAI API 参考资料
```


## API Token

在 NovelAI 官网获取 Persistent API Token 后，打开应用左侧“设置”，在 API Token 区域保存。请求会使用：

```http
Authorization: Bearer <your_token>
```

## 命令行 CLI

需要 Node.js/npm、Rust 和项目对应的 Tauri 编译依赖。CLI 为独立的
`novelai-cli` 可执行文件，运行时不启动桌面窗口。首次运行需要编译 Rust。
CLI 复用 GUI 的 API 请求、系统凭据和响应解析；编译时仍会链接项目的 Tauri 库。

```bash
npm install
npm run cli -- --help
npm run cli -- generate --help
npm run cli:build
```

GitHub Release also provides standalone CLI archives for macOS arm64 and Windows x64.
Extract the archive and run `novelai-cli --help` (Windows: `novelai-cli.exe --help`).

macOS 的 npm 脚本默认把 Cargo 产物放在 `~/.cache/novelai-gui-target`，
避免 exFAT 上的 AppleDouble 权限文件问题。可以用 `CARGO_TARGET_DIR` 覆盖。
其他系统默认使用 `src-tauri/target`。编译后可以直接执行对应目录内
`debug/novelai-cli`（Windows 为 `novelai-cli.exe`），或使用
`npm run cli:build -- --release` 构建 `release/novelai-cli`。

### Token 和账户

默认读取 GUI 已保存的系统凭据。设置 `NOVELAI_API_TOKEN` 时，该环境变量
优先于系统凭据，只影响 CLI。Token 不接受命令行明文参数，也不会写入输出目录。

```bash
# 查看 Token 是否配置，不输出 Token 内容
npm run cli -- token status

# 已设置 NOVELAI_API_TOKEN 时，保存到和 GUI 共用的系统凭据
npm run cli -- token set

# 或通过标准输入保存（适合密码管理器输出或输入重定向）
npm run cli -- token set --stdin

# 查询账户、订阅和 Anlas 信息
npm run cli -- account
```

CLI 不读取 GUI 的代理设置。需要代理时使用 `--proxy http://127.0.0.1:7890`；
`account` 和 `generate` 都支持此参数。系统凭据后端与 GUI 一致，目前启用
macOS/Windows；其他系统可以使用环境变量 Token。

### 生成与局部重绘

```bash
# 只校验和预览请求，不访问 API，不需要 Token，不写文件
npm run cli -- generate --prompt "1girl, smile" --seed 42 --dry-run

# 文生图
npm run cli -- generate --prompt "1girl, smile" --seed 42 --output-dir ./outputs

# 图生图：自动读取输入图尺寸
npm run cli -- generate --image ./source.png --prompt "1girl, smile" --strength 0.55

# 局部重绘：提供遮罩时自动使用 infill 和对应的 inpainting 模型
npm run cli -- generate --image ./source.png --mask ./mask.png \
  --prompt "smile, blush" --strength 1 --output-dir ./outputs
```

默认模型 `nai-diffusion-4-5-full`，尺寸 `832×1216`，28 步，Guidance 5，
采样器 `k_euler_ancestral`，噪声调度 `karras`，参数版本 3，输出 PNG。
默认负向提示词为空，开启质量标签和颜色校正。图生图默认强度 0.55，
局部重绘默认强度 1，噪声默认 0；这些值可通过选项或 JSON 覆盖。

输入图支持 PNG/JPEG/WebP。输入图和重绘遮罩的尺寸必须一致，宽高必须是
64 的正整数倍；遮罩必须是不透明灰度 PNG，白色重绘、黑色保留。
CLI 不会把彩色遮罩预览转换成蒙版，也不会自动扩边或改动图像像素。

局部重绘输出为 **API 原始结果**，不执行 GUI 的透明度恢复或边缘合成，
因此本 CLI 的加入并不修复先前诊断到的绿色边缘问题。

每次生成创建独立目录，保存图片与 `generation.json`（请求参数和输出路径，
不含 Token、输入图或参考图的 Base64），避免覆盖已有文件。
直接运行可执行文件时，标准输出为 JSON，状态和错误写入标准错误；
成功退出码为 0，执行失败为 1，命令参数错误为 2。
用于管道和自动化时应直接运行可执行文件，npm 包装命令还会输出 npm 提示。

### 透明底生成

```bash
# 未指定模型时，自动选择 V5 Full，补上透明底提示词并请求 Alpha 输出
npm run cli -- generate --prompt "1girl, full body, standing" --transparent-background

# 先查看参数，不调用生成 API
npm run cli -- generate --prompt "1girl, full body" --transparent-background --dry-run
```

Alpha 透明只支持 V5，官方建议使用 `transparent background` 提示词。
参见 [NovelAI Alpha Transparency Tags](https://docs.novelai.net/en/image/tags/)。
CLI 会补上该标签并发送 `tag_hint_transparent_background` 和 `straight_alpha`，
直接保存 API 返回的 PNG/WebP，保留 Alpha 通道。已存在的透明底标签，包括
`2.1::transparent background::` 形式，不会重复添加。

如果命令行、预设或 JSON 已指定了非 V5 模型，CLI 会提示用
`--model nai-diffusion-5-full` 覆盖。局部重绘 `infill` 不接受透明底选项。
预设或 JSON 开启透明底时，可以用 `--no-transparent-background` 关闭；
该选项只关闭透明底开关，不移除你自己写入提示词的标签。

### 应用 GUI 预设

```bash
# 列出 GUI 已保存的共享预设，返回名称、ID、类型和分组
npm run cli -- presets list

# 仅列出画风预设
npm run cli -- presets list --kind prompt_template

# 按名称应用画风，并保留主提示词
npm run cli -- generate --preset "米山舞" --prompt "1girl, smile" --dry-run

# 组合参数预设和画风预设
npm run cli -- generate --preset "我的参数" --preset "我的画风" \
  --prompt "1girl, full body" --transparent-background
```

默认读取 GUI 共用的 `IDLECLOUD/shared-presets.json`（macOS 位于
`~/Library/Application Support/IDLECLOUD/`，Windows 位于用户应用数据目录）。
GUI 保存的画风 `prompt_template` 作为前缀添加到主提示词前，同时恢复其
保存的负向提示词；参数预设 `params` 则设置模型、尺寸、步数等参数。
共享文件的 snake_case 参数会转换成 CLI 使用的 camelCase。

`--preset` 可以重复使用，按输入顺序应用；后面的参数和负向提示词覆盖前面的值，
多个画风的正向提示词则依次拼接。匹配名称必须完全一致；如果有同名预设，
使用 `presets list` 返回的 ID。`--style-prompt` 可以覆盖预设的画风前缀，
`--negative-prompt` 可以覆盖预设的负向提示词。

配置优先级为：**默认值 → 预设 → `--request` JSON → 显式命令行选项**。
如果参数预设指定了 V4.5，同时需要透明底，用 `--model nai-diffusion-5-full` 覆盖。
提供输入图片时，CLI 会根据图片/遮罩推断编辑模式；显式的 `--action` 或 JSON
中的 `action` 优先。预设明确保存的尺寸和强度会保留，输入图需匹配这些尺寸。

也可以在 `presets list` 或 `generate` 中使用 `--presets-file ./shared-presets.json`
读取其他共享预设文件，支持 `{ "version": 1, "presets": [...] }` 和直接的预设数组。
这些命令只读取预设文件，不修改 GUI 已保存的预设。

### JSON 请求配置

`--request` 接受部分 `ImageGenerateRequest` 配置，字段使用 camelCase，
与前端向 Rust 后端发送的数据一致，另外支持 CLI 的 `stylePrompt` 前缀字段。
未填写字段采用 CLI 默认值或所选预设；显式命令行选项优先于 JSON。
未知字段会报错。它不是包含 `input/model/action/parameters`
的原始 API 请求体，也不是 GUI 历史记录导出文件。

例如 `request.json`：

```json
{
  "prompt": "1girl, smile",
  "negativePrompt": "lowres, bad anatomy",
  "model": "nai-diffusion-4-5-full",
  "steps": 28,
  "seed": 42,
  "characters": [],
  "paramsVersion": 3
}
```

```bash
npm run cli -- generate --request ./request.json --seed 123 --dry-run
```

JSON 也可以包含 `sourceImage`、`maskImage`、参考图等高级字段的 Base64 数据。
`--dry-run` 和输出记录会省略图像数据；预览是用于检查的摘要，不能直接重放。

## 读取图片 prompt（CLI）

离线读取 PNG / WebP 内嵌的生成信息，无需 Token，不调用生成接口：

```bash
npm run cli -- metadata "/path/to/image.png"
npm run cli -- metadata "/path/to/image.png" --prompt-only
# 独立可执行文件：novelai-cli metadata image.png
```

默认输出 JSON，包含 `found`、可识别的 `prompt`、`negativePrompt`、seed、步数、采样器等参数，以及 `rawMetadata` 原始元数据。支持 PNG tEXt / zTXt / iTXt、NovelAI PNG 隐写信息（含 gzip）和 WebP EXIF / JSON 元数据。V4 / V5 的 `base_caption` 也可读取。

图片没有 prompt 时，JSON 返回 `found: false`；`--prompt-only` 返回错误和非零退出码。仅能读取图片中保留的信息，无法恢复被平台或截图移除的 prompt。此命令不会自动修改 `generate --image` 的生成参数。

## 本地 OpenAI 兼容文本 API

在 GUI「设置 → 本地 OpenAI API」中启动服务，默认地址为 `http://127.0.0.1:18765/v1`。
GUI 可停止服务、复制 Base URL 和访问密钥；服务随应用退出而停止。
CLI 也可以独立运行同一服务：

```bash
npm run cli -- serve --port 18765
# 独立发布的 CLI：novelai-cli serve --port 18765
# Ctrl+C 停止
```

服务读取现有 NovelAI Token。CLI 支持 `NOVELAI_API_TOKEN`、`--proxy`、`--allow-invalid-tls`；
GUI 使用启动时的 Token、代理与 TLS 设置，修改这些设置后需重启服务。
默认只监听本机；需要其他地址时使用 `--host` 或 GUI 监听地址输入框。
GUI 和 CLI 是独立服务，不能同时占用相同监听地址与端口。

访问密钥与 NovelAI 账户 Token 独立，默认存入系统凭据并由 GUI / CLI 共用。
可使用 `novelai-cli gateway-key` 读取本地密钥，或用至少 16 字符的 `NOVELAI_GATEWAY_API_KEY` 覆盖。
启动日志不输出任何密钥。客户端认证格式为 `Authorization: Bearer <本地密钥>`。

支持：

- `GET /health`：服务健康检查。
- `GET /v1/models`：`glm-4-6`、`xialong-v1`。
- `POST /v1/chat/completions`：文本消息，支持普通 JSON 和实时 SSE 流式输出。

上游统一使用 NovelAI 的流式接口，避免其非流式响应只包含 token ID 的情况。
服务把 SSE 内容规范化为 `choices[].delta.content`，或聚合成 `choices[].message.content`。
单次输出上限 8,192 tokens，上游未提供 usage 时用零表示未知，不估算消耗。
工具调用使用提示词适配：网关把 function 工具定义与调用历史转换为文本，解析模型返回的 JSON 调用，输出标准 `tool_calls`；工具由客户端执行，结果通过 `role: tool` 回传。
支持 `tool_choice` 的 auto / none / required / 指定函数。工具模式先收齐上游输出再返回（包括流式请求），解析失败或工具名称、必填参数不符时返回错误，不执行任何工具。
这属于协议适配，不是 NovelAI 原生工具接口；成功率取决于模型是否遵循格式。图片、音频和 Anthropic Messages API 不在此服务范围内。

### GUI 一键写入 OpenCode

在「设置 → 本地 OpenAI API → 接入 OpenCode」选择模型，启动服务，然后点击「一键写入 OpenCode 配置」。
自动合并 `~/.config/opencode/opencode.json`（遵循 `XDG_CONFIG_HOME`，已有 JSONC 时更新 JSONC），保留其他 provider 与智能体，并备份原文件。
JSONC 更新后整理为 JSON，注释仍保留在备份。独立访问密钥写入旁边的 `novelai-gateway.key`，配置使用 `{file:...}` 引用；Unix 文件权限为 600，不写入 NovelAI 账户 Token。
默认不改变当前默认模型；勾选选项后设置所选模型及 `novelai` 智能体为默认。重开 OpenCode，选择 NovelAI 模型和 `novelai` 智能体即可使用工具适配。项目配置或 `OPENCODE_CONFIG` 可能覆盖全局设置。

### 接入 OpenCode 文本模式

[示例配置](./examples/opencode-local-text.json) 使用 `@ai-sdk/openai-compatible`，关闭工具调用。
安装版 CLI 可通过以下方式给 OpenCode 提供密钥；从源码运行时先用 `npm run cli:build` 构建 CLI。

```bash
export NOVELAI_GATEWAY_API_KEY="$(novelai-cli gateway-key)"
export OPENCODE_CONFIG="/你的路径/novelai-gui/examples/opencode-local-text.json"
opencode run --agent text --model novelai/glm-4-6 "帮我构思一个小说开篇"
# 也可选择 --model novelai/xialong-v1
```

该手动示例关闭工具，适合纯文本写作；需要读文件和改代码时使用 GUI 写入的 `novelai` 智能体及工具适配配置。
Claude Code 使用 Anthropic Messages 格式，不能直接连接这一版 OpenAI 端点。

## API 文档

本仓库内的 [NovelAI-API-Docs.md](./NovelAI-API-Docs.md) 整理了 NovelAI Primary API、图像生成专用 API 和相关 schema。官方入口：

- Primary API: https://api.novelai.net/docs/
- Image API: https://image.novelai.net/docs/index.html
