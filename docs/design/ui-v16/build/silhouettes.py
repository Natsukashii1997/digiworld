"""UI v16 银饰收藏格剪影：从用户 2026-10-05 提供的四张白底银饰图生成白色描边剪影（透明底 PNG）。
做法：与白底分离得到主体轮廓 → 填补内部空洞 → 取外缘描边（白色）+ 轻微内部纹理线，供深色天鹅绒格子使用。
用法：python3 silhouettes.py
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sprites"
for name in ["ring", "necklace", "bangle", "pendant"]:
    im = Image.open(ROOT / "refs" / f"silhouette-{name}.webp").convert("RGB")
    im.thumbnail((520, 520))
    g = np.asarray(im.convert("L")).astype(float)
    mask = Image.fromarray(((g < 232) * 255).astype("uint8"))
    mask = mask.filter(ImageFilter.MedianFilter(5))
    # 外缘描边：膨胀 − 原形
    outer = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(7)), mask)
    # 内部结构线：亮部与暗部交界（让剪影保留造型细节）
    # 先模糊掉金属颗粒纹理，只留明显的结构线
    edges = im.convert("L").filter(ImageFilter.GaussianBlur(1.3)).filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 30 else 0)
    edges = edges.filter(ImageFilter.MedianFilter(3))
    edges = ImageChops.multiply(edges, mask.filter(ImageFilter.MinFilter(5)))
    line = ImageChops.lighter(outer, edges.point(lambda v: v * 0.62))
    rgba = Image.new("RGBA", im.size, (236, 241, 255, 0))
    rgba.putalpha(line)
    bbox = rgba.getbbox()
    rgba = rgba.crop(bbox)
    rgba.save(OUT / f"sil-{name}.png")
    print(name, rgba.size)
