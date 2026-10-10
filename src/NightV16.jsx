import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, GripVertical, LockKeyhole, Moon, Plus, Settings2, Trash2, Wifi, X } from 'lucide-react';
import { PageHeading } from './components.jsx';
import { prefersReduced } from './v14.jsx';
import { CrestIcon, Pixel } from './pixel.jsx';
import { request } from './api.js';
import { NIGHT_V2_CRESTS, NIGHT_V2_CREST_NAMES } from './night-v2-crests.js';
import { NightMorningView, NightOutputDetail } from './NightV2Results.jsx';
import {
  NIGHT_V2_PRESETS, NIGHT_V2_COLORS, NIGHT_V2_ICONS, NIGHT_V2_OUTPUTS,
  nightV2Of, addSlot, removeSlot, reorderSlots, reviseChip, createCustomChip,
  duplicateCustomChip, deleteCustomChip, updateSlot, archiveSupplement,
  topicCandidates,
} from './night-v2-model.js';
import './night-v16.css';

const HUES = {
  violet: '168,145,255', orange: '255,138,36', cyan: '77,227,255',
  pink: '255,143,184', yellow: '255,209,102', mint: '143,227,196',
  slate: '139,152,184', green: '143,227,196', purple: '168,145,255',
};
const OUTPUT_LABELS = { report: '报告', list: '清单', branch: '分支', brief: '一页简报' };
const ICON_FALLBACK = { learn: 'LEARN', push: 'PUSH', test: 'TEST', review: 'REVIEW', deps: 'DEPS', brief: 'BRIEF', custom: 'CUSTOM' };
const AGENTS = [{ id: 'claude', label: 'Claude Code', sprite: 'metalgreymon16' }, { id: 'codex', label: 'Codex', sprite: 'machinedramon16' }];
const STARS = Array.from({ length: 30 }, (_, i) => ({ left: `${((i * 37.3) % 100).toFixed(1)}%`, top: `${((i * 23.7) % 70).toFixed(1)}%`, '--d': `${(i % 5) * .8}s` }));
const CHECK_LABELS = { power: '电源与防休眠', disk: '磁盘空间', quota: '订阅额度', backlog: '未处理分支', worktree: 'worktree 与主分支', executor: '执行者 CLI' };

function asArray(value) { return Array.isArray(value) ? value : []; }
function idOf(value) { return value?.id || ''; }
function colorOf(chip) {
  const found = NIGHT_V2_COLORS.find(value => value.id === chip?.color);
  return found?.hue || HUES[chip?.color] || HUES.slate;
}
function rgbaHue(chip) { return { '--h': colorOf(chip) }; }
function iconOf(chip) { return chip?.kind === 'custom-entry' ? 'custom' : NIGHT_V2_CRESTS[chip?.icon] ? chip.icon : NIGHT_V2_CRESTS[chip?.id] ? chip.id : 'custom'; }
function outputName(chip) {
  const entry = NIGHT_V2_OUTPUTS.find(value => value.id === chip?.output);
  return entry?.label || OUTPUT_LABELS[chip?.output] || chip?.output || '待定义';
}
function durationOf(chip, slot) {
  const n = slot?.brakeOverrides?.maxMinutes || chip?.brake?.maxMinutes;
  if (!Number.isFinite(n)) return '—';
  return n >= 60 && n % 60 === 0 ? `≤${n / 60}h` : `≤${n}m`;
}
function minsOf(chip, slot) { return slot?.brakeOverrides?.maxMinutes || chip?.brake?.maxMinutes || 0; }
function durationTotal(minutes) { return minutes >= 60 ? `≈${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, '0') : ''}` : `${minutes}m`; }
function codeOf(chip, index) { return chip?.code || `C-${String(index + 1).padStart(2, '0')}`; }
function enOf(chip) { return ICON_FALLBACK[chip?.id] || (chip?.origin === 'custom' ? 'CUSTOM' : String(chip?.id || 'CHIP').toUpperCase()); }
function outputCaption(chip) { return chip?.id === 'learn' ? '学习报告' : chip?.id === 'push' ? '分支交付' : chip?.id === 'test' ? '测试报告' : chip?.id === 'review' ? '风险清单' : chip?.id === 'deps' ? '通告清单' : chip?.id === 'brief' ? '一页简报' : outputName(chip); }
function chipAtRevision(chip, slot) {
  if (!chip || !slot) return chip;
  const snapshot = asArray(chip.templateHistory).find(item => item.revision === slot.chipRevision)?.snapshot;
  return snapshot ? { ...chip, ...snapshot } : chip;
}
function checkedReceipt(value) {
  if (!value || value.schema !== 'night-v2-status' || typeof value.status !== 'string') throw new Error('夜巡运行状态回执不完整；计划保持锁定，请重试读取。');
  if (value.status !== 'planning' && !value.runId) throw new Error('夜巡运行回执缺少 runId；计划保持锁定，请重试读取。');
  return value;
}
function clockOf(value) {
  if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) return value;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(stamp) : '待回读';
}
function remainingOf(serverNow, end) {
  const now = clockOf(serverNow);
  if (!/^\d{2}:\d{2}$/.test(now) || !/^\d{2}:\d{2}$/.test(end || '')) return '窗口时间待回读';
  const [h, m] = now.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const left = (eh * 60 + em - h * 60 - m + 1440) % 1440;
  return `窗口剩 ${Math.floor(left / 60)}h${String(left % 60).padStart(2, '0')}m`;
}
function elapsedMinutesOf(receipt) {
  const now = Date.parse(receipt?.serverNow);
  let total = 0, found = false;
  for (const slot of asArray(receipt?.slots)) {
    const start = Date.parse(slot.startedAt);
    const ended = Date.parse(slot.endedAt);
    const end = Number.isFinite(ended) ? ended : now;
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) { total += (end - start) / 60000; found = true; }
  }
  return found ? Math.floor(total) : null;
}
function phaseOf(slot, receipt) {
  if (!slot) return 'off';
  const status = String(slot.status || '').toLowerCase();
  if (receipt?.currentSlotId === slot.slotId || ['running', 'active'].includes(status)) return 'run';
  if (['done', 'completed', 'finished'].includes(status)) return 'done';
  if (['failed', 'blocked', 'skipped', 'interrupted'].includes(status)) return 'err';
  return 'wait';
}
function checkPassed(item) { return ['pass', 'passed', 'ok', 'success'].includes(String(item?.status || '').toLowerCase()); }

