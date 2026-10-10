import { savepointThresholds } from "./settings-v16.js";
// 待处理线索：只从已加载的本机主库读出真实事项，不编造、不执行动作。
// 能力体检与晨报已按本机回执接入；尚未读取、读取失败和未运行不等于零。
import { todoIsDue, dueText } from "./calendar.js";
import { current } from "./store.js";
import { usageOf } from "./asset-usage.js";

// 规则模板装入记录是否读完：没读完时不能对“有没有待处理”下结论（D-R3）。
export function rulePendingReady(ruleInstalls) {
  return !!ruleInstalls?.loaded && !ruleInstalls?.error;
}
// ruleInstalls 来自规则模板的本机操作记录（不在主库里），由 App 读取后传入：
// { items, error }。读取失败单列一条，不当作“没有可升级”。
// projectStatus 来自项目空间的只读状态与体检（路线 v3 切片 2.1/2.2），由 App 读取后传入：
// { items, error, loaded }。只汇总和跳转，不执行任何动作；读取失败单列一条。
// agentHealth 来自智能体群的内容清单体检（只在本次打开页面后明确读取过的 Agent 才有），
// { [agentId]: { name, health: { brokenLinks, drift, unreadable } } }。未体检不下结论。
export function pendingItems(
  state,
  ruleInstalls = { items: [], error: "" },
  projectStatus = { items: [], error: "" },
  agentHealth = {},
  _legacyNightReports = undefined,
  vaultReceipts = {noteIds:[],loaded:false},
  sources = {},
) {
  ruleInstalls ||= { items: [], error: "" };
  const items = [];
  const reminders = sources.calendarTodos;
  if (reminders?.error) items.push({id:"calendar-read-error",kind:"日历",title:"提醒事项读取失败",detail:"到点事项尚未核实，请到日历刷新。",to:"calendar"});
  if (reminders?.loaded && !reminders.error) for (const item of reminders.reminders || []) {
    if (todoIsDue(item, sources.calendarNow)) items.push({id:`todo-due-${item.id}`,kind:"日历",title:item.title,detail:`已到点 · ${dueText(item.due)} · 到日历完成`,to:"calendar",foundAt:item.due});
  }
  const c = state.connections || {};
  if (ruleInstalls.error)
    items.push({
      id: "rule-installs-error",
      kind: "资产",
      title: "规则模板装入记录读取失败",
      detail: "升级提示暂时不可用；在任意规则详情里可以重新读取。",
      to: "assets",
    });
  for (const asset of state.assets) {
    if (asset.archived || asset.type !== "Rule") continue;
    const behind = ruleInstalls.items.filter(
      (i) => i.assetId === asset.id && i.versionId !== current(asset).id,
    );
    if (behind.length)
      items.push({
        id: `rule-upgrade-${asset.id}`,
        kind: "资产",
        title: `规则「${current(asset).title}」有 ${behind.length} 个项目可升级`,
        detail: "模板已有新版本；在规则详情里逐个预览差异，确认后升级。",
        to: "assets",
        assetId: asset.id,
      });
  }
  for (const asset of state.assets) {
    if (asset.archived) continue;
    if (usageOf(asset, state.assetActivity).feedback?.rating === "improve")
      items.push({
        id: `improve-${asset.id}`,
        kind: "资产",
        title: `「${current(asset).title}」被标记为需改进`,
        detail: "当前版本的最新反馈是“需改进”，可以修改后保存为新版本。",
        to: "assets",
        assetId: asset.id,
      });
  }
  // 改版候选（进化回路 v1）：用户粘贴回来的 Agent 回复，等待并排比较后采用或退回。
  for (const c of state.revisionCandidates || []) {
    if (c.status !== "pending") continue;
    const asset = state.assets.find((a) => a.id === c.assetId);
    if (!asset || asset.archived) continue;
    items.push({
      id: `candidate-${c.id}`,
      kind: "资产",
      title: `「${current(asset).title}」有改版候选待比较`,
      detail: "在资产详情里与当前版本并排比较，决定采用或退回。",
      to: "assets",
      assetId: asset.id,
    });
  }
  // 个人说明修改建议（切片 3.3）：Agent 通过本机 MCP 提交，在待处理页预览采纳或拒绝。
  for (const p of state.profileProposals || []) {
    if (p.status !== "pending") continue;
    items.push({
      id: `profile-${p.id}`,
      kind: "知识",
      title: `个人说明修改建议 · ${p.path}`,
      detail: `来自 ${p.proposer}：${p.reason.length > 60 ? p.reason.slice(0, 60) + "…" : p.reason}`,
      to: "inbox",
    });
  }
  for (const task of state.knowledgeTasks || []) {
    if (task.archived || !task.candidates?.length) continue;
    const version = task.candidates.at(-1);
    items.push({
      id: `knowledge-task-${task.id}`, kind: "知识", taskId: task.id,
      title: `候选待核对 · ${version.candidate.title}`,
      detail: "候选只在工作台本机主库；查看来源摘录后决定后续整理，尚未写入 Vault。",
      to: "knowledge", foundAt: version.receivedAt,
    });
  }
  if (projectStatus?.error)
    items.push({
      id: "project-status-error",
      kind: "项目",
      title: "在推进项目的状态与体检读取失败",
      detail: "停滞与安全提示暂时不可用；在项目空间可以重新读取。",
      to: "projects",
    });
  for (const p of projectStatus?.items || []) {
    const issues = p.safety?.issues || [];
    if (issues.length)
      items.push({
        id: `project-safety-${p.projectId}`,
        kind: "项目",
        title: `项目「${p.name}」安全体检发现 ${issues.length} 项问题`,
        detail: issues.map((i) => i.text).join("；"),
        to: "projects",
      });
    if (p.activity?.state === "stalled")
      items.push({
        id: `project-stall-${p.projectId}`,
        kind: "项目",
        title: `项目「${p.name}」已 ${p.activity.idleDays} 天没有状态更新或提交`,
        detail: "在推进项目超过停滞阈值；到项目空间查看状态卡，决定继续推进还是取消在推进。",
        to: "projects",
      });
  }
  const targeted = new Set((c.agentTargets || []).map((t) => t.agentId));
  const untargeted = (c.agents || []).filter(
    (a) => a.status === "detected" && !targeted.has(a.id),
  );
  if (untargeted.length)
    items.push({
      id: "agents-untargeted",
      kind: "目标",
      title: `${untargeted.map((a) => a.name).join("、")} 已检测到，尚未设置管理目标`,
      detail: "设置管理目标后，才能查看目录、关联 Skill 和受控修改配置。",
      to: "agents",
    });
  for (const [agentId, entry] of Object.entries(agentHealth || {})) {
    if(entry?.error) items.push({id:`agent-health-error-${agentId}`,kind:"智能体",title:`${entry.name}：能力体检结果未知`,detail:entry.error,to:"agents",agentId,agentTab:"体检",foundAt:entry.at});
    const h = entry?.health;
    if (!h) continue;
    const parts = [
      h.brokenLinks && `${h.brokenLinks} 条失效链接`,
      h.drift && `${h.drift} 个副本与仓库版本不一致`,
      h.unreadable && `${h.unreadable} 项无法读取`,
    ].filter(Boolean);
    if (parts.length)
      items.push({
        id: `agent-health-${agentId}`,
        agentId, agentTab: "内容",
        kind: "智能体",
        title: `${entry.name}：${parts.join("、")}`,
        detail: "体检只读；清理、重建或同步需要你在本机单独授权后执行。",
        to: "agents",
      });
  }
  for(const report of sources.nightV2Reports?.items||[])if(report.decisionPending===true){
    const counts=report.counts||{};
    const parts=[['completed','完成'],['partial','部分'],['failed','失败'],['notStarted','未开跑'],['unknown','未知']]
      .filter(([key])=>Number.isSafeInteger(counts[key])&&counts[key]>0).map(([key,label])=>`${label}${counts[key]}`);
    items.push({id:`night-v2-morning-${report.runId}`,kind:'夜巡',title:`晨报待决策 · ${report.nightDate||'日期未知'}`,
      detail:`${parts.join('、')||'结果待核对'}；额度为估算。请逐槽决定，不会自动合并或推送。`,
      to:'night',nightRunId:report.runId,foundAt:report.readyAt||report.generatedAt});
  }
  const decisions = sources.nightV2Reports?.decisions || [];
  const activeContinuations = new Set((state.nightV2?.slots || [])
    .map(slot => slot?.continueFrom?.operationId).filter(Boolean));
  const resolvedBranches = new Set(decisions.filter(item =>
    ['merged', 'discarded'].includes(item.status) ||
    (item.status === 'queued' && activeContinuations.has(item.operationId)))
    .map(item => `${item.runId}:${item.slotId}`));
  for (const decision of decisions) if (decision.action === 'day' &&
    decision.status === 'dispatched' &&
    !resolvedBranches.has(`${decision.runId}:${decision.slotId}`)) {
    const report = (sources.nightV2Reports?.items || []).find(item => item.runId === decision.runId);
    items.push({ id: `night-v2-day-${decision.runId}-${decision.slotId}`, kind: '夜巡',
      title: `白天处理夜巡分支 · ${report?.nightDate || '日期未知'}`,
      detail: '夜间分支已留在本地；查看产出与证据后处理，不会自动合并或推送。',
      to: 'night', nightRunId: decision.runId, foundAt: decision.at });
  }
  for (const note of state.notes || []) if (/^nightv2_[a-f0-9]{32}$/.test(note.id) &&
    note.format === 'md1' && /^- \[ \] /m.test(note.text)) {
    items.push({ id: `night-v2-task-${note.id}`, kind: '夜巡',
      title: note.text.match(/^- \[ \] ([^\r\n]+)/m)?.[1]?.slice(0, 100) || '夜巡建议待处理',
      detail: '来自已校验学习报告；前往随手记勾选完成或继续编辑。',
      to: 'notes', foundAt: note.at });
  }
  if(sources.nightV2Reports?.error)items.push({id:'night-v2-error',kind:'夜巡',title:'夜巡 v2 晨报记录读取失败',
    detail:'本机记录未知，请进入夜巡重新读取；不推断没有新结果。',to:'night'});
  const now = sources.now ?? Date.now();
  for (const project of state.connections?.projects || []) {
    const age = projectSavepointAge(project, sources.savepointReads?.[project.id], now);
    if (age !== null && age > savepointThresholds(state.connections).danger) items.push({
      id: `project-unsaved-${project.id}`, kind: "项目", projectId: project.id,
      title: `项目「${project.name}」已 ${Math.floor(age)} 天未存档`,
      detail: "前往存档点核对改动，审阅后决定是否存档。", to: "history",
      foundAt: new Date(now - age * 86400000).toISOString(),
    });
  }
  const knowledge = sources.knowledgeStatus;
  for (const health of c.knowledgeSourceHealth || []) {
    if (health.status !== "needs_reconfirmation") continue;
    const source = c.knowledgeSources?.find((item) => item.id === health.sourceId);
    if (!source) continue;
    items.push({ id:`knowledge-source-reconfirm-${source.id}`, kind:"知识", sourceId:source.id,
      title:`${source.name}：需重新确认目录`, detail:"目录身份已变化；相关 Agent 共享已关闭。前往知识仓库核对并重新确认。",
      to:"knowledge", foundAt:health.detectedAt });
  }
  if (knowledge?.loaded && !knowledge.loadError && knowledge.mcp?.url === null) items.push({
    id: "profile-mcp-stopped", kind: "知识", title: "个人说明 MCP 未运行",
    detail: knowledge.mcp.error || "前往知识仓库查看本机 MCP 状态。", to: "knowledge", foundAt: knowledge.observedAt,
  });
  const collab = sources.collabStatus;
  if (collab?.error) items.push({id:'collab-read-error',kind:'协同',title:'协同协议读取失败',detail:collab.error,to:'collab'});
  if(collab?.loaded&&!collab.error) for(const item of collab.items||[]) {
    if(!item.protocol || !['ok','partial','absent'].includes(item.protocol.state)) items.push({id:`collab-error-${item.projectId}`,kind:'协同',title:`${item.name}：协议状态未知`,detail:item.current?.message||item.protocol?.issues?.join('；')||'请重新读取项目协议',to:'collab'});
    if(item.protocol?.state==='partial') items.push({id:`collab-error-${item.projectId}-partial`,kind:'协同',title:`${item.name}：协议部分读取`,detail:item.protocol.issues.join('；')||'部分来源未核实',to:'collab'});
    for(const run of item.protocol?.runs||[]) for(const [index,alert] of run.alerts.entries()) items.push({id:`collab-${alert.main?'main':'wait'}-${item.projectId}-${run.id}-${alert.kind}${alert.kind==='needs_decision'?'-'+index:''}`,kind:'协同',title:`${item.name} · ${run.title}：${alert.label}`,detail:alert.issueId?`返修项：${alert.issueId}。${run.phase.basis}`:run.phase.basis,to:'collab',foundAt:run.stageAt});
  }
  return triageItems(items, state, projectStatus, agentHealth);
}


