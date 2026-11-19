// 设计效果图（#93 第三批）：上传到本机 design-images（内容寻址，和便签图片同一套存储写法），卡片按 ID 读回。
import { request } from "./api.js";
import { DESIGN_IMAGE_ID } from "./design-asset.js";

const MAX_BYTES = 8 * 1024 * 1024, TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const cache = new Map();

export async function uploadDesignImage(file) {
  if (!file) throw new Error("请选择一张效果图");
  if (!TYPES.has(file.type)) throw new Error("效果图只支持 PNG、JPG、WebP");
  if (!file.size || file.size > MAX_BYTES) throw new Error("单张效果图不能超过 8 MB");
  const data = new Uint8Array(await file.arrayBuffer());
  const result = await request("/design-images", { data }, "POST", true);
  if (!DESIGN_IMAGE_ID.test(result.id || "")) throw new Error("效果图保存结果无效");
  cache.set(result.id, Promise.resolve(new Blob([data], { type: result.type })));
  return result.id;
}

export function readDesignImage(id) {
  if (!DESIGN_IMAGE_ID.test(id || "")) return Promise.reject(new Error("效果图引用无效"));
  if (!cache.has(id)) {
    const pending = request(`/design-images/${id}/read`, {}, "POST", true).then((value) => {
      if (value.id !== id || !TYPES.has(value.type) || !(value.data instanceof Uint8Array) || !value.data.length)
        throw new Error("效果图读取结果无效");
      return new Blob([value.data], { type: value.type });
    });
    pending.catch(() => cache.delete(id));
    cache.set(id, pending);
  }
  return cache.get(id);
}
