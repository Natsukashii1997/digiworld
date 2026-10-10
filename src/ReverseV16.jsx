import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Plus,
  Copy,
  ArrowRight,
  Check,
  ChevronsLeftRight,
  Trash2,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  AppWindow,
  Workflow,
  BadgeCheck,
  CircleCheck,
  CircleX,
  Hourglass,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import { PageHeading, Button, Dialog } from "./components.jsx";
import { RecordPanel, MaterialForm } from "./ReverseEngineering.jsx";
import { copy } from "./Assets.jsx";
import { generateRecipeSkill } from "./reverse-skill.js";
import { makeAsset } from "./store.js";
import { request } from "./api.js";
import { uid, now, current } from "./store.js";
import { deleteRecord, restoreRecord, recordsOf } from "./reverse.js";
import { AgentSprite, useReducedMotion } from "./v14.jsx";
import { characterOf, castOf } from "./characters.js";
import { Pixel } from "./pixel.jsx";
import {
  RECIPE_TYPES,
  RECIPE_AGENTS,
  SCORE_FIELDS,
  BLOCK_LABELS,
  createSpecimen,
  specimenRows,
  recipeOf,
  recipeThreshold,
  buildRecipeTask,
  parseRecipeReply,
  prepareReplica,
  confirmReplica,
  currentVerification,
  scoreReplica,
  replicaMatches,
  taskMedia,
} from "./reverse-recipe.js";
import "./reverse-v16.css";
// 单一真实动作在窄屏固定到底部，保留原位置占位，避免复制两个状态入口。
function StepButton({ children, ...props }) {
  return <span className="reverse-step-slot"><Button {...props}>{children}</Button></span>;
}
const names = {
  codex: "Codex",
  "claude-code": "Claude Code",
  hermes: "Hermes",
  openclaw: "OpenClaw",
  doubao: "豆包工作",
};
const icons = { TXT: FileText, IMG: ImageIcon, WEB: AppWindow, FN: Workflow };
const markClass = { 观察: "obs", 推断: "inf", 已验证: "ver" };
const day = (v) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
      })
    : "";
const short = (r) => "RE-" + r.id.replaceAll("-", "").slice(0, 4).toUpperCase();
const source = (r) => {
  if (r.material?.url) {
    try {
      return new URL(r.material.url).hostname;
    } catch {
      return "链接无效";
    }
  }
  return r.referenceMedia?.length
    ? `本机截图${r.referenceMedia.length > 1 ? " ×" + r.referenceMedia.length : ""}`
    : "本机文字";
};
const actual = (r) =>
  [r.replicaDraft, ...[...(r.replicas || [])].reverse()].find(
    (a) => a && replicaMatches(r, a),
  );
