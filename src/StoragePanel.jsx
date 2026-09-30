import React, { useEffect, useState } from "react";
import { Download, Upload, HardDrive } from "lucide-react";
import { Button, Dialog } from "./components.jsx";
import { session, request } from "./api.js";
import { parse, stringify } from "./serialization.js";
import { readState as readLegacy } from "./store.js";
import { download } from "./Assets.jsx";

export function StoragePanel({ state, adoptState, notify }) {
  const [directory, setDirectory] = useState(""),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
    <section className="settings-panel">
      <div className="section-head">
        <div>
          <h2>本地数据</h2>
          <p>文件主库 · 版本 {state.revision}</p>
        </div>
        <HardDrive size={22} />
      </div>
      <code className="storage-path">{directory || "正在读取存储位置…"}</code>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="setting-row">
        <div>
          <strong>备份与恢复</strong>
          <p>导出资产、连接与整理任务；恢复前预览合并，不覆盖现有历史。</p>
          <p>
            候选写回的恢复全文与操作记录独立保存在 knowledge-writes
            目录，不在此备份中。迁移本机时请保留整个数据目录。
          </p>
        </div>
        <div className="heading-actions">
          <Button
            secondary
            disabled={busy}
            onClick={async () => {
              try {
                const backup = await request("/backup");
                download(
                  "数码世界-备份.json",
                  stringify(backup, 2),
                  "application/json",
                );
                notify("备份已导出");
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <Download size={16} />
            导出备份
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
      <div className="setting-row">
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
