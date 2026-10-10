// 银饰计划（路线 v3 5.5；产品定义 v1.2 §4.8；基线 D36）：欣赏墙 + 收藏格 + 白色描边剪影。
// 图片只存在本机数据目录 silver/（内容寻址文件名），主库只存引用；图片通过带会话令牌的接口读取。
// 剪影：保存时先试服务端“抠图器”（macOS Vision，其他平台返回不可用），不可用时由用户手动上传已抠好的 PNG；
// 白色描边由前端 canvas 按透明通道画出。删除一律进回收区，可恢复。
import React, { useEffect, useRef, useState } from "react";
import { Trash2, Wand2, ImagePlus } from "lucide-react";
import { Button, Dialog, Badge } from "./components.jsx";
import { request } from "./api.js";
import { IMAGE_MAX, update, remove } from "./silver.js";

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
export async function upload(file, kind) {
  if (!file) throw new Error("请先选择图片");
  if (file.size > IMAGE_MAX) throw new Error(`单张图片不能超过 ${MB} MB`);
  if (kind === "silhouette" && file.type !== "image/png")
    throw new Error("剪影必须是带透明背景的 PNG");
  const data = new Uint8Array(await file.arrayBuffer());
  return request("/silver/images", { data, kind });
}

export function Photo({ file, alt, className = "" }) {
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
export function Outline({ file, label, max = 160, decorative = false }) {
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

// 选图（Claude 165）：原生文件控件只保留给读屏与键盘，视觉上是一块可点、可拖入的展示框，并显示已选文件名。
export function FilePick({ title, hint, file, onFile, inputRef, accept, disabled = false, compact = false }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`silver-pick${compact ? " compact" : ""}${over ? " over" : ""}${file ? " chosen" : ""}`}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) onFile(dropped);
      }}
    >
      <ImagePlus size={compact ? 18 : 26} aria-hidden="true" />
      <span className="silver-pick-title">{title}</span>
      {hint && <span className="silver-pick-hint">{hint}</span>}
      <span className="silver-pick-file">{file ? file.name : "点按选择，或把图片拖到这里"}</span>
      <input ref={inputRef} type="file" className="silver-file-input" accept={accept} disabled={disabled} onChange={(e) => onFile(e.target.files?.[0] || null)} />
    </label>
  );
}

export function DetailDialog({ silver, item, cutout, commit, notify, onClose, onWish }) {
  const category = silver.categories.find((c) => c.id === item.categoryId) || {name:({ring:"戒指",necklace:"项链",bangle:"手镯",pendant:"吊坠"})[item.categoryKey]};
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef(),alive=useRef(true),lock=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function manual(file) {
    if (!file || lock.current) return;lock.current=true;
    setError("");
    setBusy(true);
    try {
      const stored = await upload(file, "silhouette");
      if(!alive.current)return;
      if (await commit(update(silver, "items", item.id, { silhouette: stored.file, silhouetteSource: "manual" })))
        notify("剪影已更新");
    } catch (err) {
      alive.current && setError(err.message || "上传失败");
    } finally {
      lock.current=false;if(alive.current)setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function auto() {
    if(lock.current)return;lock.current=true;
    setError("");
    setBusy(true);
    try {
      const cut = await request("/silver/cutout", { file: item.image });
      if(!alive.current)return;
      if (cut.status !== "ok") return setError(`自动抠图不可用：${cut.reason}`);
      if (await commit(update(silver, "items", item.id, { silhouette: cut.file, silhouetteSource: "auto" })))
        notify("已重新生成剪影");
    } catch (err) {
      alive.current && setError(err.message || "自动抠图失败");
    } finally {
      lock.current=false;if(alive.current)setBusy(false);
    }
  }
  return (
    <Dialog title="收藏详情" onClose={()=>{if(!lock.current)onClose();}}>
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
        {onWish&&silver.wishes?.filter(w=>w.fulfilledItemId===item.id).map(w=><Button key={w.id} secondary disabled={busy} onClick={()=>onWish(w.id)}>查看来源心愿</Button>)}
        <FilePick compact title="手动上传剪影 PNG" file={null} onFile={manual} inputRef={input} accept="image/png" disabled={busy} />
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
              if(lock.current)return;lock.current=true;setBusy(true);
              try{if (await commit(remove(silver, "items", item.id))) { if(alive.current)onClose();notify(`「${item.name}」已移入回收区`); }}finally{lock.current=false;if(alive.current)setBusy(false);}
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

