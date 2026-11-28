import assert from 'node:assert/strict';
import test from 'node:test';
import {workspaceView,workspaceViewUrl} from '../../lib/hft/ui-reuse/workspace-view-state.ts';
const views=['EMPLOYEE','ITEM','SUPPLIER'] as const;
test('workspace view survives reload without storing business or session data',()=>{
 const base='https://example.test/masters/live';
 const url=workspaceViewUrl(base,'view','ITEM',views);
 assert.equal(url,'/masters/live?view=ITEM');
 assert.equal(workspaceView('https://example.test'+url,'view',views,'EMPLOYEE'),'ITEM');
 assert.equal(workspaceView(base,'view',views,'EMPLOYEE'),'EMPLOYEE');
});
test('only one whitelisted view is accepted, and other URL state is preserved',()=>{
 assert.equal(workspaceView('https://example.test/masters/live?view=other','view',views,'EMPLOYEE'),'EMPLOYEE');
 assert.equal(workspaceView('https://example.test/masters/live?view=ITEM&view=SUPPLIER','view',views,'EMPLOYEE'),'EMPLOYEE');
 assert.equal(workspaceViewUrl('https://example.test/masters/live?auth=unavailable#top','view','SUPPLIER',views),'/masters/live?auth=unavailable&view=SUPPLIER#top');
 const intake=['items','stickers'] as const;
 assert.equal(workspaceView('https://example.test/stores/intake?view=stickers','view',intake,'items'),'stickers');
});
