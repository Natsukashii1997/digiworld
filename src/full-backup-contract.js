// ZIP transport and source data have separate bounds; manifest overhead is explicit.
export const FULL_BACKUP_LIMITS = Object.freeze({files:100000, dataBytes:1024*1024*1024, archiveBytes:1024*1024*1024, manifestBytes:64*1024*1024});
export const FULL_BACKUP_LIMIT_MESSAGE = '完整备份 ZIP 超过 1 GiB 上限，请先减少需打包的数据后重新生成';
