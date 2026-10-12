import { Reading, ReadReveal } from './ScanMotion.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, GitBranch, History } from 'lucide-react';
import { CrestIcon, Pixel } from './pixel.jsx';
import { prefersReduced } from './v14.jsx';
import { request } from './api.js';
import { NIGHT_V2_COLORS } from './night-v2-model.js';
import { NIGHT_V2_CRESTS, NIGHT_V2_CREST_NAMES } from './night-v2-crests.js';
import { NightV2ActionButton, NightV2SuggestionButton, NightV2OperationDialog, useNightV2Decisions, useNightV2Operation, decisionFor } from './NightV2Actions.jsx';
import './night-v2-results.css';

const KIND_LABELS = {
  'learning-report': '学习报告', 'branch-delivery': '分支交付', 'test-report': '测试报告',
  'review-list': '代码审查', 'deps-list': '依赖巡检', 'daily-brief': '明日简报',
  'custom-report': '自定义报告', 'custom-list': '自定义清单', 'custom-branch': '分支交付', 'custom-brief': '一页简报',
};
const BUILTIN_KINDS = { learn: 'learning-report', push: 'branch-delivery', test: 'test-report', review: 'review-list', deps: 'deps-list', brief: 'daily-brief' };
const CUSTOM_KINDS = { report: 'custom-report', list: 'custom-list', branch: 'custom-branch', brief: 'custom-brief' };
const kindOf = slot => BUILTIN_KINDS[slot.chipId] || CUSTOM_KINDS[slot.outputKind] || '';
const STATUS_LABELS = { completed: '已交付', partial: '部分完成', failed: '失败', not_started: '未开跑', unknown: '结果未知' };
const ISSUE_LABELS = { invalid: '产出结构未通过校验', missing: '产出缺失', unknown: '产出状态未知' };
const TAG_LABELS = new Set(['起点', '修正', '印证', '新增', '结论']);

const arr = value => Array.isArray(value) ? value : [];
const str = value => typeof value === 'string' ? value.trim() : '';
const num = value => Number.isFinite(value) ? value : null;
const short = value => str(value).slice(0, 600);
const evidence = value => str(value) || '证据待回读';
const hueOf = chip => NIGHT_V2_COLORS.find(item => item.id === chip?.color)?.hue || '139,152,184';
const clip = value => str(value).length > 120 ? `${str(value).slice(0, 120)}…` : str(value);
const clock = value => {
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(stamp) : '待回读';
};
const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? `${value.slice(5, 7)}/${value.slice(8, 10)}` : '日期待回读';

