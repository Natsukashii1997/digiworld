// 工厂零I/O；仅显式交付/核对展开本机受限媒体。
import { realpath } from "node:fs/promises";
import { createReverseMedia } from "./reverse-media.mjs";
export function skillMediaReader(repository) {
  let store;
  return async (metadata) => {
    store ||= createReverseMedia(await realpath(repository.directory));
    return store.read(metadata);
  };
}
