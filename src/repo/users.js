import { getPool } from "../config/db.js";

export async function upsertOtpByPhone(phone, code, expiresAt) {
  const p = getPool();
  await p.query(
    `INSERT INTO admin_users (phone, otp_code, otp_expires_at, otp_sent_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (phone)
     DO UPDATE SET otp_code = EXCLUDED.otp_code, otp_expires_at = EXCLUDED.otp_expires_at, otp_sent_at = NOW(), updated_at = NOW()`,
    [phone, code, expiresAt]
  );
}

export async function findByPhone(phone) {
  const p = getPool();
  const { rows } = await p.query(`SELECT * FROM admin_users WHERE phone = $1 LIMIT 1`, [phone]);
  return rows[0] || null;
}

export async function clearOtp(userId) {
  const p = getPool();
  await p.query(`UPDATE admin_users SET otp_code = NULL, otp_expires_at = NULL, updated_at = NOW() WHERE id = $1`, [userId]);
}

export async function createWithEmailPassword(email, passwordHash) {
  const p = getPool();
  const { rows } = await p.query(
    `INSERT INTO admin_users (email, password)
     VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [email.toLowerCase(), passwordHash]
  );
  return rows[0] || null;
}

export async function findByEmail(email) {
  const p = getPool();
  const { rows } = await p.query(`SELECT * FROM admin_users WHERE email = $1 LIMIT 1`, [email.toLowerCase()]);
  return rows[0] || null;
}

export async function setProfile(userId, username, name) {
  const p = getPool();
  await p.query(`UPDATE admin_users SET username = $2, name = $3, updated_at = NOW() WHERE id = $1`, [userId, username.toLowerCase(), name]);
}

export async function findById(id) {
  const p = getPool();
  const { rows } = await p.query(`SELECT id, email, phone, username, name FROM admin_users WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function usernameAvailable(username) {
  const p = getPool();
  const { rows } = await p.query(`SELECT 1 FROM admin_users WHERE username = $1 LIMIT 1`, [username.toLowerCase()]);
  return rows.length === 0;
}

export async function findByUsername(username) {
  const p = getPool();
  const { rows } = await p.query(`SELECT id, username, name FROM admin_users WHERE username = $1 LIMIT 1`, [
    username.toLowerCase(),
  ]);
  return rows[0] || null;
}


