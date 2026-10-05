import type { MemeStatus } from '../../db/models/Meme.js';
import { AppError } from '../../errors.js';
import type { Visibility } from '../../services/storage/StorageService.js';

/** pending → published | rejected; published → removed. Qualquer outra transição é recusada. */
const TRANSITIONS: Record<MemeStatus, readonly MemeStatus[]> = {
  pending: ['published', 'rejected'],
  published: ['removed'],
  rejected: [],
  removed: [],
};

export function canTransition(from: MemeStatus, to: MemeStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: MemeStatus, to: MemeStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(409, 'INVALID_TRANSITION', `Não é possível passar um meme de "${from}" para "${to}".`);
  }
}

/** Onde está o ficheiro em cada estado; os rejeitados já não têm ficheiro. */
export function visibilityOf(status: MemeStatus): Visibility | null {
  switch (status) {
    case 'published':
      return 'public';
    case 'pending':
    case 'removed':
      return 'private';
    case 'rejected':
      return null;
  }
}