export const TRIAGE_LABELS = ["需要决定", "等你确认", "顺手看看"];
export const TRIAGE_RULES = [
  ['collab-main-', '需要决定', '协同协议异常'],
  ['collab-error-', '需要决定', '协同协议未知'],
  ['collab-read-error', '需要决定', '协同协议读取失败'],
  ['collab-wait-', '等你确认', '协同等待人工闸门'],
  ["todo-due-", "需要决定", "提醒事项已到点"],
  ["calendar-read-error", "需要决定", "提醒事项读取失败"],
  ["night-v2-error", "需要决定", "夜巡 v2 晨报读取失败"],
  ["night-v2-morning-", "需要决定", "晨报待决策"],
  ["night-v2-day-", "需要决定", "白天处理夜巡分支"],
  ["night-v2-task-", "需要决定", "夜巡建议待处理"],
  ["rule-installs-error", "需要决定", "规则记录读取失败"],
  ["rule-upgrade-", "等你确认", "已装规则落后于当前版本"],
  ["improve-", "需要决定", "当前版本需改进反馈"],
  ["candidate-", "需要决定", "待采用改版候选"],
  ["profile-mcp-stopped", "需要决定", "个人说明 MCP 未运行"],
  ["knowledge-source-reconfirm-", "等你确认", "知识目录身份变化"],
  ["profile-", "等你确认", "个人说明修改建议"],
  ["project-unsaved-", "需要决定", "项目超过红色阈值未存档"],
  ["knowledge-tasks", "等你确认", "知识整理候选核对"],
  ["knowledge-task-", "等你确认", "知识待整理候选核对"],
  ["notes-local", "等你确认", "未归位随手记"],
  ["notes-receipts-unknown", "需要决定", "归位回执未知"],
  ["project-status-error", "需要决定", "项目体检读取失败"],
  ["project-safety-", "需要决定", "项目安全问题"],
  ["project-stall-", "需要决定", "在推进项目停滞"],
  ["agents-untargeted", "等你确认", "检测到但未设置目标"],
  ["agent-health-", "需要决定", "体检发现异常"],
];
const validTime = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const earliest = values => values.map(validTime).filter(Boolean).sort()[0] || null;
export function triageItems(items, state, projectStatus = {}, agentHealth = {}) {
  return items.map(item => {
    const rule = TRIAGE_RULES.find(([key]) => key.endsWith("-") ? item.id.startsWith(key) : item.id === key);
    let at = item.foundAt || null;
    if(item.id.startsWith("rule-upgrade-")) at = current(state.assets.find(a=>a.id===item.assetId))?.at;
    if(item.id.startsWith("improve-")) at = usageOf(state.assets.find(a=>a.id===item.assetId),state.assetActivity).feedback?.at;
    if(item.id.startsWith("candidate-")) at = state.revisionCandidates?.find(c=>item.id===`candidate-${c.id}`)?.createdAt;
    if(item.id.startsWith("profile-") && item.id!=="profile-mcp-stopped") at = state.profileProposals?.find(p=>item.id===`profile-${p.id}`)?.createdAt;
    if(item.id==="knowledge-tasks") at = earliest((state.knowledgeTasks||[]).filter(t=>!t.archived).map(t=>t.createdAt));
    if(item.id==="agents-untargeted") at = state.connections?.agentScannedAt;
    if(item.id==="notes-local" && !item.foundAt) at = null;
    if(item.id.startsWith("project-safety-") || item.id.startsWith("project-stall-")) at = projectStatus?.at;
    if(item.id.startsWith("agent-health-")) at = agentHealth[item.id.slice("agent-health-".length)]?.at || at;
    return {...item,triage:rule?.[1]||null,triageRule:rule?.[2]||"未知来源类型",foundAt:validTime(at)};
  }).sort((a,b)=>(a.foundAt===null)-(b.foundAt===null) || (a.foundAt||"").localeCompare(b.foundAt||"") || a.id.localeCompare(b.id));
}
export function triageSummary(items) {
  return TRIAGE_LABELS.map(label=>({label,count:items.filter(i=>i.triage===label).length}));
}

