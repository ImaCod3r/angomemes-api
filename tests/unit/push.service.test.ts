import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    VAPID_PUBLIC_KEY: 'public-key',
    VAPID_PRIVATE_KEY: 'private-key',
    VAPID_SUBJECT: 'https://angomemes.site',
  },
}));
vi.mock('../../src/db/index.js', () => ({
  PushSubscription: { findAll: mocks.findAll },
}));
vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock('web-push', () => ({
  sendNotification: mocks.sendNotification,
  setVapidDetails: mocks.setVapidDetails,
}));

import { createPushService } from '../../src/modules/notifications/push.service.js';

describe('push service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAll.mockResolvedValue([
      { endpoint: 'https://push.example.test/device-1', p256dh: 'key-1', auth: 'auth-1' },
      { endpoint: 'https://push.example.test/device-2', p256dh: 'key-2', auth: 'auth-2' },
    ]);
    mocks.sendNotification.mockResolvedValue(undefined);
  });

  it('envia para todos os dispositivos, sem excluir o autor do meme', async () => {
    const service = createPushService();

    await service.notifyNewMeme({ title: 'Meme novo', url: '/memes/meme-novo' });

    expect(mocks.findAll).toHaveBeenCalledOnce();
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example.test/device-1',
        keys: { p256dh: 'key-1', auth: 'auth-1' },
      },
      expect.any(String),
    );
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example.test/device-2',
        keys: { p256dh: 'key-2', auth: 'auth-2' },
      },
      expect.any(String),
    );
  });
});
