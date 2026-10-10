import { Op, UniqueConstraintError } from 'sequelize';
import { User } from '../../db/index.js';
import { AppError } from '../../errors.js';
import type { GoogleVerifier } from '../../services/google/GoogleVerifier.js';
import { pickFreeSlug } from '../memes/slug.js';
import { usernameBase } from '../users/username.js';

export interface AuthService {
  loginWithGoogle(idToken: string): Promise<User>;
}

/** Tentativas quando duas contas novas com o mesmo nome escolhem o mesmo username ao mesmo tempo. */
const USERNAME_ATTEMPTS = 3;

/** Primeiro username livre para o nome: a base, ou a base com "-2", "-3"… */
async function freeUsernameFor(name: string): Promise<string> {
  const base = usernameBase(name);
  // A base só tem [a-z0-9-], por isso não há % nem _ a escapar no LIKE.
  const rows = await User.findAll({
    attributes: ['username'],
    where: { [Op.or]: [{ username: base }, { username: { [Op.like]: `${base}-%` } }] },
  });
  return pickFreeSlug(base, rows.map((row) => row.username));
}

function isUsernameConflict(err: unknown): boolean {
  return err instanceof UniqueConstraintError && Object.keys(err.fields ?? {}).includes('username');
}

export function createAuthService(deps: {
  googleVerifier: GoogleVerifier;
  adminEmails: string[];
}): AuthService {
  return {
    async loginWithGoogle(idToken) {
      const profile = await deps.googleVerifier.verify(idToken);
      if (!profile) {
        throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Token do Google inválido.');
      }

      const email = profile.email.toLowerCase();
      // ADMIN_EMAILS só promove: um admin definido diretamente na base não é despromovido no login.
      const isAdminEmail = deps.adminEmails.includes(email);

      try {
        const existing = await User.findOne({ where: { googleSub: profile.sub } });
        if (existing) {
          existing.set({ email, name: profile.name, avatarUrl: profile.avatarUrl });
          if (isAdminEmail) existing.role = 'admin';
          return await existing.save();
        }

        // O username fica fixo: mudar o nome no Google não parte os links do perfil.
        for (let attempt = 1; ; attempt++) {
          try {
            return await User.create({
              googleSub: profile.sub,
              email,
              name: profile.name,
              username: await freeUsernameFor(profile.name),
              avatarUrl: profile.avatarUrl,
              role: isAdminEmail ? 'admin' : 'user',
            });
          } catch (err) {
            if (!isUsernameConflict(err) || attempt >= USERNAME_ATTEMPTS) throw err;
          }
        }
      } catch (err) {
        if (err instanceof UniqueConstraintError) {
          throw new AppError(409, 'EMAIL_IN_USE', 'Este email já está associado a outra conta.');
        }
        throw err;
      }
    },
  };
}
