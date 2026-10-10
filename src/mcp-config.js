// T04: deliberately narrow, inert MCP asset. No connection attempt, command,
// header value, credential value, or host configuration write is supported.
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const SERVER_ID = /^[a-z][a-z0-9_-]{0,39}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
const PUBLIC_PATH = /^\/[a-z][a-z0-9_-]{0,39}(?:\/[a-z][a-z0-9_-]{0,39})*$/;
const TARGET_ID = /^[A-Za-z0-9_-]{1,100}$/;
const fail = message => { throw new Error(message); };

export function validateMcpConfig(value) {
  if (!exact(value, ['schema', 'transport', 'serverId', 'origin', 'path', 'credentialEnvVar']))
    fail('MCP 配置只接受固定的结构化字段，不能包含 headers、token、env 值、stdio 或 Hook');
  if (value.schema !== 1 || value.transport !== 'streamable-http')
    fail('首版仅支持 streamable HTTP MCP');
  if (!SERVER_ID.test(value.serverId))
    fail('MCP 服务名须为 1–40 位小写字母开头的公开标识');
  if (typeof value.origin !== 'string' || value.origin.length > 255)
    fail('MCP origin 无效');
  let url;
  try { url = new URL(value.origin); }
  catch { fail('MCP origin 无效'); }
  // Canonical origin equality rejects userinfo, path, query, fragment, Unicode
  // host aliases and a default-port spelling that could hide extra material.
  if (url.origin !== value.origin || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    !['https:', 'http:'].includes(url.protocol)) fail('MCP origin 只能是无凭据、查询和片段的标准源');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    fail('非本机 MCP 须使用 HTTPS');
  if (typeof value.path !== 'string' || value.path.length > 512 || !PUBLIC_PATH.test(value.path))
    fail('MCP path 只允许公开斜杠路径，不含查询、片段、凭据或编码');
  if (value.credentialEnvVar !== null &&
    (typeof value.credentialEnvVar !== 'string' || !ENV_NAME.test(value.credentialEnvVar)))
    fail('仅可填写环境变量名引用，不接受凭据值');
  return { schema: 1, transport: 'streamable-http', serverId: value.serverId,
    origin: value.origin, path: value.path, credentialEnvVar: value.credentialEnvVar };
}

export function validateMcpVersion(version) {
  const config = validateMcpConfig(version?.mcpConfig);
  if (version.title !== config.serverId || version.description !== '' || version.content !== '' ||
    version.source !== '个人创建' || !Array.isArray(version.tags) || version.tags.length !== 0 ||
    !Array.isArray(version.files) || version.files.length !== 0 ||
    ['references', 'workflowTemplate', 'mediaManifest', 'candidateId'].some(key => version[key] !== undefined))
    fail('MCP 版本仅可保存结构化配置，不接收正文、文件、自由来源或其他资产字段');
  return config;
}

export function codexMcpDelivery(version, registeredTargets, targetId) {
  const config = validateMcpVersion(version);
  if (!TARGET_ID.test(targetId) || !Array.isArray(registeredTargets)) fail('请先选择已登记的 Codex 目标');
  const target = registeredTargets.find(item => item.id === targetId);
  if (!target || target.agentId !== 'codex' || target.program?.kind !== 'CLI' ||
    typeof target.home?.path !== 'string' || !target.home.path.startsWith('/'))
    fail('首版只生成已登记 Codex CLI 目标的配置片段');
  // The supported syntax is Codex's user config.toml, not a guessed Claude,
  // Hermes, plugin, or Agents API manifest format.
  const lines = [`[mcp_servers.${JSON.stringify(config.serverId)}]`,
    `url = ${JSON.stringify(config.origin + config.path)}`];
  if (config.credentialEnvVar)
    lines.push(`bearer_token_env_var = ${JSON.stringify(config.credentialEnvVar)}`);
  return { targetId, versionId: version.id, format: 'Codex config.toml 片段',
    filename: `mcp-${config.serverId}-${version.id.slice(0, 8)}.toml`,
    content: lines.join('\n') + '\n', adoption: 'unverified' };
}
