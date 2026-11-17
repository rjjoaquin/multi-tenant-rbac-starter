import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, canAssign, canManage } from '../src/policy.ts';

test('role permissions', () => {
  for (const role of ['OWNER', 'ADMIN', 'MEMBER']) assert.equal(can(role, 'read'), true);
  assert.equal(can('MEMBER', 'invite'), false);
  assert.equal(can('ADMIN', 'invite'), true);
  assert.equal(can('ADMIN', 'deleteOrganization'), false);
  assert.equal(can('OWNER', 'deleteOrganization'), true);
});
test('role assignment and removal do not allow escalation', () => {
  assert.equal(canAssign('MEMBER', 'MEMBER'), false);
  assert.equal(canAssign('ADMIN', 'ADMIN'), false);
  assert.equal(canAssign('ADMIN', 'MEMBER'), true);
  assert.equal(canAssign('OWNER', 'OWNER'), false);
  assert.equal(canManage('ADMIN', 'ADMIN'), false);
  assert.equal(canManage('ADMIN', 'OWNER'), false);
  assert.equal(canManage('OWNER', 'ADMIN'), true);
  assert.equal(canManage('OWNER', 'OWNER'), false);
});
