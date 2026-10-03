import React from "react";
import {
  ArrowUpRight,
  Route,
  KeyRound,
  Sparkles,
  Inbox as InboxIcon,
} from "lucide-react";
import { page } from "./pages.js";
import { PageHeading, Empty } from "./components.jsx";
import { pendingItems, rulePendingReady } from "./pending.js";
import { ProfileProposals } from "./ProfileProposals.jsx";

// 规划中页面：如实说明将来做什么、在路线哪一步、现在可以怎么做。不放假数据或无效按钮。
const NOW = {
  // 能力体检已并入智能体群页，不再放指回本页的链接。
  health: [["在资产仓库里核对 Skill 与目标副本是否一致", "assets"]],
  calendar: [["在夜巡里先保存夜间时间窗口草稿", "night"]],
};

export function PlanDetails({ id, navigate }) {
  const p = page(id);
  return (
    <div className="plan-grid">
      <section className="plan-card" aria-label="将来会做什么">
        <h2>
          <Sparkles size={16} />
          将来会做什么
        </h2>
        <ul>
          {p.plan.will.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <div className="plan-pair">
        <section className="plan-card" aria-label="路线位置">
          <h2>
            <Route size={16} />
            路线位置
          </h2>
          <p>{p.plan.route}</p>
          <small>尚未开发，这个页面不会执行任何动作。</small>
        </section>
        <section className="plan-card" aria-label="需要的授权">
          <h2>
            <KeyRound size={16} />
            需要的授权
          </h2>
          <p>{p.plan.needs}</p>
        </section>
      </div>
      {NOW[id] && (
        <section className="plan-card" aria-label="现在可以怎么做">
          <h2>现在可以怎么做</h2>
          <div className="plan-links">
            {NOW[id].map(([text, to]) => (
              <button
                key={text}
                className="plan-link"
                onClick={() => navigate(to)}
              >
                <span>{text}</span>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function PlannedPage({ id, navigate }) {
  return (
    <>
      <PageHeading page={id} />
      <PlanDetails id={id} navigate={navigate} />
    </>
  );
}

export function PendingList({ items, navigate, select, limit }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="pending-list">
      {shown.map((item) => (
        <li key={item.id}>
          <button
            className="pending-item"
            onClick={() =>
              item.assetId ? select(item.assetId) : navigate(item.to)
            }
          >
            <span className="pending-kind">{item.kind}</span>
            <span className="pending-main">
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <ArrowUpRight size={15} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Inbox({ state, navigate, select, ruleInstalls, projectStatus, agentContents, adoptState, notify }) {
  const items = pendingItems(state, ruleInstalls, projectStatus, agentContents);
  return (
    <>
      <PageHeading page="inbox" />
      <section className="inbox-section" aria-label="当前线索">
        <div className="section-title">
          <span className="section-index">A</span>
          <h2>当前线索 · {items.length}</h2>
          <p>只来自本机已有数据；点击到对应页面处理</p>
        </div>
        {!rulePendingReady(ruleInstalls) && !ruleInstalls?.error && (
          <p className="detail-footnote" role="status">
            规则模板装入记录还在读取，读完前不能确定待处理是否完整；规则升级提示读完后才会出现。
          </p>
        )}
        {items.length ? (
          <PendingList items={items} navigate={navigate} select={select} />
        ) : (
          rulePendingReady(ruleInstalls) && (
            <Empty icon={InboxIcon} title="目前没有可读出的待处理事项">
              这只代表下方已接入的几类来源里没有事项；尚未接入的来源不在统计范围内。
            </Empty>
          )
        )}
      </section>
      <ProfileProposals state={state} adoptState={adoptState} notify={notify} index="B" />
      <section className="inbox-section" aria-label="尚未接入的来源">
        <div className="section-title">
          <span className="section-index">C</span>
          <h2>尚未接入的来源</h2>
          <p>随对应功能上线逐类加入</p>
        </div>
        <PlanDetails id="inbox" navigate={navigate} />
      </section>
    </>
  );
}
