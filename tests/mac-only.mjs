// CI 跑在 Linux 上（#65）。下面这些测试依赖只有 macOS 才有的系统能力，在其他平台跳过，并写明原因；
// macOS 上照常全部运行。产品本身只支持 macOS，这里不是在掩盖 Linux 上的缺陷。
const other = process.platform !== "darwin";

export const macOnly = (reason) => ({ skip: other && `依赖 macOS：${reason}` });

export const VOLUME_UUID = "用 diskutil 读卷 UUID 作项目目录的稳定身份，其他平台登记不了项目";
export const PLATFORM_GUARD = "写配置、回收移动、AI 只读隔离等在非 macOS 上按设计拒绝执行";
export const PLUTIL = "用 /usr/bin/plutil 读 App 的 Info.plist 核验 bundle 身份";
