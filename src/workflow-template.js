// 协同模板属于工作流资产的某个不可变版本。运行进度仍以项目协议文件为准。
export const WORKFLOW_TEMPLATE_ACTORS = [
  ["claude-code", "Claude"],
  ["codex", "Codex"],
  ["hermes", "Hermes"],
  ["user", "你"],
];

const actors = new Set(WORKFLOW_TEMPLATE_ACTORS.map(([id]) => id));
const fields = [
  "number",
  "label",
  "defaultActor",
  "method",
  "artifact",
  "gate",
  "skippable",
];
const templateFields = ["schema", "stages", "defaultPace", "escalationAfter"];

function onlyKeys(value, allowed, name) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${name}格式无效`);
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) throw new Error(`${name}包含不支持的字段：${extra}`);
}

function boundedText(value, name, limit, { oneLine = false } = {}) {
  if (typeof value !== "string") throw new Error(`请填写${name}`);
  const text = value.trim();
  if (!text) throw new Error(`请填写${name}`);
  if (text.length > limit) throw new Error(`${name}不能超过 ${limit} 字`);
  if (/\x00|[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) ||
      (oneLine && /[\r\n]/.test(text)))
    throw new Error(`${name}包含不支持的控制字符`);
  return text;
}

/** Return a normalized copy; never modify the saved version or the form draft. */
export function validateWorkflowTemplate(input) {
  onlyKeys(input, templateFields, "协同模板");
  if (input.schema !== 1) throw new Error("协同模板版本格式不支持");
  if (!Array.isArray(input.stages) || input.stages.length < 1 || input.stages.length > 20)
    throw new Error("协同模板须有 1–20 个阶段");
  if (!["per-run", "continuous"].includes(input.defaultPace))
    throw new Error("请选择推进节奏");
  if (!Number.isInteger(input.escalationAfter) || input.escalationAfter < 1 || input.escalationAfter > 10)
    throw new Error("返修升级次数须为 1–10 的整数");
  const stages = input.stages.map((stage, index) => {
    const number = index + 1;
    onlyKeys(stage, fields, `第 ${number} 站`);
    if (stage.number !== number)
      throw new Error(`第 ${number} 站编号须依次为 ${number}`);
    if (!actors.has(stage.defaultActor))
      throw new Error(`第 ${number} 站请选择执行者`);
    if (typeof stage.skippable !== "boolean")
      throw new Error(`第 ${number} 站跳过设置无效`);
    return {
      number,
      label: boundedText(stage.label, `第 ${number} 站名称`, 80, { oneLine: true }),
      defaultActor: stage.defaultActor,
      method: boundedText(stage.method, `第 ${number} 站方法`, 2000),
      artifact: boundedText(stage.artifact, `第 ${number} 站交付物`, 200, { oneLine: true }),
      gate: boundedText(stage.gate, `第 ${number} 站过关条件`, 1000),
      skippable: stage.skippable,
    };
  });
  return {
    schema: 1,
    stages,
    defaultPace: input.defaultPace,
    escalationAfter: input.escalationAfter,
  };
}

export const DESIGN_IMPLEMENTATION_V1 = Object.freeze({
  schema: 1,
  stages: Object.freeze([
    ["方向梳理", "claude-code", "grill-me 问答", "页面 / 功能简报", "你确认", true],
    ["视觉稿", "claude-code", "compose / shoot，合成数据", "1440 + 390 多状态视觉稿", "你确认", true],
    ["派单", "claude-code", "派单模板", "排队派单", "Codex 认领时按用户授权登记正式编号（文件开头注明）", false],
    ["认领与实现", "codex", "冻结参照、隔离运行器、合成数据", "代码 + 全量回归 + 逐区叠图", "全量回归通过，首败保留", false],
    ["交付交接", "codex", "交接模板 + 证据", "交接文件", "写后回读、释放写入者", false],
    ["验收", "claude-code", "默认轻量核对交接、偏差段与 2–3 张对照图；涉及真实数据或外部账号时完整复核", "一页验收文件：通过 / 返修 / 小精修", "通过", false],
    ["运行采用", "codex", "你单次授权后受控重启 5178，接口与页面实测", "运行采用交接", "你当次授权 + 实测通过", false],
    ["终验", "user", "5178 实际使用，按 Claude 出的走查清单", "终验结论", "你确认", false],
    ["存档", "user", "存档点页：预览 → 确认创建本地提交；推送 GitHub 前先告诉你", "存档点", "你确认", false],
  ].map(([label, defaultActor, method, artifact, gate, skippable], index) =>
    Object.freeze({ number: index + 1, label, defaultActor, method, artifact, gate, skippable }))),
  defaultPace: "per-run",
  escalationAfter: 2,
});

export const freshDesignImplementationV1 = () =>
  validateWorkflowTemplate(DESIGN_IMPLEMENTATION_V1);
