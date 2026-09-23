import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveExecutionTargetLabel } from '../src/shared/executionLabel.ts';
import {getDefaultModel, getProviderModels} from '../src/shared/providerCatalog.ts';
import {buildExecutionTargetSummary} from '../src/products/shared/renderer/components/ExecutionTarget.ts';
import {clearLiveProviderModelLabels,recordLiveProviderModelLabels,resolveLiveProviderModelLabel,
  replaceInformationalProviderLabels,setProviderModelLabelContext} from '../src/shared/providerModelLabelRegistry.ts';

test('exact target labels preserve spelling and explicit removals', t => {
  clearLiveProviderModelLabels(); t.after(clearLiveProviderModelLabels);
  replaceInformationalProviderLabels([{provider:'claude',backend:'cli',models:[{id:'new-ID',label:'Factory name'}]}]);
  recordLiveProviderModelLabels('claude',[{id:'new-ID',label:'Custom (recommended)'}],{target:'cli/native',catalogRevision:'R1'});
  recordLiveProviderModelLabels('claude',[{id:'new-ID',label:'API name'}],{target:'api/main',catalogRevision:'R1'});
  const target={provider:'claude',instance:'cli/native',model:'new-ID',modelSelection:null};
  assert.equal(buildExecutionTargetSummary(target).modelLabel,'Custom (recommended)');
  assert.match(resolveExecutionTargetLabel(target),/Custom \(recommended\)/);
  assert.equal(resolveLiveProviderModelLabel('claude','new-id','cli/native'),null);
  recordLiveProviderModelLabels('claude',[],{target:'cli/native',catalogRevision:'R2'});
  assert.equal(resolveLiveProviderModelLabel('claude','new-ID','cli/native'),null);
  assert.equal(resolveLiveProviderModelLabel('claude','new-ID','api/main'),'API name');
});

test('informational labels do not populate executable defaults and contexts do not leak', t => {
  clearLiveProviderModelLabels(); t.after(clearLiveProviderModelLabels);
  setProviderModelLabelContext('A');
  replaceInformationalProviderLabels([{provider:'pi',backend:'cli',models:[{id:'provider/opaque',label:'Opaque [subscription]'}]}],'A');
  assert.equal(resolveLiveProviderModelLabel('pi','provider/opaque','cli/native'),'Opaque [subscription]');
  assert.deepEqual(getProviderModels('pi','cli/native'),[]);
  recordLiveProviderModelLabels('pi',[{id:'api-model',label:'API'}],{target:'api/main',context:'A'});
  assert.equal(getDefaultModel('pi','cli/native'),'');
  assert.equal(getDefaultModel('pi'),'');
  assert.equal(getDefaultModel('pi','api/main'),'api-model');
  setProviderModelLabelContext('B');
  recordLiveProviderModelLabels('pi',[{id:'old',label:'Old'}],{target:'cli/native',context:'A'});
  assert.equal(resolveLiveProviderModelLabel('pi','provider/opaque','cli/native'),null);
  assert.deepEqual(getProviderModels('pi','cli/native'),[]);
});
