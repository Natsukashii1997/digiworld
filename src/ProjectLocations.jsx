import React from "react";
import { Copy } from "lucide-react";
import { Button, Badge } from "./components.jsx";
import { copy } from "./Assets.jsx";
import { request } from "./api.js";
import { RosterReadonlyNote } from "./roster-readonly.jsx";
import "./project-locations.css";

const statuses = {
  present: "已发现",
  missing: "目录缺失",
  unknown: "未核实",
  out_of_scope: "扫描范围外",
  unrecognized: "未识别为项目",
  changed: "目录已更换 · 待确认",
};
const date = (value) =>
  value ? new Date(value).toLocaleString("zh-CN") : "尚未查验";

// 项目名册只读（#71）：这里只展示此前登记的身份与目录，关联已发现目录、重新确认目录已下线。
export function ProjectLocations({ project, notify }) {
  const locations = project.localPaths.map(
    (path) => project.locations?.find((l) => l.path === path) || { path },
  );

  return (
    <section className="project-locations" aria-label="项目目录与身份">
      <div className="project-location-heading">
        <h3>项目身份</h3>
        {project.identityConflict && <Badge tone="muted">项目身份待确认</Badge>}
      </div>
      <div className="project-location-id">
        <code>{project.id}</code>
        <Button secondary onClick={() => copy(project.id, notify)}>
          <Copy size={15} />
          复制项目 ID
        </Button>
      </div>
      {!!project.aliases?.length && (
        <details className="project-location-details">
          <summary>历史项目 ID · {project.aliases.length}</summary>
          {project.aliases.map((id) => (
            <code key={id}>{id}</code>
          ))}
        </details>
      )}
      {project.identityConflict && (
        <p className="detail-footnote">
          存在共享远端或来源连接冲突，已保留各项目；不会自动选择 Current。
        </p>
      )}
      <div className="project-location-heading">
        <h3>本地目录 · {locations.length}</h3>
      </div>
      {locations.map((location, index) => (
        <div className="path-entry project-location-row" key={location.path}>
          <div className="project-location-heading">
            <Badge tone="muted">{statuses[location.status] || "待扫描"}</Badge>
            <small>
              {location.checkedAt
                ? `查验于 ${date(location.checkedAt)}`
                : "尚未查验"}
            </small>
          </div>
          <code>{location.path}</code>
          {location.message && (
            <p className="detail-footnote">{location.message}</p>
          )}
          <div className="heading-actions">
            <Button secondary onClick={() => copy(location.path, notify)}>
              <Copy size={15} />
              复制路径
            </Button>
            <Button
              secondary
              disabled={location.status === "missing"}
              onClick={async () => {
                try {
                  await request("/reveal", {
                    kind: "project",
                    id: project.id,
                    index,
                  });
                } catch (e) {
                  notify(e.message, "error");
                }
              }}
            >
              在 Finder 中显示
            </Button>
          </div>
        </div>
      ))}
      {!locations.length && (
        <p className="detail-footnote">尚未关联本地目录。</p>
      )}
      <RosterReadonlyNote />
    </section>
  );
}
