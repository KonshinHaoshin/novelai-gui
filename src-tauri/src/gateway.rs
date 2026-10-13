//! Local authenticated OpenAI gateway; prompt-based tool adaptation, no tool execution.
use super::{api_client, format_api_error, read_token, to_error, STORY_GENERATE_STREAM_URL};
use axum::{
    body::Body,
    extract::{DefaultBodyLimit, State},
    http::{header, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    net::IpAddr,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    net::TcpListener,
    sync::{mpsc, oneshot, Mutex, Semaphore},
    task::JoinHandle,
};
use uuid::Uuid;

const MODELS: [&str; 2] = ["glm-4-6", "xialong-v1"];
const KEY_ACCOUNT: &str = "local-openai-api-key";

#[derive(Clone, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GatewayConfig {
    pub host: String,
    pub port: u16,
    pub allow_invalid_tls: bool,
    pub proxy_url: Option<String>,
}
impl Default for GatewayConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 18765,
            allow_invalid_tls: false,
            proxy_url: None,
        }
    }
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStatus {
    pub running: bool,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub base_url: Option<String>,
}

#[derive(Default)]
pub struct GatewayManager(Mutex<Option<RunningGateway>>);

pub struct RunningGateway {
    pub status: GatewayStatus,
    shutdown: oneshot::Sender<()>,
    task: JoinHandle<Result<(), std::io::Error>>,
}
impl RunningGateway {
    pub async fn stop(mut self) {
        let _ = self.shutdown.send(());
        if tokio::time::timeout(Duration::from_secs(2), &mut self.task)
            .await
            .is_err()
        {
            self.task.abort();
            let _ = self.task.await;
        }
    }
}

#[tauri::command]
pub fn get_gateway_key() -> Result<String, String> {
    if let Ok(key) = std::env::var("NOVELAI_GATEWAY_API_KEY") {
        if key.trim().len() < 16 {
            return Err("NOVELAI_GATEWAY_API_KEY 至少需要 16 个字符。".into());
        }
        return Ok(key.trim().into());
    }
    let entry = keyring::Entry::new(super::SERVICE_NAME, KEY_ACCOUNT).map_err(to_error)?;
    match entry.get_password() {
        Ok(key) if !key.is_empty() => Ok(key),
        Ok(_) | Err(keyring::Error::NoEntry) => {
            let key = format!("nai-local-{}", Uuid::new_v4().simple());
            entry.set_password(&key).map_err(to_error)?;
            Ok(key)
        }
        Err(error) => Err(to_error(error)),
    }
}

#[tauri::command]
pub async fn start_gateway(
    manager: tauri::State<'_, GatewayManager>,
    config: GatewayConfig,
) -> Result<GatewayStatus, String> {
    let mut running = manager.0.lock().await;
    if running
        .as_ref()
        .is_some_and(|server| !server.task.is_finished())
    {
        return Err("本地 API 服务已经运行，请先停止再修改端口。".into());
    }
    let server = spawn(config, read_token()?).await?;
    let status = server.status.clone();
    *running = Some(server);
    Ok(status)
}

#[tauri::command]
pub async fn stop_gateway(
    manager: tauri::State<'_, GatewayManager>,
) -> Result<GatewayStatus, String> {
    if let Some(server) = manager.0.lock().await.take() {
        server.stop().await;
    }
    Ok(GatewayStatus::default())
}

#[tauri::command]
pub async fn gateway_status(
    manager: tauri::State<'_, GatewayManager>,
) -> Result<GatewayStatus, String> {
    let running = manager.0.lock().await;
    Ok(running
        .as_ref()
        .filter(|server| !server.task.is_finished())
        .map(|server| server.status.clone())
        .unwrap_or_default())
}

struct ApiState {
    client: reqwest::Client,
    token: String,
    local_key: String,
    upstream: String,
    slots: Arc<Semaphore>,
}

