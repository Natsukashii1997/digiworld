// 复制 = 传送（UI v13.2，用户 2026-09-29 确认）：复制成功后，按钮里跑一条数据光带，
// 随后整块变成液晶屏，点阵对勾弹出、“TRANSFER OK”逐字打出、光标闪烁，四周迸出数据火花。
// 纯装饰：任何异常都吞掉，不影响复制与使用记录；减少动态效果时只静态显示结果。
const FONT = {
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};
const CHECK = ["0000001", "0000011", "1000110", "1101100", "0111000", "0010000"];
const TEXT = "TRANSFER OK";
const running = new WeakSet();

function reducedMotion() {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

export function transferFeedback(button) {
  try {
    play(button);
  } catch {
    /* 装饰失败不影响任何业务结果 */
  }
}

function play(button) {
  if (!(button instanceof HTMLButtonElement) || !button.isConnected || running.has(button)) return;
  running.add(button);
  const reduced = reducedMotion();
  const overlay = document.createElement("span");
  overlay.className = "transfer-lcd";
  overlay.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  overlay.append(canvas);
  let typing = 0;
  const finish = () => {
    clearInterval(typing);
    overlay.remove();
    button.classList.remove("is-transferring", "is-transferred");
    running.delete(button);
  };
  const reveal = () => {
    button.classList.remove("is-transferring");
    button.classList.add("is-transferred");
    button.append(overlay);
    const px = 2,
      w = 7 + 3 + TEXT.length * 6 + 4,
      h = 9,
      ratio = window.devicePixelRatio || 1;
    canvas.width = w * px * ratio;
    canvas.height = h * px * ratio;
    canvas.style.width = `${w * px}px`;
    canvas.style.height = `${h * px}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio * px, 0, 0, ratio * px, 0, 0);
    let shown = reduced ? TEXT.length : 0,
      frame = reduced ? 4 : 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(28, 38, 22, 0.08)";
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ctx.fillRect(x, y, 0.8, 0.8);
      ctx.fillStyle = "#1c2616";
      if (frame >= 3)
        CHECK.forEach((row, y) => [...row].forEach((c, x) => c === "1" && ctx.fillRect(x, y + 1.5, 0.8, 0.8)));
      [...TEXT.slice(0, shown)].forEach((ch, i) =>
        FONT[ch].forEach((row, y) => [...row].forEach((c, x) => c === "1" && ctx.fillRect(10 + i * 6 + x, y + 1, 0.8, 0.8))),
      );
      if (shown >= TEXT.length && Math.floor(frame / 4) % 2 === 0) ctx.fillRect(10 + TEXT.length * 6, 1, 2.6, 6.8);
      frame++;
      if (frame > 2 && shown < TEXT.length) shown++;
    };
    draw();
    if (!reduced) {
      typing = setInterval(draw, 45);
      sparks(button.getBoundingClientRect());
    }
    setTimeout(finish, reduced ? 1400 : 1300);
  };
  if (reduced) reveal();
  else {
    button.classList.add("is-transferring");
    setTimeout(reveal, 500);
  }
}

function sparks(rect) {
  if (typeof document.body.animate !== "function" || !rect.width) return;
  const tones = ["c", "o", "g", "", "c", "o", "g", "", "c", "o"];
  tones.forEach((tone, i) => {
    const spark = document.createElement("i");
    spark.className = `transfer-spark ${tone}`;
    spark.setAttribute("aria-hidden", "true");
    document.body.append(spark);
    const a = (i / tones.length) * Math.PI * 2,
      cx = rect.left + rect.width / 2,
      cy = rect.top + rect.height / 2;
    const from = [cx + Math.cos(a) * rect.width * 0.42, cy + Math.sin(a) * rect.height * 0.42],
      to = [cx + Math.cos(a) * (rect.width * 0.5 + 26), cy + Math.sin(a) * (rect.height * 0.5 + 22)];
    try {
      spark
        .animate(
          [
            { transform: `translate(${from[0]}px, ${from[1]}px) scale(1)`, opacity: 1 },
            { transform: `translate(${to[0]}px, ${to[1]}px) scale(0.4)`, opacity: 0 },
          ],
          { duration: 420 + (i % 3) * 80, easing: "steps(6)" },
        )
        .finished.catch(() => {})
        .then(() => spark.remove());
    } catch {
      spark.remove();
    }
  });
}
