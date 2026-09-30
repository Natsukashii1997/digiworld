"""从拼豆图纸截图中逐格读取颜色，输出像素精灵（仅本机设计用途）。
用法：python3 extract.py 图片.png [名称]
"""
import sys, json
import numpy as np
from PIL import Image


def profile(g, axis):
    d = np.abs(np.diff(g, axis=axis))
    return d.sum(axis=1 - axis if axis == 1 else 0) if False else (d.sum(axis=0) if axis == 1 else d.sum(axis=1))


def best_grid(prof):
    """在 10–40 像素之间搜索网格周期与相位；粗线会让“两倍周期”得分更高，
    所以取得分达到最佳值 70% 的最小周期。"""
    n = len(prof)
    cand = []
    for p10 in range(100, 400):
        p = p10 / 10
        best = (0, 0)
        for ph4 in range(0, int(p * 4)):
            ph = ph4 / 4
            idx = np.round(np.arange(ph, n - 1, p)).astype(int)
            idx = idx[idx < n]
            score = prof[idx].mean()
            if score > best[0]:
                best = (score, ph)
        cand.append((p, best[0], best[1]))
    top = max(c[1] for c in cand)
    for p, sc, ph in cand:
        if sc >= top * 0.7:
            return p, ph
    return cand[0][0], cand[0][2]


def lines(prof, p, ph):
    return list(np.arange(ph, len(prof) - 1, p))


def main_component(cells):
    """取最大的连通豆块（8 邻接）作为图案主体，排除标题、二维码和底部色卡。"""
    H, W = len(cells), len(cells[0])
    seen = [[False] * W for _ in range(H)]
    best = []
    for j in range(H):
        for i in range(W):
            if cells[j][i] and not seen[j][i]:
                stack, comp = [(j, i)], []
                seen[j][i] = True
                while stack:
                    y, x = stack.pop()
                    comp.append((y, x))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < H and 0 <= nx < W and cells[ny][nx] and not seen[ny][nx]:
                                seen[ny][nx] = True
                                stack.append((ny, nx))
                if len(comp) > len(best):
                    best = comp
    j0, j1 = min(p[0] for p in best), max(p[0] for p in best)
    i0, i1 = min(p[1] for p in best), max(p[1] for p in best)
    return [row[i0:i1 + 1] for row in cells[j0:j1 + 1]]


def lum(c):
    return 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2]


def extract(path):
    im = np.asarray(Image.open(path).convert("RGB")).astype(float)
    g = lum(im)
    px, phx = best_grid(np.abs(np.diff(g, axis=1)).sum(axis=0))
    py, phy = best_grid(np.abs(np.diff(g, axis=0)).sum(axis=1))
    xs = lines(np.abs(np.diff(g, axis=1)).sum(axis=0), px, phx)
    ys = lines(np.abs(np.diff(g, axis=0)).sum(axis=1), py, phy)
    cells = []
    for j in range(len(ys) - 1):
        row = []
        for i in range(len(xs) - 1):
            x0, x1 = int(round(xs[i])) + 2, int(round(xs[i + 1])) - 1
            y0, y1 = int(round(ys[j])) + 2, int(round(ys[j + 1])) - 1
            if x1 - x0 < 5 or y1 - y0 < 5:
                row.append(None)
                continue
            box = im[y0:y1, x0:x1]
            h, w = box.shape[:2]
            k = max(2, min(h, w) // 5)
            corners = np.concatenate([
                box[:k, :k].reshape(-1, 3), box[:k, -k:].reshape(-1, 3),
                box[-k:, :k].reshape(-1, 3), box[-k:, -k:].reshape(-1, 3)])
            c = np.median(corners, axis=0)
            center = lum(box[h // 4: 3 * h // 4, w // 5: 4 * w // 5])
            cl = lum(c)
            # 有色号文字：浅色格里有深字，深色格里有浅字
            # 浅色格：找深色字；深色格：找浅色字。用绝对阈值，避开半透明水印。
            # 深色格不可能是透明底（棋盘格总是浅色），直接算作一颗豆。
            if cl > 120:
                text = (center < min(110, cl - 70)).mean()
            else:
                text = 1.0
            is_header = c[2] > c[0] + 8 and c[0] > 190
            row.append(tuple(int(v) for v in c) if text > 0.012 and not is_header else None)
        cells.append(row)
    return cells, (px, py, len(xs) - 1, len(ys) - 1)


def to_sprite(cells, tol=34):
    pts = [(j, i) for j, r in enumerate(cells) for i, c in enumerate(r) if c]
    j0, j1 = min(p[0] for p in pts), max(p[0] for p in pts)
    i0, i1 = min(p[1] for p in pts), max(p[1] for p in pts)
    centers = []
    letters = "KABCDEFGHIJLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    rows = []
    for j in range(j0, j1 + 1):
        s = ""
        for i in range(i0, i1 + 1):
            c = cells[j][i]
            if not c:
                s += "."
                continue
            found = None
            for k, cc in enumerate(centers):
                if sum((a - b) ** 2 for a, b in zip(c, cc)) ** 0.5 < tol:
                    found = k
                    break
            if found is None:
                centers.append(c)
                found = len(centers) - 1
            s += str(found)
        rows.append(s)
    # 最暗的颜色作为描边 K
    order = sorted(range(len(centers)), key=lambda k: sum(centers[k]))
    mapping = {str(k): letters[n] for n, k in enumerate(order)}
    rows = ["".join(mapping.get(ch, ch) if ch != "." else "." for ch in r) for r in rows]
    palette = {letters[n]: "#%02x%02x%02x" % centers[k] for n, k in enumerate(order)}
    return rows, palette


if __name__ == "__main__":
    cells, geo = extract(sys.argv[1])
    cells = main_component(cells)
    rows, pal = to_sprite(cells)
    print(json.dumps({"geometry": geo, "size": [len(rows[0]), len(rows)], "palette": pal}, ensure_ascii=False))
    print("\n".join(rows))