pub async fn spawn(config: GatewayConfig, token: String) -> Result<RunningGateway, String> {
    let ip: IpAddr = config
        .host
        .parse()
        .map_err(|_| "监听地址须为 IP，例如 127.0.0.1。".to_string())?;
    if token.trim().is_empty() {
        return Err("请先保存 NovelAI Token。".into());
    }
    let listener = TcpListener::bind((ip, config.port))
        .await
        .map_err(|error| format!("无法监听 {}:{}：{error}", config.host, config.port))?;
    let address = listener.local_addr().map_err(to_error)?;
    let state = Arc::new(ApiState {
        client: api_client(config.allow_invalid_tls, config.proxy_url.as_deref())?,
        token,
        local_key: get_gateway_key()?,
        upstream: STORY_GENERATE_STREAM_URL.into(),
        slots: Arc::new(Semaphore::new(2)),
    });
    let (shutdown, receiver) = oneshot::channel();
    let task = tokio::spawn(async move {
        axum::serve(listener, routes(state))
            .with_graceful_shutdown(async {
                let _ = receiver.await;
            })
            .await
    });
    Ok(RunningGateway {
        status: GatewayStatus {
            running: true,
            host: Some(address.ip().to_string()),
            port: Some(address.port()),
            base_url: Some(format!("http://{address}/v1")),
        },
        shutdown,
        task,
    })
}

fn routes(state: Arc<ApiState>) -> Router {
    let api = Router::new()
        .route("/v1/models", get(models))
        .route("/v1/chat/completions", post(chat))
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024))
        .layer(middleware::from_fn_with_state(state.clone(), authorize));
    Router::new()
        .route("/health", get(|| async { Json(json!({"status":"ok"})) }))
        .merge(api)
        .with_state(state)
}

fn api_error(status: StatusCode, kind: &str, message: impl Into<String>) -> Response {
    (
        status,
        Json(json!({"error":{"message":message.into(),"type":kind,"param":null,"code":kind}})),
    )
        .into_response()
}
fn same_key(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |result, (a, b)| result | (a ^ b))
        == 0
}
async fn authorize(
    State(state): State<Arc<ApiState>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let key = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    if !key.is_some_and(|key| same_key(key.as_bytes(), state.local_key.as_bytes())) {
        return api_error(
            StatusCode::UNAUTHORIZED,
            "authentication_error",
            "需要本地 API 访问密钥，格式为 Authorization: Bearer <key>。",
        );
    }
    next.run(request).await
}
async fn models() -> Json<Value> {
    Json(
        json!({"object":"list","data":MODELS.map(|id| json!({"id":id,"object":"model","created":0,"owned_by":"novelai"}))}),
    )
}

