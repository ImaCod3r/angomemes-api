import { describe, expect, it } from 'vitest';
import type { User } from '../../src/db/index.js';
import { createUsersService } from '../../src/modules/admin/users.service.js';

const service = createUsersService({ adminEmails: ['dono@example.com'] });
const admin = { id: 'a1', role: 'admin', email: 'admin@example.com' } as User;

describe('users.service', () => {
  it('um administrador não pode mudar o próprio papel (falha antes de ir à base)', async () => {
    await expect(service.setRole(admin, 'a1', 'user')).rejects.toMatchObject({
      status: 409,
      code: 'CANNOT_CHANGE_OWN_ROLE',
    });
  });

  it('as contas de ADMIN_EMAILS ficam bloqueadas como admin, sem ligar a maiúsculas', () => {
    expect(service.isLockedAdmin({ email: 'Dono@Example.com' } as User)).toBe(true);
    expect(service.isLockedAdmin({ email: 'outro@example.com' } as User)).toBe(false);
  });
});
