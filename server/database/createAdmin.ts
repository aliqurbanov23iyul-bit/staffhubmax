import 'dotenv/config';
import { store } from './store';
import { validatePasswordStrength } from '../core/password';

async function main() {
  if (!process.env.INITIAL_ADMIN_USERNAME?.trim() || !process.env.INITIAL_ADMIN_NAME?.trim() || !process.env.INITIAL_ADMIN_PASSWORD) {
    throw new Error('INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_NAME ve INITIAL_ADMIN_PASSWORD değişkenlerini tanımlayın.');
  }
  const check = validatePasswordStrength(process.env.INITIAL_ADMIN_PASSWORD);
  if (!check.valid) throw new Error(check.message);
  await store.init();
  console.log('Yönetici kurulumu kontrol edildi. Mevcut hesaplar değiştirilmez. Kurulum parolasını ortam değişkenlerinden kaldırın.');
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Kurulum başarısız.'); process.exitCode = 1; }).finally(async () => { await store.pool?.end(); });