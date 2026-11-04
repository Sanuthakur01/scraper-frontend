// Tests for lib/access.ts (who may use the dashboard). Run: npm test (in client/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { can, PERMISSIONS, rawRole, roleFrom, ROLES } from './access.ts';

test('the five allowed roles are accepted from Clerk public metadata', () => {
  for (const role of ['RESEARCH_TEAM', 'ADMIN', 'SUPER_ADMIN', 'PLACEMENT_STAFF', 'STUDENT_MANAGEMENT']) {
    assert.equal(roleFrom({ role }), role);
  }
  assert.deepEqual([...ROLES].sort(), ['ADMIN', 'PLACEMENT_STAFF', 'RESEARCH_TEAM', 'STUDENT_MANAGEMENT', 'SUPER_ADMIN']);
});

test('case, spaces and hyphens are forgiven', () => {
  assert.equal(roleFrom({ role: 'research_team' }), 'RESEARCH_TEAM');
  assert.equal(roleFrom({ role: ' Research Team ' }), 'RESEARCH_TEAM');
  assert.equal(roleFrom({ role: 'placement-staff' }), 'PLACEMENT_STAFF');
  assert.equal(roleFrom({ role: 'super admin' }), 'SUPER_ADMIN');
  assert.equal(roleFrom({ role: 'Student Management' }), 'STUDENT_MANAGEMENT');
});

test('anything else means no access', () => {
  for (const metadata of [undefined, null, {}, { role: '' }, { role: 'STUDENT' }, { role: 'ADMINS' }, { role: 'ADMIN_X' },
    { role: ['ADMIN'] }, { role: { name: 'ADMIN' } }, { role: 1 }, { roles: ['ADMIN'] }, 'ADMIN', ['ADMIN']]) {
    assert.equal(roleFrom(metadata), null, JSON.stringify(metadata));
  }
});

test('the role as typed is kept for the "No access" message', () => {
  assert.equal(rawRole({ role: '  STUDENT ' }), 'STUDENT');
  assert.equal(rawRole({}), '');
});

test('permissions follow the role; no role, no permissions', () => {
  for (const role of ROLES) {
    assert.ok(can(role, 'view'), role);
    assert.equal(can(role, 'edit-hr-details'), PERMISSIONS[role].includes('edit-hr-details'), role);
  }
  assert.equal(can(null, 'view'), false);
  assert.equal(can(null, 'edit-hr-details'), false);
});

test('every role may add the jobs the scraper missed (the same list as the server)', () => {
  for (const role of ROLES) assert.ok(can(role, 'add-jobs'), role);
  assert.equal(can(null, 'add-jobs'), false);
  assert.deepEqual(PERMISSIONS, {
    SUPER_ADMIN: ['view', 'edit-hr-details', 'record-outcomes', 'view-ai-usage', 'add-jobs'],
    ADMIN: ['view', 'edit-hr-details', 'record-outcomes', 'view-ai-usage', 'add-jobs'],
    PLACEMENT_STAFF: ['view', 'edit-hr-details', 'record-outcomes', 'add-jobs'],
    RESEARCH_TEAM: ['view', 'edit-hr-details', 'record-outcomes', 'add-jobs'],
    STUDENT_MANAGEMENT: ['view', 'edit-hr-details', 'record-outcomes', 'add-jobs'],
  });
});