// 回执与当次读取按实际检查时间合并，页面共享同一口径。
export function mergeAgentHealth(audit, live = {}) {
  const result = Object.fromEntries((audit?.items || []).map(x=>[x.agentId,x]));
  for (const [id,item] of Object.entries(live || {})) {
    if (!result[id] || (Date.parse(item.at) || 0) >= (Date.parse(result[id].at) || 0)) result[id]=item;
  }
  return result;
}

// 同一只读存档口径用于项目卡与待处理；未知、目录变化、身份冲突不推断未存档。
export function projectSavepointAge(project, read, now = Date.now()) {
  if (project.identityConflict || project.localPaths?.length !== 1) return null;
  const matches = read?.root === project.localPaths[0] && read.locations === JSON.stringify(project.locations || project.localPaths);
  const at = matches ? read.lastAt : project.recentUpdate?.state === "ok" && project.recentUpdate.source === "Git" ? project.recentUpdate.at : null;
  return at && Number.isFinite(Date.parse(at)) ? Math.max(0, (now - Date.parse(at)) / 86400000) : null;
}
export const INBOX_GROUPS = [
  {key:"main",triage:"需要决定",label:"主线任务",short:"主线",en:"MAIN QUEST"},
  {key:"side",triage:"等你确认",label:"支线任务",short:"支线",en:"SIDE QUEST"},
  {key:"intel",triage:"顺手看看",label:"情报",short:"情报",en:"INTEL"},
];
export function inboxSummary(items) {
  return INBOX_GROUPS.map(group=>({...group,count:items.filter(item=>group.key==="intel" ? !item.triage || item.triage===group.triage : item.triage===group.triage).length}));
}
export function inboxBadge(items) {
  const [main,side,intel] = inboxSummary(items);
  return {tone:main.count?"red":side.count?"yellow":intel.count?"cyan":"",count:main.count||side.count?main.count+side.count:intel.count,
    label:`待处理 ${items.length} 项，主线 ${main.count}，支线 ${side.count}，情报 ${intel.count}`};
}
