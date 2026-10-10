import React from "react";

// 仅负责多选一控件的语义和键盘；每页保留自己的呈现与动作。
export function PageChoices({ label, choices, value, onChange, className = "" }) {
  const selected = choices.some(([id]) => id === value);
  return <div role="radiogroup" aria-label={label} className={className}>
    {choices.map(([id, name], i) => <button key={id} type="button" role="radio"
      aria-checked={value === id} tabIndex={value === id || (!selected && i === 0) ? 0 : -1}
      className={value === id ? "active" : ""} onClick={() => onChange(id)}
      onKeyDown={(e) => {
        const next = e.key === "Home" ? 0 : e.key === "End" ? choices.length - 1
          : ["ArrowDown", "ArrowRight"].includes(e.key) ? (i + 1) % choices.length
          : ["ArrowUp", "ArrowLeft"].includes(e.key) ? (i + choices.length - 1) % choices.length : null;
        if (next === null) return;
        e.preventDefault(); onChange(choices[next][0]); e.currentTarget.parentElement.children[next].focus();
      }}>{name}</button>)}
  </div>;
}
