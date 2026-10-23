export const COCKTAIL_RULE_VERSION = 'cocktail-local-v1';

const topic = /调酒(?!师)|鸡尾酒|cocktail|莫吉托|mojito|马[天丁]尼|martini|玛格丽特|margarita|尼格罗尼|negroni|金汤力|gin\s*(?:&|and)?\s*tonic|威士忌酸|whisk[e]?y\s*sour|曼哈顿|manhattan|长岛冰茶|old\s*fashioned|古典鸡尾酒|莫斯科骡子|moscow\s*mule/i;
const preparation = /(?:教程|教学|配方|配比|做法|调制|制作|怎么调|如何调|recipe|tutorial)/i;
const preparationTitle = new RegExp(`(?:${topic.source})\\s*(?:的\\s*)?(?:调酒\\s*)?${preparation.source}|(?:怎么|如何)\\s*(?:调制|调|制作)\\s*(?:${topic.source})|how\\s+to\\s+(?:make|mix)\\s+(?:a\\s+)?(?:${topic.source})`,'i');
const excluded = /酒驾|醉驾|招聘|招募|招工|薪资|岗位|面试|探店|打卡|酒吧推荐|开店|开业|团购|促销|优惠券|加盟|带货|营销|广告|酒评|测评|品鉴|料酒|炒菜|做菜|烹饪|红烧|无酒精|零酒精|不含酒精|mocktail|non[ -]?alcoholic|alcohol[ -]?free|海报|设计|绘画|摄影|拍摄|剪辑|穿搭|段子|骗局|不是调酒|不教调酒|人工智能|大模型|提示词|chatgpt|claude|midjourney|(^|[^a-z])(?:ai|gpt)([^a-z]|$)/i;
const uncertainTitle = /咖啡|奶茶|书单|课程|培训|报名|教程推荐|教程盘点|蛋糕|甜点|冰淇淋|香薰|蜡烛|树脂|杯垫|手工|银饰|酒杯|玻璃杯|橡皮泥|黏土|粘土|硅胶|模具|翻模|模型|cake|dessert|ice\s*cream|candle|resin|coaster|glass|jewel|dress|soap|clay|mould|mold|(?:不是|并非|不是真(?:的)?|不教|没有)[^。！!？?\n]{0,8}(?:调酒|鸡尾酒)/i;
const alcoholFree = /无醇|脱醇|去酒精|(?:不加|不放|不兑|不用|没有|不含|不使用)[^。！!？?\n]{0,8}(?:酒|酒精|基酒)|(?:0|零)\s*(?:度|酒精)|(?:酒精|alcohol)[^。！!？?\n]{0,8}0(?:\.0+)?\s*%|0(?:\.0+)?\s*%\s*alcohol/i;
const baseSpirit = /朗姆酒|金酒|琴酒|伏特加|龙舌兰(?:酒)?|威士忌|白兰地|干邑|杜松子酒|波本|苦艾酒|味美思|利口酒|\b(?:rum|gin|vodka|tequila|whisk[e]?y|bourbon|brandy|cognac|vermouth|liqueur)\b/i;
const units = '(?:ml|cl|oz|毫升|盎司)';
const measuredSpirit = new RegExp(`(?:${baseSpirit.source})\\s*[：:]?\\s*(\\d+(?:\\.\\d+)?)\\s*${units}|(\\d+(?:\\.\\d+)?)\\s*${units}\\s*(?:of\\s+|的)?(?:${baseSpirit.source})`,'gi');
const normalize = value => typeof value==='string' ? value.normalize('NFKC').toLowerCase().trim() : '';

// This is an abstaining rule, not a probability estimate or a semantic model.
export function matchCocktailNote(note) {
  const title=normalize(note?.title).slice(0,300);
  const tags=(Array.isArray(note?.tags)?note.tags:[]).slice(0,100).map(normalize);
  const text=['content','rawContent','ocrText','transcriptText'].map(key=>normalize(note?.[key]).slice(0,40000)).join('\n');
  const evidence=`${title}\n${tags.join('\n')}\n${text}`;
  if (!preparationTitle.test(title) || uncertainTitle.test(title) || excluded.test(evidence) || alcoholFree.test(evidence)) return null;
  const recipe=Array.from(text.matchAll(measuredSpirit)).some(match=>Number(match[1] || match[2])>0) && /搅拌|摇匀|摇和|加入|倒入|\b(?:shake|shaken|shaking|stir|stirred|stirring|mix|mixed|mixing)\b/i.test(text);
  if (!recipe) return null;
  return {reason:'标题明确为调酒制作，正文含基酒用量与制作步骤',ruleVersion:COCKTAIL_RULE_VERSION};
}

export function matchCocktailGroup(note, groups) {
  const targets=(Array.isArray(groups)?groups:[]).filter(group=>normalize(group?.name)==='调酒');
  if (targets.length!==1) return null;
  const match=matchCocktailNote(note);
  return match ? {...match,groupId:targets[0].id} : null;
}

export function synchronizeAutoGroups(state) {
  const autoGroups={...(state.autoGroups || {})};
  const noteIds=new Set(state.notes.map(note=>note.id));
  for (const [noteId,assignment] of Object.entries(autoGroups)) {
    if (assignment.status==='active' && (!noteIds.has(noteId) || state.desk.noteGroupMap[noteId]!==assignment.groupId)) {
      autoGroups[noteId]={...assignment,status:'overridden'};
    }
  }
  return {...state,autoGroups};
}

export function invalidateAutoGroups(state, noteIds) {
  const autoGroups={...(state.autoGroups || {})};
  for (const noteId of noteIds) {
    const assignment=autoGroups[noteId];
    if (assignment?.status==='active') autoGroups[noteId]={...assignment,status:'overridden'};
  }
  return {...state,autoGroups};
}

export function noteWithAutoGroup(note, state) {
  const assignment=state.autoGroups?.[note.id];
  const group=state.desk.groups.find(item=>item.id===assignment?.groupId);
  if (assignment?.status!=='active' || !group || state.desk.noteGroupMap[note.id]!==group.id) return note;
  return {...note,autoGroup:{assignmentId:assignment.id,groupId:group.id,groupName:group.name,reason:assignment.reason,assignedAt:assignment.at}};
}
