import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Copy,
  FileText,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Unplug,
} from "lucide-react";
import { Badge, Button, Dialog, Empty, PageHeading } from "./components.jsx";
import { request } from "./api.js";
import { KnowledgeCompilation } from "./KnowledgeCompilation.jsx";
import "./knowledge.css";

const date = (value) => new Date(value).toLocaleString("zh-CN");

export function Knowledge({ state, adoptState, notify }) {
  const sources = state.connections?.knowledgeSources || [];
  const [selectedId, setSelectedId] = useState("");
  const selected =
    sources.find((source) => source.id === selectedId) || sources[0];
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [selections, setSelections] = useState([]);
  const previousSources = useRef(sources);
  useEffect(() => {
    const previous = previousSources.current;
    setSelections((current) =>
      current.filter((selection) => {
        const before = previous.find(
          (source) => source.id === selection.sourceId,
        );
        const after = sources.find(
          (source) => source.id === selection.sourceId,
        );
        return (
          before &&
          after &&
          before.generation === after.generation &&
          before.root === after.root &&
          before.identity === after.identity
        );
      }),
    );
    previousSources.current = sources;
  }, [state.connections?.knowledgeSources]);
  const lock = useRef(false),
    sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  async function mutate(mode, input) {
    if (lock.current || pending) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy(mode);
    setError("");
    setDialog((current) => current && { ...current, input });
    try {
      const next = await request(
        `/knowledge/${mode}`,
        { ...input, confirmed: true, expectedRevision: state.revision },
        "POST",
        false,
      );
      if (ticket !== sequence.current) return;
      adoptState(next);
      setEpoch((value) => value + 1);
      if (mode === "connect")
        setSelectedId(
          next.connections.knowledgeSources.find(
            (source) => !sources.some((existing) => existing.id === source.id),
          )?.id || "",
        );
      setDialog(null);
      notify(
        mode === "remove"
          ? "已断开连接，源文件未改动"
          : mode === "reconfirm"
            ? "目录已重新确认，请重新扫描"
            : "知识源已连接，尚未扫描",
      );
    } catch (failure) {
      if (ticket !== sequence.current) return;
      setError(failure.message);
      // A lost response may follow a completed write. Never offer a blind replay.
      if (!failure.status || failure.status === 409) setPending(true);
    } finally {
      if (ticket === sequence.current) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy("refresh");
    try {
      const next = await request("/workspace");
      if (ticket !== sequence.current) return;
      adoptState(next);
      setPending(false);
      setError("");
      setEpoch((value) => value + 1);
      setDialog((current) => {
        if (!current) return null;
        const connected = next.connections?.knowledgeSources || [];
        if (current.mode === "connect")
          return connected.some((source) => source.root === current.input?.root)
            ? null
            : current;
        const source = connected.find(
          (source) => source.id === current.source.id,
        );
        return !source || source.generation !== current.source.generation
          ? null
          : { ...current, source };
      });
      notify("连接状态已刷新，请核对列表");
    } catch (failure) {
      if (ticket === sequence.current) setError(failure.message);
    } finally {
      if (ticket === sequence.current) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  function open(mode, source) {
    setError("");
    setDialog({ mode, source });
  }
  function addSelection(selection) {
    if (
      selections.some(
        (item) =>
          item.sourceId === selection.sourceId && item.path === selection.path,
      )
    ) {
      notify("此资料已加入整理");
      return;
    }
    if (selections.length >= 5) {
      notify("每个整理任务最多选择 5 份资料", "warning");
      return;
    }
    setSelections((current) => [...current, selection]);
    notify("已加入整理资料");
  }
  return (
    <>
      <PageHeading
        page="knowledge"
        action={
          <Button disabled={!!busy || pending} onClick={() => open("connect")}>
            <Plus size={16} />
            连接知识源
          </Button>
        }
      />
      <div className="knowledge-meta">
        <Badge tone="muted">仅限本机</Badge>
        <span>飞书知识库 · 未接入</span>
        <Button secondary disabled={!!busy} onClick={refresh}>
          <RefreshCw size={16} />
          {busy === "refresh" ? "核对中…" : "刷新连接核对"}
        </Button>
      </div>
      {pending && (
        <p className="inline-error" role="status">
          操作结果待核对。请刷新连接核对后再操作，不要重复提交。
        </p>
      )}
      {error && !dialog && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <KnowledgeSteps
        sources={sources.length}
        tasks={(state.knowledgeTasks || []).filter((t) => !t.archived).length}
      />
      <div id="k-sources" className="knowledge-anchor" />
      {!sources.length ? (
        <Empty icon={BookOpen} title="尚未连接知识源">
          选择一个具体的 Obsidian 或 Markdown 目录，只读连接。工作台只保存位置指针，不复制正文。
        </Empty>
      ) : (
        <div className="knowledge-layout">
          <nav className="knowledge-sources" aria-label="知识源">
            {sources.map((source) => (
              <button
                key={source.id}
                className="knowledge-source"
                aria-pressed={source.id === selected?.id}
                onClick={() => setSelectedId(source.id)}
              >
                <BookOpen size={18} />
                <span>
                  <strong>{source.name}</strong>
                  <small>
                    {source.kind === "obsidian" ? "Obsidian" : "Markdown"}
                  </small>
                  <span className="knowledge-path">{source.root}</span>
                </span>
              </button>
            ))}
          </nav>
          {selected && (
            <KnowledgeSource
              key={`${selected.id}:${selected.generation}:${epoch}`}
              source={selected}
              blocked={!!busy || pending}
              notify={notify}
              onManage={(mode) => open(mode, selected)}
              selections={selections}
              onAddSelection={addSelection}
            />
          )}
        </div>
      )}
      <div id="k-compile" className="knowledge-anchor" />
      <KnowledgeCompilation
        state={state}
        adoptState={adoptState}
        notify={notify}
        selections={selections}
        setSelections={setSelections}
        epoch={epoch}
        blocked={!!busy || pending}
      />
      {dialog && (
        <Dialog
          title={
            dialog.mode === "connect"
              ? "连接知识源"
              : dialog.mode === "remove"
                ? "断开知识源"
                : "重新确认目录"
          }
          onClose={() => {
            if (!lock.current) setDialog(null);
          }}
        >
          <KnowledgeForm
            mode={dialog.mode}
            source={dialog.source}
            busy={busy}
            pending={pending}
            error={error}
            onSubmit={(input) => mutate(dialog.mode, input)}
            onRefresh={refresh}
            onCancel={() => setDialog(null)}
          />
        </Dialog>
      )}
    </>
  );
}

function KnowledgeForm({
  mode,
  source,
  busy,
  pending,
  error,
  onSubmit,
  onRefresh,
  onCancel,
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("obsidian");
  const [root, setRoot] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const submit =
    mode === "connect"
      ? "确认连接"
      : mode === "remove"
        ? "确认断开"
        : "确认重新连接";
  return (
    <form
      className="asset-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (confirmed)
          onSubmit(
            mode === "connect" ? { name, kind, root } : { sourceId: source.id },
          );
      }}
    >
      {mode === "connect" ? (
        <>
          <label>
            来源名称
            <input
              required
              maxLength={100}
              value={name}
              disabled={!!busy || pending}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            来源类型
            <select
              value={kind}
              disabled={!!busy || pending}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="obsidian">Obsidian</option>
              <option value="markdown">Markdown 目录</option>
            </select>
          </label>
          <label>
            目录绝对路径
            <input
              required
              value={root}
              disabled={!!busy || pending}
              placeholder="/Users/你的用户名/指定知识目录"
              onChange={(event) => setRoot(event.target.value)}
            />
          </label>
          <p className="detail-footnote">
            只保存来源指针。连接后由你扫描文件；不复制正文、不读取聊天或凭据。
          </p>
        </>
      ) : (
        <>
          <strong>{source.name}</strong>
          <code className="knowledge-path">{source.root}</code>
          <p className="detail-footnote">
            {mode === "remove"
              ? "仅移除工作台连接，源文件不删除、不修改。"
              : "确认当前路径下的目录仍是你允许读取的知识源。旧扫描将失效。"}
          </p>
        </>
      )}
      <label className="knowledge-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!!busy || pending}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          {mode === "remove"
            ? "我确认仅断开连接，不删除源文件"
            : "我确认仅只读访问此目录"}
        </span>
      </label>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {pending && <p role="status">操作结果待核对，请先刷新连接核对。</p>}
      <div className="heading-actions">
        <Button type="button" secondary disabled={!!busy} onClick={onCancel}>
          取消
        </Button>
        {pending ? (
          <Button type="button" disabled={!!busy} onClick={onRefresh}>
            刷新连接核对
          </Button>
        ) : (
          <Button type="submit" disabled={!!busy || !confirmed}>
            {busy ? "处理中…" : submit}
          </Button>
        )}
      </div>
    </form>
  );
}

function KnowledgeSource({
  source,
  blocked,
  onManage,
  notify,
  selections,
  onAddSelection,
}) {
  const [scan, setScan] = useState(null),
    [query, setQuery] = useState("");
  const [document, setDocument] = useState(null),
    [selectedPath, setSelectedPath] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [fallback, setFallback] = useState("");
  const [mode, setMode] = useState("files");
  const [keyword, setKeyword] = useState("");
  const [matches, setMatches] = useState(null);
  const sequence = useRef(0),
    lock = useRef(false),
    previewRef = useRef(null);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  useEffect(() => {
    if (!scan) return;
    const timer = setTimeout(
      () => {
        sequence.current++;
        lock.current = false;
        setBusy("");
        setExpired(true);
        setDocument(null);
        setMatches(null);
        setReceipt("");
        setFallback("");
      },
      Math.max(0, Date.parse(scan.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [scan]);
  useEffect(() => {
    if (document) previewRef.current?.focus();
  }, [document]);
  useEffect(() => {
    if (!blocked) return;
    sequence.current++;
    lock.current = false;
    setBusy("");
    setScan(null);
    clearQuery();
  }, [blocked]);
  const files =
    scan?.files.filter((file) =>
      file.path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ) || [];
  function clearQuery() {
    setMatches(null);
    setDocument(null);
    setSelectedPath("");
    setReceipt("");
    setFallback("");
  }
  function changeQuery(value) {
    sequence.current++;
    lock.current = false;
    setBusy("");
    setError("");
    clearQuery();
    setKeyword(value);
  }
  function changeMode(value) {
    if (mode === value) return;
    changeQuery(keyword);
    setMode(value);
  }
  async function search(continuing = false) {
    if (lock.current || blocked || !scan || expired) return;
    const text = keyword.trim();
    if (!text || text.length > 100 || /[\r\n\x00-\x1f\x7f]/.test(text)) {
      clearQuery();
      setError("请输入 1–100 个字符的单行短语，不使用控制字符。");
      return;
    }
    const previous = continuing ? matches : null;
    if (continuing && previous?.nextOffset == null) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy("search");
    setError("");
    if (!continuing) clearQuery();
    try {
      const result = await request(
        "/knowledge/search",
        {
          sourceId: source.id,
          scanId: scan.scanId,
          query: text,
          offset: previous?.nextOffset ?? 0,
        },
        "POST",
        false,
      );
      if (ticket !== sequence.current) return;
      setMatches({
        ...result,
        attempted: (previous?.attempted || 0) + result.attempted,
        read: (previous?.read || 0) + result.read,
        bytes: (previous?.bytes || 0) + result.bytes,
        results: [...(previous?.results || []), ...result.results],
        issues: [...(previous?.issues || []), ...result.issues],
      });
    } catch (failure) {
      if (ticket !== sequence.current) return;
      clearQuery();
      setError(failure.message);
      if (failure.status === 409) setScan(null);
    } finally {
      if (ticket === sequence.current) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  async function run(action, path, expectedHash) {
    if (lock.current || blocked) return;
    lock.current = true;
    const ticket = ++sequence.current;
    const active = () => ticket === sequence.current;
    setBusy(action);
    setError("");
    setReceipt("");
    setFallback("");
    if (action === "scan") {
      clearQuery();
      setScan(null);
      setDocument(null);
      setSelectedPath("");
      setExpired(false);
    } else if (action === "read") {
      setDocument(null);
      setSelectedPath(path);
    }
    try {
      if (action === "scan") {
        const result = await request("/knowledge/scan", {
          sourceId: source.id,
        });
        if (active()) setScan(result);
      } else {
        const result = await request("/knowledge/read", {
          sourceId: source.id,
          scanId: scan.scanId,
          path,
        });
        if (!active()) return;
        if (expectedHash && result.sha256 !== expectedHash)
          throw new Error("原文已变化，旧查询结果已撤回。请重新扫描并查询。");
        setDocument(result);
        if (action === "copy") {
          const text = `# 本机知识来源\n来源：${result.sourceName}\n目录：${result.root}\n相对路径：${result.path}\n原文 SHA-256：${result.sha256}\n文件修改于：${result.modifiedAt}\n核对于：${result.readAt}\n仅限本机；不含正文，未发送给 Agent。`;
          try {
            await navigator.clipboard.writeText(text);
            if (active()) {
              setReceipt("来源指针已复制 · 不含正文");
              notify("来源指针已复制");
            }
          } catch {
            if (active()) {
              setFallback(text);
              setError("复制失败，请手动选择来源指针。此文本不含正文。");
            }
          }
        }
      }
    } catch (failure) {
      if (active()) {
        setError(failure.message);
        setDocument(null);
        setMatches(null);
        setScan(null);
        setSelectedPath("");
      }
    } finally {
      if (active()) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  return (
    <section className="knowledge-workspace" aria-label="知识源内容">
      <header className="knowledge-source-heading">
        <div>
          <h2>{source.name}</h2>
          <p className="knowledge-path">{source.root}</p>
        </div>
        <Badge tone="muted">只读连接</Badge>
      </header>
      <div className="heading-actions">
        <Button disabled={!!busy || blocked} onClick={() => run("scan")}>
          <RefreshCw size={16} />
          {busy === "scan" ? "扫描中…" : scan ? "重新扫描" : "扫描文件"}
        </Button>
        <Button
          secondary
          disabled={!!busy || blocked}
          onClick={() => onManage("reconfirm")}
        >
          <Link2 size={15} />
          重新确认目录
        </Button>
        <Button
          secondary
          disabled={!!busy || blocked}
          onClick={() => onManage("remove")}
        >
          <Unplug size={15} />
          断开连接
        </Button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {busy === "scan" ? (
        <p role="status" className="detail-footnote">
          正在扫描 Markdown 文件名与路径，不读取正文…
        </p>
      ) : !scan ? (
        <p role="status" className="detail-footnote">
          尚未扫描 · 点击扫描文件后查询。
        </p>
      ) : (
        <>
          <div className="knowledge-scan-status" role="status">
            <Badge
              tone={scan.status === "partial" || expired ? "orange" : "muted"}
            >
              {expired
                ? "扫描已过期"
                : scan.status === "partial"
                  ? "部分扫描"
                  : "扫描完成"}
            </Badge>
            <span>
              {scan.files.length} 份 Markdown · {date(scan.at)}
            </span>
          </div>
          {expired ? (
            <p className="detail-footnote">请重新扫描后查看当前原文。</p>
          ) : (
            <>
              {scan.status === "partial" && (
                <p className="detail-footnote">
                  结果不完整，未列出的文件不代表不存在。
                </p>
              )}
              {!!scan.issues?.length && (
                <details className="knowledge-issues">
                  <summary>查看扫描提示（{scan.issues.length}）</summary>
                  {scan.issues.map((issue, index) => (
                    <p key={index}>
                      <code>{issue.path}</code> · {issue.message}
                    </p>
                  ))}
                </details>
              )}
              <div
                className="heading-actions"
                role="group"
                aria-label="查询方式"
              >
                <Button
                  type="button"
                  secondary={mode !== "files"}
                  aria-pressed={mode === "files"}
                  disabled={blocked}
                  onClick={() => changeMode("files")}
                >
                  文件列表
                </Button>
                <Button
                  type="button"
                  secondary={mode !== "content"}
                  aria-pressed={mode === "content"}
                  disabled={blocked}
                  onClick={() => changeMode("content")}
                >
                  正文查询
                </Button>
              </div>
              {mode === "content" ? (
                <>
                  <form
                    className="knowledge-query-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      search();
                    }}
                  >
                    <label className="knowledge-search">
                      <Search size={17} />
                      <input
                        aria-label="正文关键词"
                        type="search"
                        value={keyword}
                        placeholder="输入正文短语"
                        onChange={(event) => changeQuery(event.target.value)}
                      />
                    </label>
                    <Button
                      type="submit"
                      disabled={!!busy || blocked || !keyword.trim()}
                    >
                      {busy === "search" ? "查询中…" : "查询正文"}
                    </Button>
                  </form>
                  <p className="detail-footnote">
                    按字面短语匹配，不区分大小写。仅在点击查询或继续时读取正文。
                  </p>
                  {matches ? (
                    <KnowledgeMatches
                      matches={matches}
                      busy={!!busy || blocked}
                      selectedPath={selectedPath}
                      onContinue={() => search(true)}
                      onRead={(result) =>
                        run("read", result.path, result.sha256)
                      }
                    />
                  ) : busy === "search" ? (
                    <p role="status" className="detail-footnote">
                      正在查询当前扫描范围…
                    </p>
                  ) : (
                    <p role="status" className="detail-footnote">
                      尚未查询正文
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label className="knowledge-search">
                    <Search size={17} />
                    <input
                      aria-label="按文件名或路径筛选"
                      type="search"
                      value={query}
                      placeholder="按文件名或路径筛选"
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <div className="knowledge-files" aria-label="扫描结果">
                    {!files.length ? (
                      <p className="knowledge-empty">
                        {query.trim()
                          ? "没有匹配的文件名或路径"
                          : "此目录未发现可读取的 Markdown"}
                      </p>
                    ) : (
                      files.map((file) => (
                        <button
                          key={file.path}
                          className="knowledge-file"
                          aria-label={file.path}
                          aria-pressed={selectedPath === file.path}
                          disabled={!!busy || blocked}
                          onClick={() => run("read", file.path)}
                        >
                          <FileText size={17} />
                          <span className="knowledge-path">{file.path}</span>
                          <small>{Math.ceil(file.bytes / 1024)} KiB</small>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
      {busy === "read" && <p role="status">正在读取所选原文…</p>}
      {document && (
        <section
          className="knowledge-preview"
          tabIndex={-1}
          ref={previewRef}
          aria-label="原文预览"
        >
          <div className="knowledge-preview-heading">
            <h3>原文预览</h3>
            <div className="heading-actions">
              <Button
                disabled={
                  !!busy ||
                  blocked ||
                  expired ||
                  selections.some(
                    (item) =>
                      item.sourceId === source.id &&
                      item.path === document.path,
                  )
                }
                onClick={() =>
                  onAddSelection({
                    sourceId: source.id,
                    scanId: scan.scanId,
                    path: document.path,
                    expectedSha256: document.sha256,
                  })
                }
              >
                <Plus size={15} />
                {selections.some(
                  (item) =>
                    item.sourceId === source.id && item.path === document.path,
                )
                  ? "已加入整理"
                  : "加入整理"}
              </Button>
              <Button
                secondary
                disabled={!!busy || blocked || expired}
                onClick={() => run("copy", document.path, document.sha256)}
              >
                <Copy size={15} />
                {busy === "copy" ? "核对来源…" : "复制来源指针"}
              </Button>
            </div>
          </div>
          <strong className="knowledge-path">{document.path}</strong>
          <small>
            修改于 {date(document.modifiedAt)} · 读取于 {date(document.readAt)}
          </small>
          <pre
            className="context-source knowledge-original"
            tabIndex={0}
            aria-label="Markdown 原文"
          >
            {document.content}
          </pre>
          <details className="knowledge-issues">
            <summary>来源校验</summary>
            <code className="context-hash">SHA-256 · {document.sha256}</code>
          </details>
          <p className="detail-footnote">
            纯文本只读预览 · 正文不入库，不执行嵌入内容
          </p>
        </section>
      )}
      {receipt && (
        <p role="status" className="context-receipt">
          {receipt}
        </p>
      )}
      {fallback && (
        <label className="knowledge-fallback">
          来源指针文本
          <textarea
            readOnly
            rows={8}
            value={fallback}
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
    </section>
  );
}

function KnowledgeMatches({ matches, busy, selectedPath, onContinue, onRead }) {
  const remaining = matches.nextOffset !== null;
  const incomplete =
    matches.scanStatus === "partial" || matches.issues.length > 0;
  return (
    <div className="knowledge-query-results">
      <div className="knowledge-query-coverage" role="status">
        <strong>
          已检查 {matches.attempted} / {matches.total} 份文件
        </strong>
        <span>
          {matches.results.length} 份命中 ·{" "}
          {remaining
            ? "还有文件待查询"
            : incomplete
              ? "部分范围已查询"
              : "查询完成"}
        </span>
      </div>
      {matches.scanStatus === "partial" && (
        <p className="detail-footnote">
          仅查询本次部分扫描的文件，不代表整个知识源。
        </p>
      )}
      {!matches.results.length && (
        <p className="knowledge-empty">
          {remaining
            ? "当前批次未命中，仍有文件待查询"
            : incomplete
              ? "可查询范围内未命中；仍有文件未覆盖或读取失败"
              : "当前扫描范围内未找到该短语"}
        </p>
      )}
      {matches.results.map((result) => (
        <article className="knowledge-query-result" key={result.path}>
          <button
            type="button"
            className="knowledge-result-open"
            aria-label={`查看原文：${result.path}`}
            aria-pressed={selectedPath === result.path}
            disabled={busy}
            onClick={() => onRead(result)}
          >
            <FileText size={17} />
            <span className="knowledge-path">{result.path}</span>
            <span>查看原文</span>
          </button>
          {result.snippets.map((snippet) => (
            <div className="knowledge-snippet" key={snippet.line}>
              <span className="knowledge-line">第 {snippet.line} 行</span>
              <p>
                {snippet.text.slice(0, snippet.matchStart)}
                <mark>
                  {snippet.text.slice(snippet.matchStart, snippet.matchEnd)}
                </mark>
                {snippet.text.slice(snippet.matchEnd)}
              </p>
            </div>
          ))}
        </article>
      ))}
      {!!matches.issues.length && (
        <details className="knowledge-issues">
          <summary>查看查询提示（{matches.issues.length}）</summary>
          {matches.issues.map((issue, index) => (
            <p key={index}>
              <code>{issue.path}</code> · {issue.message}
            </p>
          ))}
        </details>
      )}
      {remaining && (
        <Button secondary disabled={busy} onClick={onContinue}>
          {busy ? "查询中…" : "继续查询"}
        </Button>
      )}
    </div>
  );
}

// 知识工作流总览：四个阶段、各自的权限边界与真实计数；点击跳到对应区域。
function KnowledgeSteps({ sources, tasks }) {
  const steps = [
    ["k-sources", "连接", `${sources} 个知识源`, "只读 · 只存位置指针"],
    ["k-sources", "查询", sources ? "按文件名或正文短语" : "连接后可用", "只读 · 不复制正文"],
    ["k-compile", "整理", `${tasks} 个进行中任务`, "交给本人 Codex · 手动回传候选"],
    ["k-maintain", "维护", "检查来源是否变化", "确认后才写入“00 待整理”"],
  ];
  return (
    <ol className="knowledge-steps" aria-label="知识工作流">
      {steps.map(([anchor, name, fact, rule], i) => (
        <li key={name}>
          <button
            type="button"
            onClick={() =>
              document
                .getElementById(anchor)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <span className="knowledge-step-index">{String(i + 1).padStart(2, "0")}</span>
            <strong>{name}</strong>
            <span>{fact}</span>
            <small>{rule}</small>
          </button>
        </li>
      ))}
    </ol>
  );
}
