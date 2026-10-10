import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { agentTargetTuple, agentPendingKey, readAgentPending, writeAgentPending } from '../src/useAgentPending.js';

const id = '11111111-1111-4111-8111-111111111111';
function target(overrides = {}) {
  return { id: 'target-codex', agentId: 'codex', label: '初始名称',
    program: { path: '/synthetic/private/program', kind: 'CLI' },
    home: { id: 'home-one', path: '/synthetic/private/home', label: 'Home' },
    bindingId: '22222222-2222-4222-8222-222222222222', ...overrides };
}
function storage() {
  const map = new Map();
  return { getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
}

test('binding tuple ignores a rename, changes on a rebind, and hashed storage key contains no path', async () => {
  const before = target(), tuple = agentTargetTuple(before);
  assert.equal(tuple, agentTargetTuple(target({ label: '仅改名称' })));
  assert.ok(agentTargetTuple(target({ bindingId: 'binding-codex' })));
  assert.notEqual(tuple, agentTargetTuple(target({ bindingId: '33333333-3333-4333-8333-333333333333' })));
  assert.notEqual(tuple, agentTargetTuple(target({ home: { ...before.home, path: '/synthetic/other-home' } })));
  const key = await agentPendingKey('agent-model', tuple, webcrypto.subtle);
  assert.match(key, /^workbench:agent-pending:v1:agent-model:[a-f0-9]{64}$/);
  assert.ok(!key.includes('/synthetic/'));
  assert.notEqual(key, await agentPendingKey('agent-snapshot', tuple, webcrypto.subtle));
  assert.notEqual(key, await agentPendingKey('agent-model', agentTargetTuple(target({
    bindingId: '33333333-3333-4333-8333-333333333333' })), webcrypto.subtle));
});

test('pending pointer requires a valid UUID and verified localStorage write and clear', () => {
  const s = storage(), key = 'synthetic-hashed-key';
  assert.equal(readAgentPending(s, key), '');
  assert.equal(writeAgentPending(s, key, id), true);
  assert.equal(readAgentPending(s, key), id);
  assert.equal(writeAgentPending(s, key, '44444444-4444-4444-8444-444444444444'), false);
  assert.equal(readAgentPending(s, key), id);
  assert.equal(writeAgentPending(s, key, '', id), true);
  assert.equal(readAgentPending(s, key), '');
  s.setItem(key, 'invalid');
  assert.throws(() => readAgentPending(s, key), /无效/);
  assert.throws(() => writeAgentPending(s, key, id), /无效/);
});

test('storage failures do not pretend that a pending pointer was saved or cleared', () => {
  const key = 'synthetic-hashed-key';
  const unavailable = { getItem() { throw Error('blocked'); }, setItem() {}, removeItem() {} };
  assert.throws(() => readAgentPending(unavailable, key), /blocked/);
  assert.throws(() => writeAgentPending(unavailable, key, id), /blocked/);
  const notSaved = { getItem() { return null; }, setItem() {}, removeItem() {} };
  assert.equal(writeAgentPending(notSaved, key, id), false);
  const notCleared = { getItem() { return id; }, setItem() {}, removeItem() {} };
  assert.equal(writeAgentPending(notCleared, key, '', id), false);
  const replacedByOtherTab = { getItem() { return '55555555-5555-4555-8555-555555555555'; },
    setItem() {}, removeItem() { throw Error('must not remove other tab pointer'); } };
  assert.equal(writeAgentPending(replacedByOtherTab, key, '', id), false);
});

test('separate recovery UUID keys survive a competing tab replacing the focus pointer', async()=>{
 const {retainAgentPending,settleAgentPending,agentPendingQueue}=await import('../src/useAgentPending.js');
 const map=new Map(),s={get length(){return map.size;},key:n=>[...map.keys()][n]??null,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
 const other='55555555-5555-4555-8555-555555555555',key='synthetic-recovery-scope';
 assert(retainAgentPending(s,key,id,''));
 // Emulate the interleaving where both tabs saw an empty primary before write.
 s.setItem(key+':operation:'+other,other);s.setItem(key,other);
 assert.deepEqual(new Set(agentPendingQueue(s,key)),new Set([id,other]));
 assert.equal(settleAgentPending(s,key,other),id,'closing the later tab never loses the earlier operation');
 assert.equal(settleAgentPending(s,key,id),'');assert.equal(map.size,0);
});
