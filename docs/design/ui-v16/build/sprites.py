"""UI v16：把用户 2026-10-05 提供的四张拼豆图纸转成像素精灵（本机个人使用，不保留水印）。
复用 design/pixel-refs/extract.py 的网格识别与主体提取；颜色编号改用字母（原脚本超过 10 色会错位）；
可选裁掉底部色卡、水平翻转，使四只头部统一朝右。输出 JSON 与放大预览 PNG。
用法：python3 sprites.py 输出目录
"""
import sys, json, importlib.util
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("extract", ROOT / "design/pixel-refs/extract.py")
ex = importlib.util.module_from_spec(spec); spec.loader.exec_module(ex)
REFS = ROOT / "docs/design/ui-v16/refs"
# name: (文件, 中文名, 裁切框 (左,上,右,下) 或 None, 是否水平翻转, 取格方法)
SPECS = {
    "metalgreymon": ("metalgreymon-claude.webp", "机械暴龙兽", None, True, "fine"),
    "machinedramon": ("machinedramon-codex.webp", "机械邪龙兽", None, True, "legacy"),
    "agumon": ("agumon-hermes.webp", "亚古兽", None, False, "legacy"),
    "gabumon": ("gabumon-openclaw.webp", "加布兽", (40, 120, 1024, 1352), True, "legacy"),
}
LETTERS = "KABCDEFGHIJLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def fine_period(white, lo, hi):
    """按“白缝”出现位置精细搜索格子周期（0.01px）与相位；原脚本 0.1px 步长在 60+ 格上会累积错位。"""
    n = len(white); best = (-1, 0, 0)
    for p100 in range(int(lo * 100), int(hi * 100)):
        p = p100 / 100
        for ph10 in range(0, int(p * 10)):
            ph = ph10 / 10
            idx = np.round(np.arange(ph, n - 1, p)).astype(int)
            sc = white[idx].mean()
            if sc > best[0]: best = (sc, p, ph)
    return best[1], best[2]


def gaps(white, period):
    """逐条找白缝：在估计周期附近取局部最大值。拼豆图纸每 5 / 10 格有粗分隔线，格子并非严格等距。"""
    w = np.convolve(white, np.ones(3) / 3, mode="same")
    peaks, x = [], int(np.argmax(w[: int(period * 1.5)]))
    while x < len(w):
        peaks.append(x)
        lo, hi = x + int(period * 0.7), x + int(period * 1.35)
        if lo >= len(w): break
        x = lo + int(np.argmax(w[lo:min(hi, len(w))]))
    return np.array(peaks, dtype=float)


def extract_fine(img, lo=15.5, hi=18.5):
    a = np.asarray(img).astype(float)
    nearwhite = (a.min(axis=2) > 225)
    px, phx = fine_period(nearwhite.mean(axis=0), lo, hi)
    py, phy = fine_period(nearwhite.mean(axis=1), lo, hi)
    xs = gaps(nearwhite.mean(axis=0), px); ys = gaps(nearwhite.mean(axis=1), py)
    cells = []
    for j in range(len(ys) - 1):
        row = []
        for i in range(len(xs) - 1):
            x0, x1 = int(xs[i] + px * 0.18), int(xs[i + 1] - px * 0.18)
            y0, y1 = int(ys[j] + py * 0.18), int(ys[j + 1] - py * 0.18)
            box = a[y0:y1, x0:x1].reshape(-1, 3)
            # 剔除白缝与淡紫粗分隔线的像素（格子压在粗线上时，线色会被误当底色）
            lav = (box[:, 2] > box[:, 0] + 12) & (box.min(axis=1) > 165)
            if (~lav).sum() >= 9: box = box[~lav]
            if len(box) < 9: row.append(None); continue
            # 两类聚类：占多数的一类是格子底色，少数是色号文字或水印
            c1, c2 = box[box.sum(1).argmin()], box[box.sum(1).argmax()]
            for _ in range(6):
                d1 = ((box - c1) ** 2).sum(1); d2 = ((box - c2) ** 2).sum(1)
                m = d1 < d2
                if m.all() or (~m).all(): break
                c1, c2 = box[m].mean(0), box[~m].mean(0)
            major = box[m] if m.mean() >= 0.5 else box[~m]
            c = np.median(major, axis=0)
            if c.max() < 48: c = np.array([0, 0, 0])  # 近黑统一为描边黑
            row.append(None if c.min() > 215 else tuple(int(v) for v in c))
        cells.append(row)
    return cells