function Crest({ chip, size = 32 }) {
  const id = NIGHT_V2_CRESTS[chip?.icon] ? chip.icon : NIGHT_V2_CRESTS[chip?.id] ? chip.id : 'custom';
  return <CrestIcon name={NIGHT_V2_CREST_NAMES[id]} className="nv-result-crest" crestId={id} size={size} />;
}
function Agent({ id, reviewer = false }) {
  if (id !== 'claude' && id !== 'codex') return null;
  return <span className="nv-result-agent"><Pixel sprite={id === 'claude' ? 'metalgreymon16' : 'machinedramon16'} fit={18} /><span>{id === 'claude' ? 'Claude Code' : 'Codex'}{reviewer ? ' 复核' : ''}</span></span>;
}
function Status({ slot }) {
  return <span className={`nv-result-status ${slot.status || 'unknown'}`}>
    <i aria-hidden="true" />{STATUS_LABELS[slot.status] || '状态待回读'}
  </span>;
}
function AcceptanceTally({ items }) {
  const list = arr(items);
  const met = list.filter(item => item.status === 'met').length;
  return list.length ? `验收 ${met}/${list.length}` : '验收待回读';
}
function ResultCard({ slot, index, onOpen, onAction, decision, decisionsReady, onQueryDecision }) {
  const chip = slot.chip || {};
  const issue = arr(slot.validation?.issues)[0];
  const valid = slot.validation?.status === 'valid';
  const outputKind = kindOf(slot);
  const kind = KIND_LABELS[outputKind] || '产出回执';
  const btnLabel = valid ? outputKind === 'learning-report' ? '阅读报告' : outputKind === 'branch-delivery' || outputKind === 'custom-branch' ? '查看交付' : '查看报告' : '查看回执';
  const branchAction = Boolean(slot.branch);
  const decisionClosed = ['merged', 'queued', 'discarded'].includes(decision?.status);
  const actionDisabled = !decisionsReady || decisionClosed || decision?.status === 'unknown';
  return <div className={`nt-slot nv-result-slot st-${slot.status || 'unknown'}`} data-testid={`night-result-card-${slot.slotId}`} data-decision-status={decision?.status || (decisionsReady ? 'undecided' : 'unread')} style={{ '--h': hueOf(chip) }}>
    <div className="nv-slot-well">
      <article className="nv-result-card" aria-label={`插槽 ${index + 1}：${chip.name || slot.goal || '任务'}，${STATUS_LABELS[slot.status] || '状态待回读'}`}>
        <header><Crest chip={chip} size={28} /><span className="nv-mono">{chip.code || 'C-??'} · {kind}</span><Status slot={slot} /></header>
        <h3>{slot.goal || chip.name || '目标待回读'}</h3>
        <div className="nv-result-facts"><span>{AcceptanceTally({ items: slot.acceptance })}</span>{num(slot.roundCount) !== null && <span>{slot.roundCount} 轮</span>}</div>
        {valid && short(slot.summary) ? <p className="nv-result-summary">{clip(slot.summary)}</p> : <p className="nv-result-issue">{issue ? short(issue) : ISSUE_LABELS[slot.validation?.status] || '产出待回读'}</p>}
        {slot.branch && <p className="nv-result-branch nv-mono"><GitBranch size={13} />{slot.branch}</p>}
        {slot.firstFailure && <p className="nv-result-failure">首败：{short(slot.firstFailure?.reason || slot.firstFailure)}</p>}
        <footer><button type="button" className="nv-nbtn pri" data-testid={`night-open-output-${slot.slotId}`} onClick={() => onOpen(slot.slotId)}><ArrowRight size={15} />{btnLabel}</button>{branchAction && <><NightV2ActionButton action="merge" slotId={slot.slotId} disabled={actionDisabled} onClick={event => onAction(slot.slotId, 'merge', event.currentTarget)} /><details className="nv-result-action-menu"><summary aria-label={`槽 ${index + 1} 更多早上处理`}>更多</summary><div>{['day', 'continue', 'discard'].map(action => <NightV2ActionButton key={action} action={action} slotId={slot.slotId} disabled={actionDisabled} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onAction(slot.slotId, action, event.currentTarget); }} />)}</div></details></>}{decision?.status === 'unknown' && <button type="button" className="nv-nbtn" data-testid={`night-action-query-${slot.slotId}`} onClick={event => onQueryDecision(decision, event.currentTarget)}>查询原操作</button>}{decision && <p className={`nv-decision-state${decision.status === 'unknown' ? ' unknown' : ''}`} data-testid={`night-decision-${slot.slotId}`}>早上决策：{decision.status === 'unknown' ? '原操作结果未知' : decision.status === 'merged' ? '已本地合并' : decision.status === 'dispatched' ? '已派白天' : decision.status === 'queued' ? '已排今晚候选' : decision.status === 'discarded' ? 'worktree 已丢弃' : decision.status === 'conflict' ? '冲突，未合并' : '待核对'}</p>}</footer>
      </article>
    </div>
    <div className="nv-slot-mouth"><span className={`nv-led ${slot.status === 'completed' ? 'done' : slot.status === 'partial' ? 'warn' : 'err'}`} /><span className="nv-mono">SLOT {index + 1}</span><span className="nv-est nv-mono">{slot.startedAt ? clock(slot.startedAt) : '—'}{slot.endedAt ? `–${clock(slot.endedAt)}` : ''}</span></div>
    <div className="nv-slot-foot"><Agent id={chip.executor} />{chip.reviewer && <><span aria-hidden="true">→</span><Agent id={chip.reviewer} reviewer /></>}</div>
  </div>;
}

