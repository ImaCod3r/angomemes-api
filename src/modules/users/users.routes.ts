import { Router } from 'express';
import { userNotFound, type ProfilesService } from './profiles.service.js';
import { USERNAME_MAX, USERNAME_PATTERN } from './username.js';

/** Um username com formato impossível nunca existe: 404 sem ir à base. */
function parseUsername(username: unknown): string {
  if (typeof username !== 'string' || username.length > USERNAME_MAX || !USERNAME_PATTERN.test(username)) {
    throw userNotFound();
  }
  return username;
}

export function createUsersRouter(deps: { profilesService: ProfilesService }) {
  const router = Router();

  // Perfil público: os memes publicados da conta vêm de GET /memes?uploader=<username>.
  router.get('/:username', async (req, res) => {
    const user = await deps.profilesService.getByUsername(parseUsername(req.params.username));
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      user: {
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
        verified: user.role === 'admin',
        memesCount: Object.values(user.memesByType).reduce((sum, n) => sum + n, 0),
        memesByType: user.memesByType,
        joinedAt: user.createdAt,
      },
    });
  });

  return router;
}
