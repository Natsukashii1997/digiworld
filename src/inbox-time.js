export function inboxTime(value, now = new Date()) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "时间未知";
  const key = d => new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(),now.getMonth(),now.getDate()-1);
  const prefix = key(date)===key(now) ? "今天" : key(date)===key(yesterday) ? "昨天" : date.toLocaleDateString("zh-CN",{month:"numeric",day:"numeric"});
  return `${prefix} ${date.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}`;
}
