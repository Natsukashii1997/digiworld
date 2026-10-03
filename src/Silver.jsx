// 银饰计划（路线 v3 5.5；产品定义 v1.2 §4.8；基线 D36）：欣赏墙 + 收藏格 + 白色描边剪影。
// 图片只存在本机数据目录 silver/（内容寻址文件名），主库只存引用；图片通过带会话令牌的接口读取。
// 剪影：保存时先试服务端“抠图器”（macOS Vision，其他平台返回不可用），不可用时由用户手动上传已抠好的 PNG；
// 白色描边由前端 canvas 按透明通道画出。删除一律进回收区，可恢复。
import React, { useEffect, useRef, useState } from "react";
import { Plus, Minus, Trash2, RotateCcw, ShieldCheck, Wand2 } from "lucide-react";
import { PageHeading, Button, Dialog, Empty, Badge } from "./components.jsx";
import { request } from "./api.js";
import {
  ACCEPT,
  IMAGE_MAX,
  TARGET_MAX,
  CATEGORY_MAX,
  LIMITS,
  silverOf,
  cellsOf,
  liveOf,
  addWall,
  addCategory,
  addItem,
  update,
  remove,
  restore,
  parsePrice,
} from "./silver.js";
import "./silver-agents.css";

const MB = IMAGE_MAX / 1024 / 1024;
const images = new Map();
function loadImage(file) {
  if (!images.has(file))
    images.set(
      file,
      request(`/silver/images/${file}`).then(
        (r) => URL.createObjectURL(new Blob([r.data], { type: r.type })),
        (e) => {
          images.delete(file);
          throw e;
        },
      ),
    );
  return images.get(file);
}
function useImage(file) {
  const [value, setValue] = useState({ src: null, missing: false });
  useEffect(() => {
    let live = true;
    setValue({ src: null, missing: false });
    if (file)
      loadImage(file).then(
        (src) => live && setValue({ src, missing: false }),
        () => live && setValue({ src: null, missing: true }),
      );
    return () => {
      live = false;
    };
  }, [file]);
  return value;
}
async function upload(file, kind) {
  if (!file) throw new Error("请先选择图片");
  if (file.size > IMAGE_MAX) throw new Error(`单张图片不能超过 ${MB} MB`);
  if (kind === "silhouette" && file.type !== "image/png")
    throw new Error("剪影必须是带透明背景的 PNG");
  const data = new Uint8Array(await file.arrayBuffer());
  return request("/silver/images", { data, kind });
}

function Photo({ file, alt, className = "" }) {
  const { src, missing } = useImage(file);
  if (missing)
    return (
      <span className={`silver-missing ${className}`} role="img" aria-label={`${alt}（图片缺失）`}>
        图片缺失
      </span>
    );
  return src ? (
    <img className={className} src={src} alt={alt} />
  ) : (
    <span className={`silver-loading ${className}`} aria-hidden="true" />
  );
}

// 白色描边剪影：把透明 PNG 缩到 max 以内，按透明通道找出主体外侧 radius 像素的一圈，涂成白色；主体内部留空。
function Outline({ file, label, max = 160, decorative = false }) {
  const { src, missing } = useImage(file);
  const ref = useRef();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!src) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live || !ref.current) return;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale)),
        h = Math.max(1, Math.round(img.naturalHeight * scale));
      const radius = 3,
        W = w + radius * 2,
        H = h + radius * 2;
      const scratch = document.createElement("canvas");
      scratch.width = W;
      scratch.height = H;
      const sg = scratch.getContext("2d", { willReadFrequently: true });
      sg.drawImage(img, radius, radius, w, h);
      const alpha = sg.getImageData(0, 0, W, H).data;
      const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && alpha[(y * W + x) * 4 + 3] >= 128;
      const offsets = [];
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++)
          if (dx * dx + dy * dy <= radius * radius && (dx || dy)) offsets.push([dx, dy]);
      const canvas = ref.current;
      canvas.width = W;
      canvas.height = H;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      const out = g.createImageData(W, H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (solid(x, y)) continue;
          if (offsets.some(([dx, dy]) => solid(x + dx, y + dy))) {
            const i = (y * W + x) * 4;
            out.data[i] = out.data[i + 1] = out.data[i + 2] = out.data[i + 3] = 255;
          }
        }
      g.putImageData(out, 0, 0);
      setReady(true);
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src, max]);
  if (missing)
    return (
      <span className="silver-missing" role={decorative ? undefined : "img"} aria-label={decorative ? undefined : `${label}（剪影缺失）`}>
        剪影缺失
      </span>
    );
  return (
    <canvas
      ref={ref}
      className="silver-outline"
      data-state={ready ? "ready" : "loading"}
      width={1}
      height={1}
      {...(decorative
        ? { "aria-hidden": "true" }
        : { role: "img", "aria-label": `${label} 的白色描边剪影` })}
    />
  );
}

