// 逆向图片等媒体入口共用的文件头识别，不依赖任何已撤销页面。
export function sniffImage(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;
  const at = (index, signature) => signature.every((byte, offset) => bytes[index + offset] === byte);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (at(0, [0xff, 0xd8, 0xff])) return "jpg";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "webp";
  return null;
}
