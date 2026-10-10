import {fixture} from './fixture.mjs';
import {seed} from '../src/store.js';
export async function aihot202Fixture({staticRoot}={}) {
 const app=await fixture();await app.repository.write(seed(),{initialize:true});
 if(staticRoot)throw new Error('Use GUIJI_TEST_DIST for staticRoot');
 return app;
}
export function aihot202Data(mode='full',long=false) {
 const titles=['Agent 多步调用的错误累积，比想象中更快','本地优先软件的同步取舍','长上下文的真实成本','开源模型评测基准之争','代码助手的上下文窗口策略','小模型在端侧的三个用法','把评审意见写成可执行清单','RAG 评测的十个坑','多 Agent 协作的交接协议','语音交互的打断与回合'];
 const summaries=['每一步 95% 的成功率，十步之后只剩六成。作者给出三条工程做法：缩短调用链、在关键节点加检查点、失败时回到最近的检查点而不是从头重来；并用一组对照实验说明，换更强的模型不如先把链路拆短。','离线可用与冲突合并之间没有免费午餐：先确定谁是权威，再谈同步策略。','上下文翻倍，延迟和费用并不线性增长；缓存命中率才是关键变量。','同一模型在三个榜单上排名差出十位，问题出在题目泄露与提示格式。','检索片段、最近编辑与项目规则三者怎么分配额度。','分类、改写和意图识别，延迟低于 50ms。','每条意见写成“在哪里、看到什么、改成什么”。','召回率高不等于答案对；先评“找没找到”，再评“答没答对”。','共享状态文件 + 单一写入者，比消息队列更好排错。','允许用户随时打断，比更快的首字延迟更影响体验。'];
 const topics=['新一代编程模型发布，长任务成功率大幅提升','某开源 Agent 框架一周新增三万星','多家厂商下调推理价格','端侧大模型芯片路线之争','AI 生成内容标识新规征求意见','浏览器内置模型接口进入预览','开源语音模型刷新中文识别纪录','企业 Agent 落地调查报告发布','多模态模型看懂长视频','代码评审机器人引发争议'];
 const desc=['社区热议上下文与工具调用的稳定性','主打本地运行与插件生态','缓存命中部分降价最多','存算一体与传统 NPU 的取舍','涉及水印与平台责任','网页可直接调用本机小模型','方言与噪声场景提升明显','七成团队卡在权限与审计','一小时视频的问答准确率翻倍','误报率与开发者信任成焦点'];
 const categories=['研究','工程','模型','评测','工具','端侧','方法','工程','实践','产品'];
 const stamp=mode==='failed'?'2026-10-05T06:00:00+08:00':'2026-10-05T09:30:00+08:00';
 const items=titles.map((title,i)=>({title:long?'长标题EnglishWithoutSpaces'.repeat(18):title,summary:long?'长摘要EnglishWithoutSpaces'.repeat(50):summaries[i],category:categories[i],url:'https://example.com/aihot/'+i,source:'合成来源',publishedAt:'2026-10-05T'+(i===0?'09:12':i===1?'08:40':'08:05')+':00+08:00'}));
 const hot=topics.map((title,i)=>({...items[i],title:long?items[i].title:title,summary:long?items[i].summary:desc[i]}));
 return {settings:{enabled:mode!=='disabled',acknowledged:mode!=='first',intervalHours:3},cache:{status:mode==='failed'?'failed':mode==='first'||mode==='empty'?'never':'ok',error:mode==='failed'?'合成拉取失败':'',lastAttemptAt:stamp,lastSuccessAt:mode==='first'||mode==='empty'?'':stamp,sections:{selected:{items:mode==='first'||mode==='empty'?[]:items,fetchedAt:stamp},hot:{items:mode==='first'||mode==='empty'?[]:hot,fetchedAt:stamp},daily:{items:[],date:''}}}};
}
export async function aihot202Routes(page,data) {
 await page.route('**/api/aihot',r=>r.fulfill({json:data}));
}
