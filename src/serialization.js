export function stringify(value, spacing = 0) {
  return JSON.stringify(
    value,
    (_key, item) => {
      if (!(item instanceof Uint8Array)) return item;
      let binary = "";
      for (let i = 0; i < item.length; i += 8192)
        binary += String.fromCharCode(...item.subarray(i, i + 8192));
      return { __binary: btoa(binary) };
    },
    spacing,
  );
}
export function parse(text) {
  return JSON.parse(text, (_key, item) => {
    if (item && typeof item === "object" && Object.keys(item).length === 1) {
      if (typeof item.__binary === "string") {
        if (
          (item.__binary.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.__binary))
        )
          throw new Error("二进制编码无效");
        return Uint8Array.from(atob(item.__binary), (c) => c.charCodeAt(0));
      }
      if (Array.isArray(item.__bytes)) {
        if (item.__bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
          throw new Error("二进制数据无效");
        return new Uint8Array(item.__bytes);
      }
    }
    return item;
  });
}
