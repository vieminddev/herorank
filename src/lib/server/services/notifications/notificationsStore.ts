/**
 * Notifications data access — D1 store for the `notifications` table.
 *
 * Thin DI-friendly wrapper over the D1 binding (parameterized queries only, no string
 * interpolation of user input). Built from `getDb(c)` in routes; could be built request-less
 * from `env.DB` in cron/queue contexts too — the same D1Database either way.
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string | null;
  ref: string | null;
  read_at: number | null;
  created_at: number;
}

export interface InsertNotification {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  ref?: string | null;
  /** Epoch milliseconds; defaults to `Date.now()`. Stored as epoch seconds. */
  now?: number;
}

export interface NotificationsStore {
  /** Append a notification for a user. `created_at` = epoch seconds (now or supplied). */
  insert(input: InsertNotification): Promise<void>;
  /** This user's notifications, newest-first, capped to `limit` (default 30). */
  listForUser(userId: string, limit?: number): Promise<NotificationRow[]>;
  /** Count this user's unread (read_at IS NULL) notifications. */
  unreadCount(userId: string): Promise<number>;
  /** Mark a single notification read (owner-scoped, only if currently unread). */
  markRead(userId: string, id: number): Promise<void>;
  /** Mark all of this user's unread notifications read. */
  markAllRead(userId: string): Promise<void>;
}

export function createNotificationsStore(db: D1Database): NotificationsStore {
  return {
    async insert({ userId, type, title, body, ref, now }) {
      await db
        .prepare(
          'INSERT INTO notifications (user_id, type, title, body, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(userId, type, title, body ?? null, ref ?? null, Math.floor((now ?? Date.now()) / 1000))
        .run();
    },

    async listForUser(userId, limit = 30) {
      const { results } = await db
        .prepare(
          'SELECT id, type, title, body, ref, read_at, created_at FROM notifications ' +
            'WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
        )
        .bind(userId, limit)
        .all<NotificationRow>();
      return results;
    },

    async unreadCount(userId) {
      const row = await db
        .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
        .bind(userId)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    async markRead(userId, id) {
      await db
        .prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL')
        .bind(Math.floor(Date.now() / 1000), id, userId)
        .run();
    },

    async markAllRead(userId) {
      await db
        .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
        .bind(Math.floor(Date.now() / 1000), userId)
        .run();
    },
  };
}
