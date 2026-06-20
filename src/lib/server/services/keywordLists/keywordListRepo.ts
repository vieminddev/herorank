/**
 * Keyword-list repository — D1 data access for the `keyword_lists` / `keyword_list_items` tables.
 *
 * Factory + interfaces (same shape convention as `subscriptionRepo.ts`). Consumed by the
 * `/collections` router (`routes/collections.ts`). Every list/item read or write is owner-scoped
 * by `user_id`; item mutations first verify ownership of the parent list via `ownsList`.
 * Timestamps are unix SECONDS (`Math.floor(Date.now() / 1000)`).
 *
 * Parameterized queries throughout. Item upserts dedup on `(list_id, keyword)`
 * (`ON CONFLICT … DO NOTHING`) and report how many rows were actually inserted.
 */
import type { D1Database } from '@cloudflare/workers-types';

/** A keyword list (the list-level row), optionally with a derived item count. */
export interface KeywordList {
  id: number;
  name: string;
  created_at: number;
  item_count: number;
}

/** A single keyword stored inside a list. */
export interface KeywordListItem {
  id: number;
  keyword: string;
  demand_score: number | null;
  result_count: number | null;
  competition: 'low' | 'medium' | 'high' | null;
  added_at: number;
}

/** A list together with its items (returned by `getList`). */
export interface KeywordListWithItems {
  id: number;
  name: string;
  created_at: number;
  item_count: number;
  items: KeywordListItem[];
}

/** Input shape for a keyword being added to a list. */
export interface KeywordListItemInput {
  keyword: string;
  demandScore?: number | null;
  resultCount?: number | null;
  competition?: 'low' | 'medium' | 'high' | null;
}

/** The data-access contract consumed by the `/collections` router. */
export interface KeywordListRepo {
  listLists(userId: string): Promise<KeywordList[]>;
  createList(userId: string, name: string): Promise<KeywordList>;
  renameList(userId: string, listId: number, name: string): Promise<boolean>;
  deleteList(userId: string, listId: number): Promise<boolean>;
  getList(userId: string, listId: number): Promise<KeywordListWithItems | null>;
  /** Returns the number of rows inserted, or `null` if the list is not owned by the user. */
  addItems(userId: string, listId: number, items: KeywordListItemInput[]): Promise<number | null>;
  removeItem(userId: string, listId: number, itemId: number): Promise<boolean>;
}

/**
 * D1-backed keyword-list repo.
 */
export function createKeywordListRepo(db: D1Database): KeywordListRepo {
  async function ownsList(userId: string, listId: number): Promise<boolean> {
    const row = await db
      .prepare('SELECT 1 AS hit FROM keyword_lists WHERE id = ? AND user_id = ? LIMIT 1')
      .bind(listId, userId)
      .first();
    return row !== null;
  }

  return {
    async listLists(userId) {
      const { results } = await db
        .prepare(
          `SELECT l.id, l.name, l.created_at,
                  (SELECT COUNT(*) FROM keyword_list_items i WHERE i.list_id = l.id) AS item_count
           FROM keyword_lists l
           WHERE l.user_id = ?
           ORDER BY l.created_at DESC`
        )
        .bind(userId)
        .all<KeywordList>();
      return results;
    },

    async createList(userId, name) {
      const res = await db
        .prepare('INSERT INTO keyword_lists (user_id, name, created_at) VALUES (?, ?, ?)')
        .bind(userId, name, Math.floor(Date.now() / 1000))
        .run();
      const id = Number(res.meta.last_row_id);
      return { id, name, created_at: Math.floor(Date.now() / 1000), item_count: 0 };
    },

    async renameList(userId, listId, name) {
      const res = await db
        .prepare('UPDATE keyword_lists SET name = ? WHERE id = ? AND user_id = ?')
        .bind(name, listId, userId)
        .run();
      return res.meta.changes > 0;
    },

    async deleteList(userId, listId) {
      const res = await db
        .prepare('DELETE FROM keyword_lists WHERE id = ? AND user_id = ?')
        .bind(listId, userId)
        .run();
      return res.meta.changes > 0;
    },

    async getList(userId, listId) {
      const list = await db
        .prepare('SELECT id, name, created_at FROM keyword_lists WHERE id = ? AND user_id = ?')
        .bind(listId, userId)
        .first<{ id: number; name: string; created_at: number }>();
      if (!list) return null;
      const { results } = await db
        .prepare(
          'SELECT id, keyword, demand_score, result_count, competition, added_at FROM keyword_list_items WHERE list_id = ? ORDER BY added_at DESC'
        )
        .bind(listId)
        .all<KeywordListItem>();
      return { ...list, item_count: results.length, items: results };
    },

    async addItems(userId, listId, items) {
      if (!(await ownsList(userId, listId))) return null;
      if (!items.length) return 0;
      const now = Math.floor(Date.now() / 1000);
      const stmts = items.map((it) =>
        db
          .prepare(
            `INSERT INTO keyword_list_items (list_id, keyword, demand_score, result_count, competition, added_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (list_id, keyword) DO NOTHING`
          )
          .bind(listId, it.keyword, it.demandScore ?? null, it.resultCount ?? null, it.competition ?? null, now)
      );
      const results = await db.batch(stmts);
      return results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
    },

    async removeItem(userId, listId, itemId) {
      if (!(await ownsList(userId, listId))) return false;
      const res = await db
        .prepare('DELETE FROM keyword_list_items WHERE id = ? AND list_id = ?')
        .bind(itemId, listId)
        .run();
      return res.meta.changes > 0;
    },
  };
}
