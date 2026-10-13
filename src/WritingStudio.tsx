import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  BookOpen,
  Check,
  Download,
  FileText,
  LoaderCircle,
  MessageSquare,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WritingChat, type WritingChatMessage } from "./WritingChat";

type StoryMessage = { role: "system" | "user" | "assistant"; content: string };
type StoryModel = { id: string };
type StoryGenerationEvent = {
  requestId: string;
  kind: string;
  delta?: string | null;
  message?: string | null;
};
type NovelChapter = {
  id: string;
  title: string;
  guidance: string;
  content: string;
  conversation?: WritingChatMessage[];
};
type NovelProject = {
  id: string;
  mode?: "chat" | "editor";
  title: string;
  setting: string;
  chapters: NovelChapter[];
  createdAt: number;
  updatedAt: number;
};

type WritingStudioProps = {
  hasToken: boolean;
  allowInvalidTls: boolean;
  proxyUrl: string | null;
  onOpenSettings: () => void;
};

const DB_NAME = "novelai-gui-writing";
const DB_VERSION = 1;
const STORE_NAME = "projects";
const FALLBACK_MODELS = ["xialong-v1", "glm-4-6", "llama-3-erato-v1", "kayra-v1"];

function isLegacyTextModel(id: string): boolean {
  return ["llama-3-erato-v1", "kayra-v1"].includes(id.toLowerCase());
}

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("无法打开本地小说数据库。"));
    });
    databasePromise = opening;
    void opening.catch(() => {
      if (databasePromise === opening) databasePromise = undefined;
    });
  }
  return databasePromise!;
}

async function loadProjects(): Promise<NovelProject[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as NovelProject[]).sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error ?? new Error("读取小说项目失败。"));
  });
}

async function saveProjects(projects: NovelProject[]): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    projects.forEach((project) => store.put(project));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("保存小说项目失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("保存小说项目失败。"));
  });
}

function createChapter(index = 1): NovelChapter {
  return { id: crypto.randomUUID(), title: `第${index}章`, guidance: "", content: "" };
}

function createProject(mode: "chat" | "editor"): NovelProject {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    mode,
    title: mode === "chat" ? "新对话" : "未命名小说",
    setting: "",
    chapters: [createChapter()],
    createdAt: now,
    updatedAt: now,
  };
}

