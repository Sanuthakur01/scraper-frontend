// Who may use the dashboard, and what each role may do (role-based access).
//
// People sign in with Clerk. Only users whose Clerk *public metadata* has one of ROLES may use the
// dashboard, e.g. { "role": "RESEARCH_TEAM" } (set by an admin in the Clerk dashboard: Users → the
// user → Metadata → Public). Anyone else who signs in sees "No access". Sign-ups are restricted in
// Clerk, so accounts are only created or invited there.

export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'PLACEMENT_STAFF', 'RESEARCH_TEAM'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  PLACEMENT_STAFF: 'Placement staff',
  RESEARCH_TEAM: 'Research team',
};

// What a role may do:
//   view             - open the dashboard, course pages, hiring partners, activity and performance report
//   edit-hr-details  - add or change a job's HR phone numbers, emails, students and notes
//   record-outcomes  - in the performance report: give an HR number or email to a student, and record how it went
//   view-ai-usage    - see how much each person uses IJF AI (admins)
// Every role may do everything for now. To restrict a role, take a permission out of its list: the
// dashboard hides what that role can't do.
export type Permission = 'view' | 'edit-hr-details' | 'record-outcomes' | 'view-ai-usage';

export const PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: ['view', 'edit-hr-details', 'record-outcomes', 'view-ai-usage'],
  ADMIN: ['view', 'edit-hr-details', 'record-outcomes', 'view-ai-usage'],
  PLACEMENT_STAFF: ['view', 'edit-hr-details', 'record-outcomes'],
  RESEARCH_TEAM: ['view', 'edit-hr-details', 'record-outcomes'],
};

// The role written in a Clerk user's public metadata, as typed there (to show it on "No access").
export function rawRole(publicMetadata: unknown): string {
  if (!publicMetadata || typeof publicMetadata !== 'object') return '';
  const value = (publicMetadata as Record<string, unknown>).role;
  return typeof value === 'string' ? value.trim() : '';
}

// The user's role, or null when it is missing or not one of ROLES. Letter case, spaces and hyphens
// are forgiven: "research_team", "Research Team" and "RESEARCH-TEAM" all mean RESEARCH_TEAM.
export function roleFrom(publicMetadata: unknown): Role | null {
  const role = rawRole(publicMetadata).toUpperCase().replace(/[\s-]+/g, '_');
  return (ROLES as readonly string[]).includes(role) ? (role as Role) : null;
}

export const can = (role: Role | null, permission: Permission) => role !== null && PERMISSIONS[role].includes(permission);
