export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';
export type Action = 'read' | 'create' | 'invite' | 'manageMembers' | 'deleteOrganization';

export function can(role: Role, action: Action): boolean {
  if (action === 'read') return true;
  if (action === 'deleteOrganization') return role === 'OWNER';
  if (action === 'manageMembers') return role === 'OWNER' || role === 'ADMIN';
  if (action === 'invite') return role === 'OWNER' || role === 'ADMIN';
  return true;
}

export function canAssign(actor: Role, requested: Role): boolean {
  if (requested === 'OWNER') return false;
  if (actor === 'OWNER') return true;
  return actor === 'ADMIN' && requested === 'MEMBER';
}

export function canManage(actor: Role, target: Role): boolean {
  return actor === 'OWNER' ? target !== 'OWNER' : actor === 'ADMIN' && target === 'MEMBER';
}
