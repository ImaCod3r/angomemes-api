import type { User } from '../../db/index.js';

export function toUserDto(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}
