// 「AI 接入」只读登记（全局规则 P-13，第 1 批）：本应用每个 AI 功能谁做、怎么接、读什么、写到哪、现在能不能用。
// 只汇总已有事实源，不另存第二份设置：默认执行方读逆向设置，API Key 只看模型能力的写入回执，不碰钥匙串、不联网、不启动 CLI。
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolveExecutable } from './executable.mjs';
import { DESKTOP_CODEX } from './codex-native-transport.mjs';
import { PROFILE_TOOLS, KNOWLEDGE_TOOLS, REVERSE_TOOLS } from './profile-mcp.mjs';

const EXECUTOR_LABELS = { codex: 'Codex', claude: 'Claude Code', rea: '仅 REA 取证（不调用 AI）' };
const API_LABELS = { anthropic: 'Claude（官方 API）', openai: 'OpenAI（官方 API）' };
// collection-mcp.mjs 一导入就接管 stdin，不能引用；工具名由测试对照其源码。
export const COLLECTION_TOOL_NAMES = ['search_saved_notes', 'read_saved_note'];
const installed = check => check().then(() => true, () => false);

export const defaultProbes = {
  claude: () => installed(() => resolveExecutable('claude')),
  codex: () => installed(() => access(DESKTOP_CODEX, constants.X_OK)),
};

// 每个提供方只看最近一次连接写入的回执：成功=已配置，回滚=已撤回，没有=未配置。钥匙串现状仍要在「工具·模型」点核验。
export function credentialStates(history = []) {
  const out = {};
  for (const provider of Object.keys(API_LABELS)) {
    const last = history.filter(row => row.action === 'credentials' && row.provider === provider)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    out[provider] = !last ? '未配置' : last.status === 'verified' ? '已配置' : last.status === 'rolled_back' ? '已撤回' : '结果未知';
  }
  return out;
}

