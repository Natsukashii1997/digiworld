// v17 质感三选一：window.__v17.variant = "a" | "b" | "c"
(() => {
  const v = (window.__v17 || {}).variant;
  if (!v) return;
  document.documentElement.dataset.variant = v;
  if (v === "b") {
    // 像素点阵大标题：与品牌“数码世界”同一种做法（画布取阈值后放大）
    const h1 = document.querySelector(".page-heading h1");
    const text = h1.textContent.trim();
    const cv = document.createElement("canvas"), ctx = cv.getContext("2d"), size = 18;
    ctx.font = `700 ${size}px "PingFang SC", sans-serif`;
    cv.width = Math.ceil(ctx.measureText(text).width) + 2; cv.height = size + 4;
    ctx.font = `700 ${size}px "PingFang SC", sans-serif`; ctx.textBaseline = "top"; ctx.fillStyle = "#fff"; ctx.fillText(text, 1, 2);
    const d = ctx.getImageData(0, 0, cv.width, cv.height);
    for (let i = 0; i < d.data.length; i += 4) { const on = d.data[i + 3] > 110; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = on ? 255 : 0; }
    ctx.putImageData(d, 0, 0);
    const img = Object.assign(new Image(), { src: cv.toDataURL(), className: "v17-pxtitle", alt: "" });
    const sr = Object.assign(document.createElement("span"), { className: "v17-pxtitle-text", textContent: text });
    h1.textContent = ""; h1.append(img, sr);
    const act = document.querySelector(".nav-item.active");
    if (act) {
      const r = act.getBoundingClientRect();
      const beam = Object.assign(document.createElement("i"), { className: "v17-beam" });
      beam.style.top = r.top + r.height / 2 - 1 + "px";
      document.body.append(beam);
    }
  }
})();
