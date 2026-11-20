// 带 ZIP 包的旧 Skill 资产的来源记录，只读（#111）。
// 来源导入、检查来源更新、创建个人改版的写接口已下线，这里只显示当初记下的来源。
import React from "react";
import { Badge, Button } from "./components.jsx";

const timeLabel = (value) => new Date(value).toLocaleString("zh-CN");

export function SkillOrigin({ asset, state, onSelect }) {
  const origin = asset.origin;
  const source =
    origin?.kind === "derived"
      ? state.assets.find((item) => item.id === origin.assetId)
      : null;
  const sourceVersion = source?.versions.find(
    (item) => item.id === origin.versionId,
  );
  return (
    <section className="project-context" aria-label="Skill 来源">
      <div className="workflow-reference-heading">
        <strong>来源</strong>
        {origin && <Badge tone="muted">历史来源</Badge>}
      </div>
      {origin?.kind === "local" ? (
        <div className="context-preview">
          <strong>本机初始收录</strong>
          <p className="reference-identity">{origin.location}</p>
          <small>收录于 {timeLabel(origin.capturedAt)}</small>
          <code className="context-hash">初始指纹 · {origin.fingerprint}</code>
          <p className="detail-footnote">
            记录初次收录来源，不代表当前目录内容或安装状态。
          </p>
        </div>
      ) : origin?.kind === "derived" ? (
        <div className="context-preview">
          <strong>
            {sourceVersion
              ? `${sourceVersion.title} · v${source.versions.indexOf(sourceVersion) + 1}.0`
              : "来源资产或版本已缺失"}
          </strong>
          <p className="reference-identity">
            {origin.assetId} / {origin.versionId}
          </p>
          {source?.archived && <Badge tone="muted">来源已归档</Badge>}
          <p className="detail-footnote">
            从此版本独立创建；源资产后续更新不会自动同步。
          </p>
          {source && (
            <div className="heading-actions">
              <Button type="button" secondary onClick={() => onSelect(source.id)}>
                查看来源资产
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="detail-footnote">此资产没有结构化来源记录。</p>
      )}
    </section>
  );
}