def sprite(cells, tol=34):
    pts = [(j, i) for j, r in enumerate(cells) for i, c in enumerate(r) if c]
    j0, j1 = min(p[0] for p in pts), max(p[0] for p in pts)
    i0, i1 = min(p[1] for p in pts), max(p[1] for p in pts)
    centers, grid = [], []
    for j in range(j0, j1 + 1):
        row = []
        for i in range(i0, i1 + 1):
            c = cells[j][i]
            if not c:
                row.append(None); continue
            k = next((k for k, cc in enumerate(centers) if sum((a - b) ** 2 for a, b in zip(c, cc)) ** 0.5 < tol), None)
            if k is None:
                centers.append(c); k = len(centers) - 1
            row.append(k)
        grid.append(row)
    order = sorted(range(len(centers)), key=lambda k: sum(centers[k]))
    letter = {k: LETTERS[n] for n, k in enumerate(order)}
    rows = ["".join("." if k is None else letter[k] for k in r) for r in grid]
    palette = {LETTERS[n]: "#%02x%02x%02x" % tuple(centers[k]) for n, k in enumerate(order)}
    return rows, palette


def reduce_palette(rows, palette, limit=16):
    """颜色多于 limit 时，按使用量加权逐步合并最接近的两种（水印和色号文字会带进少量杂色）。"""
    from collections import Counter
    cnt = Counter(ch for r in rows for ch in r if ch != ".")
    col = {k: np.array([int(palette[k][i:i + 2], 16) for i in (1, 3, 5)], float) for k in cnt}
    target = {k: k for k in cnt}
    live = set(cnt)
    while len(live) > limit:
        ks = sorted(live)
        best = None
        for i, a in enumerate(ks):
            for b in ks[i + 1:]:
                if a == "K" or b == "K":
                    continue  # 描边黑不参与合并
                d = ((col[a] - col[b]) ** 2).sum() * min(cnt[a], cnt[b])
                if best is None or d < best[0]:
                    best = (d, a, b)
        _, a, b = best
        keep, drop = (a, b) if cnt[a] >= cnt[b] else (b, a)
        col[keep] = (col[keep] * cnt[keep] + col[drop] * cnt[drop]) / (cnt[keep] + cnt[drop])
        cnt[keep] += cnt[drop]; live.discard(drop)
        for k, v in target.items():
            if v == drop: target[k] = keep
    rows = ["".join(ch if ch == "." else target[ch] for ch in r) for r in rows]
    used = sorted(live, key=lambda k: col[k].sum())
    rename = {k: LETTERS[n] for n, k in enumerate(used)}
    rows = ["".join(ch if ch == "." else rename[ch] for ch in r) for r in rows]
    palette = {rename[k]: "#%02x%02x%02x" % tuple(int(round(v)) for v in col[k]) for k in used}
    return rows, palette


def render(rows, palette, scale=8):
    h, w = len(rows), len(rows[0])
    im = Image.new("RGB", (w * scale, h * scale), (10, 16, 32))
    px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == ".": continue
            c = tuple(int(palette[ch][i:i + 2], 16) for i in (1, 3, 5))
            for dy in range(scale):
                for dx in range(scale):
                    px[x * scale + dx, y * scale + dy] = c
    return im


if __name__ == "__main__":
    out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    result = {}
    for key, (file, name, box, flip, method) in SPECS.items():
        img = Image.open(REFS / file).convert("RGB")
        if box:
            img = img.crop(box)
        if method == "fine":
            cells = extract_fine(img)
        else:
            tmp = out / f"{key}-src.png"; img.save(tmp)
            cells, geo = ex.extract(str(tmp)); tmp.unlink()
        rows, pal = sprite(ex.main_component(cells))
        if len(pal) > 16:
            rows, pal = reduce_palette(rows, pal)
        if flip:
            rows = [r[::-1] for r in rows]
        assert len({len(r) for r in rows}) == 1, key
        result[key] = {"name": name, "size": [len(rows[0]), len(rows)], "colors": len(pal), "palette": pal, "rows": rows}
        render(rows, pal).save(out / f"{key}.png")
        print(key, name, result[key]["size"], result[key]["colors"], "色")
    (out / "sprites.json").write_text(json.dumps(result, ensure_ascii=False, indent=1))
