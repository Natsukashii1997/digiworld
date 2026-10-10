// 派单175：真实确定性事务、旧形状与备份边界。全部目录/图片为合成。
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {seed} from '../src/store.js';
import {silverOf,remove,restore} from '../src/silver.js';
import {fixedCollectionsOf,legacyCategoriesOf,wallGroupsOf,wallNumbersOf,addWish,addFixedItem,setTarget,cancelWish,restoreWish} from '../src/silver-v16.js';
import {validateState,validateHistory} from '../server/schema.mjs';
import {mergeBackup} from '../server/merge.mjs';
import {openRepository} from '../server/repository.mjs';
import {packDirectory,inspectBackup,previewRestore,restoreTo} from '../server/full-backup.mjs';
const at='2026-10-05T08:00:00.000Z',image='a'.repeat(64)+'.png';
const source=(id,author='MOON')=>({id,image,author,source:'合成',note:'',createdAt:at});
const base=()=>({wall:[source('w1'),source('w2')],categories:[],items:[]});
const state=s=>({...seed(),silver:s});
const cat=(id,name,target=3)=>({id,name,target,createdAt:at});
const item=(id,key='ring')=>({id,categoryKey:key,image,name:'合成戒指',createdAt:at});
const wish=(id='wish1',key='ring')=>({id,wallId:'w1',categoryKey:key,createdAt:at});
const sha=b=>createHash('sha256').update(b).digest('hex');
async function directory(t){const d=await mkdtemp(join(tmpdir(),'guiji-175-'));t.after(()=>rm(d,{recursive:true,force:true}));return d;}

