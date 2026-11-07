import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scanLocalProjects} from '../server/project-scan.mjs';
import { macOnly, VOLUME_UUID } from "./mac-only.mjs";
async function fixture(t){const root=await fs.mkdtemp(join(tmpdir(),'wb-scan-recovery-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
async function project(path){await fs.mkdir(path,{recursive:true});await fs.writeFile(join(path,'package.json'),'{}');}
test('已登记优先且预算有界；真实嵌套项目仍然遍历', macOnly(VOLUME_UUID),async t=>{const root=await fixture(t),known=join(root,'z-known');await project(join(root,'a-noise'));await project(known);await project(join(known,'nested'));const small=await scanLocalProjects([root],{knownPaths:[known],maxDirectories:1});assert.equal(small.locations.find(l=>l.path===known).status,'present');assert.equal(small.visited,1);assert.equal(small.diagnostics.knownChecked,1);assert.equal(small.diagnostics.reasons[0].code,'directory_budget');const all=await scanLocalProjects([root],{knownPaths:[known]});assert.ok(all.items.some(p=>p.name==='nested'));assert.equal(all.locations.filter(l=>l.path===known).length,1);assert.equal(all.truncated,false);} );
test('精确派生路径在读盘前排除，同名真实目录及work-extra保留', macOnly(VOLUME_UUID),async t=>{const root=await fixture(t),excluded=join(root,'work');await project(join(excluded,'before'));await project(join(root,'work-extra'));await project(join(root,'real','work'));let touched=0;const filesystem={...fs,lstat:async(p,...a)=>{if(p===excluded||p.startsWith(excluded+'/'))touched++;return fs.lstat(p,...a);}};const s=await scanLocalProjects([root,excluded],{excludePaths:[excluded],knownPaths:[join(excluded,'before')],filesystem});assert.equal(touched,0);assert.equal(s.items.length,2);assert.equal(s.truncated,false);});
test('深度截断可解释；更浅批准根补齐后不残留深度警报', macOnly(VOLUME_UUID),async t=>{const root=await fixture(t);await project(join(root,'parent','child'));const limited=await scanLocalProjects([root],{maxDepth:1});assert.equal(limited.diagnostics.reasons[0].code,'depth');const complete=await scanLocalProjects([root,join(root,'parent')],{maxDepth:1});assert.equal(complete.truncated,false);assert.deepEqual(complete.diagnostics.reasons,[]);});

test('Git时间与GitHub分页截断各有诊断；schema拒绝伪造计数',async t=>{
 const {scanGitHub}=await import('../server/discovery.mjs');const {validateProjectScanDiagnostics}=await import('../server/project-scan-diagnostics.mjs');const {projectScanNotice}=await import('../src/project-scan-status.js');
 const root=await fixture(t);await fs.mkdir(join(root,'.git'));await fs.writeFile(join(root,'package.json'),'{}');const local=await scanLocalProjects([root],{maxUpdateReads:0});assert.equal(local.diagnostics.reasons[0].code,'git_time_budget');
 const remote=await scanGitHub({run:async(_,args)=>({stdout:JSON.stringify(args.at(-1)==='user'?{login:'synthetic'}:Array.from({length:100},(_,i)=>({name:`repo${i}`,html_url:`https://github.com/synthetic/repo${i}`})))})});assert.equal(remote.diagnostics.pages,10);assert.equal(remote.diagnostics.records,1000);assert.equal(remote.diagnostics.reasons[0].code,'github_page_limit');
 const value={version:1,at:local.at,local:local.diagnostics,remote:remote.diagnostics};validateProjectScanDiagnostics(value);assert.throws(()=>validateProjectScanDiagnostics({...value,local:{...local.diagnostics,visited:-1}}));assert.match(projectScanNotice({projectScannedAt:local.at,projectScanDiagnostics:value}),/GitHub 分页数/);assert.match(projectScanNotice({}),/具体原因未记录/);
});

test('同一真实根的系统别名不重复展开或虚耗目录预算', macOnly(VOLUME_UUID),async t=>{const root=await fixture(t),canonical=await fs.realpath(root);await project(join(root,'one'));const result=await scanLocalProjects([root,canonical],{maxDirectories:3});assert.equal(result.items.length,1);assert.equal(result.truncated,false);assert.ok(result.visited<=3);});

test('别名的更浅批准根补齐真实子目录后，清除旧路径的深度警报', macOnly(VOLUME_UUID),async t=>{const root=await fixture(t),canonical=await fs.realpath(root);await project(join(root,'parent','child'));const result=await scanLocalProjects([root,join(canonical,'parent')],{maxDepth:1});assert.equal(result.items.length,1);assert.equal(result.truncated,false);});
