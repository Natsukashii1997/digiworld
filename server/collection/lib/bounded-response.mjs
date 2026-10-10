export async function boundedResponseBytes(response, limit, message) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) { await response.body?.cancel(); throw new Error(message); }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error(message); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}
