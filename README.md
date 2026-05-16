# NovelAI GUI

NovelAI GUI 是一个面向 NovelAI 图像生成 API 的桌面客户端，基于 Tauri 2、React 和 TypeScript 构建。当前重点支持 NAI 4.5 图像生成工作流，提供提示词编辑、参数配置、生成预览、图片保存和历史记录管理。

## 功能

- 默认使用 `nai-diffusion-4-5-full`
- 支持正向提示词和负向提示词
- 支持常用尺寸预设、采样器、步数、Guidance、种子等参数
- 自动为 V4/V4.5 模型构造 `v4_prompt` 与 `v4_negative_prompt`
- 解析 NovelAI 图像 API 返回的 ZIP 图片包
- 支持生成历史恢复和历史显示上限设置
- Token 通过 Tauri 后端保存到系统凭据，不写入前端本地存储
- 请求体预览默认关闭，可在设置页开启

## 项目结构

```text
src/                 React 前端界面
src/App.tsx          主界面、状态和交互逻辑
src/styles.css       应用样式
src-tauri/           Tauri/Rust 后端
src-tauri/src/lib.rs NovelAI API 调用、Token 存储、图片保存
scripts/             图标生成等辅助脚本
icon.png             应用图标源文件
NovelAI-API-Docs.md  NovelAI API 参考资料
```


## API Token

在 NovelAI 官网获取 Persistent API Token 后，打开应用左侧“设置”，在 API Token 区域保存。请求会使用：

```http
Authorization: Bearer <your_token>
```

## API 文档

本仓库内的 [NovelAI-API-Docs.md](./NovelAI-API-Docs.md) 整理了 NovelAI Primary API、图像生成专用 API 和相关 schema。官方入口：

- Primary API: https://api.novelai.net/docs/
- Image API: https://image.novelai.net/docs/index.html
