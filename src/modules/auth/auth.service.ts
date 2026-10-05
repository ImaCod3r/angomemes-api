import { UniqueConstraintError } from 'sequelize';
import { User } from '../../db/index.js';
import { AppError } from '../../errors.js';
import type { GoogleVerifier } from '../../services/google/GoogleVerifier.js';

export interface AuthService {
  loginWithGoogle(idToken: string): Promise<User>;
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

        return await User.create({
          googleSub: profile.sub,
          email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          role: isAdminEmail ? 'admin' : 'user',
        });
      } catch (err) {
        if (err instanceof UniqueConstraintError) {
          throw new AppError(409, 'EMAIL_IN_USE', 'Este email já está associado a outra conta.');
        }
        throw err;
      }
    },
  };
}
