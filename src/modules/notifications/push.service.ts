import * as webpush from 'web-push';
import { PushSubscription } from '../../db/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../logger.js';

export interface NewMemeNotification {
  title: string;
  url: string;
}

export interface PushService {
  notifyNewMeme(notification: NewMemeNotification): Promise<void>;
}

export function createPushService(): PushService {
  const enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
  if (enabled) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  } else {
    logger.warn(
      'Notificações push desativadas: configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT.',
    );
  }

  return {
    async notifyNewMeme(notification) {
      if (!enabled) return;
      const subscriptions = await PushSubscription.findAll();
      if (subscriptions.length === 0) {
        logger.warn('Nenhum dispositivo subscrito para receber a notificação de novo meme');
        return;
      }

      let sent = 0;
      let failed = 0;
      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify({
                title: 'Novo meme no Angomemes',
                body: notification.title,
                url: notification.url,
              }),
            );
            sent += 1;
          } catch (error: unknown) {
            failed += 1;
            const statusCode =
              typeof error === 'object' && error !== null && 'statusCode' in error
                ? error.statusCode
                : undefined;
            if (statusCode === 404 || statusCode === 410) {
              await subscription.destroy();
              return;
            }
            logger.warn({ err: error }, 'Falha ao enviar notificação push');
          }
        }),
      );
      logger.info({ sent, failed, total: subscriptions.length }, 'Notificações de novo meme processadas');
    },
  };
}