export function NightMorningView({ report, onOpen, onDecisionChange }) {
  const slots = arr(report?.slots);
  const findings = arr(report?.newFindings);
  const counts = report?.counts || {};
  const checks = report?.checks;
  const quota = num(report?.quotaEstimatePercent);
  const total = slots.length;
  const decisions = useNightV2Decisions(report?.runId);
  const flow = useNightV2Operation(async () => { await decisions.read(); await onDecisionChange?.(); });
  const openAction = (slotId, action, source) => flow.openAction({ runId: report.runId, slotId, action, expectedReportRevision: report.revision }, source);
  return <><section className="nv-bay nv-morning" data-testid="night-morning" aria-label="夜巡晨报">
    <header className="nv-bay-top"><div><span className="nv-mono nv-muted">LAST NIGHT · {dateLabel(report?.nightDate)} → {clock(report?.readyAt)} 翻面</span><h2>{total ? <>{total} 枚芯片的晨报已翻面</> : '昨夜没有执行芯片'}</h2></div><div className="nv-morning-tally"><span><b>{num(counts.completed) ?? 0}</b> 交付</span><span><b>{num(counts.partial) ?? 0}</b> 部分</span><span><b>{num(counts.failed) ?? 0}</b> 失败</span><span><b>{num(counts.notStarted) ?? 0}</b> 未开跑</span>{findings.length > 0 && <span><b>{findings.length}</b> 新发现</span>}<span className="nv-mono">额度 {quota === null ? '待回读' : `≈${quota.toFixed(1)}%`}</span></div></header>
    {decisions.kind === 'error' && <p className="nv-backlog-banner" role="alert">早上决策状态暂时读不到：{decisions.error}<button type="button" className="nv-nbtn" onClick={decisions.read}>重新读取</button></p>}
    {decisions.backlog.filter(item => item.blocked).map(item => <p className="nv-backlog-banner" data-testid="night-project-backlog" key={item.projectId}><strong>项目推进暂缓</strong>项目 {item.projectId} 有 {item.count} 个未决分支；此项目仅可排只读芯片。</p>)}
    <div className="nv-slots nv-morning-slots">{slots.map((slot, index) => <ResultCard key={slot.slotId} slot={slot} index={index} onOpen={onOpen} onAction={openAction} decision={decisionFor(decisions, slot.slotId)} decisionsReady={decisions.kind === 'ready'} onQueryDecision={flow.recoverAction} />)}{slots.length < 4 && <div className="nt-slot vacant nv-morning-vacant" aria-label="昨夜未使用的插槽"><div className="nv-slot-well"><span>昨夜未使用</span></div><div className="nv-slot-mouth"><span className="nv-led off" /><span className="nv-mono">SLOT {slots.length + 1}</span></div></div>}</div>
    <footer className="nv-bay-foot"><span><Check size={14} />{checks?.total ? `开工检查 ${checks.passed}/${checks.total}` : '开工检查待回读'} · {report.runStatus || '运行状态待回读'}</span><span className="nv-mono"><History size={14} />运行回执已保存在本机</span></footer>
  </section>{findings.length > 0 && <section className="nv-morning-findings" aria-label="昨夜新发现"><header><span className="nv-mono">NEW FINDINGS</span><h2>昨夜新发现</h2></header><ul>{findings.map((item, index) => <li key={`${item.slotId}-${index}`}><span>{item.text}</span><small>{item.sourceCount} 个来源 · {item.verification === 'crosschecked' ? '已交叉印证' : '仍待印证'}</small></li>)}</ul></section>}<NightV2OperationDialog flow={flow} /></>;
}

