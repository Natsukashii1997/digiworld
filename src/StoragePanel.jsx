import { Reading, ReadReveal } from './ScanMotion.jsx';
import { flyData } from './data-flight.js';
import React, { useCallback, useEffect, useState } from "react";
import { Download, Upload, HardDrive, Archive } from "lucide-react";
import { Button, Dialog } from "./components.jsx";
import { session, request } from "./api.js";
import { parse, stringify } from "./serialization.js";
import { readState as readLegacy } from "./store.js";
import { download } from "./Assets.jsx";
import { createFullBackupRecovery } from "./full-backup-recovery.js";
import { FULL_BACKUP_LIMITS, FULL_BACKUP_LIMIT_MESSAGE } from "./full-backup-contract.js";

// 设置页自检行与本面板共用的两段请求：生成并下载恢复包 / 可合并数据。提示照旧由调用方给。
export async function downloadFullBackup() {
  const result = await request("/full-backup/download", {}, "POST", true, {binaryResponse:true});
  download(result.filename, result.bytes, "application/zip");
  return result;
}
export const fullBackupNotice = (result) => `恢复包已生成并校验 ${result.fileCount} 个文件，已发起下载；请确认 ZIP 文件已保存`;
export async function exportMergeJson() {
  const backup = await request("/backup");
  download("数码世界-备份.json", stringify(backup, 2), "application/json");
}
export const MERGE_JSON_NOTICE = "可合并数据已生成并发起下载，请确认 JSON 文件已保存";