function Glyph({ name, size = 44 }) {
  const crestId = NIGHT_V2_CRESTS[name] ? name : 'custom';
  return <CrestIcon name={NIGHT_V2_CREST_NAMES[crestId]} className="nv-glyph" crestId={crestId} size={size} />;
}
function AgentTag({ id, role }) {
  const agent = AGENTS.find(value => value.id === id);
  return agent ? <span className="nv-agent"><Pixel sprite={agent.sprite} fit={18} /><span>{agent.label}</span>{role && <small>{role}</small>}</span> : <span className="nv-agent nv-muted">不复核</span>;
}
function Chip({ chip, index, slot, usedIndex, onClick, onDragStart, inSlot = false, focus = false, readOnly = false }) {
  const isCustomEntry = chip?.kind === 'custom-entry';
  const chipId = chip?.id || 'custom';
  return <button
    type="button" className={`nt-chip${isCustomEntry ? ' custom' : ''}${usedIndex ? ' used' : ''}${inSlot ? ' in-slot' : ''}${focus ? ' focus' : ''}`}
    data-chip-id={chipId} style={{...rgbaHue(chip), '--crest-step': Number.isFinite(index) ? index : 0}}
    draggable={!readOnly && !isCustomEntry && !inSlot}
    disabled={readOnly && isCustomEntry}
    onDragStart={onDragStart} onClick={onClick}
    aria-label={`${chip.name}芯片${usedIndex ? `，已插入第 ${usedIndex} 槽` : ''}${readOnly ? isCustomEntry ? '，夜间不可新建' : '，只读查看 Prompt' : inSlot ? '，编辑插槽' : '，打开设置'}`}
  >
    <span className="nv-chip-top"><span className="nv-mono">{codeOf(chip, index)}</span><span className="nv-mono">{enOf(chip)}</span></span>
    <span className="nv-chip-face"><Glyph name={iconOf(chip)} size={inSlot ? 42 : 54} /></span>
    <span className="nv-chip-name">{chip.name}</span>
    {inSlot ? <span className="nv-chip-sub">{slot?.topic || slot?.goal || chip.name}</span> : <span className="nv-chip-out">产出 · {isCustomEntry ? '你来定' : outputCaption(chip)}</span>}
    {!inSlot && <span className={`nv-chip-meta nv-mono${isCustomEntry ? ' placeholder' : ''}`} aria-hidden={isCustomEntry || undefined}>{isCustomEntry ? '\u00a0' : <>{durationOf(chip)}{chip.network === 'readonly' && <Wifi size={11} />}</>}</span>}
    {usedIndex > 0 && !inSlot && <span className="nv-chip-used nv-mono">#{usedIndex}</span>}
    <span className="nv-pins" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
  </button>;
}

function planFromChip(chip, slot) {
  const locked = chipAtRevision(chip, slot);
  return {
    chipId: chip.id, slotId: slot?.id || null,
    projectId: slot?.projectId || '', goal: slot?.goal || '', topic: slot?.topic || '',
    acceptance: asArray(slot?.acceptance?.length ? slot.acceptance : locked.acceptance).slice(),
    taskRedlines: asArray(slot?.taskRedlines).slice(), context: slot?.context || '',
    referenceFiles: asArray(slot?.referenceFiles).slice(), uncertainIf: slot?.uncertainIf || '',
    executor: slot?.executor || chip.executor || 'claude', reviewer: slot?.reviewer === undefined ? chip.reviewer || null : slot.reviewer,
    tonightSupplement: slot?.tonightSupplement || '',
    brakeOverrides: slot?.brakeOverrides || null,
    templatePrompt: locked.templatePrompt || '', templateRevision: slot?.chipRevision || chip.templateRevision || 1,
    name: locked.name || '', color: locked.color || 'mint', icon: locked.icon || 'brief', output: locked.output || 'report',
    canEditCode: Boolean(locked.canEditCode), network: locked.network || 'off',
    maxMinutes: locked.brake?.maxMinutes || 20, maxRounds: locked.brake?.maxRounds || 3,
  };
}
function safeText(value) { return typeof value === 'string' ? value : ''; }
function nextAcceptance(items, at, value) { return items.map((item, index) => index === at ? value : item); }
function fieldError(err) { return err?.message || '内容未保存，请核对后重试'; }

function Drawer({ chip, index, slot, draft, setDraft, onClose, onSave, onTemplateSave, onDuplicate, onDelete, onHistory, onManage, onUseChip, busy, error, state, custom = false }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const [templateEditing, setTemplateEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ownTopic, setOwnTopic] = useState(false);
  const candidates = useMemo(() => topicCandidates(state, { limit: 3 }), [state]);
  const projects = [...new Map([...asArray(state?.connections?.projects), ...asArray(state?.projects)].filter(item => item?.id).map(item => [item.id, item])).values()];
  useEffect(() => {
    const prior = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', onKey); prior?.focus?.(); };
  }, [onClose]);
  const set = (name, value) => setDraft(old => ({ ...old, [name]: value }));
  const displayChip = custom ? { ...chip, ...draft, kind: 'chip' } : chipAtRevision(chip, slot);
  const effectiveAcceptance = asArray(draft.acceptance);
  const hasAcceptance = effectiveAcceptance.some(value => safeText(value).trim());
  const customValid = safeText(draft.name).trim() && safeText(draft.templatePrompt).trim() && hasAcceptance;
  const saveDisabled = busy || (custom ? !customValid : !hasAcceptance || !(safeText(draft.goal).trim() || safeText(draft.topic).trim()) || (displayChip.canEditCode && !draft.projectId)) || draft.tonightSupplement.length > 600;
  return <>
    <div className="nv-scrim" aria-hidden="true" onMouseDown={onClose} />
    <aside ref={dialogRef} className="nv-drawer" role="dialog" aria-modal="true" aria-label={custom ? `编辑自定义芯片：${draft.name || '新芯片'}` : `编辑芯片：${displayChip.name}`} data-testid="night-edit-drawer" style={rgbaHue(displayChip)}>
      <header className="nv-dw-head">
        <span className="nv-dw-chip"><Glyph name={iconOf(displayChip)} size={28} /></span>
        <div><span className="nv-mono nv-muted">{codeOf(chip, index)} · {custom ? 'CUSTOM · 自定义' : `${enOf(chip)} · ${slot ? `插在 SLOT ${index + 1}` : '新插槽'}`}</span>
          {custom ? <input className="nv-title-input" aria-label="芯片名称" value={draft.name} maxLength={48} onChange={event => set('name', event.target.value)} /> : <h2>{displayChip.name}</h2>}
        </div>
        <button ref={closeRef} className="nv-icon-btn" aria-label="关闭芯片编辑" type="button" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="nv-dw-body">
        <div className="nv-dw-main">
          {custom ? <>
            <section className="nv-dw-field nv-custom-two"><div><h3>颜色</h3><div className="nv-hues" role="radiogroup" aria-label="芯片颜色">{NIGHT_V2_COLORS.map(color => <button type="button" key={color.id} className={`nv-hue${draft.color === color.id ? ' on' : ''}`} role="radio" aria-checked={draft.color === color.id} style={{ '--h': color.hue || HUES[color.id] || HUES.slate }} aria-label={color.label} onClick={() => set('color', color.id)} />)}</div></div>
              <div><h3>图符</h3><div className="nv-glyphs" role="radiogroup" aria-label="芯片图符">{NIGHT_V2_ICONS.map(icon => <button type="button" className={`nv-gl${draft.icon === icon.id ? ' on' : ''}`} key={icon.id} role="radio" aria-checked={draft.icon === icon.id} aria-label={icon.label} onClick={() => set('icon', icon.id)}><Glyph name={icon.id} size={20} /></button>)}</div></div></section>
            <section className="nv-dw-field"><h3>明早交回什么</h3><div className="nv-outputs" role="radiogroup" aria-label="产出形态">{NIGHT_V2_OUTPUTS.map(output => <button type="button" key={output.id} className={`nv-topic${draft.output === output.id ? ' on' : ''}`} role="radio" aria-checked={draft.output === output.id} onClick={() => set('output', output.id)}><b>{output.label}</b><small>{output.description || ''}</small></button>)}</div></section>
            <section className="nv-dw-field nv-two"><div><h3>能做什么</h3><label className="nv-toggle"><span>改代码</span><input type="checkbox" checked={draft.canEditCode} onChange={event => setDraft(old => ({ ...old, canEditCode: event.target.checked, network: event.target.checked ? 'off' : old.network }))} /><b>{draft.canEditCode ? '是 · 仅 worktree' : '否 · 只读'}</b></label><label className="nv-toggle"><span>联网</span><select aria-label="自定义芯片联网" value={draft.network} onChange={event => set('network', event.target.value)}><option value="off">断网</option><option value="readonly" disabled={draft.canEditCode}>只读</option></select></label></div>
              <div><h3>刹车</h3><label className="nv-toggle"><span>时长</span><input aria-label="自定义芯片时长分钟" type="number" min="1" max="180" value={draft.maxMinutes} onChange={event => set('maxMinutes', Number(event.target.value))} /></label><label className="nv-toggle"><span>轮次</span><input aria-label="自定义芯片轮次" type="number" min="1" max="12" value={draft.maxRounds} onChange={event => set('maxRounds', Number(event.target.value))} /></label></div></section>
            <section className="nv-dw-field"><div className="nv-field-head"><h3>Prompt</h3><span className="nv-muted">自定义芯片只有一层，改了就长期生效</span></div><textarea aria-label="自定义芯片 Prompt" className="nv-prompt-input nv-custom-prompt" value={draft.templatePrompt} onChange={event => set('templatePrompt', event.target.value)} rows={5} maxLength={16000} /></section>
          </> : <>
            <section className="nv-dw-field"><h3>今晚的主题或目标</h3>{chip.id === 'learn' && <div className="nv-topics" role="radiogroup" aria-label="今晚的主题">{candidates.map(candidate => <button type="button" key={candidate.id} className={`nv-topic${draft.topic === candidate.title && !ownTopic ? ' on' : ''}`} role="radio" aria-checked={draft.topic === candidate.title && !ownTopic} onClick={() => { set('topic', candidate.title); setDraft(old => ({ ...old, goal: old.goal || candidate.title })); setOwnTopic(false); }}><b>{candidate.title}</b><small>来自 · {candidate.source}</small></button>)}<button type="button" className={`nv-topic own${ownTopic ? ' on' : ''}`} role="radio" aria-checked={ownTopic} onClick={() => setOwnTopic(true)}>✎ 自己写</button></div>}
              {(ownTopic || chip.id !== 'learn' || !candidates.length) && <label className="nv-field-label">{chip.id === 'learn' ? '自己写主题' : '今晚目标'}<input aria-label={chip.id === 'learn' ? '自己写主题' : '今晚目标'} value={chip.id === 'learn' ? draft.topic : draft.goal} onChange={event => { if (chip.id === 'learn') setDraft(old => ({ ...old, topic: event.target.value, goal: event.target.value })); else set('goal', event.target.value); }} placeholder="请写清今晚要解决什么" /></label>}
            </section>
            <section className="nv-dw-field"><div className="nv-field-head"><h3>Prompt</h3><span className="nv-muted">变量 <em>{'{主题}'}</em> <em>{'{项目}'}</em> 运行时填入</span></div>
              {slot && <p className="nv-slot-revision">SLOT {index + 1} 执行时使用锁定模板 rev {slot.chipRevision}{slot.chipRevision !== chip.templateRevision && <>；芯片库当前为 rev {chip.templateRevision}。本槽仍用下方旧版 Prompt 与验收。采用新版需先拔出再重新插入。<button className="nv-nbtn" type="button" onClick={onManage}>查看当前库模板</button></>}</p>}
              <div className="nv-prompt"><div className="nv-seg tpl"><div className="nv-seg-head"><span><LockKeyhole size={13} />{slot ? '槽中锁定模板' : '模板 · 长期生效'} <b className="nv-mono" data-testid="night-template-revision">rev {draft.templateRevision}</b></span><span className="nv-seg-actions"><button type="button" className="nv-nbtn ghost" onClick={() => setHistoryOpen(value => !value)} aria-expanded={historyOpen}>修订历史</button>{(!slot || slot.chipRevision === chip.templateRevision) && <button type="button" className="nv-nbtn ghost" onClick={() => setTemplateEditing(value => !value)}>{templateEditing ? '取消修改' : '改模板'}</button>}</span></div>
                  {templateEditing ? <><textarea aria-label="长期模板 Prompt" className="nv-prompt-input" value={draft.templatePrompt} onChange={event => set('templatePrompt', event.target.value)} rows={9} maxLength={16000} /><button type="button" className="nv-nbtn" disabled={busy || !draft.templatePrompt.trim()} onClick={async () => { if (await onTemplateSave(draft.templatePrompt, draft.templateRevision)) setTemplateEditing(false); }}>保存模板修订</button></> : <p className="nv-template-text">{draft.templatePrompt}</p>}
                  {historyOpen && <ol className="nv-revisions" aria-label="模板修订历史">{asArray(chip.templateHistory).map(item => <li key={item.revision}><button type="button" onClick={() => onHistory(item)} aria-label={`查看模板 revision ${item.revision}`}>rev {item.revision} · {item.at || '初始模板'}</button></li>)}</ol>}
                </div>
                <div className="nv-seg tonight"><div className="nv-seg-head"><span><Moon size={13} />今晚补充 · 只用这一次</span><span className="nv-mono nv-muted">{draft.tonightSupplement.length} / 600</span></div><textarea data-testid="night-tonight-supplement" aria-label="今晚补充" value={draft.tonightSupplement} onChange={event => set('tonightSupplement', event.target.value)} maxLength={600} rows={3} placeholder="仅给今晚的补充要求；执行后归档，不改长期模板" /></div>
              </div></section>
            <section className="nv-dw-field nv-two"><div><h3>谁来做</h3><label className="nv-pick">执行者<select aria-label="夜巡执行者" value={draft.executor} onChange={event => setDraft(old => ({ ...old, executor: event.target.value, reviewer: old.reviewer === event.target.value ? null : old.reviewer }))}>{AGENTS.map(agent => <option key={agent.id} value={agent.id}>{agent.label}</option>)}</select><ChevronDown size={13} /></label><label className="nv-pick">复核者<select aria-label="夜巡复核者" value={draft.reviewer || ''} onChange={event => set('reviewer', event.target.value || null)}><option value="">不复核</option>{AGENTS.filter(agent => agent.id !== draft.executor).map(agent => <option key={agent.id} value={agent.id}>{agent.label}</option>)}</select><ChevronDown size={13} /></label></div>
              <div><h3>刹车</h3><div className="nv-brakes"><label>时长 <input type="number" aria-label="单槽时长分钟" min="1" max="180" value={draft.brakeOverrides?.maxMinutes || displayChip.brake?.maxMinutes || 45} onChange={event => set('brakeOverrides', { maxMinutes: Number(event.target.value), maxRounds: draft.brakeOverrides?.maxRounds || displayChip.brake?.maxRounds || 4 })} />m</label><label>轮次 <input type="number" aria-label="单槽轮次" min="1" max="12" value={draft.brakeOverrides?.maxRounds || displayChip.brake?.maxRounds || 4} onChange={event => set('brakeOverrides', { maxRounds: Number(event.target.value), maxMinutes: draft.brakeOverrides?.maxMinutes || displayChip.brake?.maxMinutes || 45 })} /></label><div>联网 <b>{displayChip.network === 'off' ? '断网' : '只读'}</b></div></div></div></section>
            <section className="nv-dw-field"><label className="nv-field-label">项目<select aria-label="夜巡项目" value={draft.projectId} onChange={event => set('projectId', event.target.value)}><option value="">不指定项目</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name || project.title || project.id}</option>)}</select></label>{displayChip.canEditCode && !draft.projectId && <p className="nv-inline-error">可改代码的芯片必须先指定项目。</p>}<label className="nv-field-label">背景<textarea aria-label="夜巡背景" value={draft.context} onChange={event => set('context', event.target.value)} rows={2} /></label><label className="nv-field-label">任务红线<textarea aria-label="任务红线" value={draft.taskRedlines.join('\n')} onChange={event => set('taskRedlines', event.target.value.split('\n'))} rows={2} placeholder="一行一条；触碰只停当前任务" /></label></section>
          </>}
          <section className="nv-dw-field"><h3>验收标准 <small>（必填，明早按这些条目判定）</small></h3><ul className="nv-accept">{effectiveAcceptance.map((value, at) => <li key={at}><Check size={13} /><input aria-label={`验收标准 ${at + 1}`} value={value} onChange={event => set('acceptance', nextAcceptance(effectiveAcceptance, at, event.target.value))} placeholder="写明可核查的完成条件" /><button type="button" className="nv-remove-accept" aria-label={`删除验收标准 ${at + 1}`} onClick={() => set('acceptance', effectiveAcceptance.filter((_, i) => i !== at))}><X size={14} /></button></li>)}<li><button type="button" className="nv-add-accept" onClick={() => set('acceptance', [...effectiveAcceptance, ''])}><Plus size={13} /> 加一条</button></li></ul>{!hasAcceptance && <p className="nv-inline-error">至少填写一条验收标准，才能保存或入槽。</p>}</section>
          {custom && <section className="nv-dw-field nv-actor-defaults"><h3>执行与复核默认值</h3><div className="nv-two"><label className="nv-toggle"><span>执行者</span><select aria-label="自定义芯片执行者" value={draft.executor} onChange={event => setDraft(old => ({ ...old, executor: event.target.value, reviewer: old.reviewer === event.target.value ? null : old.reviewer }))}>{AGENTS.map(agent => <option key={agent.id} value={agent.id}>{agent.label}</option>)}</select></label><label className="nv-toggle"><span>复核者</span><select aria-label="自定义芯片复核者" value={draft.reviewer || ''} onChange={event => set('reviewer', event.target.value || null)}><option value="">不复核</option>{AGENTS.filter(agent => agent.id !== draft.executor).map(agent => <option key={agent.id} value={agent.id}>{agent.label}</option>)}</select></label></div></section>}
          {custom && chip?.origin === 'custom' && <div className="nv-custom-actions"><button className="nv-nbtn" type="button" onClick={onUseChip} disabled={busy} aria-label="今晚使用这枚自定义芯片"><Plus size={14} />今晚使用</button><button className="nv-nbtn" type="button" onClick={onDuplicate} disabled={busy}><Copy size={14} />复制芯片</button><button className="nv-nbtn" type="button" onClick={onDelete} disabled={busy}><Trash2 size={14} />删除芯片</button></div>}
          {!custom && chip?.origin === 'custom' && <button className="nv-nbtn" type="button" onClick={onManage} disabled={busy} aria-label="管理自定义芯片模板">管理自定义模板</button>}
          {!custom && slot && <button className="nv-nbtn nv-unplug" type="button" disabled={busy} onClick={() => onDelete(slot.id)}><Trash2 size={14} />从今晚拔出</button>}
        </div>
        <aside className="nv-dw-side" aria-label={custom ? '芯片预览' : '明早你会拿到'}><h3>{custom ? '芯片预览' : '明早你会拿到'}</h3>{custom ? <div className="nv-preview-chip"><Chip chip={displayChip} index={index} onClick={() => {}} /></div> : <div className="nv-paper"><span className="nv-mono nv-muted">{outputCaption(displayChip)} · 样张</span><strong>{draft.topic || draft.goal || displayChip.name}</strong>{(chip.id === 'learn' ? ['主题与为什么学', '学习过程', '关键洞见 3–5', '对你的建议', '来源'] : ['任务目标', '过程与证据', '验收逐条', '风险与下一步']).map((line, at) => <div className="nv-paper-line" key={line}><i>{at + 1}</i><span>{line}<s /></span></div>)}</div>}<p className="nv-muted">{custom ? '保存后出现在芯片库末尾，可复制、修改或删除。' : '翻面后按产出类型查看；任何结论仍需你验收。'}</p></aside>
      </div>
      <footer className="nv-dw-foot"><span className="nv-muted">{custom ? '验收标准为空时不能保存' : '草稿只在本机保存，不会启动夜巡'}</span>{error && <span className="nv-dw-error" role="alert">{error}</span>}<button type="button" className="nv-nbtn" onClick={onClose}>取消</button><button type="button" className="nv-nbtn pri" onClick={onSave} disabled={saveDisabled}><Check size={16} />{busy ? '保存中…' : custom ? '保存芯片' : slot ? `保存到 SLOT ${index + 1}` : '插入今晚'}</button></footer>
    </aside>
  </>;
}