test('175 银饰旧库不迁移；四类精确映射、同名目标相加、其它类只读、目标减少不删对象',()=>{
 const old=seed();assert.deepEqual(silverOf(old),{wall:[],categories:[],items:[]});assert.equal('silver' in old,false);
 const s=base();s.categories=[cat('oldRing','戒指',2),cat('ring2','戒指',4),cat('chain','手链'),{...cat('dead','项链'),deletedAt:at}];s.items=[{...item('old'),categoryId:'oldRing'}];delete s.items[0].categoryKey;
 s.items.push({...item('chainItem'),categoryId:'chain'});delete s.items[1].categoryKey;
 const before=structuredClone(s);validateState(state(s));const c=fixedCollectionsOf(s);assert.deepEqual(c.map(t=>t.key),['ring','necklace','bangle','pendant']);assert.equal(c[0].target,6);assert.equal(c[0].items.length,1);assert.equal(c[1].target,4);assert.equal(legacyCategoriesOf(s)[0].name,'手链');assert.deepEqual(s,before);
 const next=setTarget(s,'ring',1);assert.equal(next.categories[0].target,2);assert.equal(next.items.length,2);assert.equal(fixedCollectionsOf(next)[0].cells.length,1);validateHistory(state(s),state(next));
 const many={...base(),categories:Array.from({length:50},(_,i)=>cat('c'+i,'旧'+i)),items:[item('new')]};validateState(state(many));
});
test('175 银饰品牌trim/NFC/casefold、No含回收稳定、主推单独展示、扇开可访问全组',()=>{
 const s=base();s.wall=[source('a',' Moon '),source('b','MOON'),{...source('deleted','Other'),deletedAt:at},source('e1','e\u0301'),source('e2','é')];s.wall[1].createdAt='2026-10-05T09:00:00Z';
 const before=structuredClone(s);const groups=wallGroupsOf(s);assert.equal(groups[0].records.length,2);assert.equal(groups[0].preview.length,1);assert.equal(groups[1].records.length,2);assert.equal(wallNumbersOf(s).get('deleted'),2);assert.deepEqual(s,before);
});
test('175 心愿幂等、原子实现、回收藏品不重开、恢复原关联、取消恢复重复拒绝',()=>{
 const s=base(),added=addWish(s,{wallId:'w1',categoryKey:'ring'});assert.equal(added.added,true);const duplicate=addWish(added.silver,{wallId:'w1',categoryKey:'ring'});assert.equal(duplicate.added,false);assert.equal(duplicate.wish.id,added.wish.id);
 const result=addFixedItem(added.silver,'ring',{image,name:'月戒'},{wishId:added.wish.id});validateState(state(result.silver));validateHistory(state(added.silver),state(result.silver));assert.equal(result.item.categoryId,undefined);assert.equal(result.silver.wishes[0].fulfilledItemId,result.item.id);
 const dead=remove(result.silver,'items',result.item.id);validateHistory(state(result.silver),state(dead));assert.equal(fixedCollectionsOf(dead)[0].wishes.length,0);assert.equal(fixedCollectionsOf(dead)[0].items.length,0);assert.equal(dead.wishes[0].fulfilledItemId,result.item.id);assert.throws(()=>addFixedItem(dead,'ring',{image,name:'另一件'},{wishId:added.wish.id}),/已实现/);
 const restored=restore(dead,'items',result.item.id);validateHistory(state(dead),state(restored));assert.equal(fixedCollectionsOf(restored)[0].items.length,1);
 const canceled=cancelWish(s,'irrelevant');assert.deepEqual(canceled.items,s.items); // 不存在ID无副作用。
 const cancel=cancelWish(added.silver,added.wish.id),again=addWish(cancel,{wallId:'w1',categoryKey:'ring'});assert.throws(()=>restoreWish(again.silver,added.wish.id),/已有心愿/);
 const deletedSource=remove(added.silver,'wall','w1'),filled=addFixedItem(deletedSource,'ring',{image,name:'保留来源'},{wishId:added.wish.id});validateState(state(filled.silver));validateHistory(state(deletedSource),state(filled.silver));
});
test('175 新字段严格拒绝；回收外键保留；不允许两条心愿实现同一件',()=>{
 const valid={...base(),items:[item('i')],wishes:[{...wish(),fulfilledItemId:'i',fulfilledAt:at}],targets:{ring:3}};validateState(state(valid));
 const changes=[s=>s.items[0].categoryId='x',s=>delete s.items[0].categoryKey,s=>s.items[0].categoryKey='unknown',s=>s.targets.extra=1,s=>s.targets.ring=0,s=>s.targets.ring=1000,s=>s.targets.ring=1.5,s=>s.wishes[0].wallId='missing',s=>s.wishes[0].categoryKey='bangle',s=>delete s.wishes[0].fulfilledAt,s=>s.wishes[0].extra=1,s=>s.wishes.push({...wish('other','necklace'),fulfilledItemId:'i',fulfilledAt:at}),s=>s.wishes.push(wish('another'))];
 for(const change of changes){const s=structuredClone(valid);change(s);assert.throws(()=>validateState(state(s)),/数据校验失败/);}
 const dead=structuredClone(valid);dead.wall[0].deletedAt=at;dead.items[0].deletedAt=at;validateState(state(dead));
});
test('175 历史禁止心愿硬删/改身份/换实现/挪用旧藏品；旧其它类冻结不阻断其余页',()=>{
 const s={...base(),items:[item('i')],wishes:[{...wish(),fulfilledItemId:'i',fulfilledAt:at}]};
 for(const change of [v=>v.wishes=[],v=>v.wishes[0].wallId='w2',v=>v.wishes[0].createdAt='2026-10-06T00:00:00Z',v=>delete v.wishes[0].fulfilledItemId,v=>v.wishes[0].fulfilledAt='2026-10-06T00:00:00Z']){const n=structuredClone(s);change(n);assert.throws(()=>validateHistory(state(s),state(n)),/数据校验失败/);}
 const pending={...base(),items:[item('i')],wishes:[wish()]};const invalid=structuredClone(pending);invalid.wishes[0]={...invalid.wishes[0],fulfilledItemId:'i',fulfilledAt:at};assert.throws(()=>validateHistory(state(pending),state(invalid)),/原子收录/);
 const old={...base(),categories:[cat('other','手链')],items:[{id:'x',categoryId:'other',image,name:'旧手链',createdAt:at}]};const readonly=structuredClone(old);readonly.items[0].name='修改';assert.throws(()=>validateHistory(state(old),state(readonly)),/只读/);const unrelated=state(old);unrelated.notes=[{id:'n',text:'另页',at}];validateHistory(state(old),unrelated);
});
test('175 merge补缺失目标与心愿、已有编辑当前优先；身份/跨库关联冲突整次拒且输入不变',()=>{
 const old={...base(),targets:{ring:2},wishes:[wish()]},incoming={...base(),targets:{ring:8,necklace:4},wishes:[{...wish(),deletedAt:at},wish('newWish','bangle')]};const frozen=[structuredClone(old),structuredClone(incoming)];const result=mergeBackup(state(old),state(incoming));assert.equal(result.state.silver.targets.ring,2);assert.equal(result.state.silver.targets.necklace,4);assert.equal(result.state.silver.wishes[0].deletedAt,undefined);assert.equal(result.state.silver.wishes.length,2);assert.deepEqual(result.summary.silverAdded,{wall:0,categories:0,items:0});assert.deepEqual([old,incoming],frozen);
 for(const bad of [{...incoming,wishes:[{...wish(),wallId:'w2'}]},{...incoming,wishes:[wish('sameTuple')]},{...incoming,items:[{...item('i'),categoryKey:'necklace'}],wishes:[{...wish('a','necklace'),fulfilledItemId:'i',fulfilledAt:at},{...wish('b','necklace'),wallId:'w2',fulfilledItemId:'i',fulfilledAt:at}]}]){const before=structuredClone(bad);assert.throws(()=>mergeBackup(state(old),state(bad)));assert.deepEqual(bad,before);assert.deepEqual(old,frozen[0]);}
 const absent=mergeBackup(state(base()),state(base())).state.silver;assert.equal('wishes' in absent,false);assert.equal('targets' in absent,false);
});
test('175 repository原子实现只增一次revision；失败与过期导入不半推进',async t=>{
 const dir=await directory(t),repo=await openRepository(dir);t.after(()=>repo.close());const a=addWish(base(),{wallId:'w1',categoryKey:'ring'});let before=await repo.write(state(a.silver),{initialize:true});const result=addFixedItem(before.silver,'ring',{image,name:'一件'},{wishId:a.wish.id});const stored=await repo.write({...before,silver:result.silver});assert.equal(stored.revision,before.revision+1);assert.equal(stored.silver.wishes[0].fulfilledItemId,stored.silver.items[0].id);const broken=structuredClone(stored);broken.silver.wishes[0].fulfilledAt='2026-10-06T00:00:00Z';await assert.rejects(repo.write(broken));assert.deepEqual(await repo.read(),stored);
 const backup=state({...base(),wishes:[{...wish('historic','bangle'),deletedAt:at}]});const preview=await repo.previewImport(backup);await repo.write({...stored,notes:[{id:'a',text:'并发',at}]});await assert.rejects(repo.importBackup(backup,preview.token),/过期|变化/);assert.equal((await repo.read()).silver.wishes.length,1);
});
test('175 新完整ZIP只排root silver实体，保元数据和逆向/类似路径；旧ZIP含银饰仍可恢复与校验',async t=>{
 const dir=await directory(t),repo=await openRepository(dir);t.after(()=>repo.close());const s={...base(),items:[item('i')],wishes:[{...wish(),fulfilledItemId:'i',fulfilledAt:at}],targets:{ring:2}};await repo.write(state(s),{initialize:true});
 const bytes=Buffer.from('合成银饰实体');for(const folder of ['silver','reverse-media','silver-other','logs/silver']){await mkdir(join(dir,folder),{recursive:true});await writeFile(join(dir,folder,'synthetic.png'),bytes);}
 const packed=await packDirectory(dir),entries=unzipSync(packed.bytes);assert.equal(packed.manifest.files.some(f=>f.path.startsWith('silver/')),false);assert.equal(Object.keys(entries).some(n=>n.startsWith('data/silver/')),false);for(const folder of ['reverse-media','silver-other','logs/silver'])assert.deepEqual(Buffer.from(entries['data/'+folder+'/synthetic.png']),bytes);
 const snap=packed.manifest.files.find(f=>f.path.startsWith('snapshots/'));assert.deepEqual(JSON.parse(strFromU8(entries['data/'+snap.path])).silver,s);const target=dir+'-new';t.after(()=>rm(target,{recursive:true,force:true}));await restoreTo(packed.bytes,target);const recovered=await openRepository(target);assert.deepEqual((await recovered.read()).silver,s);await recovered.close();await assert.rejects(readFile(join(target,'silver','synthetic.png')));assert.deepEqual(await readFile(join(target,'reverse-media','synthetic.png')),bytes);
 const manifest=structuredClone(packed.manifest);manifest.files.push({path:'silver/synthetic.png',size:bytes.length,sha256:sha(bytes)});manifest.files.sort((a,b)=>a.path.localeCompare(b.path));manifest.totalBytes+=bytes.length;manifest.skipped=manifest.skipped.filter(x=>x.path!=='silver');entries['data/silver/synthetic.png']=bytes;entries['manifest.json']=strToU8(JSON.stringify(manifest));const legacyBytes=zipSync(entries),legacy=inspectBackup(legacyBytes);const preview=await previewRestore(dir,legacyBytes);assert.equal(preview.summary.same,legacy.manifest.files.length);assert.deepEqual(preview.summary.conflict,[]);assert.deepEqual(preview.summary.added,[]);const legacyTarget=dir+'-old';t.after(()=>rm(legacyTarget,{recursive:true,force:true}));await restoreTo(legacyBytes,legacyTarget);assert.deepEqual(await readFile(join(legacyTarget,'silver','synthetic.png')),bytes);
 entries['data/silver/synthetic.png']=strToU8('tampered');assert.throws(()=>inspectBackup(zipSync(entries)),/SHA|不一致|大小/);assert.deepEqual(await readFile(join(dir,'silver','synthetic.png')),bytes);
});
test('175 合法旧品类原型同名仍只读；不改未知名称，不禁止读取/导入',()=>{
 for(const name of ['constructor','toString','__proto__'])for(const deleted of [false,true]){const category={...cat('other',name),...(deleted?{deletedAt:at}:{})};const old={...base(),categories:[category],items:[{id:'i',categoryId:'other',image,name:'原收藏',createdAt:at,...(deleted?{deletedAt:at}:{})}]};validateState(state(old));const change=structuredClone(old);change.items[0].name='改写';assert.throws(()=>validateHistory(state(old),state(change)),/只读/);const addition=structuredClone(old);addition.items.push({id:'new',categoryId:'other',image,name:'新收藏',createdAt:at});assert.throws(()=>validateHistory(state(old),state(addition)),/不能新增/);const incoming=state(old);assert.deepEqual(mergeBackup(state(base()),incoming).state.silver,old);}
});
