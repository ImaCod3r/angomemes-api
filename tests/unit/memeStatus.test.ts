import { describe, expect, it } from 'vitest';
import { MEME_STATUSES } from '../../src/db/models/Meme.js';
import { AppError } from '../../src/errors.js';
import { assertTransition, canTransition, visibilityOf } from '../../src/modules/memes/memeStatus.js';

describe('máquina de estados do meme', () => {
  const allowed = new Set(['pending>published', 'pending>rejected', 'published>removed']);

  it('só aceita pending → published | rejected e published → removed', () => {
    for (const from of MEME_STATUSES) {
      for (const to of MEME_STATUSES) {
        expect(canTransition(from, to), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });

  it('transição inválida dá 409', () => {
    expect(() => assertTransition('rejected', 'published')).toThrow(AppError);
    try {
      assertTransition('removed', 'published');
    } catch (err) {
      expect(err).toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
    }
  });

  it('só os publicados ficam públicos', () => {
    expect(visibilityOf('published')).toBe('public');
    expect(visibilityOf('pending')).toBe('private');
    expect(visibilityOf('removed')).toBe('private');
    expect(visibilityOf('rejected')).toBeNull();
  });
});
