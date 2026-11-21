# MAXBAHIS STAFF HUB

Kurumsal personel yönetimi, hızlı üye CRM, gerçek zamanlı İşlem Chat, Discord tarzı Genel Chat, 4 kartlı Mola Yönetimi, FTD takibi ve Super Admin denetim platformu.

## Teknoloji Yığını

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+ modülleri, framework yok)
- **Backend:** Node.js + Express + `ws` (WebSocket)
- **Veritabanı:** PostgreSQL / Neon. `DATABASE_URL` zorunludur. Bağlantı yoksa sunucu başlamaz; örnek hesap veya kayıt üretilmez.

## Kurulum

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
2. `.env.example` dosyasını `.env` olarak kopyalayın ve PostgreSQL bağlantı bilginizi ekleyin:
   ```env
   DATABASE_URL=postgres://kullanici:sifre@ep-ornek.eu-central-1.aws.neon.tech/neondb?sslmode=require
   SESSION_SECRET=uzun-rastgele-gizli-anahtar
   ```
3. Boş veritabanında ilk yöneticiyi oluşturmak için `.env` dosyasında `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_PASSWORD` tanımlayın ve `npm run setup:admin` çalıştırın. Bu komut mevcut hesapların parolasını değiştirmez ve yalnızca boş kullanıcı tablosunda çalışır. Ardından kurulum parolasını `.env` dosyasından kaldırın. Hazır kullanıcı veya ortak parola bulunmaz.
4. Geliştirme sunucusunu başlatın:
   ```bash
   npm run dev
   ```
5. Testleri çalıştırın:
   ```bash
   npm test
   ```

## Veritabanı Şeması (Neon PostgreSQL)

`server/database/schema.sql` dosyası tüm tabloları (users, roles, permissions, sessions, members, member_comments, comment_templates, reminders, operations, operation_status_history, chat_channels, chat_messages, break_schedules, break_sessions, ftd_entries, announcements, announcement_acknowledgments, notifications, user_settings, audit_logs) içerir. `DATABASE_URL` tanımlandığında sunucu başlangıcında otomatik olarak uygulanır.

## Yayınlama (Deployment)

### Mevcut sınırlar

Demo verileri ve otomatik örnek hesap oluşturma kaldırılmıştır. Başlangıçta mevcut PostgreSQL kayıtları okunur. Ancak orijinal uygulamadaki birçok CRM, sohbet, FTD, mola ve ayar değişikliği hâlâ yalnızca bellekte uygulanmaktadır. Bu yazma yolları kalıcı veritabanı işlemlerine taşınıp yeniden başlatma testlerinden geçmeden uygulama gerçek iş verileri için kullanılmamalıdır. Bir PostgreSQL bağlantısının başarılı olması bu sınırı ortadan kaldırmaz.

`.env`, yerel veriler ve ekran görüntüleri repoya eklenmez. Henüz veritabanı bağlanmadıysa uygulamanın başlamaması beklenen davranıştır.

- **Build:** `npm run build` (`/dist` statik arayüzü ve `server.js` sunucusunu derler)
- **Start:** `npm start`
- **WebSocket Notu:** Vercel yalnızca serverless HTTP işlediği için kalıcı WebSocket bağlantıları için `server.ts` Node.js sunucusu (ör. Railway, Fly.io veya Render) üzerinde veya ayrı bir WebSocket servisi ile barındırılmalıdır.