function Section({ id, number, title, children }) {
  return <section className="nv-report-section" id={id}><h2><small className="nv-mono">{number}</small>{title}</h2>{children}</section>;
}
function SourceList({ sources }) {
  return <ol className="nv-source-list">{arr(sources).map((source, index) => <li key={source.id || index}>{str(source.title) || '来源标题待回读'}{/^https?:\/\//i.test(source.url || '') && <a href={source.url} target="_blank" rel="noopener noreferrer">查看来源</a>}</li>)}</ol>;
}
function LearningBody({ content, onSuggestion }) {
  const steps = arr(content.steps), insights = arr(content.insights), sources = arr(content.sources);
  const advice = content.suggestions || {};
  return <>
    <section className="nv-report-intro" id="why"><h2>为什么学</h2><p>{content.whyLearn || '学习缘由待回读'}</p></section>
    <Section id="process" number="01" title="学习过程"><ol className="nv-learning-steps">{steps.map((step, index) => <li key={index}><b className="nv-mono">{index + 1}</b><div><h3>{TAG_LABELS.has(step.tag) ? step.tag : '过程记录'}</h3><p>{step.learned || '本步收获待回读'}</p>{step.correction && <p className="nv-correction">修正：{step.correction}</p>}<small>来源 {arr(step.sourceIds).length} 项</small></div></li>)}</ol></Section>
    <Section id="insights" number="02" title="关键洞见"><div className="nv-insight-grid">{insights.map((item, index) => <article key={index}><small className="nv-mono">{String(index + 1).padStart(2, '0')}</small><h3>{item.text}</h3><p>{item.verification === 'crosschecked' ? '已交叉印证' : '仍待印证'} · {arr(item.sourceIds).length} 个来源</p></article>)}</div></Section>
    <Section id="suggestions" number="03" title="对你的建议"><div className="nv-advice-grid">{[['learning', '对学习'], ['project', '对项目'], ['cognition', '对认知']].map(([key, label]) => <article key={key}><h3>{label}</h3>{arr(advice[key]).length ? arr(advice[key]).map((text, index) => <div className="nv-suggestion-item" key={index}><p>{text}</p><div className="nv-suggestion-actions">{['note', 'pending', 'knowledge'].map(target => <NightV2SuggestionButton key={target} target={target} section={key} index={index} onClick={event => onSuggestion(target, key, index, event.currentTarget)} />)}</div></div>) : <p>本轮无此类建议</p>}</article>)}</div></Section>
    <Section id="sources" number="04" title="来源"><SourceList sources={sources} /></Section>
  </>;
}
function TestBody({ content, slot, onAction, actionDisabled }) {
  const cases = arr(content.cases), defects = arr(content.defects), added = arr(content.newTests);
  const passed = cases.filter(item => item.status === 'passed').length;
  return <>
    <div className="nv-report-stats"><span><b>{cases.length}</b>用例</span><span><b>{passed}</b>通过</span><span><b>{defects.length}</b>缺陷</span><span><b>{added.length}</b>新增测试</span></div>
    <Section id="defects" number="01" title="缺陷">{defects.length ? defects.map((item, index) => <article className="nv-defect" key={item.id || index}><h3><small>{item.id || `D-${index + 1}`}</small>{item.reproduction || '复现步骤待回读'}</h3><dl><div><dt>复现</dt><dd>{item.reproduction}</dd></div><div><dt>期望</dt><dd>{item.expected}</dd></div><div><dt>实际</dt><dd>{item.actual}</dd></div><div><dt>证据</dt><dd>{evidence(item.evidence)}</dd></div><div><dt>可能原因</dt><dd>{item.possibleCause || '待确认'}</dd></div></dl>{slot.branch && <NightV2ActionButton action="day" slotId={slot.slotId} testId={`night-action-defect-${slot.slotId}-${index}-day`} disabled={actionDisabled} onClick={event => onAction('day', event.currentTarget)} />}</article>) : <p className="nv-report-muted">本轮未记录缺陷。</p>}</Section>
    <Section id="cases" number="02" title="用例"><ul className="nv-case-list">{cases.map((item, index) => <li key={item.id || index}><span className={item.status === 'passed' ? 'pass' : 'fail'}>{item.status === 'passed' ? '✓' : '×'}</span><span>{item.name || item.id}</span><small>{item.status === 'passed' ? '通过' : item.status === 'blocked' ? '阻断' : '失败'}</small></li>)}</ul></Section>
    <Section id="new-tests" number="03" title="新增测试"><ul className="nv-test-files">{added.map((item, index) => <li key={item.path || index}><code>{item.path}</code><span>{item.result === 'passed' ? '通过' : item.result === 'failed' ? '失败' : '未运行'}</span></li>)}</ul></Section>
  </>;
}
function DeliveryBody({ content, acceptance, slot, onAction, actionDisabled }) {
  const files = arr(content.changedFiles), rounds = arr(content.rounds), checks = arr(acceptance);
  const added = files.reduce((total, file) => total + (num(file.added) ?? 0), 0);
  const deleted = files.reduce((total, file) => total + (num(file.deleted) ?? 0), 0);
  const conflict = content.mainConflict;
  return <>
    <div className="nv-branch-panel"><code>{content.branch || '分支名待回读'}</code><span>{conflict?.status === 'clean' ? '与 main 检查时无冲突' : conflict?.status === 'conflict' ? '与 main 存在冲突' : '与 main 冲突状态未知'} · 合并前须再次检查</span>{slot.branch && <NightV2ActionButton action="merge" slotId={slot.slotId} testId={`night-action-hero-${slot.slotId}-merge`} primary disabled={actionDisabled} onClick={event => onAction('merge', event.currentTarget)} />}</div>
    <Section id="acceptance" number="01" title="验收"><ul className="nv-acceptance-list">{checks.map((item, index) => <li key={index}><span className={item.status === 'met' ? 'pass' : 'fail'}>{item.status === 'met' ? '✓' : '×'}</span><span>{item.criterion}</span><small>{evidence(item.evidence)}</small></li>)}</ul></Section>
    <Section id="files" number="02" title={`改动  +${added}  −${deleted}`}><ul className="nv-file-list">{files.map((file, index) => <li key={file.path || index}><code>{file.path}</code><span className="plus">+{file.added}</span><span className="minus">−{file.deleted}</span></li>)}</ul></Section>
    <Section id="rounds" number="03" title="轮次"><ol className="nv-round-list">{rounds.map((round, index) => <li key={index}><span className="nv-mono">R{round.round}</span><span>{round.executor || '执行者待回读'}{round.reviewer ? ` → ${round.reviewer} 复核` : ''}</span><b>{round.result === 'accepted' ? '通过' : round.result === 'returned' ? '退回' : '失败'}</b><small>{evidence(round.evidence)}</small></li>)}</ol></Section>
  </>;
}
function GenericBody({ kind, content }) {
  if (kind === 'review-list') return <Section id="risks" number="01" title="风险与复核"><p>{content.scope}</p>{arr(content.risks).map((item, index) => <article className="nv-defect" key={index}><h3>{item.location || '位置待回读'}</h3><p>{item.impact}</p><p>证据：{evidence(item.evidence)}</p><p>复核方法：{item.verification}</p><p>复核：{item.status === 'confirmed' ? '已确认' : '待确认'} · {item.reviewer || '复核者待回读'}</p></article>)}</Section>;
  if (kind === 'deps-list') return <Section id="advisories" number="01" title="通告清单"><p>{content.scope}</p>{arr(content.advisories).map((item, index) => <article className="nv-defect" key={index}><h3>{item.package} · {item.version}</h3><p>影响版本：{item.affectedVersions}</p><p>适用性：{item.applicability} · 来源：{item.source}</p><p>证据：{evidence(item.evidence)}</p></article>)}</Section>;
  if (kind === 'daily-brief' || kind === 'custom-brief') return <>{[['completed', '已完成'], ['unresolved', '未解决'], ['priorities', '明日优先']].map(([key, label], index) => <Section key={key} id={key} number={`0${index + 1}`} title={label}><ul className="nv-simple-list">{arr(content[key]).map((item, at) => <li key={at}>{item.text}<small>{item.sourceRef || item.owner || '来源待回读'}</small></li>)}</ul></Section>)}</>;
  if (kind === 'custom-report') return <>{arr(content.sections).map((item, index) => <Section key={index} id={`section-${index}`} number={String(index + 1).padStart(2, '0')} title={item.heading}><p>{item.text}</p><small>{evidence(item.evidence)}</small></Section>)}</>;
  if (kind === 'custom-list') return <Section id="items" number="01" title="清单"><ul className="nv-simple-list">{arr(content.items).map((item, index) => <li key={index}>{item.text}<small>{evidence(item.evidence)}</small></li>)}</ul></Section>;
  return <p className="nv-report-muted">该类型的详情结构待回读。</p>;
}

function DetailDocument({ morning, slot, outputView, onBack, onDecisionChange }) {
  const decisions = useNightV2Decisions(morning.runId);
  const flow = useNightV2Operation(async () => { await decisions.read(); await onDecisionChange?.(); });
  const decision = decisionFor(decisions, slot.slotId);
  const actionDisabled = decisions.kind !== 'ready' || ['merged', 'queued', 'discarded', 'unknown'].includes(decision?.status);
  const openAction = (action, source) => flow.openAction({ runId: morning.runId, slotId: slot.slotId, action, expectedReportRevision: morning.revision }, source);
  const openSuggestion = (target, section, index, source) => flow.openSuggestion({ runId: morning.runId, slotId: slot.slotId, target, section, index }, source);
  const output = outputView?.validation?.status === 'valid' ? outputView.output : null;
  const kind = output?.kind || kindOf(slot);
  const testId = kind === 'learning-report' ? 'night-report' : kind === 'test-report' ? 'night-test-report' : kind === 'branch-delivery' ? 'night-delivery' : 'night-other-report';
  const content = output?.content || {};
  const chip = slot.chip || {};
  const sections = kind === 'learning-report' ? [['why', '主题与为什么学'], ['process', '学习过程'], ['insights', '关键洞见'], ['suggestions', '对你的建议'], ['sources', '来源']] : kind === 'test-report' ? [['defects', '缺陷'], ['cases', '用例'], ['new-tests', '新增测试']] : kind === 'branch-delivery' ? [['acceptance', '验收'], ['files', '改动'], ['rounds', '轮次']] : [];
  return <><article className="nv-report-shell" data-testid={testId} data-decision-status={decision?.status || (decisions.kind === 'ready' ? 'undecided' : 'unread')} style={{ '--h': hueOf(chip) }}>
    <div className="nv-report-layout"><aside className="nv-report-nav"><button type="button" className="nv-report-back" data-testid="night-back-morning" onClick={onBack}><ArrowLeft size={16} />夜巡 · {dateLabel(morning.nightDate)} 晨报</button><nav aria-label="报告目录">{sections.map(([id, label]) => <a key={id} href={`#${id}`} onClick={event => { event.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: prefersReduced() ? 'instant' : 'smooth' }); }}>{label}<ChevronRight size={13} /></a>)}</nav><div className="nv-report-crew"><Agent id={chip.executor} />{chip.reviewer && <Agent id={chip.reviewer} reviewer />}<small>{slot.startedAt ? `${clock(slot.startedAt)}–${clock(slot.endedAt)}` : '时间待回读'} · {num(slot.roundCount) === null ? '轮次待回读' : `${slot.roundCount} 轮`}</small></div></aside>
      <div className="nv-report-main"><header className="nv-report-head"><span className="nv-mono" style={{ color: `rgb(${hueOf(chip)})` }}>{chip.code || 'C-??'} · {slot.chipId?.toUpperCase() || 'CUSTOM'} · {KIND_LABELS[kind] || '产出回执'}</span><h1>{slot.goal || chip.name || '任务目标待回读'}</h1>{output && <p>{output.summary}</p>}</header>
        {!output ? <section className="nv-report-incomplete" data-testid="night-output-partial" role="status"><h2>{ISSUE_LABELS[outputView?.validation?.status] || '产出未证实'}</h2><p>本轮没有通过结构校验的报告正文。保留运行状态与原始证据，等待人工核对。</p><ul>{arr(outputView?.validation?.issues).map((issue, index) => <li key={index}>{typeof issue === 'string' ? issue : issue.message || JSON.stringify(issue)}</li>)}</ul>{slot.firstFailure && <p>首败：{short(slot.firstFailure?.reason || slot.firstFailure)}</p>}</section>
          : kind === 'learning-report' ? <LearningBody content={content} onSuggestion={openSuggestion} /> : kind === 'test-report' ? <TestBody content={content} slot={slot} onAction={openAction} actionDisabled={actionDisabled} /> : kind === 'branch-delivery' || kind === 'custom-branch' ? <DeliveryBody content={content} acceptance={output.acceptance || slot.acceptance} slot={slot} onAction={openAction} actionDisabled={actionDisabled} /> : <GenericBody kind={kind} content={content} />}
        {decisions.kind === 'error' && <p className="nv-backlog-banner" role="alert">早上决策状态暂时读不到：{decisions.error}<button type="button" className="nv-nbtn" onClick={decisions.read}>重新读取</button></p>}
        <footer className="nv-report-footer"><p>建议与产出不会自动改动工作台、主分支或知识仓库。</p>{slot.branch && <div className="nv-report-action-row">{['merge', 'day', 'continue', 'discard'].map(action => <NightV2ActionButton key={action} action={action} slotId={slot.slotId} disabled={actionDisabled} onClick={event => openAction(action, event.currentTarget)} />)}{decision?.status === 'unknown' && <button type="button" className="nv-nbtn" data-testid={`night-action-query-${slot.slotId}`} onClick={event => flow.recoverAction(decision, event.currentTarget)}>查询原操作</button>}</div>}{decision && <p className="nv-decision-state" data-testid={`night-decision-${slot.slotId}`}>早上决策：{decision.status === 'unknown' ? '原操作结果未知，先查询' : decision.status === 'merged' ? '已本地合并' : decision.status === 'dispatched' ? '已派白天' : decision.status === 'queued' ? '已排今晚候选' : decision.status === 'discarded' ? 'worktree 已丢弃' : decision.status === 'conflict' ? '冲突，未合并' : '待核对'}</p>}</footer>
      </div></div>
  </article><NightV2OperationDialog flow={flow} /></>;
}

export function NightOutputDetail({ runId, slotId, onBack, onDecisionChange }) {
  const [state, setState] = useState({ kind: 'loading' });
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    let alive = true;
    async function load() {
      setState({ kind: 'loading' });
      try {
        const [morning, outputView] = await Promise.all([
          request(`/night-v2/morning-report?runId=${encodeURIComponent(runId)}`),
          request(`/night-v2/output?runId=${encodeURIComponent(runId)}&slotId=${encodeURIComponent(slotId)}`),
        ]);
        if (morning?.schema !== 'night-v2-morning' || morning.runId !== runId || outputView?.schema !== 'night-v2-output-view' || outputView.runId !== runId || outputView.slotId !== slotId) throw new Error('报告回执身份不一致，已停止展示。');
        const slot = arr(morning.slots).find(item => item.slotId === slotId);
        if (!slot) throw new Error('晨报中找不到该槽位，已停止展示。');
        if (alive) setState({ kind: 'ready', morning, slot, outputView });
      } catch (error) { if (alive) setState({ kind: 'error', message: error.message || '报告读取失败' }); }
    }
    load();
    return () => { alive = false; };
  }, [runId, slotId]);
  const content = state.kind === 'loading' ? <section className="nv-report-loading" role="status" data-testid="night-output-loading"><Reading label="正在读取锁定产出与晨报"/></section> : state.kind === 'error' ? <section className="nv-report-incomplete" role="alert" data-testid="night-output-error"><h2>报告暂时读不到</h2><p>{state.message}</p><button type="button" className="nv-nbtn" onClick={() => backRef.current?.()}>返回晨报</button></section> : <DetailDocument morning={state.morning} slot={state.slot} outputView={state.outputView} onBack={onBack} onDecisionChange={onDecisionChange} />;
  return <><ReadReveal pending={state.kind==='loading'} ready={state.kind==='ready'} target=".nv-report-shell"/>{content}</>;
}
