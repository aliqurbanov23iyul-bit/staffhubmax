import 'dotenv/config';
import crypto from 'node:crypto';
import { hashPassword, validatePasswordStrength } from '../core/password';
import { store } from './store';

async function main() {
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
  const displayName = process.env.INITIAL_ADMIN_NAME?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username || !displayName || !password) {
    throw new Error('INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_NAME ve INITIAL_ADMIN_PASSWORD ortam değişkenlerini tanımlayın.');
  }
  const check = validatePasswordStrength(password);
  if (!check.valid) throw new Error(check.message);
  await store.init();
  const client = await store.pool!.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const existing = await client.query('SELECT 1 FROM users LIMIT 1');
    if (existing.rowCount) throw new Error('Hesaplar zaten mevcut. İlk yönetici kurulumu yalnızca boş veritabanında çalışır.');
    await client.query(
      `INSERT INTO users (id, username, display_name, role, team, password_hash, is_active, must_change_password)
       VALUES ($1,$2,$3,'Super Admin','Yönetim',$4,TRUE,FALSE)`,
      [`usr_${crypto.randomUUID()}`, username, displayName, hashPassword(password)],
    );
    await client.query(
      `INSERT INTO chat_channels (id, slug, name, description, is_private)
       VALUES ('channel_general','genel','Genel','Ekip iletişim kanalı',FALSE) ON CONFLICT DO NOTHING`,
    );
    await client.query('COMMIT');
    console.log('İlk yönetici oluşturuldu. Kurulum şifresini ortam değişkenlerinden kaldırın.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Kurulum başarısız.');
  process.exitCode = 1;
}).finally(async () => { await store.pool?.end(); });