function ReadOnlyDrawer({ chip, slot, index, unverified, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const locked = chipAtRevision(chip, slot);
  useEffect(() => {
    const prior = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = oldOverflow; prior?.focus?.(); };
  }, []);
  function onKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...dialogRef.current.querySelectorAll('button:not([disabled])')];
    if (!controls.length) return;
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
  }
  return <>
    <div className="nv-scrim" aria-hidden="true" onMouseDown={onClose} />
    <aside ref={dialogRef} className="nv-drawer nv-readonly-drawer" role="dialog" aria-modal="true" aria-label={`只读查看芯片：${locked.name}`} data-testid="night-readonly-drawer" style={rgbaHue(locked)} onKeyDown={onKeyDown}>
      <header className="nv-dw-head"><span className="nv-dw-chip"><Glyph name={iconOf(locked)} size={28} /></span><div><span className="nv-mono nv-muted">{codeOf(locked, index)} · 夜间只读{slot ? ` · SLOT ${index + 1}` : ''}</span><h2>{locked.name}</h2></div><button ref={closeRef} className="nv-icon-btn" type="button" aria-label="关闭只读芯片" onClick={onClose}><X size={19} /></button></header>
      <div className="nv-dw-body"><div className="nv-dw-main">
        <p className="nv-readonly-note"><LockKeyhole size={16} />夜里只能查看芯片与锁定 Prompt；计划、模板和顺序暂不可修改。</p>
        {unverified && <p className="nv-readonly-warning" role="alert">计划与运行快照不一致，锁定内容待核对。当前工作台内容不能作为本轮执行依据。</p>}
        {!unverified && slot && <section className="nv-dw-field"><h3>今晚目标</h3><p>{slot.topic || slot.goal || '目标未记录'}</p>{slot.projectId && <p className="nv-muted">项目 · {slot.projectId}</p>}</section>}
        {(!unverified || !slot) && <section className="nv-dw-field"><div className="nv-field-head"><h3>Prompt</h3><span className="nv-muted">{slot ? `入槽锁定 rev ${slot.chipRevision}` : unverified ? '当前库模板，仅供参考' : `当前模板 rev ${chip.templateRevision}`}</span></div><div className="nv-prompt"><div className="nv-seg tpl"><div className="nv-seg-head"><span><LockKeyhole size={13} />{slot ? '槽中锁定模板' : '长期模板'}</span></div><p className="nv-template-text">{locked.templatePrompt || '模板内容未记录'}</p></div>{slot && <div className="nv-seg tonight"><div className="nv-seg-head"><span><Moon size={13} />今晚补充 · 只用这一次</span></div><p className="nv-template-text">{slot.tonightSupplement || '没有今晚补充'}</p></div>}</div></section>}
        {!unverified && <section className="nv-dw-field"><h3>验收标准</h3><ul className="nv-readonly-list">{asArray(slot?.acceptance?.length ? slot.acceptance : locked.acceptance).map((item, at) => <li key={at}><Check size={14} />{item}</li>)}</ul></section>}
        {!unverified && <section className="nv-dw-field nv-readonly-details"><h3>执行边界</h3><p>执行者：{AGENTS.find(agent => agent.id === (slot?.executor || locked.executor))?.label || '待回读'} · 复核者：{AGENTS.find(agent => agent.id === (slot?.reviewer ?? locked.reviewer))?.label || '不复核'}</p><p>刹车：{durationOf(locked, slot)} · 最多 {slot?.brakeOverrides?.maxRounds || locked.brake?.maxRounds || '—'} 轮 · {locked.network === 'readonly' ? '只读联网' : '断网'}</p></section>}
      </div></div>
      <footer className="nv-dw-foot"><span className="nv-muted">只读回执，不会保存或启动任务</span><button type="button" className="nv-nbtn pri" onClick={onClose}>关闭</button></footer>
    </aside>
  </>;
}