function chooseKey(e, choices, value, setValue) {
  const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
    e.key
  ];
  if (delta === undefined && !["Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const index =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? choices.length - 1
        : (choices.indexOf(value) + delta + choices.length) % choices.length;
  setValue(choices[index]);
  e.currentTarget.parentElement
    .querySelectorAll("[role=radio]")
    [index]?.focus();
}
function Media({ media, alt, className = "art" }) {
  const [dims, setDims] = useState(null);
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      objectURL;
    setUrl("");
    setError("");
    request("/reverse/media/read", media)
      .then((r) => {
        objectURL = URL.createObjectURL(new Blob([r.data], { type: r.type }));
        if (alive) setUrl(objectURL);
        else URL.revokeObjectURL(objectURL);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [media.path, media.sha256]);
  return error ? (
    <p role="alert">{error}</p>
  ) : url ? (
    <img
      className={className}
      src={url}
      alt={alt}
      onLoad={(e) =>
        setDims([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])
      }
      style={
        dims && !className.includes("web")
          ? { width: `min(100%, ${(dims[0] * 420) / dims[1]}px)` }
          : undefined
      }
    />
  ) : (
    <div
      className="await"
      aria-label={alt + "读取中"}
      style={{ minHeight: 120 }}
    >
      读取本机图片…
    </div>
  );
}
function Artifact({ type, artifact, label }) {
  if (artifact.media?.length)
    return type === "FN" ? (
      <div className="frames">
        {artifact.media.map((m, i) => (
          <Media
            key={m.path}
            media={m}
            alt={label + " " + (i + 1)}
            className="art"
          />
        ))}
      </div>
    ) : (
      <Media
        media={artifact.media[0]}
        alt={label}
        className={"art" + (type === "WEB" ? " web" : "")}
      />
    );
  if (artifact.html)
    return (
      <iframe
        title={label + "网页预览"}
        className="art web re-html"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={
          '<meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; style-src &apos;unsafe-inline&apos;; img-src data:; script-src &apos;none&apos;; form-action &apos;none&apos;; base-uri &apos;none&apos;">' +
          artifact.html
        }
      />
    );
  return (
    <div className="specimen-txt">
      <span className="en">{label}</span>
      {artifact.text ? (
        artifact.text.split("\n\n").map((p, i) => <p key={i}>{p}</p>)
      ) : (
        <p>只有来源链接，未抓取正文。</p>
      )}
    </div>
  );
}
function Compare({ record, attempt }) {
  const reduced = useReducedMotion(),
    [value, setValue] = useState(50),
    [side, setSide] = useState("original"),
    [overlay, setOverlay] = useState(false);
  const pair = useRef(null);
  const original = {
    text: record.material.text,
    html: "",
    media: record.referenceMedia || [],
  };
  const drag = (e) => {
    const rect = pair.current.getBoundingClientRect();
    setOverlay(true);
    setValue(
      Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
    );
  };
  return (
    <>
      <div className="compare-switch" aria-label="对照视图">
        {[
          ["original", "原件"],
          ["replica", "复刻"],
        ].map(([id, label]) => (
          <button
            key={id}
            className="text-btn"
            aria-pressed={side === id}
            onClick={() => setSide(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        ref={pair}
        className={
          "pair" +
          (reduced ? " reduced" : "") +
          (overlay && !reduced ? " overlay" : "")
        }
        data-side={side}
        style={{ "--split": value + "%" }}
      >
        <figure>
          <figcaption>
            <span className="en">ORIGINAL</span>原件
          </figcaption>
          <Artifact
            type={record.type || "TXT"}
            artifact={original}
            label="原件"
          />
        </figure>
        <label
            hidden={reduced}
            className="slider"
            style={{ left: value + "%" }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag(e);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e);
            }}
            onPointerUp={(e) =>
              e.currentTarget.releasePointerCapture(e.pointerId)
            }
          >
            <ChevronsLeftRight size={18} />
            <input
              aria-label="拖动对照手柄"
              type="range"
              disabled={reduced}
              min="0"
              max="100"
              value={value}
              onChange={(e) => {
                setOverlay(true);
                setValue(+e.target.value);
              }}
            />
          </label>
        <figure>
          <figcaption>
            <span className="en">REPLICA</span>复刻 · 只凭配方
          </figcaption>
          {attempt ? (
            <Artifact
              type={record.type}
              artifact={attempt.artifact}
              label="复刻"
            />
          ) : (
            <div className="await" style={{ minHeight: 240 }}>
              <Hourglass size={32} aria-hidden="true" />
              <span>等待复刻产物</span>
            </div>
          )}
        </figure>
      </div>
    </>
  );
}
function Dispatch({ record, phase, notify, onCopied }) {
  const [agent, setAgent] = useState("codex"),
    [media, setMedia] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const selected = characterOf(agent)?.name || names[agent],
    title = { reverse: "逆推", replica: "复刻", variation: "举一反三" }[phase];
  const requested = taskMedia(record, phase);
  const key = JSON.stringify(requested);
  useEffect(() => {
    let alive = true;
    setMedia(null);
    setError("");
    if (!requested.length) {
      setMedia([]);
      return;
    }
    request("/reverse/media/locate", { media: requested })
      .then((r) => {
        if (alive) setMedia(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [key]);
  const paths = new Map((media || []).map((m) => [m.path, m.localPath]));
  const prompt = buildRecipeTask(record, phase, Object.fromEntries(paths));
  return (
    <div className="re-launch">
      <div className="pick" role="radiogroup" aria-label={title + "任务的伙伴"}>
        {RECIPE_AGENTS.map((id) => (
          <button
            className={"pk" + (agent === id ? " on" : "")}
            key={id}
            role="radio"
            aria-checked={agent === id}
            tabIndex={agent === id ? 0 : -1}
            onKeyDown={(e) => chooseKey(e, RECIPE_AGENTS, agent, setAgent)}
            style={{ "--hue": castOf(id)?.hue || "140,178,255" }}
            onClick={() => setAgent(id)}
          >
            <span className={"pk-av" + (id === "doubao" ? " txt" : "")}>
              {id === "doubao" ? "豆" : <AgentSprite agent={id} mode="body" />}
            </span>
            {characterOf(id)?.name || names[id]}
          </button>
        ))}
      </div>
      <details className="pack">
        <summary>
          <Copy size={14} />
          {title}任务包{" "}
          <b>
            {prompt.length.toLocaleString()} 字 · 附{requested.length}路径
          </b>
        </summary>
        <pre className="code">{prompt}</pre>
      </details>
      {requested.length > 0 && (
        <div className="hint">
          {agent === "claude-code" || agent === "doubao"
            ? `需要你把 ${requested.length} 张截图一起拖进对话框`
            : `任务包已附 ${requested.length} 张截图的本机路径`}
          {requested.map((m, i) => (
            <button
              className="text-btn"
              key={m.path + i}
              onClick={async () => {
                try {
                  await request("/reverse/media/locate", { media: [m] });
                  await request("/storage/reveal", { path: m.path });
                  notify("已请求访达显示；请查看访达");
                } catch (e) {
                  notify(e.message, "error");
                }
              }}
            >
              <FolderOpen size={14} />
              在访达中显示{i + 1}
            </button>
          ))}
        </div>
      )}
      {record.type === "IMG" && phase !== "reverse" && agent !== "doubao" && (
        <p className="hint">
          此伙伴能否生成图片尚未确认；需要支持生图的工具返回实际图片，再由你投入。当前选择已保留。
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="bench-bar">
        <span className="hint">会复制任务包；到 {names[agent]} 里粘贴发送</span>
        <StepButton
          className="go"
          disabled={busy || media === null}
          onClick={async () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            try {
              if (await copy(prompt, notify)) await onCopied?.(agent, prompt);
            } catch (e) {
              setError(e.message);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <Copy size={16} />把{title}任务交给 <b>{selected}</b>
          <ArrowRight size={16} />
        </StepButton>
      </div>
    </div>
  );
}
function Score({ record, attempt, threshold, onConfirm, onDraft, notify }) {
  const [draft, setDraft] = useState(() => structuredClone(attempt)),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const saved = !!attempt.confirmedAt,
    scores = draft.scores,
    checks = draft.checks || [],
    scored = scoreReplica(
      record.type,
      scores,
      checks,
      draft.threshold ?? threshold,
    );
  const change = (next) => {
    setDraft(next);
  };
  const cases = record.recipe?.blocks.flatMap((b) => b.cases || []) || [];
  return (
    <>
      <div className="score">
        <div className="srows">
          {record.type === "FN" && (
            <div className="srow">
              <span className="sdim">
                验收用例 {checks.filter((c) => c.result === true).length} /{" "}
                {checks.length}
              </span>
              <span className="sbar">
                <i style={{ width: (scored.automatic || 0) + "%" }} />
              </span>
              <b className="sval">
                {scored.automatic === null
                  ? "—"
                  : Math.round(scored.automatic) + "%"}
              </b>
            </div>
          )}
          {SCORE_FIELDS[record.type].map(([key, label]) => (
            <div className="srow" key={key}>
              <span className="sdim">{label}</span>
              <span
                className="segs"
                role="radiogroup"
                aria-label={label + " 打分"}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={scores[key] === n}
                    aria-label={label + " " + n + " 分"}
                    className={scores[key] >= n ? "on" : ""}
                    disabled={saved}
                    tabIndex={n === (scores[key] || 1) ? 0 : -1}
                    onClick={() =>
                      change({ ...draft, scores: { ...scores, [key]: n } })
                    }
                    onKeyDown={(e) => {
                      if (
                        [
                          "ArrowLeft",
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowDown",
                        ].includes(e.key)
                      ) {
                        e.preventDefault();
                        const value = Math.min(
                          5,
                          Math.max(
                            1,
                            n +
                              (["ArrowRight", "ArrowUp"].includes(e.key)
                                ? 1
                                : -1),
                          ),
                        );
                        change({
                          ...draft,
                          scores: { ...scores, [key]: value },
                        });
                        e.currentTarget.parentElement.children[
                          value - 1
                        ].focus();
                      }
                    }}
                  />
                ))}
              </span>
              <b className="sval">{scores[key] ?? "—"}</b>
            </div>
          ))}
        </div>
        <div
          className={
            "stotal" +
            (scored.complete ? (scored.passed ? " pass" : " fail") : "")
          }
        >
          <span className="en">SCORE</span>
          <b>
            {scored.total === null ? "—" : Math.floor(scored.total)}
            <small>%</small>
          </b>
          <span className="sline">达标线 {draft.threshold ?? threshold}%</span>
          {saved ? (
            <span
              className={"verdict-chip " + (scored.passed ? "pass" : "fail")}
            >
              <BadgeCheck size={16} />
              {scored.passed ? "达标" : "未达标"}
            </span>
          ) : (
            <StepButton
              disabled={saved || !scored.complete || busy}
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                try {
                  await onConfirm(draft);
                } catch (e) {
                  notify(e.message, "error");
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              <BadgeCheck size={16} />
              {saved
                ? scored.passed
                  ? "已确认：达标"
                  : "已确认：未达标"
                : scored.passed
                  ? "确认：达标"
                  : "确认：未达标"}
            </StepButton>
          )}
        </div>
      </div>
      {record.type === "FN" && !saved && (
        <details className="pack" open>
          <summary>逐条检查复刻用例</summary>
          <ul className="cases editable">
            {cases.map((c) => {
              const result = checks.find((v) => v.id === c.id)?.result;
              return (
                <li
                  key={c.id}
                  className={
                    result === true ? "ok" : result === false ? "no" : ""
                  }
                >
                  <span className="mono">{c.id}</span>
                  <span>{c.text}</span>
                  <select
                    aria-label={c.id + " 验收结果"}
                    disabled={saved}
                    value={
                      result === null || result === undefined
                        ? ""
                        : String(result)
                    }
                    onChange={(e) =>
                      change({
                        ...draft,
                        checks: checks.map((v) =>
                          v.id === c.id
                            ? {
                                ...v,
                                result:
                                  e.target.value === ""
                                    ? null
                                    : e.target.value === "true",
                              }
                            : v,
                        ),
                      })
                    }
                  >
                    <option value="">未检查</option>
                    <option value="true">通过</option>
                    <option value="false">未通过</option>
                  </select>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {saved && draft.note && <p className="judge-note">{draft.note}</p>}
      <details className="pack">
        <summary>判定说明与复刻记录</summary>
        <div className="re-controls">
          <label>
            判定说明
            <textarea
              disabled={saved}
              value={draft.note}
              onChange={(e) => change({ ...draft, note: e.target.value })}
            />
          </label>
          <p className="mono">
            {draft.at} · {names[draft.agentId]} · {draft.id}
          </p>
          {!saved && (
            <Button secondary onClick={() => onDraft(draft)}>
              保存本次评分草稿
            </Button>
          )}
          {record.replicas?.map((a) => (
            <p key={a.id} className="mono">
              {a.at} · {names[a.agentId]} · {a.total.toFixed(1)}% /{" "}
              {a.threshold}% · {a.conclusion === "passed" ? "达标" : "未达标"} ·{" "}
              {a.note}
            </p>
          ))}
        </div>
      </details>
    </>
  );
}
function Variables({ text }) {
  return String(text)
    .split(/(\{[^{}]+\})/g)
    .map((part, i) =>
      /^\{[^{}]+\}$/.test(part) ? (
        <em key={i}>{part}</em>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    );
}
function Composition({ block }) {
  const t = Object.fromEntries(
    (block.tokens || []).map((t) => [t.name, t.value]),
  );
  if (
    !["width", "height", "circleX", "circleY", "radius", "bandY", "tilt"].every(
      (k) => Number.isFinite(t[k]),
    ) ||
    t.width <= 0 ||
    t.height <= 0
  )
    return <p>{block.text}</p>;
  return (
    <div className="comp">
      <svg
        viewBox={`0 0 ${t.width} ${t.height}`}
        aria-label="由配方令牌绘出的构图示意"
        role="img"
      >
        <rect
          width={t.width}
          height={t.height}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
        />
        <circle
          cx={t.circleX}
          cy={t.circleY}
          r={t.radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
        />
        <path
          d={`M0 ${t.bandY}h${t.width}`}
          stroke="currentColor"
          strokeWidth={15}
          transform={`rotate(${t.tilt} ${t.width / 2} ${t.bandY})`}
        />
      </svg>
      <p>{block.text}</p>
    </div>
  );
}
function Recipe({ record, onPromote }) {
  const recipe = recipeOf(record);
  if (!recipe) return null;
  const attempt =
    [...(record.replicas || [])]
      .reverse()
      .find((a) => replicaMatches(record, a)) || record.replicaDraft;
  const cases = recipe.blocks.flatMap((b) => b.cases || []);
  const negative = recipe.blocks.find((b) => b.kind === "negative");
  const display = recipe.blocks.filter(
    (b) =>
      b.kind !== "negative" &&
      !(recipe.type === "WEB" && b.kind === "motion") &&
      !(recipe.type === "FN" && !["flow", "boundary"].includes(b.kind)),
  );
  const card = (b) => (
    <article
      className={
        "gene" +
        (["prompt", "acceptance"].includes(b.kind) ||
        (recipe.type === "WEB" && b.kind === "components")
          ? " wide"
          : "")
      }
      key={b.id}
    >
      <h3>
        {b.label || BLOCK_LABELS[b.kind]}{" "}
        <span className={"mk " + (markClass[b.mark] || "inf")}>{b.mark}</span>
      </h3>
      {b.palette && (
        <div className="swatches">
          {b.palette.map((c) => (
            <span key={c.name}>
              <i style={{ background: c.value }} />
              <b>{c.value}</b>
              {c.name}
            </span>
          ))}
        </div>
      )}
      {b.kind === "prompt" ? (
        <>
          <pre className="code">
            <Variables text={b.text} />
          </pre>
          {negative && <p className="mono neg">反向提示词：{negative.text}</p>}
        </>
      ) : b.kind === "font" &&
        recipe.type === "IMG" &&
        b.text.includes("\n") ? (
        <>
          <p className="type-sample">{b.text.split("\n")[0]}</p>
          <p className="mono">{b.text.split("\n").slice(1).join("\n")}</p>
        </>
      ) : b.kind === "composition" ? (
        <Composition block={b} />
      ) : recipe.type === "WEB" && b.kind === "components" && recipe.html ? (
        <>
          <pre className="code">
            replica/index.html ·{" "}
            {(new TextEncoder().encode(recipe.html).length / 1024).toFixed(1)}{" "}
            KB · 用上面的令牌写成，可在受控预览里查看
          </pre>
          <details className="pack">
            <summary>查看 HTML 文本与动效参数</summary>
            <p>{b.text}</p>
            <pre className="code">{recipe.html}</pre>
            <p>{recipe.blocks.find((b) => b.kind === "motion")?.text}</p>
          </details>
        </>
      ) : b.text ? (
        <p
          className={
            ["font", "spacing", "colors"].includes(b.kind) ? "mono" : undefined
          }
        >
          {b.text}
        </p>
      ) : null}
      {b.tokens?.length > 0 && b.kind !== "composition" && (
        <p className="mono">
          {b.tokens.map((t) => t.name + " " + t.value + t.unit).join(" · ")}
        </p>
      )}
      {b.cases && (
        <ul className="cases">
          {b.cases.map((c) => (
            <li key={c.id}>
              <span className="mono">{c.id}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
  return (
    <section className="recipe" aria-labelledby="recipe-title">
      <div className="sec-head">
        <h2 id="recipe-title" className="en-head">
          <span className="en">RECIPE</span>配方
          {recipe.type === "FN" ? " · 验收用例" : ""}
        </h2>
        <span className="sec-meta">
          {recipe.type === "FN"
            ? `${(attempt?.checks || []).filter((c) => c.result === true).length} / ${cases.length} 通过`
            : `${recipe.blocks.length} 项`}
        </span>
        {currentVerification(record) &&
          recipe.blocks.some((b) => b.mark !== "已验证") && (
            <button className="text-btn" onClick={onPromote}>
              标为已验证
            </button>
          )}
      </div>
      {recipe.type === "FN" && (
        <ol className="cases">
          {cases.map((c) => {
            const result = attempt?.checks?.find((v) => v.id === c.id)?.result;
            return (
              <li
                key={c.id}
                className={
                  result === true ? "ok" : result === false ? "no" : ""
                }
              >
                {result === true ? (
                  <CircleCheck size={16} />
                ) : result === false ? (
                  <CircleX size={16} />
                ) : (
                  <span aria-hidden="true">○</span>
                )}
                <span className="mono">{c.id}</span>
                <span>{c.text}</span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="genes">{display.map(card)}</div>
      {recipe.type === "WEB" && (
        <details className="pack">
          <summary>组件与动效完整配方</summary>
          <div className="genes">
            {recipe.blocks
              .filter((b) => ["components", "motion"].includes(b.kind))
              .map(card)}
          </div>
        </details>
      )}
      {recipe.type === "FN" && (
        <details className="pack">
          <summary>状态、数据、文案与验收配方</summary>
          <div className="genes">
            {recipe.blocks
              .filter((b) => !["flow", "boundary"].includes(b.kind))
              .map(card)}
          </div>
        </details>
      )}
    </section>
  );
}
function InputDrawer({
  state,
  save,
  notify,
  onClose,
  onCreated,
  referenceOnly = false,
  legacyMode = false,
}) {
  const [type, setType] = useState("TXT"),
    [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [text, setText] = useState(""),
    [why, setWhy] = useState(""),
    [media, setMedia] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function upload(files) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const results = [];
      for (const f of files) {
        if (f.size > 8 * 1024 * 1024) throw Error("单张图片不能超过8 MB");
        results.push(
          await request("/reverse/media", {
            data: new Uint8Array(await f.arrayBuffer()),
          }),
        );
      }
      setMedia((prev) => [
        ...new Map([...prev, ...results].map((m) => [m.path, m])).values(),
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  if (legacyMode)
    return (
      <Dialog title="旧文字候选流程 · 投入素材" drawer onClose={onClose}>
        <section aria-label="逆向工程工作区">
          <MaterialForm
            state={state}
            save={save}
            notify={notify}
            onCreated={(id) => {
              onCreated(id);
              onClose();
            }}
          />
        </section>
      </Dialog>
    );
  return (
    <Dialog
      title={referenceOnly ? "保存参考" : "投入参照物"}
      drawer
      onClose={onClose}
    >
      <form
        className="asset-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            let next;
            if (referenceOnly) {
              const u = new URL(url);
              if (!["http:", "https:"].includes(u.protocol) || !title.trim())
                throw Error("请填写参考名称和http或https链接");
              next = {
                ...state,
                references: [
                  { id: uid(), title: title.trim(), url: u.href, note: why },
                  ...state.references,
                ],
              };
            } else {
              const record = createSpecimen({
                type,
                title,
                text,
                url,
                why,
                media,
              });
              next = {
                ...state,
                reverseRecords: [record, ...recordsOf(state)],
              };
              if (await save(next)) {
                notify("参照物已投入");
                onCreated(record.id);
                onClose();
              }
              return;
            }
            if (await save(next)) {
              notify("参考资料已保存");
              onClose();
            }
          } catch (e) {
            setError(e.message);
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {!referenceOnly && (
          <label>
            参照类型
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {RECIPE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          {referenceOnly ? "参考名称" : "标题"}
          <input
            value={title}
            maxLength={referenceOnly ? 1000 : 120}
            onChange={(e) => setTitle(e.target.value)}
            required={referenceOnly}
          />
        </label>
        <label>
          来源链接
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required={referenceOnly}
          />
          <small>只保存链接，工作台不抓取正文</small>
        </label>
        {!referenceOnly && (
          <>
            <label>
              贴文字
              <textarea
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <div
              className="re-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                upload([...e.dataTransfer.files]);
              }}
            >
              <label>
                拖入本机截图
                <input
                  aria-label="参照截图"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  disabled={busy}
                  onChange={(e) => upload([...e.target.files])}
                />
              </label>
              <small>png / jpg / webp · 单张不超过8 MB · 只存本机</small>
              {media.map((m) => (
                <p key={m.path}>
                  {m.path.slice(0, 29)}… · {m.size} 字节
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() =>
                      setMedia(media.filter((x) => x.path !== m.path))
                    }
                  >
                    移除引用
                  </button>
                </p>
              ))}
            </div>
          </>
        )}
        <label>
          {referenceOnly ? "值得学习的地方" : "你看重的点"}
          <textarea
            value={why}
            maxLength={referenceOnly ? 1000000 : 500}
            onChange={(e) => setWhy(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {referenceOnly ? "保存参考" : "投入参照物"}
        </Button>
      </form>
    </Dialog>
  );
}
function Recover({ record, phase, onSave, onClose, threshold, notify }) {
  const [text, setText] = useState(
      phase === "reverse" ? record.recipeReply || "" : "",
    ),
    [media, setMedia] = useState([]),
    [title, setTitle] = useState(""),
    [agent, setAgent] = useState("codex"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const binding = useRef(record),
    lock = useRef(false);
  async function upload(files) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const results = [];
      for (const f of files) {
        if (f.size > 8 * 1024 * 1024) throw Error("单张图片不能超过8 MB");
        results.push(
          await request("/reverse/media", {
            data: new Uint8Array(await f.arrayBuffer()),
          }),
        );
      }
      setMedia((prev) => [
        ...new Map([...prev, ...results].map((m) => [m.path, m])).values(),
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        phase === "reverse"
          ? "贴回复 · 解析配方"
          : phase === "replica"
            ? "投入复刻产物"
            : "投入举一反三产物"
      }
      drawer
      onClose={onClose}
    >
      <form
        className="asset-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            let next;
            if (phase === "reverse") {
              const parsed = parseRecipeReply(text, record.type);
              if (!parsed.ok) {
                await onSave({ ...record, recipeReply: text });
                throw Error(parsed.error);
              }
              next = { ...record, recipeReply: text, recipe: parsed.recipe };
              if (parsed.issues.length) notify(parsed.issues.join("；"));
            } else {
              const htmls = [...text.matchAll(/```html\s*\n([\s\S]*?)```/g)];
              if (
                htmls.length > 1 ||
                (text.includes("```") &&
                  text
                    .replace(/```html\s*\n([\s\S]*?)```/g, "")
                    .includes("```"))
              )
                throw Error("HTML代码块截断或存在多个结果");
              const html =
                htmls[0]?.[1] ||
                (record.type === "WEB" && text.trim().startsWith("<")
                  ? text
                  : "");
              if (html.length > 100000) throw Error("HTML超过100000字符");
              if (!text.trim() && !media.length) throw Error("请投入实际产物");
              next =
                phase === "replica"
                  ? {
                      ...record,
                      replicaDraft: prepareReplica(binding.current, {
                        agentId: agent,
                        text: html ? "" : text,
                        html,
                        media,
                        threshold,
                      }),
                    }
                  : {
                      ...record,
                      variations: [
                        ...(record.variations || []),
                        {
                          id: uid(),
                          title:
                            title ||
                            "变体 " + ((record.variations?.length || 0) + 1),
                          at: now(),
                          agentId: agent,
                          text: html ? "" : text,
                          html,
                          media,
                        },
                      ],
                    };
            }
            if (await onSave(next)) onClose();
          } catch (e) {
            setError(e.message);
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {phase !== "reverse" && (
          <label>
            完成复刻的伙伴
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              {RECIPE_AGENTS.map((id) => (
                <option key={id} value={id}>
                  {names[id]}
                </option>
              ))}
            </select>
          </label>
        )}
        {phase === "variation" && (
          <label>
            变体标题
            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        )}
        <label>
          {phase === "reverse" ? "伙伴完整回复" : "实际正文或HTML代码块"}
          <textarea
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {phase !== "reverse" && (
          <div
            className="re-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload([...e.dataTransfer.files]);
            }}
          >
            <label>
              实际产物图片
              <input
                aria-label="产物图片"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={busy}
                onChange={(e) => upload([...e.target.files])}
              />
            </label>
            <p>{media.length} 张，只存本机</p>
          </div>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {phase === "reverse" ? "解析并保存配方" : "保存产物"}
        </Button>
      </form>
    </Dialog>
  );
}
export function ReverseV16({ state, save, notify, onSelect }) {
  const rows = specimenRows(state),
    [selected, setSelected] = useState(null),
    [filter, setFilter] = useState("全部"),
    [type, setType] = useState(""),
    [drawer, setDrawer] = useState(""),
    [help, setHelp] = useState(false),
    [recover, setRecover] = useState(""),
    [threshold, setThreshold] = useState(recipeThreshold(state));
  const filtered = rows.filter(
    (r) =>
      (filter === "全部" || r.status === filter) && (!type || r.type === type),
  );
  const active = filtered.find((r) => r.key === selected) || filtered[0],
    raw =
      active && !active.reference
        ? recordsOf(state).find((r) => r.id === active.id)
        : null;
  const recipe = active ? recipeOf(raw || active) : null,
    attempt = raw ? actual(raw) : null,
    verified = raw ? currentVerification(raw) : null;
  async function update(record) {
    return save({
      ...state,
      reverseRecords: recordsOf(state).map((r) =>
        r.id === record.id ? { ...record, updatedAt: now() } : r,
      ),
    });
  }
  const steps = ["投入", "逆推配方", "复刻验证", "举一反三", "炼成 Skill"],
    stage = active?.status === "已炼成" ? 5 : verified ? 4 : recipe ? 2 : 1;
  const beginReference = async () => {
    try {
      const record = createSpecimen({
        type: "TXT",
        title: active.title,
        text: active.material.text,
        url: active.material.url,
        why: "", // 旧长备注完整保留在material.text；不重复塞进500字看重点。
      });
      if (
        await save({ ...state, reverseRecords: [record, ...recordsOf(state)] })
      )
        setSelected("record:" + record.id);
    } catch (e) {
      notify(e.message, "error");
    }
  };
  return (
    <>
      <PageHeading
        page="references"
        help={
          <button
            className="page-help"
            aria-label="逆向工程说明与设置"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        }
        action={
          <Button className="go" onClick={() => setDrawer("input")}>
            <Plus size={17} />
            投入参照物
          </Button>
        }
      />
      <div className="re-layout">
        <aside className="rail" aria-label="标本架">
          <div className="rail-filter" role="group" aria-label="标本状态">
            {[
              "全部",
              "待逆推",
              "待复刻",
              "待判定",
              ...(rows.some((r) => r.status === "已验证") ? ["已验证"] : []),
              "已炼成",
            ].map((label) => (
              <button
                key={label}
                aria-checked={filter === label}
                role="checkbox"
                onClick={() => setFilter(label)}
              >
                {label}
                <span>
                  {label === "全部"
                    ? rows.length
                    : rows.filter((r) => r.status === label).length}
                </span>
              </button>
            ))}
          </div>
          <div className="rail-types" role="group" aria-label="参照类型">
            {RECIPE_TYPES.map((t) => {
              const Icon = icons[t];
              return (
                <button
                  key={t}
                  aria-pressed={type === t}
                  onClick={() => setType(type === t ? "" : t)}
                >
                  <Icon size={14} />
                  <span className="en">{t}</span>
                </button>
              );
            })}
          </div>
          <div className="rail-list" role="radiogroup" aria-label="参照物">
            {filtered.map((r) => {
              const Icon = icons[r.type];
              return (
                <button
                  key={r.key}
                  className={"rec" + (active?.key === r.key ? " on" : "")}
                  role="radio"
                  aria-checked={active?.key === r.key}
                  tabIndex={active?.key === r.key ? 0 : -1}
                  onKeyDown={(e) =>
                    chooseKey(
                      e,
                      filtered.map((x) => x.key),
                      active?.key,
                      setSelected,
                    )
                  }
                  aria-label={`打开逆向记录 ${r.title}`}
                  onClick={() => setSelected(r.key)}
                >
                  <span className="rec-type">
                    <Icon size={14} />
                    <span className="en">{r.type}</span>
                  </span>
                  <b>{r.title}</b>
                  <span className="en-meta">
                    {source(r)}
                    {r.createdAt ? " · " + day(r.createdAt) : " · 旧参考"}
                  </span>
                  <span
                    className={
                      "dot " +
                      (r.status === "已炼成"
                        ? "done"
                        : r.status === "待判定"
                          ? "verify"
                          : r.status === "待复刻"
                            ? "reverse"
                            : "todo")
                    }
                  >
                    {r.status}
                  </span>
                  {r.legacyIssue && <small>{r.legacyIssue}</small>}
                </button>
              );
            })}
          </div>
          {!filtered.length && <p className="rail-empty">还没有参照物</p>}
          <details className="pack">
            <summary>保存参考与回收区</summary>
            <div className="re-controls">
              <button
                className="text-btn"
                onClick={() => setDrawer("reference")}
              >
                保存参考
              </button>
              {recordsOf(state)
                .filter((r) => r.deletedAt)
                .map((r) => (
                  <button
                    className="text-btn"
                    key={r.id}
                    onClick={async () => {
                      if (
                        await save({
                          ...state,
                          reverseRecords: restoreRecord(recordsOf(state), r.id),
                        })
                      )
                        notify("逆向记录已恢复");
                    }}
                  >
                    <RotateCcw size={14} />
                    {r.title} · 恢复
                  </button>
                ))}
            </div>
          </details>
        </aside>
        <div className="re-main">
          {active ? (
            <>
              <div className="bench m-screen">
                <div className="bench-head">
                  <span className="en">SPECIMEN · {active.type}</span>
                  <h2>{active.title}</h2>
                  <span className="bench-meta">
                    {source(active).toUpperCase()} · {day(active.createdAt)} ·{" "}
                    {short(active)}
                  </span>
                  <ol className="rsteps">
                    {steps.map((s, i) => (
                      <li
                        className={
                          (i < stage ? "done" : i === stage ? "now" : "") +
                          (i === 3 ? " opt" : "")
                        }
                        key={s}
                      >
                        <i>{i < stage ? <Check size={13} /> : i + 1}</i>
                        {s}
                        {i === 3 && <small>可选</small>}
                      </li>
                    ))}
                  </ol>
                </div>
                {active.reference ? (
                  <>
                    <Artifact
                      type="TXT"
                      artifact={{
                        text: active.material.text,
                        media: [],
                        html: "",
                      }}
                      label="旧参考备注"
                    />
                    <a
                      href={active.material.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-btn"
                    >
                      查看来源
                      <ExternalLink size={14} />
                    </a>
                    <Button onClick={beginReference}>开始逆推</Button>
                  </>
                ) : (
                  <>
                    <section className="judge" aria-label="对照台">
                      {(recipe || active.type !== "TXT") && (
                        <div className="judge-top">
                          <span className="en">COMPARE · 原件 ↔ 复刻</span>
                          <span className="judge-hint" hidden={!attempt}>
                            逐项给复刻打分，总分到达标线才算 1:1
                          </span>
                        </div>
                      )}
                      {!recipe ? (
                        <Artifact
                          type={active.type}
                          artifact={{
                            text: active.material.text,
                            media: active.referenceMedia || [],
                            html: "",
                          }}
                          label={`原文 · 节选 ${[...(active.material.text || "")].length} 字`}
                        />
                      ) : (
                        <Compare
                          key={active.id}
                          record={raw}
                          attempt={attempt}
                        />
                      )}
                      {attempt && (
                        <Score
                          key={attempt.id + Boolean(attempt.confirmedAt)}
                          record={raw}
                          attempt={attempt}
                          threshold={recipeThreshold(state)}
                          notify={notify}
                          onDraft={(a) => update({ ...raw, replicaDraft: a })}
                          onConfirm={async (a) => {
                            const next = confirmReplica(raw, a);
                            delete next.replicaDraft;
                            if (await update(next))
                              notify(
                                next.replicas.at(-1).conclusion === "passed"
                                  ? "复刻已确认达标"
                                  : "复刻未达标，保留本次记录",
                              );
                          }}
                        />
                      )}
                      {attempt && (
                        <p className="judge-note">
                          复刻由{" "}
                          {characterOf(attempt.agentId)?.name ||
                            names[attempt.agentId]}
                          （{names[attempt.agentId]}
                          ）只凭配方完成；左右拖动中间的手柄对照
                        </p>
                      )}
                    </section>
                    {raw.type && (!attempt || !recipe) && (
                      <Dispatch
                        record={raw}
                        phase={recipe ? "replica" : "reverse"}
                        notify={notify}
                        onCopied={async (agentId, pack) => {
                          if (
                            !(await update({
                              ...raw,
                              pack,
                              stage: "prepared",
                              copies: [
                                ...(raw.copies || []),
                                { id: uid(), agentId, at: now() },
                              ],
                            }))
                          )
                            throw Error(
                              "任务包已复制，但回执保存未确认；请刷新核对，不要重复复制补记。",
                            );
                        }}
                      />
                    )}
                    {attempt?.confirmedAt && attempt.conclusion === "failed" && (
                      <div className="reverse-mobile-retry"><StepButton onClick={() => setRecover("replica")}>再投入一份复刻</StepButton></div>
                    )}
                    <details className="pack">
                      <summary>
                        回收回复与产物{attempt ? " · 再复刻一次" : ""}
                      </summary>
                      <div className="re-controls">
                        {raw.type && (
                          <>
                            <button
                              className="text-btn"
                              disabled={!!raw.forge}
                              onClick={() => setRecover("reverse")}
                            >
                              贴回复 · 解析配方
                            </button>
                            {recipe && (
                              <button
                                className="text-btn"
                                onClick={() => setRecover("replica")}
                              >
                                投入复刻产物
                              </button>
                            )}
                          </>
                        )}
                        <button
                          className="text-btn"
                          onClick={async () => {
                            if (
                              await save({
                                ...state,
                                reverseRecords: deleteRecord(
                                  recordsOf(state),
                                  raw.id,
                                ),
                              })
                            ) {
                              setSelected(null);
                              notify("逆向记录已移入回收区");
                            }
                          }}
                        >
                          <Trash2 size={14} />
                          移入回收区
                        </button>
                        {raw.material.url && (
                          <a
                            className="text-btn"
                            href={raw.material.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            查看来源
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </details>
                  </>
                )}
              </div>
              {!attempt && raw?.replicas?.length > 0 && (
                <details className="pack">
                  <summary>历史复刻记录（当前配方已变化）</summary>
                  {raw.replicas.map((a) => (
                    <article key={a.id}>
                      <p className="mono">
                        {a.at} · {names[a.agentId]} · {a.total}% · 当时达标线{" "}
                        {a.threshold}% ·{" "}
                        {a.conclusion === "passed" ? "当时达标" : "当时未达标"}
                      </p>
                      <p>{a.note}</p>
                      <Artifact
                        type={a.recipeSnapshot.type}
                        artifact={a.artifact}
                        label="历史实际产物"
                      />
                      <pre>
                        {JSON.stringify(
                          {
                            recipe: a.recipeSnapshot,
                            specimen: a.specimenSnapshot,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </article>
                  ))}
                </details>
              )}
              {recipe && active.status !== "已炼成" && (
                <Recipe
                  record={raw}
                  onPromote={async () => {
                    if (!currentVerification(raw)) return;
                    if (
                      await update({
                        ...raw,
                        recipe: {
                          ...raw.recipe,
                          blocks: raw.recipe.blocks.map((b) => ({
                            ...b,
                            mark: "已验证",
                          })),
                        },
                      })
                    )
                      notify("配方已标为已验证");
                  }}
                />
              )}
              {raw && !raw.type && (
                <details className="pack" open>
                  <summary>原候选与入库记录</summary>
                  <section className="reverse-v14" aria-label="逆向工程工作区">
                    <RecordPanel
                      key={raw.id}
                      record={raw}
                      state={state}
                      save={save}
                      notify={notify}
                      onNew={() => setDrawer("legacy")}
                    />
                  </section>
                </details>
              )}
              {verified && (
                <>
                  <section aria-label="举一反三">
                    <div className="sec-head">
                      <h2 className="en-head">
                        <span className="en">VARIATION</span>举一反三
                      </h2>
                      <span className="sec-meta">
                        可选 · {raw.variations?.length || 0} 件
                      </span>
                    </div>
                    {raw.variations?.length > 0 && (
                      <div className="var-row">
                        {raw.variations.map((v) => (
                          <figure key={v.id}>
                            <Artifact
                              type={raw.type}
                              artifact={v}
                              label={v.title}
                            />
                            <figcaption>{v.title}</figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                    <details className="pack">
                      <summary>继续举一反三</summary>
                      <Dispatch
                        record={raw}
                        phase="variation"
                        notify={notify}
                      />
                      <button
                        className="text-btn"
                        onClick={() => setRecover("variation")}
                      >
                        投入举一反三产物
                      </button>
                    </details>
                  </section>
                  <Forge
                    record={raw}
                    state={state}
                    save={save}
                    notify={notify}
                    onSelect={onSelect}
                  />
                </>
              )}
            </>
          ) : (
            <div className="bench bench-empty m-screen">
              <span className="en">SPECIMEN</span>
              <h2>{rows.length ? "没有符合筛选的参照物" : "还没有参照物"}</h2>
              <p>海报、网页、功能或一段好文字，投进来，逆推成能复刻的配方。</p>
              <StepButton className="go" onClick={() => setDrawer("input")}>
                <Plus size={16} />
                投入第一件
              </StepButton>
            </div>
          )}
        </div>
      </div>
      {drawer && (
        <InputDrawer
          legacyMode={drawer === "legacy"}
          referenceOnly={drawer === "reference"}
          state={state}
          save={save}
          notify={notify}
          onClose={() => setDrawer("")}
          onCreated={(id) => setSelected("record:" + id)}
        />
      )}
      {recover && raw && (
        <Recover
          key={raw.id + recover}
          record={raw}
          phase={recover}
          threshold={recipeThreshold(state)}
          onSave={update}
          onClose={() => setRecover("")}
          notify={notify}
        />
      )}
      {help && (
        <Dialog title="逆向工程 · 说明与设置" onClose={() => setHelp(false)}>
          <div className="asset-form">
            <button
              className="text-btn"
              onClick={() => {
                setHelp(false);
                setDrawer("legacy");
              }}
            >
              沿用旧文字候选流程
            </button>
            <p>
              投入你提供或公开的作品，逆推配方，再只凭配方复刻。观察、推断与已验证分开；旧报告的已验证不代表完成本次复刻。
            </p>
            <p>
              分数×20与功能用例通过率取平均；所有项目检查完才能确认。HTML只存文本，预览禁止脚本与外部请求。图片留在本机，完整备份包含图片，JSON导出只保留引用。
            </p>
            <label>
              复刻达标线（百分比）
              <input
                type="number"
                min="1"
                max="100"
                value={threshold}
                onChange={(e) => setThreshold(+e.target.value)}
              />
            </label>
            <Button
              onClick={async () => {
                if (
                  !Number.isInteger(threshold) ||
                  threshold < 1 ||
                  threshold > 100
                ) {
                  notify("达标线需为1–100整数", "error");
                  return;
                }
                if (await save({ ...state, reverseSettings: { threshold } })) {
                  notify("达标线已保存；历史判定保留原阈值");
                  setHelp(false);
                }
              }}
            >
              保存设置
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
function Forge({ record, state, save, notify, onSelect }) {
  const [busy, setBusy] = useState(false),
    lock = useRef(false);
  const asset = state.assets.find((a) => a.id === record.forge?.assetId),
    version = asset?.versions.find((v) => v.id === record.forge?.versionId);
  const generated = useMemo(
    () => version || generateRecipeSkill(record),
    [version, record],
  );
  async function forge() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (record.forge) {
        notify("此记录已经炼成，请查看固定Skill");
        return;
      }
      const spec = generateRecipeSkill(record),
        egg = makeAsset({ ...spec, type: "Skill" }),
        pointer = {
          assetId: egg.id,
          versionId: current(egg).id,
          replicaId: currentVerification(record).id,
          at: now(),
        };
      if (
        await save({
          ...state,
          assets: [egg, ...state.assets],
          reverseRecords: recordsOf(state).map((r) =>
            r.id === record.id ? { ...r, forge: pointer } : r,
          ),
        })
      )
        notify("Skill 已炼成，固定版本已存到资产仓库");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const mediaCount = generated.mediaManifest?.length || 0;
  return (
    <section
      className={"forge2" + (version ? " done" : "")}
      aria-label="炼成 Skill"
    >
      <span className="egg">
        <Pixel sprite="egg" size={50} />
      </span>
      <div className="forge-info">
        <span className="en">FORGE · SKILL</span>
        <h2>{generated.title}</h2>
        <p className="files">
          {generated.files
            .filter((f) =>
              [
                "SKILL.md",
                "palette.json",
                "prompt.txt",
                "negative.txt",
                "acceptance.md",
              ].includes(f.path),
            )
            .map((f) => (
              <span key={f.path}>{f.path}</span>
            ))}
          {mediaCount > 0 && <span>assets × {mediaCount}</span>}
        </p>
        <details className="pack">
          <summary>
            完整文件清单 · {generated.files.length + mediaCount}
          </summary>
          <ul>
            {generated.files.map((f) => (
              <li className="mono" key={f.path}>
                {f.path}
              </li>
            ))}
            {generated.mediaManifest?.map((m) => (
              <li className="mono" key={m.path}>
                {m.path} · {m.size} B · SHA256 {m.sha256}
              </li>
            ))}
          </ul>
        </details>
      </div>
      {version ? (
        <div className="forge-done">
          <span className="seal big">已炼成</span>
          <button className="text-btn" onClick={() => onSelect?.(asset)}>
            查看 Skill <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <StepButton disabled={busy} onClick={forge}>
          {busy ? "正在炼成…" : "炼成 Skill"}
        </StepButton>
      )}
    </section>
  );
}