function CutoutNotice({ status }) {
  if (!status) return null;
  return (
    <div className="subtle-notice">
      <ShieldCheck size={17} />
      <span>
        图片只存在本机数据目录的 silver/ 文件夹，不进备份，也不上传。
        {status.available
          ? "自动剪影：本机可用（macOS Vision 主体抠图），也可以手动替换。"
          : `自动剪影不可用：${status.reason}。可以手动上传已抠好的 PNG。`}
      </span>
    </div>
  );
}

function WallSection({ silver, commit, notify }) {
  const [file, setFile] = useState(null),
    [author, setAuthor] = useState(""),
    [source, setSource] = useState(""),
    [sourceUrl, setSourceUrl] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef();
  const wall = liveOf(silver.wall);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const url = sourceUrl.trim();
    if (url) {
      try {
        const u = new URL(url);
        if (!["http:", "https:"].includes(u.protocol)) throw new Error();
      } catch {
        setError("来源链接需要是 http 或 https 地址");
        return;
      }
    }
    setBusy(true);
    try {
      const stored = await upload(file, "photo");
      const ok = await commit(addWall(silver, { image: stored.file, author, source, sourceUrl: url, note }));
      if (!ok) return;
      setFile(null);
      setAuthor("");
      setSource("");
      setSourceUrl("");
      setNote("");
      if (input.current) input.current.value = "";
      notify("已加入欣赏墙");
    } catch (err) {
      setError(err.message || "上传失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="silver-section" aria-labelledby="silver-wall-title">
      <div className="section-title">
        <span className="section-index">赏</span>
        <h2 id="silver-wall-title">欣赏墙</h2>
        <p>别人的好作品：图片、作者、来源，只给自己看。</p>
      </div>
      <form className="silver-form" onSubmit={submit}>
        <label className="silver-file">
          欣赏图片（jpg、png、webp，单张不超过 {MB} MB）
          <input ref={input} type="file" className="silver-file-input" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <label>
          作者
          <input value={author} maxLength={LIMITS.author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label>
          来源
          <input value={source} maxLength={LIMITS.source} onChange={(e) => setSource(e.target.value)} placeholder="例如：小红书、展览、店铺" />
        </label>
        <label>
          来源链接（可选）
          <input type="url" value={sourceUrl} maxLength={LIMITS.url} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
        </label>
        <label className="silver-note">
          备注
          <textarea rows={2} value={note} maxLength={LIMITS.note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && (
          <p className="inline-error silver-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button disabled={busy}>
            <Plus size={16} />
            {busy ? "上传中…" : "加入欣赏墙"}
          </Button>
        </div>
      </form>
      {wall.length ? (
        <ul className="silver-wall">
          {wall.map((w) => {
            const who = w.author || "未署名";
            return (
              <li key={w.id}>
                <article className="silver-wall-card">
                  <Photo file={w.image} alt={`${who} 的作品`} className="silver-wall-image" />
                  <div className="silver-wall-meta">
                    <strong>{who}</strong>
                    {w.sourceUrl ? (
                      <a href={w.sourceUrl} target="_blank" rel="noreferrer">
                        {w.source || "来源链接"}
                      </a>
                    ) : (
                      w.source && <span>{w.source}</span>
                    )}
                    {w.note && <p>{w.note}</p>}
                  </div>
                  <button
                    className="text-button danger-text"
                    aria-label={`删除 ${who} 的作品`}
                    onClick={async () => {
                      if (await commit(remove(silver, "wall", w.id))) notify("已移入回收区");
                    }}
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty sprite="egg" title="欣赏墙还是空的">
          看到喜欢的银饰作品，上传图片并记下作者与来源。
        </Empty>
      )}
    </section>
  );
}

function GridSection({ silver, commit, notify, onFill, onOpen }) {
  const [name, setName] = useState(""),
    [target, setTarget] = useState("1"),
    [error, setError] = useState("");
  const categories = liveOf(silver.categories);
  async function add(e) {
    e.preventDefault();
    setError("");
    const n = name.trim(),
      t = Number(target);
    if (!n) return setError("请填写品类名称");
    if (!Number.isInteger(t) || t < 1 || t > TARGET_MAX) return setError(`目标数量需要是 1–${TARGET_MAX} 的整数`);
    if (categories.some((c) => c.name === n)) return setError("已经有这个品类了");
    if (silver.categories.length >= CATEGORY_MAX) return setError(`最多 ${CATEGORY_MAX} 个品类`);
    if (await commit(addCategory(silver, n, t))) {
      // 保存期间用户可能已经在输入下一个品类：只清掉刚提交的内容。
      setName((v) => (v.trim() === n ? "" : v));
      setTarget((v) => (Number(v) === t ? "1" : v));
      notify(`已添加品类「${n}」`);
    }
  }
  return (
    <section className="silver-section" aria-labelledby="silver-grid-title">
      <div className="section-title">
        <span className="section-index">藏</span>
        <h2 id="silver-grid-title">收藏格</h2>
        <p>自己的收藏：按目标数量排出格子，买到一件填一格。</p>
      </div>
      <form className="silver-form silver-category-form" onSubmit={add}>
        <label>
          品类名称
          <input value={name} maxLength={LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder="例如：项链" />
        </label>
        <label>
          目标数量
          <input type="number" min={1} max={TARGET_MAX} step={1} value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <div className="form-actions">
          <Button>
            <Plus size={16} />
            添加品类
          </Button>
        </div>
        {error && (
          <p className="inline-error silver-form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {!categories.length && (
        <Empty sprite="egg" title="还没有设定收藏目标">
          先添加品类和目标数量，例如项链 5 条、戒指 3 个；数量随时可以调整。
        </Empty>
      )}
      {categories.map((c) => {
        const cells = cellsOf(c, silver.items);
        const filled = cells.filter((x) => x.item).length;
        return (
          <div className="silver-category" key={c.id}>
            <div className="silver-category-head">
              <h3>{c.name}</h3>
              <span className="silver-count">{`已填 ${filled} / ${c.target}`}</span>
              <span className="silver-category-actions">
                <button
                  className="icon-button"
                  aria-label={`减少 ${c.name} 目标`}
                  title="目标 −1"
                  disabled={c.target <= 1}
                  onClick={() => commit(update(silver, "categories", c.id, { target: c.target - 1 }))}
                >
                  <Minus size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`增加 ${c.name} 目标`}
                  title="目标 +1"
                  disabled={c.target >= TARGET_MAX}
                  onClick={() => commit(update(silver, "categories", c.id, { target: c.target + 1 }))}
                >
                  <Plus size={16} />
                </button>
                <button
                  className="text-button danger-text"
                  aria-label={`删除品类 ${c.name}`}
                  onClick={async () => {
                    if (await commit(remove(silver, "categories", c.id))) notify(`品类「${c.name}」已移入回收区`);
                  }}
                >
                  <Trash2 size={15} />
                  删除品类
                </button>
              </span>
            </div>
            <ul className="silver-cells">
              {cells.map(({ index, item }) => (
                <li key={item ? item.id : `empty-${index}`}>
                  {item ? (
                    <button className="silver-cell filled" aria-label={`查看 ${item.name}`} onClick={() => onOpen(item.id)}>
                      {item.silhouette ? (
                        <Outline file={item.silhouette} label={item.name} max={120} decorative />
                      ) : (
                        <>
                          <Photo file={item.image} alt="" className="silver-cell-photo" />
                          <small className="silver-cell-tag">无剪影</small>
                        </>
                      )}
                      <span className="silver-cell-name">{item.name}</span>
                    </button>
                  ) : (
                    <button
                      className="silver-cell empty"
                      aria-label={`填入 ${c.name} 第 ${index + 1} 格`}
                      onClick={() => onFill({ categoryId: c.id, index })}
                    >
                      <Plus size={18} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function FillDialog({ silver, slot, commit, notify, onClose }) {
  const category = silver.categories.find((c) => c.id === slot.categoryId);
  const [file, setFile] = useState(null),
    [name, setName] = useState(""),
    [boughtAt, setBoughtAt] = useState(""),
    [price, setPrice] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!name.trim()) return setError("请填写名称");
    const p = parsePrice(price);
    if (p === null) return setError("价格需要是非负数，最多两位小数");
    setBusy(true);
    try {
      const photo = await upload(file, "photo");
      // 先试自动抠图，再一次性保存：记录与剪影同时落库，不会出现“存了一半”。
      let cut;
      try {
        cut = await request("/silver/cutout", { file: photo.file });
      } catch (err) {
        cut = { status: "unavailable", reason: err.message || "抠图服务没有响应" };
      }
      const { silver: next, item } = addItem(silver, slot.categoryId, {
        image: photo.file,
        name,
        boughtAt: boughtAt || undefined,
        price: p,
        note,
      });
      const withCut =
        cut.status === "ok"
          ? update(next, "items", item.id, { silhouette: cut.file, silhouetteSource: "auto" })
          : next;
      if (!(await commit(withCut))) return;
      onClose();
      if (cut.status === "ok") notify(`已填入「${item.name}」，并自动生成了剪影`);
      else notify(`已填入「${item.name}」。自动抠图不可用：${cut.reason}。可在详情里手动上传剪影 PNG。`, "warning");
    } catch (err) {
      setError(err.message || "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="填入收藏格" onClose={onClose}>
      <form className="asset-form" onSubmit={submit}>
        <p className="helper">
          {category?.name} · 第 {slot.index + 1} 格。保存时会先尝试自动抠出剪影。
        </p>
        <label>
          实物图（jpg、png、webp，单张不超过 {MB} MB）
          <input type="file" className="silver-file-input" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <label>
          名称
          <input value={name} maxLength={LIMITS.itemName} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            购入时间
            <input type="date" value={boughtAt} onChange={(e) => setBoughtAt(e.target.value)} />
          </label>
          <label>
            价格（元，可选）
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <label>
          备注
          <textarea rows={2} value={note} maxLength={LIMITS.note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button disabled={busy}>{busy ? "保存中…" : "保存"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function DetailDialog({ silver, item, cutout, commit, notify, onClose }) {
  const category = silver.categories.find((c) => c.id === item.categoryId);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef();
  async function manual(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const stored = await upload(file, "silhouette");
      if (await commit(update(silver, "items", item.id, { silhouette: stored.file, silhouetteSource: "manual" })))
        notify("剪影已更新");
    } catch (err) {
      setError(err.message || "上传失败");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function auto() {
    setError("");
    setBusy(true);
    try {
      const cut = await request("/silver/cutout", { file: item.image });
      if (cut.status !== "ok") return setError(`自动抠图不可用：${cut.reason}`);
      if (await commit(update(silver, "items", item.id, { silhouette: cut.file, silhouetteSource: "auto" })))
        notify("已重新生成剪影");
    } catch (err) {
      setError(err.message || "自动抠图失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="收藏详情" onClose={onClose}>
      <div className="asset-form silver-detail">
        <h2>{item.name}</h2>
        <p className="helper">{category?.name}</p>
        <div className="silver-detail-images">
          <figure>
            <Photo file={item.image} alt={`${item.name} 实物图`} className="silver-detail-photo" />
            <figcaption>实物图</figcaption>
          </figure>
          <figure>
            {item.silhouette ? (
              <Outline file={item.silhouette} label={item.name} />
            ) : (
              <span className="silver-missing">还没有剪影</span>
            )}
            <figcaption>
              剪影
              {item.silhouette && <Badge>{item.silhouetteSource === "auto" ? "自动" : "手动"}</Badge>}
            </figcaption>
          </figure>
        </div>
        <dl className="silver-facts">
          <dt>购入时间</dt>
          <dd>{item.boughtAt || "—"}</dd>
          <dt>价格</dt>
          <dd>{item.price !== undefined ? `¥${item.price}` : "—"}</dd>
          <dt>备注</dt>
          <dd>{item.note || "—"}</dd>
        </dl>
        <label>
          手动上传剪影 PNG
          <input ref={input} type="file" className="silver-file-input" accept="image/png" disabled={busy} onChange={manual} />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {cutout?.available && (
            <Button secondary disabled={busy} onClick={auto}>
              <Wand2 size={16} />
              重新自动抠图
            </Button>
          )}
          <Button
            secondary
            className="danger-text"
            disabled={busy}
            onClick={async () => {
              if (await commit(remove(silver, "items", item.id))) {
                onClose();
                notify(`「${item.name}」已移入回收区`);
              }
            }}
          >
            <Trash2 size={16} />
            移入回收区
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Recycle({ silver, commit, notify }) {
  const categoryIds = new Set(liveOf(silver.categories).map((c) => c.id));
  const rows = [
    ...silver.wall.filter((w) => w.deletedAt).map((w) => ["wall", w.id, `欣赏图：${w.author || "未署名"}`]),
    ...silver.categories.filter((c) => c.deletedAt).map((c) => ["categories", c.id, `品类：${c.name}`]),
    // 所属品类在回收区时，收藏随品类一起恢复，这里不单列。
    ...silver.items
      .filter((i) => i.deletedAt && categoryIds.has(i.categoryId))
      .map((i) => ["items", i.id, `收藏：${i.name}`]),
  ];
  return (
    <section className="silver-section silver-recycle" aria-labelledby="silver-recycle-title">
      <details>
        <summary>
          <h2 id="silver-recycle-title">回收区</h2>
          <span>{rows.length} 项</span>
        </summary>
        {rows.length ? (
          <ul>
            {rows.map(([list, id, label]) => (
              <li key={id}>
                <span>{label}</span>
                <button
                  className="text-button"
                  aria-label={`恢复 ${label}`}
                  onClick={async () => {
                    if (await commit(restore(silver, list, id))) notify(`已恢复${label}`);
                  }}
                >
                  <RotateCcw size={15} />
                  恢复
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="helper">回收区是空的。</p>
        )}
      </details>
    </section>
  );
}

export function Silver({ state, save, notify }) {
  const silver = silverOf(state);
  const [slot, setSlot] = useState(null),
    [openId, setOpenId] = useState(null),
    [cutout, setCutout] = useState(null);
  useEffect(() => {
    let live = true;
    request("/silver/status").then(
      (s) => live && setCutout(s.cutout),
      (e) => live && setCutout({ available: false, reason: e.message || "无法读取抠图状态" }),
    );
    return () => {
      live = false;
    };
  }, []);
  const commit = (next) => save({ ...state, silver: next });
  const open = openId && silver.items.find((i) => i.id === openId && !i.deletedAt);
  return (
    <>
      <PageHeading page="silver" />
      <CutoutNotice status={cutout} />
      <WallSection silver={silver} commit={commit} notify={notify} />
      <GridSection silver={silver} commit={commit} notify={notify} onFill={setSlot} onOpen={setOpenId} />
      <Recycle silver={silver} commit={commit} notify={notify} />
      {slot && (
        <FillDialog silver={silver} slot={slot} commit={commit} notify={notify} onClose={() => setSlot(null)} />
      )}
      {open && (
        <DetailDialog
          silver={silver}
          item={open}
          cutout={cutout}
          commit={commit}
          notify={notify}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
