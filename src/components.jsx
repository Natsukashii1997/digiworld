import React, { useEffect, useRef } from "react";
import { X, Layers, Quote, Workflow } from "lucide-react";
import { Pixel, StageBar } from "./pixel.jsx";

// 各页标题区的背景纹样
const MARKS = {
  home: "mark_crest",
  assets: "mark_egg",
  agents: "mark_agent",
  projects: "mark_folder",
  knowledge: "mark_book",
  notes: "mark_pencil",
  history: "mark_branch",
  references: "mark_scan",
  night: "mark_moon",
  settings: "mark_gear",
};
import { page as pageOf, MATURITY } from "./pages.js";

export const typeLabel = {
  Skill: "Skill",
  Prompt: "Prompt",
  Workflow: "工作流",
  Rule: "规则",
};
export const typeCode = {
  Skill: "SKL",
  Prompt: "PRM",
  Workflow: "WFL",
  Rule: "RUL",
};
// 规则的小角标用像素卷轴（用户 2026-09-30 与封面对调），尺寸与其他线条小图标一致。
export function TypeIcon({ type, size = 24, className = "" }) {
  if (type === "Rule")
    return (
      <Pixel
        sprite="rule_scroll"
        fit={size}
        className={`type-icon-pixel ${className}`}
      />
    );
  const Icon = type === "Skill" ? Layers : type === "Prompt" ? Quote : Workflow;
  return <Icon size={size} className={className || undefined} />;
}
export function Button({
  children,
  secondary = false,
  className = "",
  ...props
}) {
  return (
    <button
      className={`${secondary ? "button secondary" : "button"} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Maturity({ level }) {
  if (!level) return null;
  return (
    <span className={`maturity ${level}`}>
      <i aria-hidden="true" />
      {MATURITY[level]}
    </span>
  );
}
// 流程步骤：只按真实状态标记“已完成 / 下一步”，其余为待进行。
export function Steps({ items, current, label = "流程" }) {
  return (
    <ol className="steps" aria-label={label}>
      {items.map((item, i) => (
        <li
          key={item}
          className={i < current ? "done" : i === current ? "now" : ""}
          aria-current={i === current ? "step" : undefined}
        >
          <span className="steps-dot" aria-hidden="true">
            {i < current ? "✓" : i + 1}
          </span>
          <span className="steps-text">
            {item}
            {i === current && <small>下一步</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}
// 进行中：液晶屏上的雷达扫线 + 等宽 SEARCHING，只说明“正在读”，不预告结果。
export function Scanning({ label }) {
  return (
    <div className="scanning" aria-live="polite">
      <span className="scanning-screen" aria-hidden="true">
        <i />
      </span>
      <span className="scanning-text">
        <small>SEARCHING</small>
        {label}…
      </span>
    </div>
  );
}
// 空状态：一颗在等待的数码蛋，或该区域的图标。
export function Empty({ icon: Icon, sprite = "egg", title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-screen" aria-hidden="true">
        {Icon ? (
          <Icon size={24} strokeWidth={1.6} />
        ) : (
          <Pixel sprite={sprite} size={40} />
        )}
      </div>
      <small className="empty-code" aria-hidden="true">
        NO DATA
      </small>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
// 页头：编号、英文眉题、标题、一句话定位、成熟度，全部来自 pages.js。
export function PageHeading({ page, eyebrow, title, description, action }) {
  const meta = page ? pageOf(page) : null;
  return (
    <header className="page-heading">
      {page && MARKS[page] && (
        <Pixel sprite={MARKS[page]} size={210} className="page-mark" dots />
      )}
      <div className="page-heading-main">
        <div className="page-eyebrow">
          {meta && <span className="page-code">{meta.code}</span>}
          <span>{eyebrow || meta?.eyebrow}</span>
          {meta?.maturity && <Maturity level={meta.maturity} />}
        </div>
        <h1>{title || meta?.title}</h1>
        {(description || meta?.lead) && (
          <p className="page-lead">{description || meta.lead}</p>
        )}
      </div>
      {action && <div className="page-heading-action">{action}</div>}

    </header>
  );
}
export function Dialog({ title, children, onClose, drawer = false }) {
  const ref = useRef();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handle = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const els = ref.current.querySelectorAll(
          'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
        );
        const first = els[0],
          last = els[els.length - 1];
        if (!els.length) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className={`overlay ${drawer ? "drawer-overlay" : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={drawer ? "drawer" : "modal"}
      >
        <div className="dialog-top">
          <span>{title}</span>
          <button
            className="icon-button dialog-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
// 液晶封面：点阵屏 + 类型像素图标 + 编号与版本。
// bump：刚保存新版本时，封面扫一道光并冒出 NEW VERSION（UI v13.2 轻量新版本）
// uses：资产库卡片左下角的大号使用次数（切片 1.1），只显示数字；读屏文字由卡片正文提供。
export function Cover({ type, sprite, serial = 1, version = 1, stage, large = false, bump = false, uses }) {
  return (
    <div
      className={`cover lcd type-${type} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      <span className="cover-code">
        {typeCode[type]}.{String(serial).padStart(2, "0")}
      </span>
      <span className="cover-version">v{version}.0</span>
      {uses !== undefined && <span className="cover-uses">{uses}</span>}
      {large && <span className="cover-ring" />}
      <Pixel sprite={sprite || type} size={large ? 96 : 64} className="cover-glyph" />
      {bump && (
        <>
          <span className="version-scan" />
          <span className="version-tag">NEW VERSION</span>
        </>
      )}
      {large && stage !== undefined && (
        <span className="cover-stage">
          <StageBar stage={stage} />
        </span>
      )}
    </div>
  );
}
