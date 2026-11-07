import React from "react";

// #71：项目名册的唯一正式来源是数字分身里的 projects.json，数码世界只读展示，不再整理目录、扫描登记或关联目录。
const ROSTER_PATH = "~/Documents/ChatGPT/个人/work/digital-twin/projects.json";

export function RosterReadonlyNote() {
  return <p className="detail-footnote roster-readonly">项目名册以 digital-twin/projects.json 为准，在数码世界只读。<code style={{ overflowWrap: "anywhere" }}>{ROSTER_PATH}</code></p>;
}
