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
    `INSERT INTO poem_templates (text, instructions, owner_id)
     VALUES ($1, $2, $3) RETURNING id`,
    [data.text, data.instructions || null, ownerId]
  );
  return rows[0];
}

export async function updatePoem(id, ownerId, data) {
  const p = getPool();
  const { rowCount } = await p.query(
    `UPDATE poem_templates SET text = $3, instructions = $4, updated_at = NOW() WHERE id = $1 AND owner_id = $2`,
    [id, ownerId, data.text, data.instructions || null]
  );
  return rowCount > 0;
}

export async function deletePoem(id, ownerId) {
  const p = getPool();
  const { rowCount } = await p.query(`DELETE FROM poem_templates WHERE id = $1 AND owner_id = $2`, [id, ownerId]);
  return rowCount > 0;
}


