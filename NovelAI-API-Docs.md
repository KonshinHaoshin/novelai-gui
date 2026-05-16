# NovelAI 完整 API 文档

> 来源:
> - Primary API: [https://api.novelai.net/docs/](https://api.novelai.net/docs/)
> - 图像/文本生成 API (Omegalaser): [https://image.novelai.net/docs/](https://image.novelai.net/docs/) / [https://text.novelai.net/docs/](https://text.novelai.net/docs/)
>
> **注意**: 自 2024 年 9 月 30 日起，Kayra 仅在 `text.novelai.net` 可用（已从 Primary API 下线）。Clio 等旧模型暂保留在旧 API。

## API 概览

NovelAI 提供两套 API：
- **Primary API** (`api.novelai.net`) — 账户管理、订阅、故事存储等
- **Omegalaser API** (`image.novelai.net` / `text.novelai.net`) — 图像和文本生成

## 认证

所有受保护端点使用 **Bearer Token**（JWT），在 `Authorization: Bearer <token>` 中传递。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/user/login` | 使用 access key 登录，获取 access token |
| POST | `/user/create-persistent-token` | 创建持久化 API token（推荐第三方应用使用） |

---

## /ai/ 生成 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/ai/generate` | 文本生成 |
| POST | `/ai/generate-stream` | 流式文本生成（SSE） |
| POST | `/ai/generate-prompt` | 生成 prompt 建议 |
| POST | `/ai/generate-image` | 图像生成（SSE / ZIP） |
| POST | `/ai/annotate-image` | 图像标注预处理 |
| POST | `/ai/upscale` | 图像超分辨率（2x / 4x） |
| POST | `/ai/classify` | 序列分类 |
| GET | `/ai/generate-image/suggest-tags` | 提示词标签建议 |
| GET | `/ai/generate-voice` | 文本转语音（已弃用） |
| POST | `/ai/generate-voice` | 文本转语音 |

---

## Schemas 参考

### AiGenerateRequest（文本生成）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `input` | string (max 40000) | 是 | 输入文本 |
| `model` | string | 是 | 模型名称 |
| `parameters` | object | 是 | 生成参数（见 AiGenerateParameters） |

**可用模型**: `kayra-v1`, `clio-v1`, `euterpe-v2`, `krake-v2`, `genji-jp-6b-v2`, `genji-python-6b`, `genji-jp-6b`, `sigurd-2.9b-v1`, `hypebot`, `infillmodel`, `cassandra`, `blue`, `red`, `green`, `purple`, `2.7B`, `6B-v4`

### AiGenerateParameters（文本生成参数）

| 参数 | 类型 | 范围 | 说明 |
| --- | --- | --- | --- |
| `temperature` | number | 0.1–100 | 采样温度 |
| `min_length` | number | 1–2048 | 最小生成长度 |
| `max_length` | number | 1–2048 | 最大生成长度 |
| `top_k` | number | — | Top-K 采样 |
| `top_p` | number | — | Top-P / Nucleus 采样 |
| `top_a` | number | — | Top-A 采样 |
| `typical_p` | number | — | Typical 采样 |
| `tail_free_sampling` | number | 0–1 | 无尾采样 |
| `top_g` | number | 0–65536 | Top-G 采样 |
| `repetition_penalty` | number | — | 重复惩罚 |
| `repetition_penalty_range` | number | 0–8192 | 重复惩罚范围 |
| `repetition_penalty_slope` | number | 0–10 | 重复惩罚斜率 |
| `repetition_penalty_frequency` | number | -2–2 | 频率重复惩罚 |
| `repetition_penalty_presence` | number | -2–2 | 存在重复惩罚 |
| `repetition_penalty_whitelist` | array | — | 重复惩罚白名单 token IDs |
| `cfg_scale` | number | ≥0 | CFG 缩放 |
| `cfg_uc` | string | — | CFG 无条件输入 |
| `cfg_alpha` | number | 0–1 | CFG Alpha |
| `mirostat_tau` | number | ≥0 | Mirostat tau |
| `mirostat_lr` | number | 0–1 | Mirostat 学习率 |
| `stop_sequences` | array | — | 停止序列 token IDs |
| `bad_words_ids` | array | — | 禁用词 token IDs |
| `logit_bias` | array | — | Token 偏差 `[[id, bias], ...]` |
| `logit_bias_exp` | array | — | 序列偏差（含 ensure_sequence_finish / generate_once） |
| `phrase_rep_pen` | string | — | 短语重复惩罚 |
| `do_sample` | boolean | — | 是否采样 |
| `early_stopping` | boolean | — | 提前停止 |
| `num_beams` | number | — | Beam search 数 |
| `num_return_sequences` | number | — | 返回序列数 |
| `num_logprobs` | number | 0–30 | 返回对数概率数 |
| `no_repeat_ngram_size` | number | — | N-gram 不重复大小 |
| `encoder_no_repeat_ngram_size` | number | — | 编码器 N-gram 不重复大小 |
| `num_beam_groups` | number | — | Beam group 数 |
| `diversity_penalty` | number | — | 多样性惩罚 |
| `length_penalty` | number | — | 长度惩罚 |
| `force_emotion` | boolean | 是 | 强制情感 |
| `use_string` | boolean | — | false = Base64 编码的 uint16 tokens |
| `prefix` | string | — | 生成前缀 |
| `order` | array | — | 采样顺序（max 6） |
| `generate_until_sentence` | boolean | — | 生成到句子结束 |
| `output_nonzero_probs` | boolean | — | 输出非零概率 |
| `next_word` | boolean | — | 仅生成下一个词 |
| `get_hidden_states` | boolean | — | 获取隐藏状态 |
| `max_time` | number | — | 最大生成时间 |
| `use_cache` | boolean | — | 使用缓存 |
| `line_start_ids` | array | — | 行首 token IDs |
| `pad_token_id` | number | — | 填充 token ID |
| `bos_token_id` | number | — | 句首 token ID |
| `eos_token_id` | number | — | 句尾 token ID |

### AiGenerateImageRequest（图像生成）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `input` | string (max 40000) | 是 | 提示词 |
| `model` | string | 是 | 图像生成模型 |
| `action` | string | 否 | `generate` / `img2img` / `infill` |
| `parameters` | object | 是 | 模型相关生成参数 |
| `url` | string | 否 | 自定义图像生成 URL |

**图像模型**: `nai-diffusion-3`, `nai-diffusion-2`, `nai-diffusion`, `safe-diffusion`, `nai-diffusion-furry`, `nai-diffusion-inpainting`, `nai-diffusion-3-inpainting`, `safe-diffusion-inpainting`, `furry-diffusion-inpainting`, `kandinsky-vanilla`, `custom`

### AiGenerateImageResponse（图像生成响应）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ptr` | number | 递增版本指针 |
| `image` | string | Base64 编码的生成图像 |
| `final` | boolean | 是否为最终图像，生成结束 |
| `error` | string | 错误信息（如有） |

### AiAnnotateImageRequest（图像标注）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `model` | string | 是 | `canny` / `hed` / `midas` / `mlsd` / `openpose` / `uniformer` / `fake_scribble` |
| `parameters` | object | 是 | 模型相关标注参数 |

### AiUpscaleImageRequest（超分辨率）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `image` | string | 是 | Base64 编码图像 |
| `width` | number | 是 | 输入图像宽 |
| `height` | number | 是 | 输入图像高 |
| `scale` | number | 是 | 放大倍数（2 或 4） |

### AiGenerateVoiceRequest（语音生成）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `text` | string | 是 | 转换文本 |
| `seed` | string | 是 | 随机种子 |
| `voice` | number | 是 | 语音编号 |
| `opus` | boolean | 是 | 是否使用 Opus 编码 |
| `version` | string | 是 | `v1` / `v2` |

### AiGenerateStreamableResponse（流式文本响应 SSE）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ptr` | number | 递增 token 指针 |
| `token` | string | 生成的 token |
| `final` | boolean | 是否最终 token，生成结束 |
| `error` | string | 错误信息 |

### AiSequenceClassificationResponse（分类响应）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `output` | array 或 object | 含 `label`/`score` 的数组，或含 `scores` 数组的对象 |
| `error` | string | 错误信息 |

---

## /ai/module/ AI 模块 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/ai/module/all` | 获取用户所有模块 |
| GET | `/ai/module/{id}` | 获取单个模块 |
| DELETE | `/ai/module/{id}` | 删除模块 |
| POST | `/ai/module/buy-training-steps` | 购买训练步数 |

### AiModuleDto

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 模块 ID |
| `name` | string (max 64) | 名称 |
| `description` | string (max 256) | 描述 |
| `model` | string | 训练用文本生成模型 |
| `steps` | number | 训练步数 |
| `lr` | number | 学习率 |
| `status` | string | `pending` / `training` / `ready` / `error` |
| `data` | string | Base64 编码数据或错误信息 |
| `lossHistory` | array | 记录的 loss 值 |
| `lastUpdatedAt` | number | UNIX 时间戳 |

---

## /user/ 账户管理 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/user/register` | 注册新账户 |
| POST | `/user/login` | 登录 |
| POST | `/user/change-access-key` | 更换访问密钥 |
| POST | `/user/sso/google` | Google SSO 登录 |
| PATCH | `/user/change-mailing-list-consent` | 更改营销邮件同意 |
| POST | `/user/resend-email-verification` | 重发验证邮件 |
| POST | `/user/verify-email` | 验证邮箱 |
| GET | `/user/information` | 账户信息 |
| GET | `/user/osano-external-id` | Osano 外部 ID |
| PUT | `/user/consent` | 同意设置 |
| POST | `/user/deletion/request` | 请求删除账户 |
| POST | `/user/deletion/delete` | 确认删除账户 |
| POST | `/user/recovery/request` | 请求恢复账户 |
| POST | `/user/recovery/recover` | 确认恢复账户 |
| POST | `/user/delete` | 直接删除账户 |
| GET | `/user/data` | 用户数据概览 |
| GET | `/user/priority` | 优先级配额 |
| GET | `/user/giftkeys` | 礼物密钥 |
| GET | `/user/subscription` | 订阅状态 |
| GET | `/user/keystore` | 获取 keystore |
| PUT | `/user/keystore` | 更新 keystore |
| GET | `/user/objects/{type}` | 列出指定类型对象 |
| PUT | `/user/objects/{type}` | 创建对象 |
| GET | `/user/objects/{type}/{id}` | 获取单个对象 |
| PATCH | `/user/objects/{type}/{id}` | 编辑对象 |
| DELETE | `/user/objects/{type}/{id}` | 删除对象 |
| DELETE | `/user/objects/batch` | 批量删除对象 |
| GET | `/user/clientsettings` | 获取客户端设置 |
| PUT | `/user/clientsettings` | 更新客户端设置 |
| POST | `/user/create-persistent-token` | 创建持久化 token |
| POST | `/user/submission` | 提交作品 |

---

## 错误响应

所有 API 错误返回统一格式 `ApiError`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `statusCode` | number | HTTP 状态码 |
| `message` | string | 错误描述 |

常见状态码：
- `400` — 参数校验失败
- `401` — Token 错误或过期
- `402` — 需要付费订阅
- `404` — 资源未找到
- `409` — 冲突
- `500` — 服务器未知错误

---

## Omegalaser API（图像/文本生成专用 API）

> 来源: [https://image.novelai.net/docs/](https://image.novelai.net/docs/) & [https://text.novelai.net/docs/](https://text.novelai.net/docs/)
>
> 两个域名服务相同的 API，自 2024 年起与 Primary API 分离以提升稳定性。生成请求必须由人工操作发起。

### 认证

使用 `Authorization: Bearer <persistent_token>` header（需先通过 Primary API 创建持久化 token）。

---

### 生成端点

| 方法 | 路径 | 说明 | 返回 |
| --- | --- | --- | --- |
| POST | `/ai/generate` | 文本生成 | JSON |
| POST | `/ai/generate-stream` | 流式文本生成 | SSE |
| POST | `/ai/generate-image` | 图像生成 | ZIP |
| POST | `/ai/generate-image-stream` | 流式图像生成 | SSE (msgpack/sse) |
| POST | `/ai/augment-image` | 图像增强（Director Tools） | ZIP |
| POST | `/ai/encode-vibe` | 编码图像 vibe 信息 | Binary |
| GET | `/ai/generate-image/suggest-tags` | 标签建议 | JSON |

### OpenAI 兼容端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/oa/v1/chat/completions` | Chat completions |
| POST | `/oa/v1/completions` | Text completions |
| POST | `/oa/v1/internal/token-count` | Token 计数 |
| GET | `/oa/v1/models` | 可用模型列表 |

---

### 图像生成 Schemas

#### image.ImageGenerationRequest

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `input` | string | 是 | 提示词 / 输入 |
| `model` | string | 是 | 图像模型名称 |
| `action` | string | 否 | `generate` / `img2img` / `infill` |
| `parameters` | object | 是 | 图像生成参数 |
| `url` | string | 否 | 自定义图像生成 URL |

#### image.RequestParameters（图像生成参数）

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `width` | integer | 图像宽度 |
| `height` | integer | 图像高度 |
| `prompt` | string | Positive prompt |
| `negative_prompt` | string | Negative prompt |
| `v4_prompt` | V4ConditionInput | V4 模型的 prompt（结构化 prompt） |
| `v4_negative_prompt` | V4ConditionInput | V4 模型的 negative prompt |
| `n_samples` | integer | 生成数量 |
| `steps` | number | 采样步数 |
| `scale` | number | CFG scale |
| `cfg_rescale` | number | CFG rescale |
| `seed` | integer | 随机种子 |
| `sampler` | string | 采样器 |
| `noise_schedule` | string | 噪声调度 |
| `strength` | number | img2img / infill 强度 |
| `noise` | number | img2img / infill 噪声 |
| `extra_noise_seed` | integer | 额外噪声种子 |
| `dynamic_thresholding` | boolean | 动态阈值 |
| `sm` | boolean | SMEA 采样 |
| `sm_dyn` | boolean | SMEA Dynamic 采样 |
| `skip_cfg_above_sigma` | number | Variety Boost（Summer Sampler 更新） |
| `deliberate_euler_ancestral_bug` | boolean | 保留 Euler Ancestral bug（默认 true） |
| `prefer_brownian` | boolean | 偏好布朗运动噪声 |
| `image` | string | Base64 输入图像（img2img） |
| `mask` | string | Base64 遮罩（infill） |
| `image_format` | string | 输出格式：`png` / `webp` |
| `add_original_image` | boolean | 是否在 ZIP 中包含原图 |
| `stream` | string | 流式类型：`msgpack` / `sse` |
| `noise_schedule` | string | 噪声调度 |
| `params_version` | integer | 参数版本 |
| `qualityToggle` | boolean | 质量切换 |
| `ucPreset` | integer | UC 预设 |
| `legacy` | boolean | 旧版模式 |
| `legacy_v3_extend` | boolean | 旧版 V3 扩展 |
| `color_correct` | boolean | 颜色校正 |
| `reference_image` | string | 参考图像（Style Reference） |
| `reference_strength` | number | 参考强度 |
| `reference_image_multiple` | array | 多个参考图像 |
| `reference_strength_multiple` | array | 多个参考强度 |
| `reference_information_extracted` | number | 参考信息提取量 |
| `reference_information_extracted_multiple` | array | 多个参考信息提取量 |
| `controlnet_condition` | string | ControlNet 条件 |
| `controlnet_model` | string | ControlNet 模型 |
| `controlnet_strength` | number | ControlNet 强度 |
| `director_reference_images` | array | CR 参考图像（1024x1536 或 1536x1024 或 1472x1472） |
| `director_reference_descriptions` | array | CR 参考描述（V4ConditionInput 数组） |
| `director_reference_strength_values` | array | CR Fidelity 滑杆值（0-1） |
| `director_reference_secondary_strength_values` | array | CR 二级强度值（0-1） |
| `director_reference_information_extracted` | array | CR 信息提取量（0-1） |

#### image.V4ConditionInput

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `caption` | V4ExternalCaption | 结构化 caption |
| `use_coords` | boolean | 使用坐标 |
| `use_order` | boolean | 使用顺序 |
| `legacy_uc` | boolean | 旧版 UC 模式 |

#### image.V4ExternalCaption

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `base_caption` | string | 基础 caption |
| `char_captions` | array | 角色 caption 数组（V4ExternalCharacterCaption） |

#### image.V4ExternalCharacterCaption

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `char_caption` | string | 角色 caption |
| `centers` | array | 坐标中心点数组（Coordinates: {x, y}） |

#### image.Img2ImgParams

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `strength` | number | 转换强度 |
| `noise` | number | 噪声 |
| `extra_noise_seed` | integer | 额外噪声种子 |
| `color_correct` | boolean | 颜色校正 |

#### image.EncodeVibeRequest

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `image` | string | Base64 编码图像 |
| `model` | string | 模型名称 |
| `information_extracted` | number | 信息提取量（0-1） |
| `crop_to_mask` | boolean | 是否裁剪至遮罩范围 |
| `mask` | string | Base64 遮罩 |
| `focus_seed` | integer | 焦点区域随机种子 |
| `info_extract_seed` | integer | 信息提取随机种子 |

#### image.AugmentImageRequest

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `image` | string | Base64 编码图像 |
| `prompt` | string | 提示词 |
| `width` | integer | 宽度 |
| `height` | integer | 高度 |
| `req_type` | string | 请求类型 |
| `defry` | integer | Defry 参数 |

#### image.TagSuggestionResponse

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tags` | array | TagSuggestion 数组 `[{tag, count, confidence}]` |

---

### 文本生成 Schemas

#### text.LMGenerateRequest

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `input` | string | 是 | 输入文本（max 100000） |
| `model` | string | 是 | 模型（当前仅 `kayra-v1` / `llama-3-erato-v1`） |
| `parameters` | object | 是 | 生成参数 |
| `prefix` | string | 否 | 生成前缀 |
| `n_samples` | integer | 否 | 采样数量 |

> Trial 用户仅可使用 `kayra-v1`。

**上下文长度限制（按订阅）**：
- Tablet: 4096 tokens
- Scroll: 8192 tokens
- Opus: 8192 tokens

**`max_length` 限制（按订阅）**：
- Tablet: 150 tokens
- Scroll: 150 tokens
- Opus: 250 tokens

#### text.RequestParameters（文本生成参数）

| 参数 | 类型 | 范围 | 说明 |
| --- | --- | --- | --- |
| `temperature` | number | 0.1–100 | 采样温度 |
| `min_length` | integer | 1–2048 | 最小生成长度 |
| `max_length` | integer | 1–2048 | 最大生成长度 |
| `top_k` | integer | — | Top-K 采样 |
| `top_p` | number | — | Top-P 采样 |
| `top_a` | number | — | Top-A 采样 |
| `top_g` | number | 0–65536 | Top-G 采样 |
| `typical_p` | number | — | Typical 采样 |
| `min_p` | number | 0–1 | Min-P 采样 |
| `tail_free_sampling` | number | 0–1 | 无尾采样 |
| `repetition_penalty` | number | — | 重复惩罚 |
| `repetition_penalty_range` | integer | 0–8192 | 重复惩罚范围 |
| `repetition_penalty_slope` | number | 0–10 | 重复惩罚斜率 |
| `repetition_penalty_frequency` | number | -16–16 | 频率重复惩罚 |
| `repetition_penalty_presence` | number | -16–16 | 存在重复惩罚 |
| `repetition_penalty_whitelist` | array | — | 白名单 token IDs（纯数组，不支持嵌套） |
| `cfg_scale` | number | ≥0 | CFG scale |
| `cfg_uc` | string | — | CFG 无条件输入 |
| `mirostat_tau` | number | ≥0 | Mirostat tau |
| `mirostat_lr` | number | 0–1 | Mirostat 学习率 |
| `stop_sequences` | array | max 1024 | 停止序列 |
| `bad_words_ids` | array | max 2048 | 禁用词 token IDs |
| `logit_bias_exp` | array | max 1024 | 序列偏差（LogitBiasParameters） |
| `phrase_rep_pen` | string | — | 短语重复惩罚：`off` / `very_light` / `light` / `medium` / `aggressive` / `very_aggressive` |
| `order` | array | — | 采样顺序 |
| `use_string` | boolean | — | 响应输出是否为 detokenized 文本（默认 true） |
| `num_logprobs` | integer | 0–30 | 返回 logprobs 数量 |
| `prefix` | string | — | 生成前缀 |
| `force_emotion` | boolean | — | 强制情感 |
| `generate_until_sentence` | boolean | — | 生成到句子结束 |
| `bracket_ban` | boolean | — | 禁止括号 |
| `line_start_ids` | array | — | 行首 token IDs |
| `eos_token_id` | integer | — | 句尾 token ID |
| `cropped_token` | integer | — | 裁剪 token |
| `valid_first_tokens` | array | — | 允许的首 token |
| `math1_temp` | number | — | Unified Linear |
| `math1_quad` | number | — | Unified Quad |
| `math1_quad_entropy_scale` | number | — | Unified Conf |

#### text.LogitBiasParameters

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sequence` | array | 否 | Token 序列 |
| `bias` | number | 否 | 偏差值 |
| `ensure_sequence_finish` | boolean | 是 | 确保序列完成 |
| `generate_once` | boolean | 是 | 只生成一次 |

#### text.LMGenerationResponse

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `output` | string | 生成的文本输出 |
| `logprobs` | array | 每个 token 的 logprobs（含 before/after/chosen） |

---

### OpenAI 兼容 Schemas

#### text.OAIChatGenerateRequest

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `model` | string | 模型名称 |
| `messages` | array | OAIChatMessage 数组 `[{role, content, name}]` |
| `temperature` | number | 采样温度 |
| `max_tokens` | integer | 最大 token 数 |
| `top_p` | number | Top-P 采样 |
| `top_k` | integer | Top-K 采样 |
| `min_p` | number | Min-P 采样 |
| `frequency_penalty` | number | 频率惩罚 |
| `presence_penalty` | number | 存在惩罚 |
| `stop` | union | 停止词（string 或 string[]） |
| `stream` | boolean | 是否流式 |
| `seed` | integer | 随机种子 |
| `n` | integer | 返回数量 |
| `best_of` | integer | 最佳选择数 |
| `echo` | boolean | 是否回显 |
| `logprobs` | integer | logprobs 数量 |
| `logit_bias` | object | Token 偏差 map |
| `user` | string | 用户标识 |
| `suffix` | string | 后缀 |
| `enable_thinking` | boolean | 启用思考 |
| `generation_prefix` | string | 生成前缀（结构化输出） |
| `unified_linear` | number | Unified Linear |
| `unified_quadratic` | number | Unified Quad |
| `unified_cubic` | number | Unified Cubic |
| `unified_increase_linear_with_entropy` | number | Unified Conf |

#### text.OAITextGenerateRequest

与 Chat 类似的参数，但使用 `prompt` 字段（支持 string、string[]、token 数组、token 二维数组 四种格式）替代 `messages`。

#### text.OAITokenCountResponse

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `length` | integer | Token 数量 |
| `encoded` | array | 编码后的 token IDs |

---

### 重要的向后不兼容变更

> 以下变更在从 `api.novelai.net` 迁移到生成专用 API 时需要注意：

1. **`repetition_penalty_whitelist`** 现在是纯数组，不再支持嵌套数组
2. **上下文大小校验** 更严格
3. **`max_length` 校验** 更严格

---

### 官方参考

- Primary API: [https://api.novelai.net/docs/](https://api.novelai.net/docs/)
- 图像/文本生成 API: [https://image.novelai.net/docs/](https://image.novelai.net/docs/) | [https://text.novelai.net/docs/](https://text.novelai.net/docs/)
- 服务条款: [https://novelai.net/terms](https://novelai.net/terms)
- Tokenizer: [https://github.com/NovelAI/nai-js-tokenizer](https://github.com/NovelAI/nai-js-tokenizer)