export function createAiAccess({ readState, modelStatus, modelHistory, mcp = () => ({ url: null, error: '' }), probes = defaultProbes, now = Date.now }) {
  return {
    async status() {
      const [state, model, history, claude, codex] = await Promise.all([
        readState(), modelStatus(), modelHistory(), probes.claude(), probes.codex()]);
      const credentials = credentialStates(history);
      const cliState = ok => ok ? '已安装（登录与额度未检查）' : '未安装';
      const executors = [
        { id: 'claude', name: 'Claude Code', model: '跟随本机 Claude Code 设置', access: '本机 CLI', detail: '命令 claude，本机登录的订阅', state: cliState(claude), available: claude },
        { id: 'codex', name: 'Codex', model: '跟随桌面版 Codex 设置', access: '本机 CLI', detail: `桌面版内置 Codex（${DESKTOP_CODEX}），不改用其他版本`, state: cliState(codex), available: codex },
        { id: 'anthropic', name: API_LABELS.anthropic, model: 'claude-haiku-4-5-20251001', access: '官方 API', detail: 'Key 存 macOS 钥匙串', state: `Key ${credentials.anthropic}`, available: credentials.anthropic === '已配置' },
        { id: 'openai', name: API_LABELS.openai, model: 'gpt-6.1-sol', access: '官方 API', detail: 'Key 存 macOS 钥匙串', state: `Key ${credentials.openai}`, available: credentials.openai === '已配置' },
      ];
      const reverseExecutor = state?.reverseSettings?.executor || 'codex';
      const features = [
        { id: 'reverse', name: '逆向工程 · AI 逆推', decision: '保留', ticket: 'I-DW-8（产出改道 my-skills 候选）',
          executor: EXECUTOR_LABELS[reverseExecutor], follows: '默认执行方',
          access: reverseExecutor === 'claude' ? '本机 CLI（claude -p，Seatbelt 只读）' : reverseExecutor === 'codex' ? '本机 CLI（桌面版 Codex app-server）' : '不调用 AI',
          reads: '用户授权的目标路径、REA 只读取证、已有逆向摘要', writes: '工作台私有运行目录 → 逆向记录（结论、未知项、复刻任务包）',
          trail: '每条运行记录执行方', supports: 'Claude、Codex' },
        { id: 'book-model', name: '读书摘要 / 划线 / 问答', decision: '待定', ticket: 'I-DW-9（学习收藏核查）',
          executor: model.provider ? `${API_LABELS[model.provider] || model.provider} · ${model.model || '未选模型'}` : '未选', follows: '单独指定（设置 · 工具 · 模型）',
          access: '官方 API', enabled: model.enabled === true,
          reads: '登记书的有界正文（EPUB）', writes: '工作台私有结果文件；操作日志记提供方、模型、用量、费用',
          trail: '操作日志记提供方与模型', supports: '仅支持官方 API（Claude Haiku 4.5、OpenAI gpt-6.1-sol）：按价格白名单预留费用，本机 CLI 不给逐次费用' },
        { id: 'night-v1', name: '夜巡 v1（常驻与夜巡受控执行）', decision: '建议下线', ticket: 'I-DW-9（信息驾驶舱不再保留第二套自治执行器）',
          executor: 'Claude Code', follows: '固定', access: '本机 CLI + 官方 API Key（Seatbelt，只连 api.anthropic.com）',
          reads: '项目内登记的只读文件', writes: '工作台输出目录', trail: '运行台账', supports: '仅支持 Claude：预算控制只核实过 Claude 官方 CLI' },
        { id: 'night-v2', name: '夜巡 v2', decision: '建议下线', ticket: 'I-DW-9',
          executor: '每个槽位 Claude / Codex', follows: '单独指定', access: '本机 CLI（生产未接适配器，跑不起来）',
          reads: '项目 worktree', writes: '夜间分支与晨报', trail: '运行台账记执行方', supports: 'Claude、Codex' },
        { id: 'knowledge-compilation', name: '知识整理任务包', decision: '待定', ticket: 'I-DW-9',
          executor: '本人 Codex（手动）', follows: '固定', access: '应用不调用：出任务包，本人在 Codex 里跑，再导入',
          reads: '已连接知识源里选中的资料', writes: '导入为候选，不写回 Vault', trail: '导入记录', supports: '仅支持 Codex：任务包按 Codex 原生环境编写' },
      ];
      const server = mcp();
      const exposures = [
        { id: 'profile-mcp', name: '个人说明 MCP', transport: 'HTTP，仅 127.0.0.1', url: server.url, state: server.url ? '运行中' : server.error || '未启用',
          audience: '本机已注册的 Codex、Claude Code、Hermes、OpenClaw',
          reads: [...PROFILE_TOOLS, ...KNOWLEDGE_TOOLS].map(t => t.name).filter(n => n !== 'propose_profile_change'),
          writes: ['propose_profile_change（只进待采纳）', ...REVERSE_TOOLS.map(t => `${t.name}（回执只进待过目）`)],
          off: '环境变量 WORKBENCH_MCP_PORT=off 后重启工作台' },
        { id: 'collection-mcp', name: '收藏集 MCP', transport: 'stdio，由 Agent 启动', url: null, state: '由各 Agent 自行注册',
          audience: '本人注册了它的 Agent', reads: COLLECTION_TOOL_NAMES, writes: [], off: '在对应 Agent 里注销' },
      ];
      const dataObjects = [
        { name: '本机会话（接力用）', source: 'Claude Code、Codex、Hermes、OpenClaw 的会话文件，当次点击时只读' },
        { name: 'Skill 使用统计', source: '读本机 Agent 会话里的 Skill 调用' },
        { name: 'MCP 使用统计', source: '个人说明 MCP 的调用记录' },
        { name: 'Agent 发现与清单', source: '本机已安装的 Agent 程序与配置目录（只读）' },
        { name: 'MCP 注册自检', source: '调用 codex / claude / hermes 的 mcp 查询命令' },
        { name: 'AI HOT 资讯', source: '外部资讯源，不是 AI 替本应用产出的内容' },
        { name: '驾驶舱 Agent 页', source: '4 个 Agent 的全局指令（疑似密钥打码）、模型名、Skill 目录、MCP 与 hook 名字、网关状态、驿窗额度快照；只读，不读凭据与会话（#74）' },
        { name: '项目关系页', source: '名册 type / relations、各项目 AGENTS.md 对底座的引用、Skill 使用统计、近 30 天提交与状态；只读（GET /api/projects-space/relations，#78）' },
        { name: '驾驶舱规则页', source: 'Vault 偏好表的编号与确认依据、agent-kit LESSONS 与自检、全局规则审核包、各项目 AGENTS/LESSONS/ADR 统计；只读（#74）' },
        { name: '资产仓库 Skill 页', source: 'my-skills 的 links.tsv、各 SKILL.md 头部与 git 提交日期，agent-kit 的 skill-usage.jsonl（只记 Claude 端调用）；只读，不写 my-skills（GET /api/my-skills，#93）' },
      ];
      const localModels = [
        { name: '收藏视频转写', detail: '本机 SenseVoice 模型，失败时改用 macOS 系统识别并提示核对；不外发，不属于可切换执行方' },
        { name: '图片文字识别', detail: 'macOS Vision；不外发，不属于可切换执行方' },
      ];
      return {
        checkedAt: new Date(now()).toISOString(),
        defaultExecutor: { value: reverseExecutor, label: EXECUTOR_LABELS[reverseExecutor], options: ['codex', 'claude', 'rea'],
          where: '逆向页「执行器」（第 2 批迁到设置页）', appliesTo: ['reverse'] },
        executors, features, exposures, dataObjects, localModels,
      };
    },
  };
}
