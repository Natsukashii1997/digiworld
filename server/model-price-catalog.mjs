// 官方少量白名单；客户端不可覆盖单价。过期只允许连接GET，生成关闭至人工复核更新。
const asOf='2026-10-04',expiresAt='2026-11-03T00:00:00.000Z';
const rates={
 'anthropic/claude-haiku-4-5-20251001':{inputMicrosPerToken:1,outputMicrosPerToken:5,source:'https://platform.claude.com/docs/en/about-claude/pricing'},
 'openai/gpt-6.1-sol':{inputMicrosPerToken:2,outputMicrosPerToken:10,source:'https://developers.openai.com/api/docs/pricing'},
};
export function priceForModel(provider,model,{clock=Date.now}={}){if(clock()>Date.parse(expiresAt))return null;const r=rates[provider+'/'+model];return r?{...r,currency:'USD',asOf,expiresAt}:null;}
