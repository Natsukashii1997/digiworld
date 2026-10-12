import { flyData } from './data-flight.js';
import { Reading, ReadReveal } from './ScanMotion.jsx';
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  HardDrive,
  Folder,
  BookOpen,
  CalendarDays,
  Radio,
  Library,
} from "lucide-react";
import { Button, Dialog, PageHeading, ScrollFade } from "./components.jsx";
import { PageChoices } from "./PageChoices.jsx";
import { request } from "./api.js";
import { StoragePanel } from "./StoragePanel.jsx";
import { CapabilitySettings } from "./CapabilitySettings.jsx";
import { ModelCapabilityUI } from "./ModelCapabilityUI.jsx";
import { DaemonCapabilityUI } from "./DaemonCapabilityUI.jsx";
import { AiHotSettings, useAiHot } from "./LifePages.jsx";
import { ProjectSettings } from "./ProjectSettings.jsx";
import { SourcePolicy } from "./KnowledgeV16.jsx";
import {
  ProfilePanel,
  zonesConfig,
  vaultOf,
  useZoneSummary,
} from "./KnowledgeZones.jsx";
import { Permission } from "./Calendar.jsx";
import {
  SETTINGS_CATEGORIES,
  permissionRows,
  savepointThresholds,
  calendarPermissionLabel,
} from "./settings-v16.js";
import "./settings-v16.css";
const icons = [
  ShieldCheck,
  HardDrive,
  Folder,
  BookOpen,
  CalendarDays,
  Radio,
  Library,
];
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
export function SettingsV16({ state, save, notify, adoptState, navigate }) {
  const [category, setCategory] = useState("security"),
    [panel, setPanel] = useState(null),
    [help, setHelp] = useState(false),
    [settings, setSettings] = useState(null),
    [calendar, setCalendar] = useState(null),
    [usage, setUsage] = useState(null),
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
      read("/calendar/status", setCalendar),
      read("/capability-usage", setUsage),
    ]);
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
    sources = c.knowledgeSources || [],
    thresholds = savepointThresholds(c),
    rows = permissionRows(state, settings, calendar, {}, usage);
  const statuses = [
    settings?.error
      ? "状态未知"
      : settings
        ? `${rows.filter((r) => r.enabled).length} 项已开启`
        : <Reading mini label="读取MCP状态"/>,
    `REV ${state.revision}`,
    `${c.roots?.length || 0} 个目录 · ${c.projectStallDays || 7} 天`,
    `${sources.length} 个来源`,
    calendarPermissionLabel(calendar),
    aihotError
      ? "读取失败"
      : aihot
        ? `${aihot.settings.enabled ? "已开启" : "已关闭"} · ${aihot.settings.intervalHours} 小时`
        : <Reading mini label="读取MCP状态"/>,
  ];
  const close = () => {
    if (busy.current || policyBusy) return;
    setPanel(null);
    refresh();
    reloadAiHot();
  };
  const manageRow = (row) => {
    if (row.id === "knowledge" || row.id === "calendar") {
      setCategory(row.id);
      return;
    }
    if (row.id === "savepoints") {
      navigate("history");
      return;
    }
    setPanel({ type: "capabilities", cap: row.capability });
  };
  const source = sources.find((s) => s.id === panel?.id);
  return (
    <div className="settings-v16">
      <ReadReveal pending={!summary.loaded} ready={summary.loaded&&!summary.loadError}/>
      <ReadReveal pending={!aihot&&!aihotError} ready={!!aihot&&!aihotError}/>
      <ReadReveal pending={!calendar} ready={!!calendar&&!calendar.error}/>
      <PageHeading
        page="settings"
        help={
          <button
            className="page-help"
            aria-label="这页怎么用"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        }
      />
      <p className="settings-scroll-cue">左右滑动查看分类 · {SETTINGS_CATEGORIES.findIndex(([id])=>id===category)+1} / {SETTINGS_CATEGORIES.length}</p>
      <div className="st-layout">
        <ScrollFade className="settings-scroll"><PageChoices
          label="设置分类"
          className="st-nav"
          value={category}
          onChange={setCategory}
          choices={SETTINGS_CATEGORIES.map(([id, name], i) => {
            const Icon = icons[i];
            return [
              id,
              <React.Fragment>
                <Icon size={18} aria-hidden="true" />
                <span>
                  <b>{name}</b>
                  <small aria-hidden="true">{statuses[i]}</small>
                </span>
              </React.Fragment>,
            ];
          })}
        /></ScrollFade>
        <div className="st-content">
          {category === "security" && (
            <section>
              <h2 className="st-h">
                授权与安全<small>开启前先预览</small>
              </h2>
              <div className="st-group" role="table" aria-label="权限表">
                <div className="st-tr st-th" role="row">
                  <span role="columnheader">能力 · 影响范围</span>
                  <span role="columnheader">状态</span>
                  <span role="columnheader">最近一次使用</span>
                  <span role="columnheader">操作</span>
                </div>
                {rows.map((row) => (
                  <div
                    className={`st-tr${row.deferred ? " hold" : ""}`}
                    role="row"
                    key={row.id}
                    data-capability={row.id}
                  >
                    <div className="st-cap" role="cell">
                      <b>{row.title}</b>
                      <small>{row.scope}</small>
                    </div>
                    <span
                      role="cell"
                      className={`st-dot ${row.enabled ? "on" : ""}`}
                    >
                      {row.deferred ? `暂缓 · ${row.status}` : row.status}
                    </span>
                    <span className="st-last" role="cell">
                      {row.last}
                    </span>
                    <div className="st-act" role="cell">
                      <Button
                        secondary
                        disabled={
                          !!row.capability && (!settings || !!settings.error)
                        }
                        aria-label={
                          row.capability
                            ? `${row.title} · ${row.enabled ? "撤销" : "预览开启"}`
                            : undefined
                        }
                        onClick={() => manageRow(row)}
                      >
                        {row.deferred
                          ? "管理"
                          : row.capability
                            ? row.enabled
                              ? "撤销"
                              : "预览开启"
                            : "管理"}
                      </Button>
                      {["model", "daemon"].includes(row.id) && (
                        <Button
                          secondary
                          aria-label={
                            row.id === "model" ? "配置模型连接" : "配置常驻服务"
                          }
                          onClick={() => setPanel({ type: row.id })}
                        >
                          管理
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {settings?.error && (
                <p className="inline-error" role="alert">
                  授权状态读取失败：{settings.error}
                </p>
              )}
              <p className="st-foot">
                默认关闭；每次外部写入仍需单独预览确认。
              </p>
            </section>
          )}
          {category === "data" && (
            <section>
              <h2 className="st-h">
                数据与备份<small>只存本机</small>
              </h2>
              <StoragePanel
                state={state}
                adoptState={adoptState}
                notify={notify}
                compact
              />
            </section>
          )}
          {category === "project" && (
            <section>
              <h2 className="st-h">
                项目与存档<small>与项目空间共用设置</small>
              </h2>
              <div className="st-group">
                <Row title="扫描目录" detail="本地项目的发现范围">
                  <div className="st-paths st-val">
                    {c.roots?.length
                      ? c.roots.map((p) => <code key={p}>{p}</code>)
                      : "尚未配置"}
                    <Button
                      secondary
                      onClick={() => setPanel({ type: "project" })}
                    >
                      编辑目录
                    </Button>
                  </div>
                </Row>
                <Row title="停滞阈值" detail="超过阈值的项目标为停滞">
                  <span>{c.projectStallDays || 7} 天</span>
                  <Button
                    secondary
                    onClick={() => setPanel({ type: "project" })}
                  >
                    调整阈值
                  </Button>
                </Row>
                <Row title="未存档提醒" detail="供项目空间、存档点与待处理使用">
                  <span className="st-chip yellow">
                    黄 <b>{thresholds.warn} 天</b>
                  </span>
                  <span className="st-chip red">
                    红 <b>{thresholds.danger} 天</b>
                  </span>
                  <Button
                    secondary
                    onClick={() => setPanel({ type: "project" })}
                  >
                    调整提醒
                  </Button>
                </Row>
              </div>
            </section>
          )}
          {category === "knowledge" && (
            <section>
              <h2 className="st-h">
                知识与 MCP<small>只读范围独立授权</small>
              </h2>
              <div className="st-group">
                {sources.map((s) => (
                  <Row
                    key={s.id}
                    title={s.name}
                    detail={`${s.kind} · ${s.excludedFolders?.length || 0} 个排除目录`}
                  >
                    <span className={`st-dot ${s.agentSharing ? "on" : ""}`}>
                      {s.agentSharing ? "已开放" : "关闭"}
                    </span>
                    <Button
                      secondary
                      aria-label={`管理知识源 ${s.name}`}
                      onClick={() => {
                        setPolicyError("");
                        setPanel({
                          type: "source",
                          id: s.id,
                          revision: state.revision,
                        });
                      }}
                    >
                      管理
                    </Button>
                  </Row>
                ))}
                {!sources.length && (
                  <Row title="知识源" detail="尚未连接来源">
                    <Button secondary onClick={() => navigate("knowledge")}>
                      去连接
                    </Button>
                  </Row>
                )}
                <Row
                  title="个人说明 MCP"
                  detail={
                    summary?.mcp?.url ||
                    summary?.loadError ||
                    summary?.mcp?.error ||
                    <Reading mini label="读取MCP状态"/>
                  }
                >
                  <span
                    className={`st-dot ${state.knowledgeZones?.profileSharing ? "on" : ""}`}
                  >
                    {state.knowledgeZones?.profileSharing ? "已开放" : "关闭"}
                  </span>
                  <Button
                    secondary
                    onClick={() => setPanel({ type: "profile" })}
                  >
                    接入与授权
                  </Button>
                </Row>
              </div>
            </section>
          )}
          {category === "calendar" && (
            <section>
              <h2 className="st-h">
                日历与提醒<small>macOS 系统权限</small>
              </h2>
              <div className="st-group">
                <Row
                  title="日历与提醒事项"
                  detail={
                    calendar?.error ||
                    calendar?.reason ||
                    "两类权限分别由系统管理"
                  }
                >
                  <span
                    className={`st-dot ${calendarPermissionLabel(calendar) === "已授权" ? "on" : ""}`}
                  >
                    {calendarPermissionLabel(calendar)}
                  </span>
                  <Button
                    secondary
                    onClick={() => setPanel({ type: "calendar" })}
                  >
                    管理权限
                  </Button>
                </Row>
                <Row title="规划块写入日历" detail="其他日历只读显示">
                  <span>{calendar?.calendarName || "工作台"}</span>
                </Row>
                <Row title="TodoList 提醒事项列表" detail="到点在站内标记">
                  <span>{calendar?.listName || "工作台"}</span>
                </Row>
              </div>
            </section>
          )}
          {category === "network" && (
            <section>
              <h2 className="st-h">
                资讯<small>AI HOT</small>
              </h2>
              <div className="st-group">
                <Row
                  title="AI HOT 网络访问"
                  detail={
                    aihotError
                      ? `读取配置失败：${aihotError}`
                      : aihot
                        ? `当前${aihot.settings.enabled ? "允许" : "关闭"}访问 · 每 ${aihot.settings.intervalHours} 小时更新`
                        : <Reading mini label="正在读取配置"/>
                  }
                >
                  <span
                    className={`st-dot ${aihot?.settings.enabled ? "on" : ""}`}
                  >
                    {aihotError
                      ? "未知"
                      : aihot
                        ? aihot.settings.enabled
                          ? "已开启"
                          : "关闭"
                        : <Reading mini label="读取MCP状态"/>}
                  </span>
                  <Button
                    secondary
                    onClick={() => setPanel({ type: "network" })}
                  >
                    配置网络访问
                  </Button>
                </Row>
              </div>
            </section>
          )}
        </div>
      </div>
      {panel && (
        <Dialog
          drawer
          recoverFocus
          title={
            {
              capabilities: "配置授权能力",
              model: "配置模型连接",
              daemon: "配置常驻服务",
              network: "配置网络访问",
              project: "项目空间设置",
              source: "知识源开放与排除",
              profile: "个人说明 MCP",
              calendar: "日历与提醒权限",
            }[panel.type]
          }
          onClose={close}
        >
          {panel.type === "capabilities" && (
            <CapabilitySettings
              state={state}
              initialCapability={panel.cap}
              onChanged={refresh}
              onBusyChange={(v) => {
                busy.current = v;
              }}
            />
          )}
          {panel.type === "model" && (
            <ModelCapabilityUI
              adoptState={adoptState}
              onBusyChange={(v) => {
                busy.current = v;
              }}
            />
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
              navigate={navigate}
            />
          )}
          {["source", "profile"].includes(panel.type) && policyError && (
            <p role="alert">{policyError}</p>
          )}
          {["source", "profile"].includes(panel.type) && policyPending && (
            <Button
              secondary
              disabled={policyBusy}
              onClick={async () => {
                if (busy.current) return;
                busy.current = true;
                setPolicyBusy(true);
                try {
                  const next = await request(
                    "/workspace",
                    undefined,
                    "GET",
                    false,
                  );
                  adoptState(next);
                  setPanel((old) => ({
                    ...old,
                    revision: next.revision,
                  }));
                  setPolicyPending(false);
                  setPolicyError("");
                  notify("已回读知识范围，请重新核对");
                } catch (e) {
                  setPolicyError(e.message);
                } finally {
                  busy.current = false;
                  setPolicyBusy(false);
                }
              }}
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
              各页设置抽屉是这里的快捷入口，读写同一份设置。开启能力沿用预览、备份、确认、回读与留痕，默认关闭；每次实际写入仍单独确认。
            </p>
            <p>
              知识源与个人说明分别授权；存档点写入每次确认，日历与提醒权限由系统管理。最近使用只取本机实际调用留痕；没有记录显示从未使用，读取失败表示未知。
            </p>
            <p>
              普通备份以合并方式导入，不覆盖历史。完整备份含主库、操作日志与逆向图片；恢复到新的目录并校验，保留原目录，切换由你完成。生成记录不证明下载文件已保存到磁盘。旧浏览器数据检查入口保留。
            </p>
            <p>
              AI HOT 只读公开接口并缓存，设置草稿须保存；学习书架只读索引 PDF /
              EPUB。模型连接意向草稿界面已移除，历史 state.model 数据保留。
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
