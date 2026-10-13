import { ArrowUp, BookOpen, Check, Copy, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type WritingChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  inserted?: boolean;
  status?: "error";
};

type WritingChatProps = {
  title: string;
  model: string;
  messages: WritingChatMessage[];
  draft: string;
  prompt: string;
  loading: boolean;
  hasToken: boolean;
  canSend: boolean;
  onTitleChange: (title: string) => void;
  onSend: (prompt: string) => void;
  onPromptChange: (prompt: string) => void;
  onInsert: (id: string) => void;
  onOpenSettings: () => void;
  onNotice: (notice: string) => void;
};

const STARTERS = [
  ["写一个开篇", "请根据作品设定，为本章写一个有吸引力的开篇。"],
  ["继续故事", "请承接本章正文和前面的对话，继续推进故事。"],
  ["推敲情节", "请帮我推敲本章接下来可以如何发展，给出三个不同的情节方向。"],
];

export function WritingChat(props: WritingChatProps) {
  const { prompt, onPromptChange: setPrompt } = props;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const followBottom = useRef(true);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const area = scrollArea.current;
    if (area && followBottom.current) area.scrollTop = area.scrollHeight;
  }, [props.messages, props.draft, props.loading]);

  useEffect(() => {
    if (!composer.current) return;
    composer.current.style.height = "auto";
    composer.current.style.height = `${Math.min(composer.current.scrollHeight, 180)}px`;
  }, [prompt]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const send = () => {
    if (!prompt.trim() || !props.canSend || props.loading) return;
    followBottom.current = true;
    props.onSend(prompt.trim());
    setPrompt("");
    composer.current?.focus();
  };

  const copy = async (message: WritingChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1800);
    } catch {
      props.onNotice("复制失败，请选中文字后手动复制。" );
    }
  };

  return (
    <main className="writing-chat writing-panel">
      <header className="writing-chat-header">
        <input aria-label="章节标题" maxLength={100} value={props.title} onChange={(event) => props.onTitleChange(event.target.value)} />
        <span>{props.messages.length} 条对话</span>
      </header>
      <div
        className="writing-chat-scroll"
        ref={scrollArea}
        onScroll={() => {
          const area = scrollArea.current;
          if (area) followBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
        }}
      >
        {props.messages.length || props.loading ? (
          <div className="writing-chat-transcript" role="log" aria-label="本章写作对话">
            {props.messages.map((message) => (
              <article key={message.id} className={`writing-chat-message ${message.role}`}>
                {message.role === "assistant" ? <span className="writing-chat-avatar"><Sparkles aria-hidden="true" /></span> : null}
                <div className="writing-chat-message-body">
                  <div className="writing-chat-message-text">{message.content}</div>
                  {message.role === "assistant" ? (
                    <div className="writing-chat-message-actions">
                      <button onClick={() => void copy(message)} aria-label="复制回复" title="复制回复">{copiedId === message.id ? <Check /> : <Copy />}{copiedId === message.id ? "已复制" : "复制"}</button>
                      <button onClick={() => props.onInsert(message.id)} disabled={props.loading || message.inserted}><BookOpen />{message.inserted ? "已保存正文作品" : "保存为正文作品"}</button>
                      {message.status === "error" ? <span>生成中断，已保留收到的内容</span> : null}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {props.loading ? (
              <article className="writing-chat-message assistant" aria-label="NovelAI 正在回复">
                <span className="writing-chat-avatar"><Sparkles aria-hidden="true" /></span>
                <div className="writing-chat-message-body">
                  {props.draft ? <div className="writing-chat-message-text">{props.draft}<span className="writing-chat-cursor" /></div> : <span className="writing-chat-thinking"><LoaderCircle className="spinning" />正在创作…</span>}
                </div>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="writing-chat-empty">
            <Sparkles aria-hidden="true" />
            <h2>今天想写什么故事？</h2>
            <p>写下想法，和 NovelAI 一起续写、改写或推敲情节。</p>
            <div className="writing-chat-starters">
              {STARTERS.map(([label, text]) => <button key={label} onClick={() => { setPrompt(text); composer.current?.focus(); }}>{label}</button>)}
            </div>
          </div>
        )}
      </div>
      <div className="writing-chat-composer-area">
        {!props.hasToken ? <button className="writing-chat-token-link" onClick={props.onOpenSettings}>设置 NovelAI 令牌，开始对话写作</button> : null}
        <form className="writing-chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <textarea
            ref={composer}
            value={prompt}
            maxLength={6000}
            rows={1}
            aria-label="写作要求"
            placeholder="输入写作要求，或和 NovelAI 讨论情节…"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className="writing-chat-composer-footer">
            <span>{props.model || "选择文本模型"}</span>
            <button type="submit" disabled={!prompt.trim() || !props.canSend || props.loading} aria-label="发送写作要求" title="发送写作要求">{props.loading ? <LoaderCircle className="spinning" /> : <ArrowUp />}</button>
          </div>
        </form>
        <p className="writing-chat-composer-hint">Enter 发送 · Shift + Enter 换行 · 对话自动保存到本机</p>
      </div>
    </main>
  );
}
