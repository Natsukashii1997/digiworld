import { flyData } from './data-flight.js';
import { Reading, ReadReveal } from './ScanMotion.jsx';
import { LcdText, useReducedMotion } from "./v14.jsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Dialog } from "./components.jsx";
import { request } from "./api.js";
import { StoragePanel, downloadFullBackup, fullBackupNotice, exportMergeJson, MERGE_JSON_NOTICE } from "./StoragePanel.jsx";
import { CapabilitySettings } from "./CapabilitySettings.jsx";
import { DaemonCapabilityUI } from "./DaemonCapabilityUI.jsx";
import { AiHotSettings, useAiHot } from "./LifePages.jsx";
import { ReaUpdate } from "./ReaUpdate.jsx";
import "./agents-v16.css";
import { ProjectSettings } from "./ProjectSettings.jsx";
import { SourcePolicy } from "./KnowledgeV16.jsx";
import { KnowledgeForm } from "./Knowledge.jsx";
import {
  ProfilePanel,
  zonesConfig,
  vaultOf,
  useZoneSummary,
} from "./KnowledgeZones.jsx";
import { Permission } from "./Calendar.jsx";
import { calendarPermissionLabel } from "./settings-v16.js";
import { MARK_GLYPH, selfTestRows, selfTestTally, readAcks, writeAck, reconfirmSources } from "./settings-selftest.js";
import "./settings-v16.css";
function Row({ title, detail, children }) {
  return (
    <div className="st-row">
      <div className="st-cap">
        <b>{title}</b>
        {detail && <small>{detail}</small>}
      </div>
      <div className="st-val">{children}</div>
    </div>
  );
}
// 开关只表示状态：点它打开现有的预览抽屉，确认后由真实状态决定拨不拨过去
const STEP = { easing: "steps(1, end)" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 值变了才按帧动：首次渲染不动，减少动态效果时直接到位
function useChanged(value, run) {
  const reduced = useReducedMotion(), prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from !== value && !reduced) return run(from);
  }, [value]);
}
function Switch({ on, label, disabled, onClick }) {
  const knob = useRef(null);
  // 拨片三帧滑过去；从「读取中」（on 还没有值）到读出真实状态不算拨动，直接到位（#127：不把读取完成演成用户切换）
  useChanged(on, (from) => {
    if (from === undefined || !!from === !!on) return;
    knob.current?.animate([0, 1, 2, 3].map((k) => ({ offset: k / 4, transform: `translateX(${Math.round((on ? -26 : 26) * (3 - k) / 3)}px)`, ...STEP })).concat({ transform: "translateX(0)" }), { duration: 200 });
  });
  return (
    <button type="button" className={`st-switch${on ? " on" : ""}`} role="switch" aria-checked={!!on} aria-label={`${label}：${on ? "已开启" : "关闭"}，点了先预览`} disabled={disabled} onClick={onClick}>
      <span className="st-track"><span className="st-knob" ref={knob} /></span>
    </button>
  );
}
// 自检一行：标记 · 名字 · 结果句 · 右端操作。phase：wait（还没跑到）/ typing（点点点）/ done
function SelfTestLine({ row, phase, dots, children }) {
  const [shade, setShade] = useState(null);
  // 标记变化：原标记 → ▒ → ░ → 新标记
  useChanged(row.mark, (from) => {
    // 读取完成（loading → 结果）也过一次 ▒░，交代「这一行刚读到」（#127）
    if (phase !== "done") return;
    let live = true;
    (async () => { for (const g of ["▒", "░"]) { if (!live) return; setShade(g); await wait(90); } if (live) setShade(null); })();
    return () => { live = false; setShade(null); };
  });
  return (
    <li className={`st-line ${row.mark} ${phase}`} data-line={row.id}>
      <span className="st-mk" aria-hidden="true">[{shade || MARK_GLYPH[row.mark]}]</span>
      <b className="st-name">{row.label}</b>
      <span className="st-dots" aria-hidden="true">{phase === "typing" ? dots : ""}</span>
      <span className="st-res">{row.result}</span>
      <span className="st-ctl">{children}</span>
    </li>
  );
}
// 开页自检：逐行出名字，点点点三帧后出标记与结果；重新自检重放。减少动态效果时直接全部到位。
function useSelfTestBoot(count) {
  const reduced = useReducedMotion();
  const [run, setRun] = useState(0), [at, setAt] = useState({ i: reduced ? count : 0, dots: "" });
  useEffect(() => {
    if (reduced) return setAt({ i: count, dots: "" });
    let live = true;
    (async () => {
      for (let i = 0; i < count; i++) for (const dots of [" .", " . .", " . . ."]) { if (!live) return; setAt({ i, dots }); await wait(70); }
      if (live) setAt({ i: count, dots: "" });
    })();
    return () => { live = false; };
  }, [run, reduced]);
  const done = at.i >= count;
  return { done, shown: Math.min(at.i, count), dots: at.dots, phase: (i) => (done || i < at.i ? "done" : i === at.i ? "typing" : "wait"), replay: () => setRun((n) => n + 1) };
}
// 计数液晶：数字变了分四帧揭开（底边逐帧放下，从上往下露出）
function TallyLcd({ text, label }) {
  const box = useRef(null);
  useChanged(text, () => { box.current?.querySelector("svg")?.animate([3, 2, 1, 0].map((k, i) => ({ offset: i / 3, clipPath: `inset(0 0 ${k * 33}% 0)`, ...STEP })).concat({ clipPath: "inset(0 0 0 0)" }), { duration: 160 }); });
  return <span ref={box}><LcdText className="st-lcd" px={3} text={text} label={label} /></span>;
}
// 下载按钮里的四格进度，打包期间循环
function usePackFrames(busy) {
  const reduced = useReducedMotion(), [k, setK] = useState(0);
  useEffect(() => {
    if (!busy || reduced) return setK(0);
    setK(1); // 一按下就进四格进度，不先闪一下「正在打包…」（#127）
    const id = setInterval(() => setK((n) => (n % 4) + 1), 120);
    return () => clearInterval(id);
  }, [busy, reduced]);
  return busy ? (k ? `打包中 ${"▮".repeat(k)}${"▯".repeat(4 - k)}` : "正在打包…") : "下载恢复包";
}
const stamp = (d) => d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace("/", "-");
const TALLY = [["bad", "要处理"], ["warn", "要看一眼"], ["ok", "正常"]];
export function SettingsV16({ state, save, notify, adoptState, navigate }) {
  const [panel, setPanel] = useState(null),
    [help, setHelp] = useState(false),
    [settings, setSettings] = useState(null),
    [history, setHistory] = useState(null),
    [calendar, setCalendar] = useState(null),
    [usage, setUsage] = useState(null),
    [storage, setStorage] = useState(null),
    [readAt, setReadAt] = useState(null),
    [acks, setAcks] = useState(() => readAcks()),
    [backupBusy, setBackupBusy] = useState(false),
    [downloaded, setDownloaded] = useState(false),
    [policyBusy, setPolicyBusy] = useState(false),
    [policyError, setPolicyError] = useState(""),
    [policyPending, setPolicyPending] = useState(false);
  const busy = useRef(false),
    generation = useRef(0);
  const { data: aihot, error: aihotError, reload: reloadAiHot } = useAiHot();
  const refresh = useCallback(async () => {
    const n = ++generation.current;
    const read = async (route, set) => {
      try {
        const value = await request(route);
        if (n === generation.current) set(value);
      } catch (e) {
        if (n === generation.current) set({ error: e.message });
      }
    };
    await Promise.all([
      read("/capabilities/settings/status", setSettings),
      read("/capabilities/settings/history", setHistory),
      read("/calendar/status", setCalendar),
      read("/capability-usage", setUsage),
      read("/storage/status", setStorage),
    ]);
    if (n === generation.current) setReadAt(new Date());
  }, []);
  useEffect(() => {
    refresh();
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    return () => {
      generation.current++;
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  const [summary] = useZoneSummary();
  const c = state.connections || {},
    sources = c.knowledgeSources || [];
  const rows = selfTestRows({ state, settings, history, calendar, usage, aihot, aihotError, storage, downloaded, acks });
  const tally = selfTestTally(rows);
  const boot = useSelfTestBoot(rows.length);
  const packLabel = usePackFrames(backupBusy);
  const rerun = () => { refresh(); reloadAiHot(); boot.replay(); };
  const close = () => {
    if (busy.current || policyBusy) return;
    setPanel(null);
    refresh();
    reloadAiHot();
  };
  const ack = (row) => setAcks(writeAck(row.id, row.ackKey));
  const capsReady = !!settings && !settings.error;
  const actions = (row) => {
    const know = row.ackKey && row.mark === "warn" ? <Button secondary onClick={() => ack(row)}>知道了</Button> : row.acked ? <span className="st-acked">已看过</span> : null;
    switch (row.id) {
      case "backup":
        return <Button className="st-pack" disabled={backupBusy || !storage || !!storage.error} onClick={async () => {
          setBackupBusy(true);
          try { const result = await downloadFullBackup(); setDownloaded(true); await refresh(); notify(fullBackupNotice(result)); }
          catch (e) { notify(e.message, "error"); }
          finally { setBackupBusy(false); }
        }}>{packLabel}</Button>;
      case "daemon":
        return <>{know}<Switch on={row.on} label={row.label} disabled={!capsReady} onClick={() => setPanel({ type: "capabilities" })} /></>;
      case "knowledge":
        return <>{know}<Button secondary onClick={() => setPanel({ type: "knowledge" })}>管理</Button></>;
      case "aihot":
        return <Switch on={row.on} label="AI HOT 网络访问" disabled={!aihot} onClick={() => setPanel({ type: "network" })} />;
      case "calendar":
        return <Button secondary onClick={() => setPanel({ type: "calendar" })}>系统设置</Button>;
      case "scan":
        return <Button secondary onClick={() => setPanel({ type: "project" })}>调整</Button>;
    }
  };
  const source = sources.find((s) => s.id === panel?.id);
  const reconfirm = reconfirmSources(state), needsReconfirm = (s) => reconfirm.some((r) => r.id === s?.id);
  async function reloadPolicy() {
    if (busy.current) return;
    busy.current = true;
    setPolicyBusy(true);
    try {
      const next = await request("/workspace", undefined, "GET", false);
      adoptState(next);
      setPanel((old) => ({ ...old, revision: next.revision }));
      setPolicyPending(false);
      setPolicyError("");
      notify("已回读知识范围，请重新核对");
    } catch (e) {
      setPolicyError(e.message);
    } finally {
      busy.current = false;
      setPolicyBusy(false);
    }
  }
  // 目录身份变化后由本人重新确认；只改这一个来源的登记，Agent 共享仍保持关闭。
  async function reconfirmSource(input) {
    if (busy.current || policyPending) return;
    busy.current = true;
    setPolicyBusy(true);
    setPolicyError("");
    try {
      const next = await request("/knowledge/reconfirm", { ...input, confirmed: true, expectedRevision: panel.revision }, "POST", false);
      adoptState(next);
      setPanel((old) => ({ ...old, revision: next.revision }));
      flyData();
      notify("目录已重新确认，回执已保存；Agent 共享与个人说明仍关闭，需要时再单独开启");
    } catch (e) {
      setPolicyError(e.message);
      if (!e.status || e.status === 409 || e.unknownResult) setPolicyPending(true);
    } finally {
      busy.current = false;
      setPolicyBusy(false);
    }
  }
  return (
    <div className="settings-v16 st-post">
      <ReadReveal pending={!summary.loaded} ready={summary.loaded&&!summary.loadError}/>
      <ReadReveal pending={!aihot&&!aihotError} ready={!!aihot&&!aihotError}/>
      <ReadReveal pending={!calendar} ready={!!calendar&&!calendar.error}/>
      <header className="st-bar">
        <h1>设置<span className="st-en">SELF-TEST</span></h1>
        <span className="st-grow" />
        <span className="st-readat">{readAt ? `读取于 ${stamp(readAt)} · ` : ""}REV {state.revision}</span>
        <button className="page-help" aria-label="这页怎么用" onClick={() => setHelp(true)}>?</button>
        <Button secondary onClick={rerun}>重新自检</Button>
      </header>
      <section className="st-panel-post" aria-label="开机自检">
        <header className="st-post-head">
          <span className="st-post-id">POST · 数码世界 · REV {state.revision}</span>
          <span role="status">{tally.loading || !boot.done ? `自检中… ${Math.min(boot.shown + 1, rows.length)} / ${rows.length}` : `自检完成 · ${rows.length} 项`}</span>
        </header>
        <ol className="st-lines">
          {rows.map((row, i) => (
            <SelfTestLine key={row.id} row={row} phase={boot.phase(i)} dots={boot.dots}>
              {actions(row)}
            </SelfTestLine>
          ))}
        </ol>
        <div className="st-extra">
          <span className="st-lbl">数据</span>
          <Button secondary onClick={async () => { try { await exportMergeJson(); notify(MERGE_JSON_NOTICE); } catch (e) { notify(e.message, "error"); } }}>导出可合并数据 JSON</Button>
          <Button secondary onClick={() => setPanel({ type: "storage" })}>导入备份</Button>
          <Button secondary disabled={!storage?.finderAvailable} onClick={async () => { try { await request("/storage/reveal", {}); notify("已请求访达显示数据目录"); } catch (e) { notify(e.message, "error"); } }}>在访达中显示</Button>
          <span className="st-grow" />
          <Button secondary className="st-danger" onClick={() => setPanel({ type: "storage" })}>从完整备份恢复…</Button>
        </div>
        <div className="st-extra">
          <span className="st-lbl">工具</span>
          <ReaUpdate />
        </div>
        <footer className={`st-post-foot ${tally.bad ? "has-bad" : tally.warn ? "has-warn" : "clear"}`}>
          {TALLY.map(([k, label]) => (
            <span key={k} className={`st-tally ${k}`}><TallyLcd text={boot.done ? String(tally[k]).padStart(2, "0") : "00"} label={`${label} ${boot.done ? tally[k] : 0}`} /><small>{label}</small></span>
          ))}
          <span className="st-grow" />
          <span className="st-verdict" role="status">{boot.done ? tally.verdict : "自检中…"}</span>
        </footer>
      </section>
      {settings?.error && <p className="inline-error" role="alert">授权状态读取失败：{settings.error}</p>}
      <p className="st-foot">默认关闭；开启前先预览，每次外部写入仍单独确认。每行右边就是它的操作。</p>
      {panel && (
        <Dialog
          drawer
          recoverFocus
          title={
            {
              capabilities: "配置授权能力",
              daemon: "配置常驻服务",
              network: "配置网络访问",
              project: "项目空间设置",
              source: "知识源开放与排除",
              profile: "个人说明 MCP",
              calendar: "日历与提醒权限",
              knowledge: "知识开放",
              storage: "数据与备份",
            }[panel.type]
          }
          onClose={close}
        >
          {panel.type === "capabilities" && (
            <CapabilitySettings
              onChanged={refresh}
              onBusyChange={(v) => {
                busy.current = v;
              }}
            />
         )}
          {panel.type === "capabilities" && (
            <p className="st-more">
              <Button secondary onClick={() => { if (!busy.current) setPanel({ type: "daemon" }); }}>
                查看服务状态…
              </Button>
            </p>
          )}
          {panel.type === "knowledge" && (
            <div className="st-group">
              {sources.map((s) => (
                <Row key={s.id} title={s.name} detail={`${s.kind} · ${s.excludedFolders?.length || 0} 个排除目录`}>
                  {needsReconfirm(s)
                    ? <span className="st-dot bad">需重新确认</span>
                    : <span className={`st-dot ${s.agentSharing ? "on" : ""}`}>{s.agentSharing ? "已开放" : "关闭"}</span>}
                  <Button secondary aria-label={`管理知识源 ${s.name}`} onClick={() => { setPolicyError(""); setPanel({ type: "source", id: s.id, revision: state.revision }); }}>管理</Button>
                </Row>
              ))}
              {!sources.length && (
                <Row title="知识源" detail="尚未连接来源"><span>无已连接来源</span></Row>
              )}
              <Row title="个人说明 MCP" detail={summary?.mcp?.url || summary?.loadError || summary?.mcp?.error || <Reading mini label="读取MCP状态"/>}>
                <span className={`st-dot ${state.knowledgeZones?.profileSharing ? "on" : ""}`}>{state.knowledgeZones?.profileSharing ? "已开放" : "关闭"}</span>
                <Button secondary onClick={() => setPanel({ type: "profile" })}>接入与授权</Button>
              </Row>
            </div>
          )}
          {panel.type === "storage" && (
            <StoragePanel state={state} adoptState={adoptState} notify={notify} compact />
          )}
          {panel.type === "daemon" && (
            <DaemonCapabilityUI
              onBusyChange={(v) => {
                busy.current = v;
              }}
            />
          )}
          {panel.type === "network" && (
            <AiHotSettings notify={notify} onChanged={reloadAiHot} />
          )}
          {panel.type === "project" && (
            <ProjectSettings
              state={state}
              notify={notify}
              adoptState={adoptState}
              onBusyChange={(v) => {
                busy.current = v;
              }}
            />
          )}
          {panel.type === "source" &&
            (source ? (
              <div className="st-panel">
                {needsReconfirm(source) && (
                  <section className="st-reconfirm" aria-label="重新确认目录">
                    <p role="status">需重新确认目录：目录身份已变化，读取与 Agent 共享已暂停。核对路径仍是你允许读取的知识目录后再确认；确认后共享保持关闭。</p>
                    <KnowledgeForm
                      mode="reconfirm"
                      source={source}
                      busy={policyBusy ? "reconfirm" : ""}
                      pending={policyPending}
                      onSubmit={reconfirmSource}
                      onRefresh={reloadPolicy}
                      onCancel={() => setPanel({ type: "knowledge" })}
                    />
                  </section>
                )}
                <SourcePolicy
                  source={source}
                  busy={policyBusy}
                  blocked={policyPending}
                  onSave={async (patch) => {
                    if (busy.current || policyPending) return;
                    busy.current = true;
                    setPolicyBusy(true);
                    setPolicyError("");
                    try {
                      const next = await request(
                        "/knowledge/policy",
                        {
                          ...patch,
                          confirmed: true,
                          expectedRevision: panel.revision,
                        },
                        "POST",
                        false,
                      );
                      adoptState(next);
                      setPanel((old) => ({ ...old, revision: next.revision }));
                      flyData();
                      notify("知识范围已保存");
                    } catch (e) {
                      setPolicyError(e.message);
                      if (!e.status || e.status === 409 || e.unknownResult)
                        setPolicyPending(true);
                    } finally {
                      busy.current = false;
                      setPolicyBusy(false);
                    }
                  }}
                />
              </div>
            ) : (
              <p>该来源已移除，请关闭后重新核对。</p>
            ))}
          {panel.type === "profile" && (
            <ProfilePanel
              state={state}
              config={zonesConfig(state)}
              vault={vaultOf(state)}
              mcp={summary?.mcp}
              blocked={policyPending || policyBusy}
              adoptState={adoptState}
              notify={notify}
              onReconfirm={(source) => { setPolicyError(""); setPanel({ type: "source", id: source.id, revision: state.revision }); }}
            />
          )}
          {["source", "profile"].includes(panel.type) && policyError && (
            <p role="alert">{policyError}</p>
          )}
          {["source", "profile"].includes(panel.type) && policyPending && (
            <Button
              secondary
              disabled={policyBusy}
              onClick={reloadPolicy}
            >
              重新读取知识范围
            </Button>
          )}
          {panel.type === "calendar" && (
            <div className="st-panel">
              {calendar?.available ? (
                calendarPermissionLabel(calendar) === "已授权" ? (
                  <p>日历：已授权 · 提醒事项：已授权</p>
                ) : (
                  <Permission
                    access={calendar.access}
                    onGranted={refresh}
                    notify={notify}
                  />
                )
              ) : (
                <p role="status">
                  {calendar?.error || calendar?.reason || <Reading label="正在读取权限"/>}
                </p>
              )}
              <p>撤销或更改权限：系统设置 → 隐私与安全性 → 日历 / 提醒事项。</p>
              <Button secondary onClick={refresh}>
                刷新权限
              </Button>
            </div>
          )}
        </Dialog>
      )}
      {help && (
        <Dialog
          recoverFocus
          title="设置 · 这页怎么用"
          onClose={() => setHelp(false)}
        >
          <div className="st-help">
            <p>
              开页先自检：每行一项，[✗] 要处理、[!] 要看一眼、[?] 读取失败、[●] 外部访问开着、[✓] 正常、[·] 还没配置；有问题的排最上，右边就是它的操作。
            </p>
            <p>
              开关只表示状态，点它先进预览抽屉；开启能力沿用预览、备份、确认、回读与留痕，默认关闭；每次实际写入仍单独确认。「知道了」只记在这台机器的浏览器里，出现新的失败或未知记录会再亮。
            </p>
            <p>
              普通备份以合并方式导入，不覆盖历史。完整备份含主库、操作日志与逆向图片，不含 REA 原始证据；恢复到新的目录并校验，保留原目录，切换由你完成。生成记录不证明下载文件已保存到磁盘。旧浏览器数据检查入口在「数据与备份」抽屉里。
            </p>
            <p>
              日历与提醒权限由系统管理；最近使用只取本机实际调用留痕，读取失败表示未知。
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