fn prepare(mut input: Value) -> Result<(Value, bool), String> {
    let body = input.as_object_mut().ok_or("请求体必须为 JSON 对象。")?;
    if body.get("tools").is_some_and(|value| {
        !value.is_null() && value.as_array().is_none_or(|items| !items.is_empty())
    }) || body.get("functions").is_some_and(|value| {
        !value.is_null() && value.as_array().is_none_or(|items| !items.is_empty())
    }) || body
        .get("tool_choice")
        .is_some_and(|value| !value.is_null() && value.as_str() != Some("none"))
        || body
            .get("function_call")
            .is_some_and(|value| !value.is_null() && value.as_str() != Some("none"))
    {
        return Err(
            "此接口仅支持文本对话，不支持 tools / tool_calls。请在调用端关闭工具调用。".into(),
        );
    }
    let model = body
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or("glm-4-6")
        .to_string();
    if !MODELS.contains(&model.as_str()) {
        return Err("模型须为 glm-4-6 或 xialong-v1。".into());
    }
    let messages = body
        .get_mut("messages")
        .and_then(Value::as_array_mut)
        .filter(|messages| !messages.is_empty())
        .ok_or("messages 不能为空。")?;
    for message in messages {
        if message.get("tool_calls").is_some_and(|value| {
            !value.is_null() && value.as_array().is_none_or(|calls| !calls.is_empty())
        }) {
            return Err("不支持 tool_calls 消息。".into());
        }
        let role = message.get("role").and_then(Value::as_str).unwrap_or("");
        if !["system", "developer", "user", "assistant"].contains(&role) {
            return Err("仅支持 system、developer、user、assistant 消息。".into());
        }
        let role = if role == "developer" { "system" } else { role }.to_string();
        let content = match message.get("content") {
            Some(Value::String(text)) => text.clone(),
            Some(Value::Array(parts)) => {
                let mut text = String::new();
                for part in parts {
                    if part.get("type").and_then(Value::as_str) != Some("text") {
                        return Err("仅支持文本内容，不支持图片、音频或工具结果。".into());
                    }
                    text.push_str(
                        part.get("text")
                            .and_then(Value::as_str)
                            .ok_or("文本内容格式无效。")?,
                    );
                }
                text
            }
            _ => return Err("每条消息必须包含文本 content。".into()),
        };
        *message = json!({"role":role,"content":content});
    }
    let streaming = body.get("stream").and_then(Value::as_bool).unwrap_or(false);
    let requested_tokens = body
        .get("max_tokens")
        .or_else(|| body.get("max_completion_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(2048);
    if requested_tokens == 0 {
        return Err("max_tokens 必须大于零。".into());
    }
    let mut output = json!({"model":model,"messages":body["messages"],"max_tokens":requested_tokens.min(8192),"stream":true});
    for key in [
        "temperature",
        "top_p",
        "top_k",
        "min_p",
        "frequency_penalty",
        "presence_penalty",
        "stop",
        "seed",
        "enable_thinking",
    ] {
        if let Some(value) = body.get(key) {
            output[key] = value.clone();
        }
    }
    Ok((output, streaming))
}

async fn chat(State(state): State<Arc<ApiState>>, Json(mut input): Json<Value>) -> Response {
    let adapter = match crate::tool_adapter::ToolAdapter::prepare(&mut input) {
        Ok(adapter) => adapter,
        Err(error) => return api_error(StatusCode::BAD_REQUEST, "invalid_request_error", error),
    };
    let (payload, streaming) = match prepare(input) {
        Ok(value) => value,
        Err(error) => return api_error(StatusCode::BAD_REQUEST, "invalid_request_error", error),
    };
    let model = payload["model"].as_str().unwrap().to_string();
    let slot = match state.slots.clone().acquire_owned().await {
        Ok(slot) => slot,
        Err(_) => {
            return api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "server_error",
                "服务正在关闭。",
            )
        }
    };
    let response = match state
        .client
        .post(&state.upstream)
        .bearer_auth(&state.token)
        .header("Accept", "text/event-stream")
        .json(&payload)
        .timeout(Duration::from_secs(180))
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => {
            return api_error(
                StatusCode::BAD_GATEWAY,
                "upstream_error",
                "无法连接 NovelAI，请检查网络或服务的代理设置。",
            )
        }
    };
    let status = response.status();
    if !status.is_success() {
        let body = response.bytes().await.unwrap_or_default();
        return api_error(
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            "upstream_error",
            format_api_error(status.as_u16(), &body),
        );
    }
    if streaming && adapter.is_none() {
        let (sender, receiver) = mpsc::channel::<String>(16);
        tokio::spawn(forward_stream(response, slot, model, sender));
        let stream = futures_util::stream::unfold(receiver, |mut receiver| async {
            receiver
                .recv()
                .await
                .map(|data| (Ok::<_, std::convert::Infallible>(data), receiver))
        });
        return (
            [
                (header::CONTENT_TYPE, "text/event-stream; charset=utf-8"),
                (header::CACHE_CONTROL, "no-cache"),
            ],
            Body::from_stream(stream),
        )
            .into_response();
    }
    let mut stream = response.bytes_stream();
    let mut pending = Vec::new();
    let mut result = CollectedReply::default();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(chunk) => pending.extend_from_slice(&chunk),
            Err(_) => {
                return api_error(
                    StatusCode::BAD_GATEWAY,
                    "upstream_error",
                    "NovelAI 流式响应中断。",
                )
            }
        }
        while let Some(newline) = pending.iter().position(|byte| *byte == b'\n') {
            let line = String::from_utf8_lossy(&pending[..newline])
                .trim_end_matches('\r')
                .to_string();
            pending.drain(..=newline);
            if let Err(error) = result.consume(&line) {
                return api_error(StatusCode::BAD_GATEWAY, "upstream_error", error);
            }
        }
    }
    if !pending.is_empty() {
        if let Err(error) = result.consume(&String::from_utf8_lossy(&pending)) {
            return api_error(StatusCode::BAD_GATEWAY, "upstream_error", error);
        }
    }
    if result.finish.is_none() && !result.done {
        return api_error(
            StatusCode::BAD_GATEWAY,
            "upstream_error",
            "NovelAI 响应在完成标记之前结束。",
        );
    }
    if result.text.trim().is_empty() {
        return api_error(
            StatusCode::BAD_GATEWAY,
            "upstream_error",
            "NovelAI 未返回可识别的文本。请尝试关闭 enable_thinking 或增加 max_tokens。",
        );
    }
    let finish = result.finish.unwrap_or_else(|| "stop".into());
    let (message, finish) = match adapter {
        Some(adapter) => match adapter.decode(&result.text, &finish) {
            Ok(reply) => reply,
            Err(error) => return api_error(StatusCode::BAD_GATEWAY, "tool_adapter_error", error),
        },
        None => (json!({"role":"assistant","content":result.text}), finish),
    };
    let id = format!("chatcmpl-{}", Uuid::new_v4().simple());
    let created = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let usage = result
        .usage
        .unwrap_or_else(|| json!({"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}));
    if streaming {
        let mut delta = message.clone();
        if let Some(calls) = delta.get_mut("tool_calls").and_then(Value::as_array_mut) {
            for (index, call) in calls.iter_mut().enumerate() {
                call["index"] = json!(index);
            }
        }
        let first = json!({"id":id,"object":"chat.completion.chunk","created":created,"model":model,"choices":[{"index":0,"delta":delta,"finish_reason":null}]});
        let last = json!({"id":id,"object":"chat.completion.chunk","created":created,"model":model,"choices":[{"index":0,"delta":{},"finish_reason":finish}],"usage":usage});
        return (
            [
                (header::CONTENT_TYPE, "text/event-stream; charset=utf-8"),
                (header::CACHE_CONTROL, "no-cache"),
            ],
            format!("data: {first}\n\ndata: {last}\n\ndata: [DONE]\n\n"),
        )
            .into_response();
    }
    Json(json!({"id":id,"object":"chat.completion","created":created,"model":model,"choices":[{"index":0,"message":message,"finish_reason":finish}],"usage":usage})).into_response()
}

fn text_delta(value: &Value) -> String {
    match value
        .pointer("/choices/0/delta/content")
        .or_else(|| value.pointer("/choices/0/text"))
    {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect(),
        _ => String::new(),
    }
}

async fn forward_stream(
    response: reqwest::Response,
    _slot: tokio::sync::OwnedSemaphorePermit,
    model: String,
    sender: mpsc::Sender<String>,
) {
    let id = format!("chatcmpl-{}", Uuid::new_v4().simple());
    let created = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let chunk = |delta: Value, finish: Option<&str>, usage: Option<&Value>| {
        let mut value = json!({"id":id,"object":"chat.completion.chunk","created":created,"model":model,"choices":[{"index":0,"delta":delta,"finish_reason":finish}]});
        if let Some(usage) = usage {
            value["usage"] = usage.clone();
        }
        format!("data: {value}\n\n")
    };
    if sender
        .send(chunk(json!({"role":"assistant","content":""}), None, None))
        .await
        .is_err()
    {
        return;
    }
    let mut upstream = response.bytes_stream();
    let mut pending = Vec::new();
    let mut reply = CollectedReply::default();
    let mut failed = None;
    'reading: loop {
        let bytes = tokio::select! {
            _ = sender.closed() => return,
            bytes = upstream.next() => bytes,
        };
        let Some(bytes) = bytes else {
            break;
        };
        match bytes {
            Ok(bytes) => pending.extend_from_slice(&bytes),
            Err(_) => {
                failed = Some("NovelAI 流式响应中断。".to_string());
                break;
            }
        }
        while let Some(newline) = pending.iter().position(|byte| *byte == b'\n') {
            let line = String::from_utf8_lossy(&pending[..newline])
                .trim_end_matches('\r')
                .to_string();
            pending.drain(..=newline);
            let previous_length = reply.text.len();
            if let Err(error) = reply.consume(&line) {
                failed = Some(error);
                break 'reading;
            }
            if reply.text.len() > previous_length
                && sender
                    .send(chunk(
                        json!({"content": &reply.text[previous_length..]}),
                        None,
                        None,
                    ))
                    .await
                    .is_err()
            {
                return;
            }
        }
    }
    if failed.is_none() && !pending.is_empty() {
        let previous_length = reply.text.len();
        if let Err(error) = reply.consume(&String::from_utf8_lossy(&pending)) {
            failed = Some(error);
        }
        if reply.text.len() > previous_length
            && sender
                .send(chunk(
                    json!({"content": &reply.text[previous_length..]}),
                    None,
                    None,
                ))
                .await
                .is_err()
        {
            return;
        }
    }
    if failed.is_none() && reply.finish.is_none() && !reply.done {
        failed = Some("NovelAI 响应在完成标记之前结束。".into());
    }
    if failed.is_none() && reply.text.trim().is_empty() {
        failed = Some("NovelAI 未返回可识别的文本。".into());
    }
    if let Some(message) = failed {
        let _ = sender
            .send(format!(
                "data: {}\n\n",
                json!({"error":{"type":"upstream_error","message":message}})
            ))
            .await;
    } else {
        let _ = sender
            .send(chunk(
                json!({}),
                Some(reply.finish.as_deref().unwrap_or("stop")),
                reply.usage.as_ref(),
            ))
            .await;
    }
    let _ = sender.send("data: [DONE]\n\n".into()).await;
}

#[derive(Default)]
struct CollectedReply {
    text: String,
    finish: Option<String>,
    usage: Option<Value>,
    done: bool,
}
impl CollectedReply {
    fn consume(&mut self, line: &str) -> Result<(), String> {
        let Some(data) = line.strip_prefix("data:") else {
            return Ok(());
        };
        let data = data.trim();
        if data == "[DONE]" {
            self.done = true;
            return Ok(());
        }
        if data.is_empty() {
            return Ok(());
        }
        let value: Value =
            serde_json::from_str(data).map_err(|_| "NovelAI 返回了无效的流式数据。".to_string())?;
        if let Some(error) = value.get("error") {
            return Err(error
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| error.as_str())
                .unwrap_or("NovelAI 生成失败。")
                .into());
        }
        self.text.push_str(&text_delta(&value));
        if let Some(finish) = value
            .pointer("/choices/0/finish_reason")
            .and_then(Value::as_str)
        {
            self.finish = Some(finish.into());
        }
        if let Some(usage) = value.get("usage").filter(|value| value.is_object()) {
            self.usage = Some(usage.clone());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_tools_and_multimodal_without_silently_dropping_them() {
        let plain = json!({"model":"glm-4-6","messages":[{"role":"user","content":"你好"}]});
        let mut tools = plain.clone();
        tools["tools"] = json!([{"type":"function"}]);
        assert!(prepare(tools).is_err());
        let mut image = plain.clone();
        image["messages"][0]["content"] = json!([{"type":"image_url","image_url":{"url":"x"}}]);
        assert!(prepare(image).is_err());
        let mut tool_role = plain;
        tool_role["messages"][0]["role"] = json!("tool");
        assert!(prepare(tool_role).is_err());
    }
    #[test]
    fn normalizes_text_parts_and_caps_output_while_always_using_upstream_sse() {
        let (payload, streaming) = prepare(json!({"model":"xialong-v1","max_completion_tokens":32000,"stream":false,"messages":[{"role":"developer","content":[{"type":"text","text":"中"},{"type":"text","text":"文"}]}]})).unwrap();
        assert!(!streaming);
        assert_eq!(payload["stream"], true);
        assert_eq!(payload["max_tokens"], 8192);
        assert_eq!(
            payload["messages"][0],
            json!({"role":"system","content":"中文"})
        );
    }
    #[test]
    fn reconstructs_nonstreaming_text_and_propagates_sse_errors() {
        let mut reply = CollectedReply::default();
        reply
            .consume("data: {\"choices\":[{\"delta\":{\"content\":\"雨夜\"}}]}")
            .unwrap();
        reply.consume("data: {\"choices\":[{\"delta\":{\"content\":\"来信\"},\"finish_reason\":\"stop\"}]}").unwrap();
        reply.consume("data: [DONE]").unwrap();
        assert_eq!(reply.text, "雨夜来信");
        assert_eq!(reply.finish.as_deref(), Some("stop"));
        assert!(reply
            .consume("data: {\"error\":{\"message\":\"failed\"}}")
            .is_err());
    }
    #[tokio::test]
    async fn http_authentication_and_real_routes_work_without_upstream_calls() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let key = "test-local-key-123456";
        let state = Arc::new(ApiState {
            client: reqwest::Client::new(),
            token: "unused-test-token".into(),
            local_key: key.into(),
            upstream: "http://127.0.0.1:1".into(),
            slots: Arc::new(Semaphore::new(2)),
        });
        let task = tokio::spawn(async move {
            axum::serve(listener, routes(state)).await.unwrap();
        });
        let client = reqwest::Client::new();
        let url = format!("http://{addr}/v1/models");
        assert_eq!(
            client.get(&url).send().await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            client
                .get(&url)
                .bearer_auth("wrong")
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
        let models: Value = client
            .get(&url)
            .bearer_auth(key)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(models["data"].as_array().unwrap().len(), 2);
        let response = client
            .post(format!("http://{addr}/v1/chat/completions"))
            .bearer_auth(key)
            .json(&json!({"tools":[{"type":"function"}],"messages":[]}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        task.abort();
    }

    #[tokio::test]
    async fn normalizes_native_text_sse_for_both_openai_response_modes() {
        let upstream_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream_address = upstream_listener.local_addr().unwrap();
        let upstream = Router::new().route("/generate",post(|Json(payload):Json<Value>| async move {
            assert_eq!(payload["stream"],true);
            ([(header::CONTENT_TYPE,"text/event-stream")], "data: {\"choices\":[{\"text\":\"雨\"}]}\n\ndata: {\"choices\":[{\"text\":\"夜\",\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n")
        }));
        let upstream_task = tokio::spawn(async move {
            axum::serve(upstream_listener, upstream).await.unwrap();
        });
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let state = Arc::new(ApiState {
            client: reqwest::Client::new(),
            token: "unused".into(),
            local_key: "test-key".into(),
            upstream: format!("http://{upstream_address}/generate"),
            slots: Arc::new(Semaphore::new(2)),
        });
        let task = tokio::spawn(async move {
            axum::serve(listener, routes(state)).await.unwrap();
        });
        let client = reqwest::Client::new();
        let url = format!("http://{address}/v1/chat/completions");
        let payload = json!({"model":"glm-4-6","messages":[{"role":"user","content":"写小说"}],"stream":false});
        let response: Value = client
            .post(&url)
            .bearer_auth("test-key")
            .json(&payload)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(response["object"], "chat.completion");
        assert_eq!(
            response["choices"][0]["message"],
            json!({"role":"assistant","content":"雨夜"})
        );
        let mut payload = payload;
        payload["stream"] = json!(true);
        let response = client
            .post(&url)
            .bearer_auth("test-key")
            .json(&payload)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let sse = response.text().await.unwrap();
        let events: Vec<Value> = sse
            .lines()
            .filter_map(|line| line.strip_prefix("data: "))
            .filter(|data| *data != "[DONE]")
            .map(|data| serde_json::from_str(data).unwrap())
            .collect();
        let content: String = events
            .iter()
            .filter_map(|event| {
                event
                    .pointer("/choices/0/delta/content")
                    .and_then(Value::as_str)
            })
            .collect();
        assert_eq!(content, "雨夜");
        assert!(events
            .iter()
            .all(|event| event["object"] == "chat.completion.chunk"));
        assert_eq!(
            events.last().unwrap()["choices"][0]["finish_reason"],
            "stop"
        );
        assert!(sse.ends_with("data: [DONE]\n\n"));
        task.abort();
        upstream_task.abort();
    }
}