function separateLibraries(saved: NovelProject[]): NovelProject[] {
  return saved.flatMap((project) => {
    if (project.mode === "chat" || project.mode === "editor") return [project];
    const hasConversation = project.chapters.some((chapter) => chapter.conversation?.length);
    if (!hasConversation) return [{ ...project, mode: "editor" as const }];
    const chatProject: NovelProject = { ...project, mode: "chat" };
    if (!project.chapters.some((chapter) => chapter.content.trim())) return [chatProject];
    return [chatProject, {
      ...project,
      id: crypto.randomUUID(),
      mode: "editor" as const,
      chapters: project.chapters.map((chapter) => ({ ...chapter, id: crypto.randomUUID(), conversation: undefined })),
    }];
  });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function WritingStudio({ hasToken, allowInvalidTls, proxyUrl, onOpenSettings }: WritingStudioProps) {
  const [projects, setProjects] = useState<NovelProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [models, setModels] = useState<StoryModel[]>([]);
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState(2048);
  const [temperature, setTemperature] = useState(0.85);
  const [draft, setDraft] = useState("");
  const [editorDraft, setEditorDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saveState, setSaveState] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [storageError, setStorageError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [modelError, setModelError] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [writingMode, setWritingMode] = useState<"chat" | "editor">("chat");
  const [composerDrafts, setComposerDrafts] = useState<Record<string, string>>({});
  const activeRequestId = useRef<string | null>(null);
  const streamedDraft = useRef("");
  const loaded = useRef(false);
  const librarySelection = useRef<Partial<Record<"chat" | "editor", { projectId: string | null; chapterId: string | null }>>>({});

  const visibleProjects = projects.filter((item) => item.mode === writingMode);
  const project = visibleProjects.find((item) => item.id === selectedProjectId) ?? null;
  const chapter = project?.chapters.find((item) => item.id === selectedChapterId) ?? project?.chapters[0] ?? null;

  useEffect(() => {
    setDraft("");
    setEditorDraft("");
  }, [selectedProjectId, selectedChapterId]);

  useEffect(() => {
    let disposed = false;
    loadProjects()
      .then((saved) => {
        if (disposed) return;
        const separated = separateLibraries(saved);
        const first = separated.find((item) => item.mode === "chat");
        setProjects(separated);
        setSelectedProjectId(first?.id ?? null);
        setSelectedChapterId(first?.chapters[0]?.id ?? null);
        loaded.current = true;
        setStorageError("");
        setSaveState("saved");
      })
      .catch((error: unknown) => {
        if (disposed) return;
        loaded.current = false;
        setSaveState("error");
        setStorageError(`本地项目读取失败：${errorText(error)}`);
      });
    return () => { disposed = true; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!loaded.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      saveProjects(projects)
        .then(() => setSaveState("saved"))
        .catch((error: unknown) => {
          setSaveState("error");
          setNotice(`自动保存失败：${errorText(error)}`);
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [projects]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<StoryGenerationEvent>("story-generation-event", (event) => {
      const payload = event.payload;
      if (payload.requestId !== activeRequestId.current) return;
      if (payload.kind === "delta" && payload.delta) {
        streamedDraft.current += payload.delta;
        setDraft(streamedDraft.current);
      }
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const refreshModels = useCallback(async () => {
    if (!hasToken) return;
    setLoadingModels(true);
    setModelError("");
    try {
      const result = await invoke<StoryModel[]>("get_story_models", { allowInvalidTls, proxyUrl });
      setModels(result);
      setModel((current) => result.some((item) => item.id === current) ? current : result[0]?.id ?? "");
    } catch (error) {
      setModels(FALLBACK_MODELS.map((id) => ({ id })));
      setModel((current) => FALLBACK_MODELS.includes(current) ? current : FALLBACK_MODELS[0]);
      setModelError(`暂时无法读取模型列表，可重试：${errorText(error)}`);
    } finally {
      setLoadingModels(false);
    }
  }, [allowInvalidTls, hasToken, proxyUrl]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  useEffect(() => {
    if (!assistantOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAssistantOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [assistantOpen]);

  const updateProject = useCallback((updater: (current: NovelProject) => NovelProject) => {
    if (!selectedProjectId) return;
    setProjects((current) => current.map((item) => item.id === selectedProjectId
      ? { ...updater(item), updatedAt: Date.now() }
      : item));
  }, [selectedProjectId]);

  const updateChapter = useCallback((updater: (current: NovelChapter) => NovelChapter) => {
    if (!selectedChapterId) return;
    updateProject((current) => ({
      ...current,
      chapters: current.chapters.map((item) => item.id === selectedChapterId ? updater(item) : item),
    }));
  }, [selectedChapterId, updateProject]);

  const addProject = () => {
    if (loading) return;
    const next = createProject(writingMode);
    setProjects((current) => [next, ...current]);
    setSelectedProjectId(next.id);
    setSelectedChapterId(next.chapters[0].id);
    setDraft("");
    setNotice(writingMode === "chat" ? "已创建新对话。" : "已创建新作品。");
  };

  const switchWritingMode = (nextMode: "chat" | "editor") => {
    if (loading || nextMode === writingMode) return;
    librarySelection.current[writingMode] = { projectId: selectedProjectId, chapterId: selectedChapterId };
    const previous = librarySelection.current[nextMode];
    const nextProject = projects.find((item) => item.mode === nextMode && item.id === previous?.projectId)
      ?? projects.find((item) => item.mode === nextMode);
    setWritingMode(nextMode);
    setSelectedProjectId(nextProject?.id ?? null);
    setSelectedChapterId(nextProject?.chapters.find((item) => item.id === previous?.chapterId)?.id
      ?? nextProject?.chapters[0]?.id ?? null);
    setNotice("");
  };

  const removeProject = () => {
    if (loading || !project || !window.confirm(`确定删除《${project.title}》及其全部章节吗？此操作无法撤销。`)) return;
    const remaining = projects.filter((item) => item.id !== project.id);
    const next = remaining.find((item) => item.mode === writingMode);
    setProjects(remaining);
    setSelectedProjectId(next?.id ?? null);
    setSelectedChapterId(next?.chapters[0]?.id ?? null);
    setDraft("");
    setNotice("作品已删除。");
  };

  const addChapter = () => {
    if (!project || loading) return;
    const next = createChapter(project.chapters.length + 1);
    updateProject((current) => ({ ...current, chapters: [...current.chapters, next] }));
    setSelectedChapterId(next.id);
    setDraft("");
  };

  const removeChapter = () => {
    if (loading || !project || !chapter || project.chapters.length <= 1) return;
    const index = project.chapters.findIndex((item) => item.id === chapter.id);
    const remaining = project.chapters.filter((item) => item.id !== chapter.id);
    updateProject((current) => ({ ...current, chapters: remaining }));
    setSelectedChapterId(remaining[Math.max(0, index - 1)]?.id ?? remaining[0]?.id ?? null);
    setDraft("");
  };

  const generate = async (chatPrompt?: string) => {
    if (!project || !chapter || !hasToken || !model || loading || activeRequestId.current) return;
    const isChat = writingMode === "chat";
    const prompt = chatPrompt?.trim() || "请承接本章现有情节，继续写一段小说正文。";
    setNotice("");
    setDraft("");
    streamedDraft.current = "";
    if (!isChat) setEditorDraft("");
    setLoading(true);
    const requestId = crypto.randomUUID();
    activeRequestId.current = requestId;
    const recentText = chapter.content.slice(-14000);
    let messages: StoryMessage[] = [
      {
        role: "system",
        content: "你是专业的中文小说协作写作助手，遵循作者给出的世界观和风格设定，维持人物、视角、时序与因果一致。写出具体、连贯、有画面感的小说正文。不要替作者总结、点评或解释写作过程；除非作者明确要求，不要输出标题、提纲或 Markdown。",
      },
      {
        role: "user",
        content: [
          `作品：${project.title}`,
          `作品设定与文风：\n${project.setting.trim() || "由正文自然展开，避免自行添加互相矛盾的设定。"}`,
          `章节：${chapter.title}`,
          `本章目标：\n${chapter.guidance.trim() || "承接现有情节，自然推进冲突和人物关系。"}`,
          recentText ? `当前正文（节选结尾）：\n${recentText}` : "当前章节尚无正文，请根据设定和本章目标写出开篇。",
          "请从当前情节自然接写一段小说正文。不要复述已给出的内容，不要写出分析或前言。",
        ].join("\n\n"),
      },
    ];
    if (isChat) {
      const userMessage: WritingChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
      const history = (chapter.conversation ?? []).filter((item) => item.status !== "error").slice(-12);
      const historyBudget = isLegacyTextModel(model) ? 6000 : 12000;
      while (history.length && history.reduce((total, item) => total + item.content.length, 0) > historyBudget) {
        history.shift();
      }
      while (history[0]?.role === "assistant") history.shift();
      messages = [
        {
          role: "system",
          content: [
            "你是中文小说协作写作助手。遵循作者的世界观、人物、文风和时序。根据用户本轮要求，续写或改写正文，也可以讨论剧情、人物与提纲。需要正文时直接写正文，需要建议时给出明确建议。",
            `作品：${project.title}\n章节：${chapter.title}`,
            `作品设定：\n${project.setting.slice(0, 6000) || "暂未填写。"}`,
            `本章目标：\n${chapter.guidance.slice(0, 2000) || "暂未填写。"}`,
            `已采纳的本章正文（结尾）：\n${chapter.content.slice(isLegacyTextModel(model) ? -4000 : -10000) || "暂无正文。"}`,
          ].join("\n\n"),
        },
        ...history.map(({ role, content }) => ({ role, content })),
        { role: "user", content: prompt },
      ];
      updateChapter((current) => ({ ...current, conversation: [...(current.conversation ?? []), userMessage] }));
    }
    const storeReply = (content: string, status?: "error") => {
      updateChapter((current) => ({
        ...current,
        conversation: [...(current.conversation ?? []), { id: crypto.randomUUID(), role: "assistant", content, status }],
      }));
    };
    try {
      const result = await invoke<string>("generate_story_text", {
        request: {
          requestId,
          model,
          messages,
          maxTokens,
          temperature,
          allowInvalidTls,
          proxyUrl,
        },
      });
      if (isChat) {
        if (result.trim()) storeReply(result);
        setDraft("");
      } else {
        setEditorDraft(result);
        setDraft("");
      }
      if (!result.trim()) setNotice("模型没有返回正文，可以调整设定后重试。");
    } catch (error) {
      if (isChat && streamedDraft.current.trim()) {
        storeReply(streamedDraft.current, "error");
        setDraft("");
      } else if (!isChat) {
        setEditorDraft(streamedDraft.current);
        setDraft("");
      }
      setNotice(`${isChat ? "回复" : "续写"}失败：${errorText(error)}`);
    } finally {
      if (activeRequestId.current === requestId) {
        activeRequestId.current = null;
        setLoading(false);
      }
    }
  };

  const insertDraft = () => {
    if (!editorDraft.trim()) return;
    updateChapter((current) => ({
      ...current,
      content: current.content.trimEnd()
        ? `${current.content.trimEnd()}\n\n${editorDraft.trimStart()}`
        : editorDraft.trimStart(),
    }));
    setEditorDraft("");
    setNotice("续写内容已追加到正文末尾。");
  };

  const insertChatMessage = (id: string) => {
    const message = chapter?.conversation?.find((item) => item.id === id);
    if (!project || !chapter || !message?.content.trim() || message.inserted || loading) return;
    const manuscript = createProject("editor");
    manuscript.title = `${project.title} · 正文`;
    manuscript.setting = project.setting;
    manuscript.chapters[0] = { ...createChapter(), title: chapter.title, guidance: chapter.guidance, content: message.content.trim() };
    setProjects((current) => [manuscript, ...current.map((item) => item.id === project.id ? {
      ...item,
      updatedAt: Date.now(),
      chapters: item.chapters.map((entry) => entry.id === chapter.id ? {
        ...entry,
        conversation: entry.conversation?.map((reply) => reply.id === id ? { ...reply, inserted: true } : reply),
      } : entry),
    } : item)]);
    setNotice("已在正文编辑库创建独立作品。后续编辑不会改变这段对话。");
  };

  const exportProject = async () => {
    if (!project) return;
    const content = [
      `# ${project.title}`,
      ...project.chapters.flatMap((item) => [
        `\n## ${item.title}\n`,
        writingMode === "chat"
          ? (item.conversation ?? []).map((message) => `${message.role === "user" ? "作者" : "NovelAI"}：\n${message.content}`).join("\n\n")
          : item.content.trim(),
      ]),
    ].join("\n");
    try {
      const path = await invoke<string | null>("export_novel_text", {
        fileName: `${project.title || "小说"}.txt`,
        content,
      });
      if (path) setNotice(`已导出到：${path}`);
    } catch (error) {
      setNotice(`导出失败：${errorText(error)}`);
    }
  };

  const wordCount = useMemo(() => chapter?.content.replace(/\s/g, "").length ?? 0, [chapter?.content]);
  const modelLabel = (id: string) => {
    const normalized = id.toLowerCase();
    if (normalized.includes("xialong")) return "Xialong · Opus";
    if (normalized.includes("glm-4-6")) return "GLM-4.6";
    if (normalized === "llama-3-erato-v1") return "Erato · Opus";
    if (normalized === "kayra-v1") return "Kayra";
    return id;
  };

  if (saveState === "loading") {
    return <section className="writing-loading"><LoaderCircle className="spinning" /><span>正在读取本地作品…</span></section>;
  }
  if (storageError) {
    return (
      <section className="writing-storage-error writing-panel">
        <BookOpen aria-hidden="true" />
        <h2>无法打开本地作品</h2>
        <p>{storageError}</p>
        <p>为避免覆盖已有内容，读取成功前不会保存空项目。</p>
        <button className="writing-primary-button" onClick={() => { setSaveState("loading"); setLoadAttempt((attempt) => attempt + 1); }}><RefreshCw />重试读取</button>
      </section>
    );
  }

  return (
    <section className="writing-workspace">
      <header className="writing-topbar">
        <div className="writing-heading">
          <span className="writing-mark"><BookOpen aria-hidden="true" /></span>
          <div>
            <p className="writing-eyebrow">NOVELAI WRITING STUDIO</p>
            <h1>小说工作台</h1>
          </div>
        </div>
        <div className="writing-topbar-actions">
          <div className="writing-mode-switch" role="tablist" aria-label="写作模式">
            <button role="tab" aria-selected={writingMode === "chat"} className={writingMode === "chat" ? "active" : ""} disabled={loading} onClick={() => switchWritingMode("chat")}><MessageSquare />对话写作</button>
            <button role="tab" aria-selected={writingMode === "editor"} className={writingMode === "editor" ? "active" : ""} disabled={loading} onClick={() => switchWritingMode("editor")}><FileText />正文编辑</button>
          </div>
          <span className={`writing-save-state ${saveState}`}>
            <span className="writing-save-dot" />
            {saveState === "saving" ? "正在保存" : saveState === "error" ? "保存异常" : "已自动保存"}
          </span>
          <button className="writing-action-button" onClick={exportProject} disabled={!project}>
            <Download aria-hidden="true" />导出 TXT
          </button>
          <button
            className="writing-action-button writing-assistant-toggle"
            aria-expanded={assistantOpen}
            aria-controls="writing-assistant-drawer"
            onClick={() => setAssistantOpen((open) => !open)}
          >
            <PanelRightOpen aria-hidden="true" />{assistantOpen ? "收起设置" : "写作设置"}
          </button>
        </div>
      </header>

      <div className="writing-stage">
      <div className="writing-grid">
        <aside className="writing-library writing-panel">
          <div className="writing-panel-head">
            <div><p className="writing-kicker">{writingMode === "chat" ? "CONVERSATIONS" : "LIBRARY"}</p><h2>{writingMode === "chat" ? "对话库" : "小说库"}</h2></div>
            <button className="writing-icon-button" title="新建作品" aria-label="新建作品" disabled={loading} onClick={addProject}><Plus /></button>
          </div>
          <div className="writing-project-list">
            {visibleProjects.length ? visibleProjects.map((item) => (
              <button
                key={item.id}
                className={`writing-project-item${item.id === selectedProjectId ? " active" : ""}`}
                disabled={loading}
                onClick={() => {
                  setSelectedProjectId(item.id);
                  setSelectedChapterId(item.chapters[0]?.id ?? null);
                  setDraft("");
                }}
              >
                <FileText aria-hidden="true" />
                <span><strong>{item.title || "未命名小说"}</strong><small>{item.chapters.length} 章 · {new Date(item.updatedAt).toLocaleDateString()}</small></span>
              </button>
            )) : (
              <div className="writing-library-empty"><BookOpen /><p>{writingMode === "chat" ? "还没有对话" : "还没有作品"}</p><button onClick={addProject}>{writingMode === "chat" ? "开启新对话" : "创建第一部小说"}</button></div>
            )}
          </div>
          {project ? (
            <>
              <div className="writing-section-divider" />
              <div className="writing-panel-head chapter-head">
                <div><p className="writing-kicker">CHAPTERS</p><h2>章节目录</h2></div>
                <button className="writing-icon-button" title="添加章节" aria-label="添加章节" disabled={loading} onClick={addChapter}><Plus /></button>
              </div>
              <div className="writing-chapter-list">
                {project.chapters.map((item, index) => (
                  <button
                    key={item.id}
                    className={`writing-chapter-item${item.id === chapter?.id ? " active" : ""}`}
                    disabled={loading}
                    onClick={() => { setSelectedChapterId(item.id); setDraft(""); }}
                  >
                    <span className="writing-chapter-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="writing-chapter-name">{item.title || `第${index + 1}章`}</span>
                  </button>
                ))}
              </div>
              <button className="writing-delete-project" disabled={loading} onClick={removeProject}><Trash2 />删除当前作品</button>
            </>
          ) : null}
        </aside>

        {project && chapter ? (
          writingMode === "chat" ? (
            <WritingChat
              key={chapter.id}
              title={chapter.title}
              model={model ? modelLabel(model) : ""}
              messages={chapter.conversation ?? []}
              draft={draft}
              prompt={composerDrafts[chapter.id] ?? ""}
              loading={loading}
              hasToken={hasToken}
              canSend={hasToken && !!model}
              onTitleChange={(title) => updateChapter((current) => ({ ...current, title }))}
              onSend={(prompt) => { void generate(prompt); }}
              onPromptChange={(prompt) => setComposerDrafts((current) => ({ ...current, [chapter.id]: prompt }))}
              onInsert={insertChatMessage}
              onOpenSettings={onOpenSettings}
              onNotice={setNotice}
            />
          ) : (
          <main className="writing-editor-column">
            <section className="writing-project-settings writing-panel">
              <div className="writing-panel-head">
                <div><p className="writing-kicker">PROJECT NOTES</p><h2>作品设定</h2></div>
                <span className="writing-autosave-label">自动保存到本机</span>
              </div>
              <input
                className="writing-title-input"
                aria-label="作品名称"
                value={project.title}
                maxLength={100}
                placeholder="给你的小说起个名字"
                onChange={(event) => updateProject((current) => ({ ...current, title: event.target.value }))}
              />
              <textarea
                className="writing-setting-input"
                value={project.setting}
                placeholder="记录世界观、主要人物、叙事视角和整体文风。续写时会作为长期设定传给 NovelAI。"
                onChange={(event) => updateProject((current) => ({ ...current, setting: event.target.value }))}
                rows={3}
              />
            </section>

            <section className="writing-manuscript writing-panel">
              <div className="writing-manuscript-head">
                <input
                  className="writing-chapter-title"
                  value={chapter.title}
                  maxLength={100}
                  aria-label="章节标题"
                  onChange={(event) => updateChapter((current) => ({ ...current, title: event.target.value }))}
                />
                <div className="writing-manuscript-meta">
                  <span>{wordCount.toLocaleString()} 字</span>
                  <button className="writing-subtle-button" onClick={removeChapter} disabled={loading || project.chapters.length <= 1} title="删除当前章节"><Trash2 />删除章节</button>
                </div>
              </div>
              <textarea
                className="writing-manuscript-input"
                aria-label="章节正文"
                value={chapter.content}
                placeholder="从这里开始写作。写下场景、对话或一个念头，然后让 NovelAI 帮你继续……"
                onChange={(event) => updateChapter((current) => ({ ...current, content: event.target.value }))}
                spellCheck={false}
              />
              <label className="writing-guidance-label">
                <span>本章目标 / 衔接提示</span>
                <input
                  value={chapter.guidance}
                  placeholder="例如：雨夜重逢，主角发现信件被调换；文风克制、慢热。"
                  onChange={(event) => updateChapter((current) => ({ ...current, guidance: event.target.value }))}
                />
              </label>
            </section>
          </main>
          )
        ) : (
          <main className="writing-no-project writing-panel"><BookOpen /><h2>{writingMode === "chat" ? "开启一段写作对话" : "开始一部新小说"}</h2><p>{writingMode === "chat" ? "对话记录独立保存在本机。" : "小说和章节独立保存在本机。"}</p><button className="writing-primary-button" onClick={addProject}><Plus />{writingMode === "chat" ? "新建对话" : "新建作品"}</button></main>
        )}

      </div>

      {assistantOpen ? (
        <>
          <button
            className="writing-drawer-backdrop"
            aria-label="关闭续写助手面板"
            onClick={() => setAssistantOpen(false)}
          />
          <aside
            id="writing-assistant-drawer"
            className="writing-assistant-drawer"
            role="dialog"
            aria-modal="false"
            aria-label="NovelAI 续写助手"
          >
            <div className="writing-drawer-heading">
              <div><p className="writing-kicker">WRITING TOOLS</p><h2><Settings2 aria-hidden="true" />写作设置</h2></div>
              <button className="writing-icon-button" title="关闭助手" aria-label="关闭助手" onClick={() => setAssistantOpen(false)}><X /></button>
            </div>
            {writingMode === "chat" && project && chapter ? (
              <section className="writing-project-settings writing-panel writing-chat-notes">
                <h2>作品设定</h2>
                <input className="writing-title-input" aria-label="作品名称" value={project.title} maxLength={100} placeholder="作品名称" onChange={(event) => updateProject((current) => ({ ...current, title: event.target.value }))} />
                <textarea className="writing-setting-input" aria-label="世界观与人物设定" value={project.setting} placeholder="世界观、人物与文风…" rows={5} onChange={(event) => updateProject((current) => ({ ...current, setting: event.target.value }))} />
                <label className="writing-guidance-label"><span>本章目标</span><input value={chapter.guidance} placeholder="希望本章发生什么？" onChange={(event) => updateChapter((current) => ({ ...current, guidance: event.target.value }))} /></label>
              </section>
            ) : null}
          <section className="writing-assistant-card writing-panel">
            <div className="writing-panel-head assistant-head">
              <div><p className="writing-kicker">NOVELAI</p><h2><Sparkles aria-hidden="true" />续写助手</h2></div>
              {model.toLowerCase().includes("xialong") || model.toLowerCase().includes("erato")
                ? <span className="writing-opus-badge">OPUS</span>
                : <span className="writing-opus-badge">TEXT</span>}
            </div>
            {!hasToken ? (
              <div className="writing-token-prompt">
                <p>先在设置中保存 NovelAI 持久化令牌，即可使用当前订阅的文本模型。</p>
                <button className="writing-primary-button" onClick={onOpenSettings}><Settings2 />前往设置</button>
              </div>
            ) : (
              <>
                <label className="writing-control-label">文本模型</label>
                <div className="writing-model-row">
                  <select
                    value={model}
                    onChange={(event) => {
                      const nextModel = event.target.value;
                      setModel(nextModel);
                      setMaxTokens((current) => isLegacyTextModel(nextModel)
                        ? Math.min(current, 250)
                        : current <= 250 ? 2048 : current);
                    }}
                    disabled={!models.length || loadingModels}
                  >
                    {models.length ? models.map((item) => <option key={item.id} value={item.id}>{modelLabel(item.id)}</option>) : <option value="">读取模型中…</option>}
                  </select>
                  <button className="writing-icon-button" title="刷新模型列表" aria-label="刷新模型列表" onClick={() => void refreshModels()} disabled={loadingModels}>
                    <RefreshCw className={loadingModels ? "spinning" : ""} />
                  </button>
                </div>
                {modelError ? <p className="writing-inline-error">{modelError}</p> : null}
                <label className="writing-control-label">单次续写长度 <strong>{maxTokens.toLocaleString()} tokens{isLegacyTextModel(model) ? " · 经典模型上限 250" : ""}</strong></label>
                <select className="writing-full-select" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))}>
                  {isLegacyTextModel(model) ? (
                    <>
                      <option value={128}>128 · 短段落</option>
                      <option value={250}>250 · 最长续写</option>
                    </>
                  ) : (
                    <>
                      <option value={1024}>1,024 · 短段落</option>
                      <option value={2048}>2,048 · 中等续写</option>
                      <option value={4096}>4,096 · 长段落</option>
                      <option value={8192}>8,192 · 最长续写</option>
                    </>
                  )}
                </select>
                <label className="writing-control-label writing-temperature-label">创作自由度 <strong>{temperature.toFixed(2)}</strong></label>
                <input className="writing-range" type="range" min="0" max="1.4" step="0.05" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
                <p className="writing-control-hint">较低更稳定，较高更有变化。</p>
                <button className="writing-generate-button" onClick={() => void generate()} disabled={!project || !chapter || !model || loading}>
                  {loading ? <><LoaderCircle className="spinning" />正在创作…</> : <><Sparkles />{writingMode === "chat" ? "让故事继续" : "继续写这一章"}</>}
                </button>
                <p className="writing-privacy-note">生成时会把作品设定、正文末尾与近期对话发给 NovelAI。</p>
              </>
            )}
          </section>

          {writingMode === "editor" && (editorDraft || loading) ? (
            <section className="writing-draft-card writing-panel">
              <div className="writing-panel-head draft-head">
                <div><p className="writing-kicker">NEW PASSAGE</p><h2>续写预览</h2></div>
                {loading ? <LoaderCircle className="spinning writing-draft-spinner" /> : null}
              </div>
              <textarea className="writing-draft-input" value={loading ? draft : editorDraft} disabled={loading} onChange={(event) => setEditorDraft(event.target.value)} placeholder="NovelAI 的续写会显示在这里…" />
              <button className="writing-insert-button" onClick={insertDraft} disabled={loading || !editorDraft.trim()}><Check />追加到正文</button>
            </section>
          ) : (
            <section className="writing-tip-card">
              <span className="writing-tip-icon"><BookOpen /></span>
              <p className="writing-tip-title">让故事接着发生</p>
              <p>补充本章目标，或先写一段正文。NovelAI 会参考作品设定与章节末尾继续创作。</p>
            </section>
          )}
          </aside>
        </>
      ) : null}
      </div>
      {notice ? <p className="writing-notice writing-global-notice" role="status">{notice}</p> : null}
    </section>
  );
}
