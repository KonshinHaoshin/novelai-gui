import { ArrowDown, ArrowUp, BookOpen, Check, Copy, LoaderCircle, Sparkles } from "lucide-react";
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

const STARTERS: Array<[label: string, description: string, prompt: string]> = [
  ["写一个开篇", "从作品设定出发，写一个有吸引力的开头", "请根据作品设定，为本章写一个有吸引力的开篇。"],
  ["继续故事", "承接本章正文和上文对话继续推进", "请承接本章正文和前面的对话，继续推进故事。"],
  ["推敲情节", "给出三个不同走向，帮你做选择", "请帮我推敲本章接下来可以如何发展，给出三个不同的情节方向。"],
  ["改一段文字", "把已写好的段落改得更紧凑或更有画面感", "请帮我改写下面的段落，让语言更紧凑、画面感更强。"],
];

const JUMP_THRESHOLD = 200;

export function WritingChat(props: WritingChatProps) {
  const { prompt, onPromptChange: setPrompt } = props;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const scrollArea = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const followBottom = useRef(true);
  const jumping = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleScroll = () => {
    const area = scrollArea.current;
    if (!area) return;
    const distance = area.scrollHeight - area.scrollTop - area.clientHeight;
    if (jumping.current && distance <= 100) {
      jumping.current = false;
    }
    if (!jumping.current) {
      followBottom.current = distance < 100;
    }
    setShowJump(!jumping.current && distance > JUMP_THRESHOLD);
    setScrolled(area.scrollTop > 8);
  };

  useEffect(() => {
    const area = scrollArea.current;
    if (!area) return;
    if (followBottom.current) area.scrollTop = area.scrollHeight;
    handleScroll();
  }, [props.messages, props.draft, props.loading]);

  useEffect(() => {
    if (!composer.current) return;
    composer.current.style.height = "auto";
    composer.current.style.height = `${Math.min(composer.current.scrollHeight, 180)}px`;
  }, [prompt]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const jumpToBottom = () => {
    const area = scrollArea.current;
    if (!area) return;
    const distance = area.scrollHeight - area.scrollTop - area.clientHeight;
    if (distance < 100) {
      followBottom.current = true;
      setShowJump(false);
      return;
    }
    jumping.current = true;
    followBottom.current = true;
    area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
    setShowJump(false);
  };

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
      props.onNotice("复制失败，请选中文字后手动复制。");
    }
  };

  return (
    <main className="writing-chat writing-panel">
      <header className={scrolled ? "writing-chat-header scrolled" : "writing-chat-header"}>
        <div className="writing-chat-heading">
          <input
            aria-label="章节标题"
            maxLength={100}
            value={props.title}
            onChange={(event) => props.onTitleChange(event.target.value)}
          />
          <div className="writing-chat-meta">
            <span className="writing-chat-model-badge" title={props.model || "未选择模型"}>
              {props.model || "未选择模型"}
            </span>
            <span className="writing-chat-count">{props.messages.length} 条对话</span>
          </div>
        </div>
      </header>

      <div className="writing-chat-scroll" ref={scrollArea} onScroll={handleScroll}>
        {props.messages.length || props.loading ? (
          <div className="writing-chat-transcript" role="log" aria-label="本章写作对话" aria-live="polite">
            {props.messages.map((message) => (
              <article key={message.id} className={`writing-chat-message ${message.role}`}>
                <div className="writing-chat-message-body">
                  {message.role === "assistant" ? (
                    <div className="writing-chat-author">
                      <Sparkles aria-hidden="true" />
                      <span>{props.model || "NovelAI"}</span>
                    </div>
                  ) : null}
                  {message.role === "assistant" ? (
                    <div className="writing-chat-message-text">{message.content}</div>
                  ) : (
                    <div className="writing-chat-bubble">{message.content}</div>
                  )}
                  <div className="writing-chat-message-actions">
                    <button onClick={() => void copy(message)} aria-label="复制" title="复制">
                      {copiedId === message.id ? <Check /> : <Copy />}
                      <span>{copiedId === message.id ? "已复制" : "复制"}</span>
                    </button>
                    {message.role === "assistant" ? (
                      <button
                        onClick={() => props.onInsert(message.id)}
                        disabled={props.loading || message.inserted}
                        aria-label={message.inserted ? "已保存正文" : "保存为正文"}
                        title={message.inserted ? "已保存正文" : "保存为正文"}
                      >
                        <BookOpen />
                        <span>{message.inserted ? "已保存" : "存为正文"}</span>
                      </button>
                    ) : null}
                  </div>
                  {message.status === "error" ? <span className="writing-chat-error">生成中断，已保留收到的内容</span> : null}
                </div>
              </article>
            ))}
            {props.loading ? (
              <article className="writing-chat-message assistant" aria-label="NovelAI 正在回复">
                <div className="writing-chat-message-body">
                  <div className="writing-chat-author">
                    <Sparkles aria-hidden="true" />
                    <span>{props.model || "NovelAI"}</span>
                  </div>
                  {props.draft ? (
                    <div className="writing-chat-message-text">{props.draft}<span className="writing-chat-cursor" /></div>
                  ) : (
                    <span className="writing-chat-thinking"><LoaderCircle className="spinning" />正在创作…</span>
                  )}
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
              {STARTERS.map(([label, description, text]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setPrompt(text); composer.current?.focus(); }}
                >
                  <strong>{label}</strong>
                  <span>{description}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="writing-chat-composer-area">
        {showJump ? (
          <button className="writing-chat-jump" onClick={jumpToBottom} type="button" aria-label="回到底部" title="回到底部">
            <ArrowDown aria-hidden="true" />
          </button>
        ) : null}
        {!props.hasToken ? (
          <button className="writing-chat-token-link" onClick={props.onOpenSettings} type="button">
            设置 NovelAI 令牌，开始对话写作
          </button>
        ) : null}
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
            <span className="writing-chat-composer-model">{props.model || "选择文本模型"}</span>
            <button
              className="writing-chat-send"
              type="submit"
              disabled={!prompt.trim() || !props.canSend || props.loading}
              aria-label="发送写作要求"
              title="发送写作要求"
            >
              {props.loading ? <LoaderCircle className="spinning" /> : <ArrowUp />}
            </button>
          </div>
        </form>
        <p className="writing-chat-composer-hint">Enter 发送 · Shift + Enter 换行 · 对话自动保存到本机</p>
      </div>
    </main>
  );
}
