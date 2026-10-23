// 炼入焚决对话框：随手记与收藏共用（随手记标记“已炼”，收藏在卷条目上记来源）。
import React, { useState } from "react";
import { Flame } from "lucide-react";
import { Button, Dialog } from "./components.jsx";
import { orderScrolls } from "./scrolls.js";

export function RefineDialog({ draft, scrolls, onClose, onConfirm, navigate, busy=false }) {
  const live = orderScrolls(scrolls);
  const [scrollId, setScrollId] = useState(live[0]?.id || "");
  return (
    <Dialog title="炼入焚决" onClose={onClose}>
      <form
        className="asset-form refine-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (scrollId && !busy) onConfirm(scrollId);
        }}
      >
        <p className="body-copy">
          {draft.partial ? "把选中的文字" : draft.collection ? "把这条收藏" : "把整条随手记"}
          作为新条目加入所选卷的末尾，{draft.collection ? "原收藏显示“已收入焚决”。" : "原随手记标记为“已炼”。"}
        </p>
        <blockquote className="refine-preview">{draft.text}</blockquote>
        {live.length ? (
          <>
            <label>
              目标卷
              <select disabled={busy} value={scrollId} onChange={(e) => setScrollId(e.target.value)}>
                {live.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={busy}>
              <Flame size={16} />
              炼入
            </Button>
          </>
        ) : (
          <>
            <p className="body-copy">还没有卷。先到资产仓库的“焚决”标签建一卷，再回来炼入。</p>
            {/* 焚决已迁入资产仓库（切片 1.3b）：#scrolls 旧路由落到资产仓库并选中“焚决”标签。 */}
            <Button type="button" secondary disabled={busy} onClick={() => navigate("scrolls")}>
              去焚决建卷
            </Button>
          </>
        )}
      </form>
    </Dialog>
  );
}
