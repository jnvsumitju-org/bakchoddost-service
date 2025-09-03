import { getPool } from "../config/db.js";

export async function samplePoems(limit) {
  const p = getPool();
  const { rows } = await p.query(
    `SELECT id, text, instructions, usage_count, owner_id
     FROM poem_templates
     ORDER BY random()
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function browsePoems({ q, page, limit }) {
  const p = getPool();
  const offset = (page - 1) * limit;
  let where = "";
  let params = [];
  if (q && q.trim()) {
    where = "WHERE to_tsvector('english', text) @@ plainto_tsquery('english', $1)";
    params.push(q.trim());
  }
  const countSql = `SELECT COUNT(*)::int AS c FROM poem_templates ${where}`;
  const { rows: countRows } = await p.query(countSql, params);
  const total = countRows[0]?.c || 0;

  const listSql = `
    SELECT id, text, instructions, usage_count, owner_id
    FROM poem_templates
    ${where}
    ORDER BY created_at DESC
    OFFSET $${params.length + 1} LIMIT $${params.length + 2}
  `;
  const { rows } = await p.query(listSql, [...params, offset, limit]);
  return { rows, total };
}

export async function incUsage(id) {
  const p = getPool();
  await p.query(`UPDATE poem_templates SET usage_count = usage_count + 1 WHERE id = $1`, [id]);
}

export async function listByOwner(ownerId) {
  const p = getPool();
  const { rows } = await p.query(`SELECT id, text, instructions FROM poem_templates WHERE owner_id = $1 ORDER BY created_at DESC`, [ownerId]);
  return rows;
}

export async function findByIdForOwner(id, ownerId) {
  const p = getPool();
  const { rows } = await p.query(`SELECT id, text, instructions FROM poem_templates WHERE id = $1 AND owner_id = $2 LIMIT 1`, [id, ownerId]);
  return rows[0] || null;
}

export async function createPoem(ownerId, data) {
  const p = getPool();
  const { rows } = await p.query(
    `INSERT INTO poem_templates (text, instructions, owner_id, max_friend_required)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [data.text, data.instructions || null, ownerId, inferMaxFriend(data.text)]
  );
  return rows[0];
}

export async function updatePoem(id, ownerId, data) {
  const p = getPool();
  const { rowCount } = await p.query(
    `UPDATE poem_templates SET text = $3, instructions = $4, max_friend_required = $5, updated_at = NOW() WHERE id = $1 AND owner_id = $2`,
    [id, ownerId, data.text, data.instructions || null, inferMaxFriend(data.text)]
  );
  return rowCount > 0;
}

export async function deletePoem(id, ownerId) {
  const p = getPool();
  const { rowCount } = await p.query(`DELETE FROM poem_templates WHERE id = $1 AND owner_id = $2`, [id, ownerId]);
  return rowCount > 0;
}

export async function countFittingTemplates(friendCount) {
  const p = getPool();
  const { rows } = await p.query(`SELECT COUNT(*)::int AS c FROM poem_templates WHERE max_friend_required = $1`, [friendCount]);
  return rows[0]?.c || 0;
}

export async function getFitStats() {
  const p = getPool();
  const { rows } = await p.query(`SELECT max_friend_required AS friends, COUNT(*)::int AS count FROM poem_templates GROUP BY max_friend_required ORDER BY max_friend_required ASC`);
  return rows;
}

function inferMaxFriend(text) {
  const re = /\{\{\s*friendName(\d+)\s*\}\}/g;
  let m;
  let max = 0;
  while ((m = re.exec(text)) !== null) {
    const idx = parseInt(m[1], 10);
    if (!Number.isNaN(idx) && idx > max) max = idx;
  }
  return max;
}


