// 协作角色与桌面程序分开：不迁移历史角色 ID，也不改变 CLI/会话适配器。
const TARGETS = {
  codex: { label: "Codex 桌面版", discoveryId: "codex", bundleId: "com.openai.codex" },
  "claude-code": { label: "Claude 桌面版", discoveryId: "claude-app", bundleId: "com.anthropic.claudefordesktop" },
};
export function desktopAgent(agentId) {
  const id = agentId === "claude" || agentId === "claude-app" ? "claude-code" : agentId;
  return Object.hasOwn(TARGETS, id) ? TARGETS[id] : undefined;
}
export function desktopAgentLabel(agentId, fallback = "") {
  return desktopAgent(agentId)?.label || fallback;
}
