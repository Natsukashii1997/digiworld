import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProjectScanDiagnostics} from '../server/project-scan-diagnostics.mjs';
import {projectScanNotice} from '../src/project-scan-status.js';
// 全盘扫描与 GitHub 拉取已删除（#73）；主库里留下的旧扫描诊断仍要能校验、能显示原因。
test('旧扫描诊断：Git时间与GitHub分页截断各有说明；schema拒绝伪造计数',()=>{
 const at='2026-10-04T01:02:03.000Z';
 const local={visited:1,knownRequested:0,knownChecked:0,gitReads:0,maxDirectories:5000,maxDepth:6,maxUpdateReads:0,reasons:[{code:'git_time_budget',limit:0,used:0,samples:['/synthetic/project']}]};
 const remote={pages:10,records:1000,maxPages:10,pageSize:100,reasons:[{code:'github_page_limit',limit:10,used:10,samples:[]}]};
 const value={version:1,at,local,remote};validateProjectScanDiagnostics(value);
 assert.throws(()=>validateProjectScanDiagnostics({...value,local:{...local,visited:-1}}));
 assert.match(projectScanNotice({projectScannedAt:at,projectScanDiagnostics:value}),/GitHub 分页数/);
 assert.match(projectScanNotice({projectScannedAt:at,projectScanDiagnostics:value}),/Git 时间读取次数/);
 assert.match(projectScanNotice({}),/具体原因未记录/);
});
