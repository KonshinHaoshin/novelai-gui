import { invoke, isTauri } from "@tauri-apps/api/core";
import { Copy, Download, LoaderCircle, Play, Server, Square } from "lucide-react";
import { useEffect, useState } from "react";

type GatewayStatus = { running: boolean; host: string | null; port: number | null; baseUrl: string | null };
type Props = { hasToken: boolean; allowInvalidTls: boolean; proxyUrl: string };
type Integration = { path: string; exists: boolean; config: unknown };

export function LocalApiSettings({ hasToken, allowInvalidTls, proxyUrl }: Props) {
  const [status, setStatus] = useState<GatewayStatus>({ running: false, host: null, port: null, baseUrl: null });
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(18765);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [model, setModel] = useState("glm-4-6");
  const [makeDefault, setMakeDefault] = useState(false);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [writing, setWriting] = useState(false);
  const [integrationNotice, setIntegrationNotice] = useState("");
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const url = status.baseUrl ?? `http://${host.includes(":") ? `[${host}]` : host}:${port}/v1`;
    void invoke<Integration>("opencode_integration", { baseUrl: url, model, makeDefault }).then((value) => {
      if (!disposed) setIntegration(value);
    }).catch(() => { if (!disposed) setIntegration(null); });
    return () => { disposed = true; };
  }, [host, port, status.baseUrl, model, makeDefault]);
  const writeConfig = async () => {
    setWriting(true); setIntegrationNotice("");
    try {
      const result = await invoke<{ path: string; backupPath: string | null }>("write_opencode_config", { model, makeDefault });
      setIntegrationNotice(`已写入 ${result.path}。${result.backupPath ? `原配置备份：${result.backupPath}。` : ""}重新打开 OpenCode，选择 NovelAI 模型与 novelai 智能体。`);
    } catch (error) { setIntegrationNotice(String(error)); }
    finally { setWriting(false); }
  };
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const refresh = () => invoke<GatewayStatus>("gateway_status").then((value) => {
      if (disposed) return;
      setStatus(value);
      if (value.running && value.host && value.port) { setHost(value.host); setPort(value.port); }
    }).catch((error) => { if (!disposed) setNotice(String(error)); });
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, []);

  const toggle = async () => {
    setBusy(true); setNotice("");
    try {
      const next = status.running
        ? await invoke<GatewayStatus>("stop_gateway")
        : await invoke<GatewayStatus>("start_gateway", { config: { host: host.trim(), port, allowInvalidTls, proxyUrl: proxyUrl || null } });
      setStatus(next);
      setNotice(next.running ? "本地 API 已启动。使用下方地址和独立访问密钥连接。" : "本地 API 已停止。");
    } catch (error) { setNotice(String(error)); }
    finally { setBusy(false); }
  };
  const copy = async (kind: "url" | "key") => {
    try {
      const value = kind === "key" ? await invoke<string>("get_gateway_key") : status.baseUrl;
      if (!value) return;
      await navigator.clipboard.writeText(value);
      setNotice(kind === "key" ? "已复制本地 API 访问密钥。" : "已复制 Base URL。");
    } catch (error) { setNotice(`复制失败：${String(error)}`); }
  };
  return (
    <section className="settings-panel local-api-settings">
      <div className="section-head"><Server aria-hidden="true" /><h2>本地 OpenAI API</h2><i className={status.running ? "status-dot ok" : "status-dot"} /></div>
      <p className="local-api-description">提供 GLM‑4.6 / Xialong 对话与流式输出，支持 /v1/models 和 /v1/chat/completions。</p>
      <div className="local-api-address-fields">
        <label className="field"><span>监听地址</span><input aria-label="本地 API 监听地址" value={host} disabled={status.running || busy} onChange={(event) => setHost(event.target.value)} /></label>
        <label className="field"><span>端口</span><input aria-label="本地 API 端口" type="number" min={1} max={65535} value={port} disabled={status.running || busy} onChange={(event) => setPort(Number(event.target.value))} /></label>
      </div>
      {status.running ? <div className="local-api-url"><code>{status.baseUrl}</code><button className="ghost-button" title="复制 Base URL" aria-label="复制 Base URL" onClick={() => void copy("url")}><Copy size={14} /></button></div> : null}
      <div className="local-api-actions">
        <button className="run-button" disabled={busy || !isTauri() || (!status.running && (!hasToken || !host.trim() || !Number.isInteger(port) || port < 1 || port > 65535))} onClick={() => void toggle()}>{busy ? <LoaderCircle className="spinning" size={14} /> : status.running ? <Square size={14} /> : <Play size={14} />}{status.running ? "停止服务" : "启动服务"}</button>
        <button className="ghost-button" disabled={!status.running || busy} onClick={() => void copy("key")}><Copy size={14} />复制访问密钥</button>
      </div>
      <p className="local-api-description">访问需使用 Bearer 密钥。默认仅供本机调用；GUI 服务随应用退出而停止，CLI 可使用 serve 独立运行。修改 Token、代理或 TLS 设置后需重启服务。</p>
      {notice ? <p className="local-api-notice" role="status">{notice}</p> : null}
      <div className="opencode-integration">
        <h3>接入 OpenCode</h3>
        <p className="local-api-description">工具适配模式：由模型请求工具，OpenCode 执行并返回结果。工具调用会收齐输出后返回；参数解析失败时会报错。</p>
        <label className="field"><span>模型</span><select aria-label="OpenCode 模型" value={model} onChange={(event) => setModel(event.target.value)} disabled={writing}><option value="glm-4-6">GLM‑4.6</option><option value="xialong-v1">Xialong</option></select></label>
        <label className="toggle-row"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} disabled={writing} />设为 OpenCode 默认模型和智能体</label>
        <p className="local-api-description">合并已有配置并自动备份。支持 JSON / JSONC，写入后整理为 JSON；原注释保留在备份。访问密钥单独保存，无需设置环境变量。</p>
        {integration ? <p className="local-api-description opencode-config-path">{integration.path}</p> : null}
        <div className="local-api-actions"><button className="run-button" disabled={!isTauri() || !status.running || busy || writing} onClick={() => void writeConfig()}>{writing ? <LoaderCircle size={14} className="spinning" /> : <Download size={14} />}{writing ? "正在写入" : "一键写入 OpenCode 配置"}</button></div>
        {!status.running ? <p className="local-api-description">先启动本地 API，再写入配置。</p> : null}
        {integration ? <details className="opencode-config-preview"><summary>查看配置</summary><pre>{JSON.stringify(integration.config, null, 2)}</pre></details> : null}
        {integrationNotice ? <p className="local-api-notice" role="status">{integrationNotice}</p> : null}
      </div>
    </section>
  );
}
