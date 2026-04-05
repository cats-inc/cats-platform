import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getWorkTemplate,
  listWorkTemplates,
} from '../build/server/products/work/templates/index.js';

test('listWorkTemplates returns at least one template', () => {
  const templates = listWorkTemplates();
  assert.ok(templates.length > 0, 'should have at least one template');
});

test('getWorkTemplate returns software_delivery', () => {
  const template = getWorkTemplate('software_delivery');
  assert.ok(template, 'should find software_delivery template');
  assert.equal(template.id, 'software_delivery');
  assert.equal(template.version, 1);
});

test('getWorkTemplate returns null for unknown id', () => {
  const template = getWorkTemplate('nonexistent');
  assert.equal(template, null);
});

test('software_delivery template has required structure', () => {
  const template = getWorkTemplate('software_delivery');
  assert.ok(template);
  assert.ok(template.roles.length > 0, 'should have roles');
  assert.ok(template.taskBlueprints.length > 0, 'should have task blueprints');
  assert.ok(template.approval.requiresPlanApproval, 'should require plan approval');
});

test('software_delivery roles include required boss and pm', () => {
  const template = getWorkTemplate('software_delivery');
  assert.ok(template);

  const requiredRoles = template.roles.filter((role) => role.required);
  assert.ok(requiredRoles.length >= 2, 'should have at least 2 required roles');

  const bossRole = template.roles.find((role) => role.key === 'boss');
  assert.ok(bossRole, 'should have boss role');
  assert.equal(bossRole.required, true);

  const pmRole = template.roles.find((role) => role.key === 'pm');
  assert.ok(pmRole, 'should have pm role');
  assert.equal(pmRole.required, true);
});

test('software_delivery blueprints have valid roleKey references', () => {
  const template = getWorkTemplate('software_delivery');
  assert.ok(template);

  const roleKeys = new Set(template.roles.map((role) => role.key));

  for (const blueprint of template.taskBlueprints) {
    assert.ok(
      roleKeys.has(blueprint.roleKey),
      `Blueprint "${blueprint.key}" references unknown roleKey "${blueprint.roleKey}"`,
    );
  }
});

test('software_delivery blueprints have valid dependsOnKeys references', () => {
  const template = getWorkTemplate('software_delivery');
  assert.ok(template);

  const blueprintKeys = new Set(template.taskBlueprints.map((bp) => bp.key));

  for (const blueprint of template.taskBlueprints) {
    for (const depKey of blueprint.dependsOnKeys) {
      assert.ok(
        blueprintKeys.has(depKey),
        `Blueprint "${blueprint.key}" depends on unknown key "${depKey}"`,
      );
      assert.notEqual(
        depKey,
        blueprint.key,
        `Blueprint "${blueprint.key}" depends on itself`,
      );
    }
  }
});

test('software_delivery blueprints have no circular dependencies', () => {
  const template = getWorkTemplate('software_delivery');
  assert.ok(template);

  const depsMap = new Map(
    template.taskBlueprints.map((bp) => [bp.key, bp.dependsOnKeys]),
  );

  function hasCycle(key, visited = new Set()) {
    if (visited.has(key)) {
      return true;
    }

    visited.add(key);
    const deps = depsMap.get(key) ?? [];
    for (const dep of deps) {
      if (hasCycle(dep, new Set(visited))) {
        return true;
      }
    }
    return false;
  }

  for (const blueprint of template.taskBlueprints) {
    assert.ok(
      !hasCycle(blueprint.key),
      `Circular dependency detected starting from "${blueprint.key}"`,
    );
  }
});

test('software_delivery blueprints have valid productHint values', () => {
  const template = getWorkTemplate('software_delivery');
  assert.ok(template);

  const validProducts = new Set(['chat', 'work', 'code']);
  for (const blueprint of template.taskBlueprints) {
    assert.ok(
      validProducts.has(blueprint.productHint),
      `Blueprint "${blueprint.key}" has invalid productHint "${blueprint.productHint}"`,
    );
  }
});

