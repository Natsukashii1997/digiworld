import test from 'node:test';
import assert from 'node:assert/strict';
import {modelUsageSummary} from '../src/model-usage-summary.js';
test('usage summary keeps unknown costs separate, deduplicates IDs and retains rolled-back request costs',()=>{
 const known={operationId:'a',action:'single-book',provider:'p',model:'m',status:'rolled_back',usage:{input_tokens:10,output_tokens:5},costMicrosUsd:7};
 const rows=modelUsageSummary([known,known,{...known,operationId:'b',status:'unknown',usage:null,costMicrosUsd:null},{...known,operationId:'c',action:'credentials'}]);
 assert.equal(rows.length,1);assert.deepEqual({count:rows[0].count,unknown:rows[0].unknown,input:rows[0].input,output:rows[0].output,usageKnown:rows[0].usageKnown,costKnown:rows[0].costKnown,cost:rows[0].cost},{count:2,unknown:1,input:10,output:5,usageKnown:1,costKnown:1,cost:7});
});
test('usage summary does not invent missing token receipts and separates source/provider/model',()=>{
 const rows=modelUsageSummary([{operationId:'a',action:'connection-test',status:'verified',usage:{input_tokens:0},costMicrosUsd:0},{operationId:'b',action:'single-book',status:'verified',usage:{input_tokens:0,output_tokens:0},costMicrosUsd:null}]);
 assert.equal(rows.length,2);assert.equal(rows[0].usageKnown,0);assert.equal(rows[0].costKnown,1);assert.equal(rows[1].usageKnown,1);assert.equal(rows[1].costKnown,0);
});
