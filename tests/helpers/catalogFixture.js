// Frozen HTTP projection from Runtime schema 2 for isolated UI tests. Never production data.
// The only later edit is the advanced `basis` field on six providers (Runtime PLAN-045); models,
// labels and controls stay frozen and do not track the Runtime factory catalog.
import catalogs from '../fixtures/catalogs-v2.json' with { type: 'json' };
export function createFixtureProviderModelCatalog(provider, options = {}) {
  const catalog = structuredClone(catalogs[provider]?.base ?? {provider,backend:'cli',models:[],defaultModel:null,source:'static',cache:null,warnings:[]});
  return {...catalog,...options,instance:options.instance ?? catalog.instance};
}
export function createFixtureProviderAdvancedCatalog(provider, options = {}) {
  return {...structuredClone(catalogs[provider].advanced),...options};
}