function NightPlanner({ state, save, notify, navigate, morningTarget, onMorningChange }) {
  const [load, setLoad] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [runtime, setRuntime] = useState(null);
  const [runAction, setRunAction] = useState('');
  const [runError, setRunError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [editor, setEditor] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [morning, setMorning] = useState({ kind: 'idle' });
  const [showMorning, setShowMorning] = useState(true);
  const [morningRetry, setMorningRetry] = useState(0);
  const dragged = useRef(null);
  const opener = useRef(null);
  const morningChangeRef = useRef(onMorningChange);
  morningChangeRef.current = onMorningChange;
  const model = nightV2Of(state || {});
  const chips = asArray(model.chips);
  const slots = asArray(model.slots);
  const library = [...chips, ...NIGHT_V2_PRESETS.filter(chip => chip.kind === 'custom-entry')];
  const byId = new Map(chips.map(chip => [chip.id, chip]));
  const minutes = slots.reduce((total, slot) => total + minsOf(byId.get(slot.chipId), slot), 0);
  const usedIndex = chipId => slots.findIndex(slot => slot.chipId === chipId) + 1;
  const isPlanning = ['planning', 'completed', 'stopped', 'interrupted', 'global-redline']
    .includes(runtime?.status);
  const morningRunId = morningTarget || (['completed', 'stopped', 'interrupted', 'global-redline'].includes(runtime?.status) ? runtime?.runId : null);
  const canPlanTonight = isPlanning && !morningTarget;
  const planExecutionNotice = runtime?.executionMode === 'disabled' || runtime?.executionMode === 'synthetic'
    ? '真实执行未启用，今晚不会自动运行。'
    : '尚未确认今晚运行安排，请先核对执行状态。';
  const planLocked = !canPlanTonight || (Boolean(morningRunId) && showMorning);
  const isRunning = runtime?.status === 'running';
  const isPaused = runtime?.status === 'paused';
  const isBlocked = runtime?.status === 'blocked';
  const mayStopStatus = ['announced', 'ready', 'running', 'paused'].includes(runtime?.status);
  const canStop = mayStopStatus && !runtime?.stopRequestedAt;
  const showStop = mayStopStatus || runtime?.status === 'stopping';
  const snapshotMismatch = !isPlanning && planLocked && runtime?.planRevision !== model.revision;
  const runtimeSlots = new Map(asArray(runtime?.slots).map(slot => [slot.slotId, slot]));
  const checkSlotNumber = slotId => asArray(runtime?.slots).findIndex(slot => slot.slotId === slotId) + 1;
  const currentSlotIndex = slots.findIndex(slot => slot.id === runtime?.currentSlotId);
  const readReceipt = useCallback(async () => checkedReceipt(await request('/night-v2/status')), []);
  const loading = useCallback(async () => {
    setLoad('loading'); setLoadError('');
    try {
      const [, receipt] = await Promise.all([request('/workspace'), readReceipt()]);
      setRuntime(receipt); setRunError(''); setLoad('ready');
    }
    catch (cause) { setLoadError(fieldError(cause)); setLoad('error'); }
  }, [readReceipt]);
  useEffect(() => { loading(); }, [loading]);
  const closeEditor = useCallback(() => { setEditor(null); setDraft(null); setError(''); setTimeout(() => opener.current?.focus?.(), 0); }, []);
  useEffect(() => { if (planLocked && editor) closeEditor(); }, [planLocked, editor, closeEditor]);
  useEffect(() => {
    if (load !== 'ready' || !planLocked || runAction) return undefined;
    let mounted = true;
    const refresh = async () => {
      try { const next = await readReceipt(); if (mounted) { setRuntime(next); setRunError(''); } }
      catch (cause) { if (mounted) setRunError(`运行状态更新失败；保留最后一次回执。${fieldError(cause)}`); }
    };
    const timer = setInterval(refresh, 20000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { mounted = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load, planLocked, runAction, readReceipt]);
  useEffect(() => {
    if (load !== 'ready' || !morningRunId) { setMorning({ kind: 'idle' }); return undefined; }
    let active = true;
    let timer;
    setMorning({ kind: 'loading' });
    const readDetail = async () => {
      const value = await request(`/night-v2/morning-report?runId=${encodeURIComponent(morningRunId)}`);
      if (value?.schema !== 'night-v2-morning' || value.runId !== morningRunId || !Array.isArray(value.slots))
        throw new Error('晨报回执身份或内容不完整。');
      if (active) { setMorning({ kind: 'ready', report: value }); morningChangeRef.current?.(); }
      return value;
    };
    const checkExisting = async () => {
      try {
        const list = await request('/night-v2/morning-reports');
        if (list?.schema !== 'night-v2-morning-list' || !Array.isArray(list.items) || !list.items.some(item => item.runId === morningRunId)) return false;
        await readDetail();
        return true;
      } catch { return false; }
    };
    const poll = async () => {
      try { await readDetail(); return; }
      catch (readError) {
        if (!active) return;
        if (morningTarget) { setMorning({ kind: 'unknown', message: `晨报尚未可靠回读：${fieldError(readError)}` }); return; }
      }
      let receipt;
      try { receipt = await request('/night-v2/morning/reconcile', { runId: morningRunId }); }
      catch (cause) {
        if (!active || await checkExisting()) return;
        setMorning({ kind: 'unknown', message: `晨报生成结果未知：${fieldError(cause)}。请重新读取，不会自动重放。` });
        return;
      }
      if (!active) return;
      if (receipt?.schema !== 'night-v2-morning-reconcile' || receipt.runId !== morningRunId) {
        if (!(await checkExisting()) && active) setMorning({ kind: 'unknown', message: '晨报生成回执身份不符；请重新读取。' });
        return;
      }
      if (receipt.status === 'not_due') {
        setMorning({ kind: 'not_due', readyAt: receipt.readyAt });
        timer = setTimeout(poll, 30000);
        return;
      }
      if (receipt.status === 'ready' || receipt.status === 'unknown') {
        try { await readDetail(); }
        catch (cause) { if (!(await checkExisting()) && active) setMorning({ kind: 'unknown', message: `晨报已到翻面时间，但报告回读失败：${fieldError(cause)}` }); }
        return;
      }
      if (!(await checkExisting()) && active) setMorning({ kind: 'unknown', message: '晨报生成状态未知；请重新读取。' });
    };
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [load, morningRunId, morningTarget, morningRetry]);
  function openReadonly(chip, slotId = null) {
    if (chip.kind === 'custom-entry') { setInfo('night-locked'); return; }
    setViewing({ chipId: chip.id, slotId });
  }
  function openEditor(chip, slotId = null, prefill = null, manageCustom = false) {
    if (planLocked) { openReadonly(chip, slotId); return; }
    if (!editor) opener.current = document.activeElement;
    const slotIndex = slots.findIndex(slot => slot.id === slotId);
    const slot = slotIndex < 0 ? null : slots[slotIndex];
    const custom = chip.kind === 'custom-entry' || manageCustom;
    const initial = chip.kind === 'custom-entry' ? { ...chip, id: 'custom', name: '', color: 'mint', icon: 'brief', output: 'report', templatePrompt: '', acceptance: [''], canEditCode: false, network: 'readonly', brake: { maxMinutes: 20, maxRounds: 3 }, executor: 'claude', reviewer: null } : chip;
    setEditor({ chipId: chip.id, slotId, custom, isNewCustom: chip.kind === 'custom-entry', slotIndex });
    setDraft({ ...planFromChip(initial, slot), ...(prefill || {}) }); setError('');
  }
  async function commit(next, message, morningTransition = false) {
    if (planLocked && !(morningTransition && canPlanTonight && morning.kind === 'ready')) {
      setError('夜巡运行状态已锁定计划；先核对最新回执。'); return false;
    }
    setBusy(true); setError('');
    try {
      const accepted = await save(next);
      if (accepted) { notify?.(message); return true; }
      setError('本次保存未确认；内容仍留在表单，请核对后重试。');
      return false;
    } catch (cause) { setError(fieldError(cause)); return false; }
    finally { setBusy(false); }
  }
  async function saveEditor() {
    if (!editor || !draft || busy || planLocked) return;
    try {
      const cleanAcceptance = draft.acceptance.map(value => safeText(value).trim()).filter(Boolean);
      if (!cleanAcceptance.length) throw new Error('验收标准至少填写一条。');
      let next;
      if (editor.custom) {
        if (editor.isNewCustom) next = createCustomChip(state, { name: draft.name.trim(), color: draft.color, icon: draft.icon, output: draft.output, templatePrompt: draft.templatePrompt, acceptance: cleanAcceptance, canEditCode: draft.canEditCode, network: draft.network, brake: { maxMinutes: draft.maxMinutes, maxRounds: draft.maxRounds }, executor: draft.executor, reviewer: draft.reviewer });
        else next = reviseChip(state, editor.chipId, { name: draft.name.trim(), color: draft.color, icon: draft.icon, output: draft.output, templatePrompt: draft.templatePrompt, acceptance: cleanAcceptance, canEditCode: draft.canEditCode, network: draft.network, brake: { maxMinutes: draft.maxMinutes, maxRounds: draft.maxRounds }, executor: draft.executor, reviewer: draft.reviewer }, { expectedRevision: draft.templateRevision });
      } else {
        const slotDraft = { chipId: editor.chipId, projectId: draft.projectId, goal: draft.goal || draft.topic, topic: draft.topic, acceptance: cleanAcceptance, taskRedlines: draft.taskRedlines.map(value => safeText(value).trim()).filter(Boolean), executor: draft.executor, reviewer: draft.reviewer, tonightSupplement: draft.tonightSupplement, context: draft.context, referenceFiles: draft.referenceFiles, uncertainIf: draft.uncertainIf, brakeOverrides: draft.brakeOverrides };
        if (editor.slotId) {
          const { chipId: ignored, ...changes } = slotDraft;
          next = updateSlot(state, editor.slotId, changes, { expectedRevision: model.revision });
        } else next = addSlot(state, slotDraft, { expectedRevision: model.revision });
      }
      if (await commit(next, editor.custom ? '芯片已保存到本机库' : '今晚插槽已保存，未启用真实夜巡')) closeEditor();
    } catch (cause) { setError(fieldError(cause)); }
  }
  async function saveTemplate(prompt, expectedRevision) {
    try {
      const next = reviseChip(state, editor.chipId, { templatePrompt: prompt }, { expectedRevision });
      const okay = await commit(next, '长期模板已保存新 revision');
      if (okay) setDraft(old => ({ ...old, templateRevision: expectedRevision + 1 }));
      return okay;
    } catch (cause) { setError(fieldError(cause)); return false; }
  }
  async function removeCurrent(slotId) {
    try { if (await commit(removeSlot(state, slotId, { expectedRevision: model.revision }), '已从今晚拔出芯片')) closeEditor(); }
    catch (cause) { setError(fieldError(cause)); }
  }
  async function duplicateCurrent() {
    try { if (await commit(duplicateCustomChip(state, editor.chipId, { expectedRevision: model.revision }), '已复制自定义芯片')) closeEditor(); }
    catch (cause) { setError(fieldError(cause)); }
  }
  async function deleteCurrent() {
    if (!globalThis.confirm('删除这枚自定义芯片？已插槽的芯片要先拔出。')) return;
    try { if (await commit(deleteCustomChip(state, editor.chipId), '自定义芯片已删除')) closeEditor(); }
    catch (cause) { setError(fieldError(cause)); }
  }
  async function move(from, to) {
    if (planLocked || from === to || from < 0 || to < 0 || from >= slots.length || to >= slots.length || busy) return;
    try { await commit(reorderSlots(state, from, to, { expectedRevision: model.revision }), '今晚执行顺序已更新'); }
    catch (cause) { setError(fieldError(cause)); }
  }
  function onDrop(event, at) {
    event.preventDefault();
    const value = dragged.current;
    dragged.current = null;
    if (!value || planLocked) return;
    if (value.kind === 'slot') { move(value.index, Math.min(at, slots.length - 1)); return; }
    const chip = byId.get(value.id);
    if (chip && slots.length < 4) openEditor(chip);
  }
  async function actOnRun(kind) {
    if (!runtime?.runId || runAction || (kind === 'recheck' && (!isBlocked || runtime.canRecheck !== true)) || (kind === 'stop' && !canStop)) return;
    const runId = runtime.runId;
    setRunAction(kind); setRunError('');
    let actionError = null;
    try { await request(`/night-v2/${kind}`, { runId }); }
    catch (cause) { actionError = cause; }
    try {
      const next = await readReceipt();
      if (next.status !== 'planning' && next.runId !== runId) throw new Error('回读到另一轮夜巡；原操作结果仍待核对。');
      setRuntime(next);
      if (kind === 'stop') {
        if (next.status === 'stopped') notify?.('已回读确认：今晚已停止');
        else if (next.stopRequestedAt || next.status === 'stopping') setRunError('停止请求已记录，正在安全收场；尚未确认结束。');
        else setRunError(`停止结果未确认，请核对运行状态。${actionError ? fieldError(actionError) : ''}`);
      } else if (next.status === 'running') notify?.('重新检查已通过，夜巡运行状态已回读');
      else if (next.status === 'ready' && next.checks?.passed === next.checks?.total && next.checks.total > 0)
        notify?.('重新检查已通过；服务端已记录待执行状态');
      else if (next.status === 'blocked') setRunError(actionError ? `重新检查操作未确认；服务端仍显示阻断。${fieldError(actionError)}` : '重新检查仍未通过；请查看失败项与服务端重检条件。');
      else setRunError(`重新检查结果待确认。${actionError ? fieldError(actionError) : ''}`);
    } catch (cause) { setRunError(`操作结果未确认；保留上次回执，请重新读取。${fieldError(cause)}`); }
    finally { setRunAction(''); }
  }
  const showReady = load === 'ready';
  const checkItems = asArray(runtime?.checks?.items);
  const failedChecks = checkItems.filter(item => !checkPassed(item));
  const checkPassedCount = Number.isFinite(runtime?.checks?.passed) ? runtime.checks.passed : checkItems.filter(checkPassed).length;
  const checkTotal = Number.isFinite(runtime?.checks?.total) ? runtime.checks.total : checkItems.length;
  const quotaEstimate = typeof runtime?.quotaEstimatePercent === 'number' && Number.isFinite(runtime.quotaEstimatePercent) ? runtime.quotaEstimatePercent : null;
  const quotaLabel = quotaEstimate === null ? '待检查' : `≈${quotaEstimate.toFixed(1)}%`;
  const elapsedMinutes = elapsedMinutesOf(runtime);
  const usedTime = elapsedMinutes === null ? null : durationTotal(elapsedMinutes);
  const displayMorning = showReady && morning.kind === 'ready' &&
    (showMorning || Boolean(morningTarget));
  async function planTonight() {
    if (!canPlanTonight || morning.kind !== 'ready' || busy) return;
    const oldSlots = asArray(runtime?.slots);
    const untouchedPriorPlan = runtime?.planRevision === model.revision &&
      slots.length === oldSlots.length &&
      slots.every((slot, index) => slot.id === oldSlots[index].slotId);
    if (untouchedPriorPlan && slots.length) {
      let next = state;
      try {
        for (const slot of slots) {
          next = archiveSupplement(next, slot.id, { at: new Date().toISOString() });
          next = removeSlot(next, slot.id);
        }
      } catch (cause) { setError(fieldError(cause)); return; }
      if (!await commit(next, '昨夜插槽已归档，可以规划今晚', true)) return;
    }
    setShowMorning(false);
  }
  const openOutput = slotId => { window.location.hash = `#night/report/${encodeURIComponent(morning.report.runId)}/${encodeURIComponent(slotId)}`; };
  return <div className="night-v16" data-testid="night-v2" data-run-status={showReady ? runtime?.status : load}>
    <PageHeading page="night" description={displayMorning ? '昨夜芯片已翻面，逐项核对交付、缺口与新发现。' : isRunning ? '夜里自己跑，你去睡。这里可查看进度或停止今晚。' : runtime?.status === 'paused' ? '夜巡暂停中，服务端仍可在窗口内续跑；这里可停止今晚。' : '选择芯片，保存计划；是否开跑请看实际运行状态。'} help={<>{showReady && planLocked && <span className={`nv-run-state${isRunning ? ' running' : isBlocked ? ' blocked' : ''}`} role="status">{displayMorning ? '晨报待决策' : isRunning ? '运行中' : isBlocked ? '开工受阻' : runtime.status === 'paused' ? '限流暂停' : runtime.status === 'ready' ? '待执行' : runtime.status === 'announced' ? '已预告' : runtime.status === 'stopping' ? '停止中' : runtime.status === 'stopped' ? '已停止' : '状态待核对'}</span>}<button type="button" className="nv-help" aria-label="这页怎么用" onClick={() => setInfo('help')}>?</button></>} action={<div className="nv-head-actions"><button type="button" className="nv-icon-btn" aria-label="刹车与额度说明" onClick={() => setInfo('brakes')}><Settings2 size={18} /></button></div>} />
    <ul className="page-bounds"><li>{displayMorning ? '晨报仅在本机回读' : showReady && planLocked ? '夜巡状态仅在本机' : '只在本机规划'}</li><li>不合并、不推送</li><li>每周额度 ≤ 20%</li></ul>
    {load === 'loading' && <div data-testid="night-loading" role="status" aria-busy="true"><section className="nv-bay nv-loading" aria-label="读取夜巡计划中"><div className="nv-bay-top"><div><span className="nv-sk nv-w30" /><span className="nv-sk nv-h28 nv-w50" /></div><span className="nv-sk nv-w40" /></div><div className="nv-slots">{Array.from({ length: 4 }, (_, index) => <div className="nt-slot" key={index}><div className="nv-slot-well"><span className="nv-sk nv-chip-sk" /></div><div className="nv-slot-mouth"><span className="nv-led off" /><span className="nv-sk nv-w40" /></div></div>)}</div></section><section className="nv-library"><h2>芯片库</h2><div className="nv-lib-row">{Array.from({ length: 7 }, (_, index) => <span className="nv-sk nv-chip-sk" key={index} />)}</div></section></div>}
    {load === 'error' && <section data-testid="night-error" className="nv-load-error" role="alert"><h2>夜巡计划或运行状态暂时读不到</h2><p>{loadError}</p><button className="nv-nbtn pri" type="button" onClick={loading}>重试读取</button></section>}
    {showReady && <>
      {morning.kind === 'ready' && !morningTarget && <div className="nv-morning-switch" role="group" aria-label="夜巡晨报与今晚计划"><button type="button" className="nv-nbtn" aria-pressed={displayMorning} onClick={() => setShowMorning(true)}>查看昨夜晨报</button><button type="button" className="nv-nbtn pri" aria-pressed={!displayMorning} disabled={busy || !canPlanTonight} onClick={planTonight}>规划今晚</button></div>}
      {error && !editor && <p className="nv-save-error" role="alert">{error}</p>}
      {displayMorning ? <NightMorningView report={morning.report} onOpen={openOutput} onDecisionChange={onMorningChange} /> : morningTarget ? <section className="nv-morning-state" role={morning.kind === 'unknown' ? 'alert' : 'status'}><h2>{morning.kind === 'loading' ? '正在回读晨报' : '晨报暂时无法确认'}</h2><p>{morning.message || '正在读取服务端已生成的晨报；不会用当前计划代替昨夜锁定结果。'}</p><button type="button" className="nv-nbtn" onClick={() => setMorningRetry(value => value + 1)}>重新读取</button></section> : <>
      {morning.kind === 'not_due' && <p className="nv-morning-state" role="status">晨报尚未到服务端翻面时间（{clockOf(morning.readyAt)}）；页面打开时约每 30 秒复核一次。</p>}
      {morning.kind === 'unknown' && <p className="nv-morning-state" role="alert">{morning.message}<button type="button" className="nv-nbtn" onClick={() => setMorningRetry(value => value + 1)}>重新读取晨报</button></p>}
      <section className={`nv-bay${isRunning ? ' running' : isPaused ? ' paused' : isBlocked ? ' blocked' : planLocked ? ' locked' : ''}`} aria-label={isRunning ? '正在巡逻' : isPaused ? '夜巡限流暂停' : '今晚插槽'} data-testid="night-slots"><div className="nv-stars" aria-hidden="true">{STARS.map((style, index) => <i key={index} style={style} />)}</div>
        {isRunning && <span className="nv-moon-big" aria-hidden="true"><Moon size={28} /></span>}
        <header className="nv-bay-top" data-testid={isRunning ? 'night-running' : undefined}><div><span className="nv-mono nv-muted">{isRunning ? `PATROLLING · ${clockOf(runtime.serverNow)} · ${remainingOf(runtime.serverNow, model.window?.end || '07:00')}` : `TONIGHT · ${model.window?.start || '23:00'} → ${model.window?.end || '07:00'}`}</span><h2>{isRunning ? <>正在巡逻{currentSlotIndex >= 0 && <> · 第 <b className="nv-mono">{currentSlotIndex + 1}</b> 枚芯片</>}</> : slots.length ? <>今晚插了 <b className="nv-mono">{slots.length}</b> 枚芯片</> : '今晚还没插芯片'}</h2></div><div className="nv-meters"><div><span>插槽</span><b className="nv-mono">{slots.length}<small>/4</small></b></div><div><span>{isRunning ? '时长' : '计划时长'}</span><span className="nv-meter"><i style={{ width: `${isRunning ? Math.min(100, (elapsedMinutes || 0) / 450 * 100) : Math.min(100, minutes / 450 * 100)}%` }} /></span><b className="nv-mono">{isRunning ? `已用 ${usedTime || '待回读'}` : `${minutes ? durationTotal(minutes) : '0'} / 7h30`}</b></div><div><span>本周额度</span><span className="nv-meter quota"><i style={{ width: `${quotaEstimate === null ? 0 : Math.min(100, Math.max(0, quotaEstimate / 20 * 100))}%` }} /></span><b className="nv-mono">{quotaLabel} / 20%</b></div></div></header>
        {!planLocked && <p className="nv-run-unknown" data-testid="night-plan-notice" role="status"><b>{slots.length ? "计划已保存" : "当前仅规划"}</b>{planExecutionNotice}</p>}
        {isBlocked && <div className="nv-block-banner" data-testid="night-blocked" role="alert"><X size={18} aria-hidden="true" /><div className="nv-block-copy"><b>开工检查未通过，今晚不开跑</b><p>{failedChecks.length ? failedChecks.map(item => item.reason || `${CHECK_LABELS[item.id] || item.id}未通过`).join('；') : '失败项待回读'} · 已通过 {checkPassedCount}/{checkTotal} 项。{runtime.canRecheck ? `修复后可在 ${clockOf(runtime.recheckUntil)} 前重新检查。` : `当前不可重新检查；截止 ${clockOf(runtime.recheckUntil)}。`}</p><details className="nv-check-details" data-testid="night-check-list"><summary>查看 {checkTotal || 6} 类开工检查的逐槽明细</summary><ul>{checkItems.map(item => <li key={`${item.id}:${item.slotId || ''}`}><span>{CHECK_LABELS[item.id] || item.id}{item.slotId ? ` · 槽 ${checkSlotNumber(item.slotId) || '待核对'}` : ''}</span><b className={checkPassed(item) ? 'passed' : 'failed'}>{checkPassed(item) ? '通过' : item.status === 'unknown' ? '未知' : '未通过'}</b>{item.reason && <small>{item.reason}</small>}</li>)}</ul></details></div><button className="nv-nbtn pri" type="button" data-testid="night-recheck" disabled={runtime.canRecheck !== true || Boolean(runAction)} onClick={() => actOnRun('recheck')}><Check size={15} />{runAction === 'recheck' ? '检查并回读中…' : '重新检查'}</button></div>}
        {planLocked && !isRunning && !isBlocked && <p className="nv-run-unknown" role="status">{runtime.status === 'stopped' ? '今晚已停止，状态已由服务端回读。' : runtime.status === 'stopping' ? '停止请求已记录，等待安全收场。' : runtime.status === 'paused' ? '夜巡因限流暂停，仍可能在窗口内续跑；可停止今晚。' : runtime.status === 'ready' ? '开工检查已通过，等待服务端开始下一槽。' : runtime.status === 'announced' ? '今晚已预告，等待开工检查。' : '夜巡状态待确认，计划暂时锁定；请重新读取运行回执。'} <button type="button" className="nv-nbtn" onClick={loading}>重新读取</button></p>}
        {snapshotMismatch && <p className="nv-run-error" role="alert">计划与运行快照不一致，锁定内容待核对。当前工作台槽位只供辨认，不代表本轮实际执行内容。</p>}
        {runError && <p className="nv-run-error" role="alert">{runError}<button type="button" className="nv-nbtn" onClick={loading}>重新读取</button></p>}
        <div className="nv-slots">{Array.from({ length: 4 }, (_, index) => {
          const slot = slots[index], chip = slot ? chipAtRevision(byId.get(slot.chipId), slot) : null;
          const live = slot ? runtimeSlots.get(slot.id) || { slotId: slot.id, status: 'queued' } : null;
          const phase = isBlocked ? 'err' : isPaused && live?.status === 'paused' ? 'warn' : isRunning || isPaused ? phaseOf(live, runtime) : 'ok';
          return <div key={slot?.id || index} className={`nt-slot${slot ? ` st-${phase}` : ' vacant'}`} data-testid={`night-slot-${index + 1}`} style={chip ? rgbaHue(chip) : undefined} tabIndex={slot && !planLocked ? 0 : undefined} aria-label={slot && !planLocked ? `插槽 ${index + 1}：${chip?.name || '芯片'}；左右方向键换序` : undefined} onKeyDown={event => { if (!slot || planLocked) return; if (event.key === 'ArrowLeft') { event.preventDefault(); move(index, index - 1); } if (event.key === 'ArrowRight') { event.preventDefault(); move(index, index + 1); } }} draggable={Boolean(slot) && !planLocked} onDragStart={event => { if (!slot || planLocked) return; dragged.current = { kind: 'slot', index }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', slot.id); }} onDragEnd={() => { dragged.current = null; }} onDragOver={event => { if (!planLocked) event.preventDefault(); }} onDrop={event => onDrop(event, index)}>
            {slot && !planLocked && <div className="nv-slot-tools"><button type="button" aria-label={`将槽 ${index + 1} 前移`} disabled={index === 0 || busy} onClick={() => move(index, index - 1)}><ChevronLeft size={15} /></button><GripVertical size={15} aria-hidden="true" /><button type="button" aria-label={`将槽 ${index + 1} 后移`} disabled={index === slots.length - 1 || busy} onClick={() => move(index, index + 1)}><ChevronRight size={15} /></button></div>}
            <div className="nv-slot-well">{chip ? <Chip chip={chip} index={chips.findIndex(item => item.id === chip.id)} slot={slot} inSlot readOnly={planLocked} onClick={() => openEditor(chip, slot.id)} /> : planLocked ? <span className="nv-slot-hint nv-locked-hint"><LockKeyhole size={18} /><b>{isRunning ? '夜里不能换芯片' : '暂不可换芯片'}</b><small>{isRunning ? '07:05 之后再排' : '等待检查或运行结果'}</small></span> : <button type="button" className="nv-slot-hint" aria-label={`打开芯片库，为槽 ${index + 1} 选芯片`} onClick={() => document.querySelector('[data-testid="night-library"]')?.scrollIntoView({ behavior: prefersReduced() ? 'instant' : 'smooth' })}><Plus size={18} /><b>点选芯片，也可拖入</b>{index === 0 && !slots.length && <small>先到下方芯片库选一枚</small>}{slots.length > 0 && <small>还能放 {4 - slots.length} 枚</small>}</button>}
              {isRunning && chip && phase === 'run' && <div className="nv-run-over" data-testid="night-slot-progress"><div className="nv-run-row"><span className="nv-mono">{Number.isFinite(live.round) && Number.isFinite(live.maxRounds) ? `R${live.round}/${live.maxRounds}` : '执行中'}</span><span>验收待回读</span></div><span className="nv-run-bar"><i style={{ width: Number.isFinite(live.round) && Number.isFinite(live.maxRounds) && live.maxRounds > 0 ? `${Math.min(100, Math.max(0, live.round / live.maxRounds * 100))}%` : '0%' }} /></span></div>}
              {isRunning && chip && phase === 'done' && <div className="nv-run-over done">已交回 · 07:05 翻面</div>}
              {isRunning && chip && phase === 'wait' && <div className="nv-run-over wait">排队 · 开始时间待回读</div>}
              {isRunning && chip && phase === 'err' && <div className="nv-run-over err">已暂停 · 详情待回读</div>}
              {isPaused && chip && phase === 'warn' && <div className="nv-run-over wait">限流暂停 · 仍可能续跑</div>}
            </div>
            <div className="nv-slot-mouth"><span className={`nv-led ${slot ? planLocked ? phase : 'ok' : 'off'}`} /><span className="nv-mono">SLOT {index + 1}</span>{chip && <span className="nv-mono nv-est">{isRunning && live?.startedAt ? `${clockOf(live.startedAt)}${live.endedAt ? `–${clockOf(live.endedAt)}` : ' 起'}` : durationOf(chip, slot)}</span>}</div><div className={`nv-slot-foot${slot ? '' : ' muted'}`}>{slot && chip ? <><AgentTag id={slot.executor} />{slot.reviewer && <><span aria-hidden="true">→</span><AgentTag id={slot.reviewer} role="复核" /></>}{!isRunning && slot.tonightSupplement && <span className="nv-supp">✎ 今晚补充</span>}{isRunning && phase === 'run' && Number.isFinite(live?.round) && <span className="nv-live nv-mono">第 {live.round} 轮</span>}{!isRunning && slot.chipRevision !== chip.templateRevision && <span className="nv-rev-note">模板 rev {slot.chipRevision} 已锁定</span>}</> : '空'}</div>
          </div>;
        })}</div>
        <footer className="nv-bay-foot">
          {isRunning ? <span><Check size={14} />开工检查 {checkPassedCount}/{checkTotal} · 运行回执已读取</span>
            : isBlocked ? <><span><Moon size={14} />按槽位顺序执行；检查失败期间不改计划</span><span className="nv-mono">{clockOf(runtime.serverNow)} 检查未通过 · 晨报状态待回读</span></>
              : planLocked ? <span><LockKeyhole size={14} />{runtime.status === 'paused' ? '限流暂停，仍可能续跑' : runtime.status === 'ready' ? '已通过检查，等待下一槽' : runtime.status === 'announced' ? '已预告，等待开工检查' : runtime.status === 'stopping' ? '停止请求已记录，等待安全收场' : '计划已锁定，等待运行状态确认'}</span>
                : <><span><Moon size={14} />{slots.length ? '计划顺序已保存，拖动或按左右键换序' : '不插芯片，今晚就不跑；22:00 也不会提醒'}</span><span className="nv-mono">预设流程：22:00 预告 · 22:55 检查 · 07:05 翻面（尚未安排）</span></>}
          {showStop && <button type="button" className="nv-nbtn nv-stop" data-testid="night-stop" disabled={Boolean(runAction) || !canStop} onClick={() => actOnRun('stop')}><X size={15} />{runtime.stopRequestedAt ? '停止请求已记录' : runAction === 'stop' ? '停止并回读中…' : '停止今晚'}</button>}
        </footer>
      </section></>}
      <section className="nv-library" data-testid="night-library" data-locked={planLocked ? 'true' : 'false'} aria-label={planLocked ? '芯片库，只读' : '芯片库'}><header className="nv-section-title"><h2>芯片库</h2><span className="nv-mono nv-muted">{displayMorning ? '当前库模板仅供参考；昨夜锁版以晨报为准' : planLocked ? '夜里只能看 Prompt，不能换芯片' : `${library.length} 种 · ${slots.length ? '点开看 prompt 与产出' : '先点开一枚，看看它会做什么、明早交回什么'}`}</span></header><div className="nv-lib-row">{library.map((chip, index) => <Chip chip={chip} index={index} key={chip.id} usedIndex={displayMorning ? 0 : usedIndex(chip.id)} readOnly={planLocked} onClick={() => openEditor(chip)} onDragStart={event => { if (planLocked) return; dragged.current = { kind: 'library', id: chip.id }; event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('text/plain', chip.id); }} />)}</div></section>
    </>}
    {editor && draft && <Drawer key={`${editor.chipId}:${editor.custom ? 'template' : 'slot'}:${editor.slotId || ''}`} chip={editor.isNewCustom ? { id: 'custom', name: '自定义芯片', kind: 'custom-entry', color: draft.color, icon: draft.icon, output: draft.output } : byId.get(editor.chipId)} index={editor.slotIndex >= 0 ? editor.slotIndex : chips.findIndex(chip => chip.id === editor.chipId)} slot={slots.find(slot => slot.id === editor.slotId)} draft={draft} setDraft={setDraft} onClose={closeEditor} onSave={saveEditor} onTemplateSave={saveTemplate} onDuplicate={duplicateCurrent} onDelete={editor.custom ? deleteCurrent : removeCurrent} onHistory={item => setInfo(`rev ${item.revision}: ${item.prompt}`)} onManage={() => { const chip = byId.get(editor.chipId); if (chip) openEditor(chip, null, null, chip.origin === 'custom'); }} onUseChip={() => { const chip = byId.get(editor.chipId); if (chip) openEditor(chip); }} busy={busy} error={error} state={state} custom={editor.custom} />}
    {viewing && byId.get(viewing.chipId) && <ReadOnlyDrawer key={`${viewing.chipId}:${viewing.slotId || 'library'}`} chip={byId.get(viewing.chipId)} slot={slots.find(slot => slot.id === viewing.slotId)} index={viewing.slotId ? slots.findIndex(slot => slot.id === viewing.slotId) : chips.findIndex(chip => chip.id === viewing.chipId)} unverified={snapshotMismatch} onClose={() => setViewing(null)} />}
    {info && <div className="nv-info-overlay" onMouseDown={() => setInfo('')}><section className="nv-info" role="dialog" aria-label="夜巡说明" onMouseDown={event => event.stopPropagation()}><button type="button" aria-label="关闭说明" onClick={() => setInfo('')}><X size={18} /></button><h2>{info === 'brakes' ? '刹车与额度' : info === 'help' ? '夜巡怎么用' : info === 'night-locked' ? '夜间芯片库只读' : '模板修订'}</h2><p>{info === 'brakes' ? '每槽有轮次、时长与任务红线；全局红线触碰整夜停。每周额度上限 20%，实际用量以晨报回执为准。' : info === 'help' ? '从芯片库选一枚，补目标与可核查的验收标准，再插入今晚槽位。四槽按顺序执行；真实夜巡仍需另行授权。' : info === 'night-locked' ? '夜间只能查看已有芯片的 Prompt，不能新建、编辑或换序。请在本轮结束后再调整计划。' : info}</p><button className="nv-nbtn pri" onClick={() => setInfo('')}>知道了</button></section></div>}
  </div>;
}

export function NightV16(props) {
  if (props.reportTarget?.runId && props.reportTarget?.slotId) {
    const { runId, slotId } = props.reportTarget;
    return <div className="night-v16 nv-detail-view" data-testid="night-v2-detail"><NightOutputDetail runId={runId} slotId={slotId} onBack={() => props.navigate?.('night', { nightRunId: runId })} onDecisionChange={props.onMorningChange} /></div>;
  }
  return <NightPlanner {...props} />;
}