export function StoragePanel({ state, adoptState, notify, compact = false }) {
  const [directory, setDirectory] = useState(""),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [facts,setFacts] = useState(null), [factsError,setFactsError] = useState(""), [finderBusy,setFinderBusy] = useState(false);
  const reloadFacts = useCallback(async () => {
    try { setFacts(await request("/storage/status")); setFactsError(""); }
    catch (e) { setFactsError(e.message); }
  },[]);
  useEffect(() => { reloadFacts(); },[reloadFacts]);
  useEffect(() => {
    session()
      .then((s) => setDirectory(s.directory))
      .catch((e) => setError(e.message));
  }, []);
  async function inspect(backup) {
    setBusy(true);
    setError("");
    try {
      const result = await request("/import/preview", backup);
      setPreview({ ...result, backup });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={compact ? "st-storage st-group" : "settings-panel"}>
      {compact ? <div className="st-row"><div className="st-cap"><ReadReveal pending={!facts&&!factsError} ready={!!facts&&!factsError}/><b>数据目录</b><small><code>{directory || (error ? "存储位置待核实" : <Reading mini label="正在读取存储位置"/>)}</code></small><small>{facts?.size.state === "ok" ? `${facts.size.bytes.toLocaleString("zh-CN")} 字节 · ${facts.size.files} 个文件` : facts?.size.reason || (factsError ? "大小待核实" : facts ? "大小未知" : <Reading mini label="正在读取大小"/>)} · REV {state.revision}</small>{!!facts?.size.skipped?.length&&<small>{facts.size.skipped.length} 个链接或特殊文件未计入；不跟随链接。</small>}{factsError&&<small role="alert">目录信息读取失败：{factsError}</small>}</div><Button secondary disabled={finderBusy || !facts?.finderAvailable} onClick={async()=>{setFinderBusy(true);try{await request("/storage/reveal",{});notify("已请求访达显示数据目录");}catch(e){notify(e.message,"error");}finally{setFinderBusy(false);}}}>{finderBusy?"正在请求访达…":"在访达中显示数据目录"}</Button></div> : <><div className="section-head"><div><h2>本地数据</h2><p>文件主库 · 版本 {state.revision}</p></div><HardDrive size={22}/></div><code className="storage-path">{directory || (error ? "存储位置待核实" : <Reading mini label="正在读取存储位置"/>)}</code></>}
      <FullBackup busy={busy} notify={notify} onCreated={reloadFacts} compact={compact} facts={facts} factsError={factsError}/>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className={compact ? "st-row" : "setting-row"}>
        <div>
          <strong>合并导入 / 导出</strong>
          <p>JSON 用于合并资产、连接与整理任务；导入前预览，不覆盖现有历史。恢复整个工作台请使用 ZIP 恢复包。</p>
          {!compact && <p>
            候选写回的恢复全文与操作记录独立保存在 knowledge-writes
            目录，不在此备份中；需要时用下面的“完整备份”。
          </p>}
        </div>
        <div className="heading-actions">
          <Button
            secondary
            disabled={busy}
            onClick={async () => {
              try {
                await exportMergeJson();
                notify(MERGE_JSON_NOTICE);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <Download size={16} />
            导出可合并数据 JSON
          </Button>
          <label className="button secondary import-backup">
            <Upload size={16} />
            导入备份
            <input
              type="file"
              aria-label="导入备份文件"
              accept=".json,application/json"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 100 * 1024 * 1024) {
                  setError("备份文件超过 100 MB 限制");
                  return;
                }
                try {
                  await inspect(parse(await file.text()));
                } catch {
                  setError("无法解析备份文件，请选择完整的 JSON 备份");
                }
              }}
            />
          </label>
        </div>
      </div>
      <div className={compact ? "st-row" : "setting-row"}>
        <div>
          <strong>旧版浏览器数据</strong>
          <p>原始数据保留不动；仅在当前浏览器查找。</p>
        </div>
        <Button
          secondary
          disabled={busy}
          onClick={async () => {
            try {
              const legacy = await readLegacy();
              if (legacy) await inspect(legacy);
              else notify("当前浏览器没有旧版记录", "info");
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          检查并导入
        </Button>
      </div>
      {preview && (
        <Dialog title="确认合并备份" onClose={() => !busy && setPreview(null)}>
          <div className="asset-form">
            <h2>合并预览</h2>
            <div className="backup-summary">
              {Object.entries({
                assets: "资产",
                notes: "随手记",
                projects: "旧项目记录",
                agents: "旧 Agent 记录",
                references: "参考",
                knowledgeTasks: "整理任务",
                scrolls: "焚决卷",
                reverseRecords: "逆向记录",
              }).map(([key, label]) => (
                <div key={key}>
                  <span>新增{label}</span>
                  <strong>{preview.summary.added[key] ?? 0}</strong>
                </div>
              ))}
              <div>
                <span>追加版本</span>
                <strong>{preview.summary.newVersions}</strong>
              </div>
              <div>
                <span>追加候选版本</span>
                <strong>{preview.summary.knowledgeVersions ?? 0}</strong>
              </div>
              <div>
                <span>追加焚决条目</span>
                <strong>{preview.summary.scrollEntriesAdded ?? 0}</strong>
              </div>
              <div><span>新增使用与反馈</span><strong>{preview.summary.activityAdded ?? 0}</strong></div>
              <div><span>新增协同留痕</span><strong>{preview.summary.collabAdded ?? 0}</strong></div>
              <div><span>新增改版候选</span><strong>{preview.summary.candidatesAdded ?? 0}</strong></div>
              <div><span>新增 Skill 采用回执</span><strong>{preview.summary.skillSourceAdoptionsAdded ?? 0}</strong></div>
            </div>
            <p className="body-copy">
              保留当前设置、连接与兼容历史。整理任务恢复后仍需核对来源，不恢复读取授权。确认后写入本机主库，不修改原备份文件。
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button
                secondary
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                取消
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const next = await request("/import/confirm", {
                      backup: preview.backup,
                      token: preview.token,
                    });
                    adoptState(next);
                    flyData();
                    setPreview(null);
                    notify("备份已合并并保存");
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "合并中…" : "确认合并"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}

const LIST_LIMIT = 12;
function PathList({ label, items }) {
  if (!items.length) return null;
  return (
    <details className="full-backup-paths">
      <summary>
        {label} {items.length} 个文件
      </summary>
      <ul>
        {items.slice(0, LIST_LIMIT).map((p) => (
          <li key={p}>
            <code>{p}</code>
          </li>
        ))}
        {items.length > LIST_LIMIT && <li>另有 {items.length - LIST_LIMIT} 个未列出</li>}
      </ul>
    </details>
  );
}

// 完整备份（路线 v3 5.1）：整个数据目录打包为一个 zip（含清单与每个文件 SHA256）。
// 恢复只写到新的数据目录副本并校验，不覆盖当前目录；切换由用户手动完成。
function FullBackup({ busy: outerBusy, notify, onCreated, compact = false, facts, factsError }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(null),
    [done, setDone] = useState(null),
    [recoveryResult,setRecoveryResult] = useState(null),
    [recoveryReady,setRecoveryReady] = useState(false);
  const [recovery] = useState(()=>createFullBackupRecovery({call:request,identity:async()=>({dataRootIdentity:(await request("/full-backup/scope")).identity}),storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},locks:navigator.locks}));
  const showResult = result => {setRecoveryResult(result);setDone(result?.status==='complete'?result:null);};
  useEffect(()=>{let alive=true;recovery.resume().then(result=>{if(alive){showResult(result);setRecoveryReady(true);}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[recovery]);
  const disabled = busy || outerBusy;
  const unresolved = recoveryResult && !['complete','interrupted'].includes(recoveryResult.status);
  return (
    <div className={compact ? "st-row full-backup" : "setting-row full-backup"}>
      <div>
        <strong>{compact?"最近完整备份 / 恢复":"完整备份（含数据与图片）"}</strong>
        <p>REA 原始证据不随备份；摘要和日志会保留。原件请单独复制 data/reverse-evidence 目录。语音识别模型也不随备份，恢复后第一次转写视频时会自动重新下载。</p>
        {compact && <><p>上次完整备份生成并校验：{facts?.lastBackup.state === "ok" ? new Date(facts.lastBackup.at).toLocaleString("zh-CN") : facts?.lastBackup.state === "none" ? "尚无成功记录" : facts?.lastBackup.state === "pending" ? "生成记录待核对" : facts?.lastBackup.reason || (factsError ? "备份信息待核实" : facts ? "备份信息未知" : <Reading mini label="正在读取备份信息"/>)}</p>{!!facts?.lastBackup.pending&&<p role="status">另有 {facts.lastBackup.pending} 条未完成的生成记录；请核对后再决定是否重做。</p>}<p>服务端生成记录不证明下载文件已保存到你的磁盘。</p></> }
        <p className="full-backup-scope">含工作台数据与记录。历史快照保持原样；已撤销页面的记录不会导入当前主库。</p>
        {!compact && <p>
          打包主库快照、配置操作日志、知识写入日志、各集合与逆向图片。附清单与每个文件的
          SHA256。恢复前先预览新增、冲突与缺失；确认后恢复到一个新的数据目录并校验，不覆盖当前目录，切换由你手动完成。
        </p>}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {((!recoveryReady && !!error) || (recoveryResult && recoveryResult.status !== 'complete')) && <div className="full-backup-done" role="status">
          <p>{!recoveryReady?'恢复连接尚未核实，请查询上次恢复结果后继续。':recoveryResult?.status==='interrupted'?'上次恢复未完成，当前数据目录未被覆盖。可以重新选择备份。':recoveryResult?.status==='processing'?'上次恢复仍在处理，请稍后查询原操作。':'恢复结果待核对，原操作编号已保留。连接恢复后请查询，避免重复恢复。'}</p>
          <Button secondary disabled={disabled} onClick={async()=>{setBusy(true);try{showResult(await recovery.resume());setRecoveryReady(true);setError("");}catch(e){setError(e.message);}finally{setBusy(false);}}}>查询上次恢复结果</Button>
        </div>}
        {done && (
          <div className="full-backup-done" role="status">
            <p>
              已恢复到新目录并逐个校验 {done.verified} 个文件
              {done.mainDatabase ? `，主库修订 ${done.mainDatabase.revision} 可读` : ""}：
            </p>
            <code className="storage-path">{done.target}</code>
            <p>
              当前工作台仍在使用原目录。要切换：先停止工作台，再用 WORKBENCH_DATA_DIR
              指向上面的目录启动；确认无误后再自行处理旧目录。
            </p>
          </div>
        )}
      </div>
      <div className="heading-actions">
        <Button
          secondary
          disabled={disabled}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await downloadFullBackup();
              await onCreated?.();
              notify(fullBackupNotice(result));
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Archive size={16} />
          {busy && !preview ? "正在处理…" : "下载恢复包 ZIP"}
        </Button>
        <label className="button secondary import-backup">
          <Upload size={16} />
          从完整备份恢复
          <input
            type="file"
            aria-label="选择完整备份文件"
            accept=".zip,application/zip"
            disabled={disabled || !recoveryReady || !!unresolved}
            onChange={async (e) => {
              const file = e.target.files[0];
              e.target.value = "";
              if (!file) return;
              setError("");
              setDone(null);
              if (file.size > FULL_BACKUP_LIMITS.archiveBytes) {
                setError(FULL_BACKUP_LIMIT_MESSAGE);
                return;
              }
              setBusy(true);
              try {
                if(recoveryResult){await recovery.acknowledge(recoveryResult.operationId);showResult(null);}
                setPreview(await request("/full-backup/upload", file, "POST", true, {binaryUpload:true}));
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      {preview && (
        <Dialog title="完整备份恢复预览" onClose={() => !busy && setPreview(null)}>
          <div className="asset-form full-backup-restore">
          <div className="full-backup-restore-body">
            <h2>恢复前预览</h2>
            <p className="body-copy">
              备份时间 {new Date(preview.backup.createdAt).toLocaleString("zh-CN")} · {preview.backup.files}{" "}
              个文件 · 校验通过
              {preview.mainDatabase ? ` · 主库修订 ${preview.mainDatabase.revision}` : " · 不含主库"}
              {preview.current.revision !== null ? `（当前主库修订 ${preview.current.revision}）` : ""}
            </p>
            <p className="body-copy full-backup-scope">恢复只创建新的数据目录；历史快照保持原样，已撤销页面的记录不会进入当前主库。</p>
            <div className="backup-summary">
              <div>
                <span>新增（当前目录没有）</span>
                <strong>{preview.summary.added.length}</strong>
              </div>
              <div>
                <span>冲突（内容不同）</span>
                <strong>{preview.summary.conflict.length}</strong>
              </div>
              <div>
                <span>缺失（备份里没有）</span>
                <strong>{preview.summary.missing.length}</strong>
              </div>
              <div>
                <span>相同</span>
                <strong>{preview.summary.same}</strong>
              </div>
            </div>
            <PathList label="新增" items={preview.summary.added} />
            <PathList label="冲突" items={preview.summary.conflict} />
            <PathList label="缺失" items={preview.summary.missing} />
            <p className="body-copy">
              确认后按备份原样写到新目录（冲突与缺失不影响当前目录）：
            </p>
            <code className="storage-path">{preview.target}</code>
            <p className="body-copy">
              当前目录 {preview.current.directory} 不会被修改。恢复完成后由你手动切换。
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            </div>
            <div className="form-actions full-backup-restore-actions">
              <Button secondary disabled={busy} onClick={() => setPreview(null)}>
                取消
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await recovery.begin(preview);
                    showResult(result);
                    setPreview(null);
                    if(result.status==='complete')notify("已恢复到新目录并校验");
                  } catch (e) {
                    setPreview(null);
                    setRecoveryReady(false);
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "正在恢复…" : "恢复到新目录"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
