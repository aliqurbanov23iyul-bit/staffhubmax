# MAXBAHIS STAFF HUB

Kurumsal personel yönetimi, hızlı üye CRM, gerçek zamanlı İşlem Chat, Discord tarzı Genel Chat, 4 kartlı Mola Yönetimi, FTD takibi ve Super Admin denetim platformu.

## Teknoloji Yığını

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+ modülleri, framework yok)
- **Backend:** Node.js + Express; Vercel Function (`api/index.ts`)
- **Canlı güncelleme:** PostgreSQL revision kontrolüyle 3 saniyelik senkronizasyon; arka plandaki sekmelerde 15 saniye.
- **Veritabanı:** PostgreSQL / Neon. `DATABASE_URL` zorunludur. Bağlantı yoksa sunucu başlamaz; örnek hesap veya kayıt üretilmez.

## Kurulum

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
2. `.env.example` dosyasını `.env` olarak kopyalayın ve PostgreSQL bağlantı bilginizi ekleyin:
   ```env
   DATABASE_URL=postgres://kullanici:sifre@ep-ornek.eu-central-1.aws.neon.tech/neondb?sslmode=require
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

### Kalıcı veri ve Vercel

Demo verisi oluşturulmaz. Kullanıcılar, oturumlar, CRM, sohbet, FTD, molalar, bildirimler, ayarlar ve yetkiler PostgreSQL'de saklanır. Her API isteği güncel veriyi transaction içinde okur; değişen satırları kaydeder ve ancak COMMIT başarılı olduktan sonra yanıt verir. Hatalı isteklerde ROLLBACK uygulanır. Vercel nüsxeleri arasındaki eşzamanlı değişiklikler PostgreSQL advisory lock ile sıralanır. Bu tasarım küçük ekipler içindir; yüksek trafik için modül bazında SQL sorguları ve daha ince kilitler tercih edilmelidir.

`vercel.json`, `/api/*` isteklerini `api/index.ts` işlevine yönlendirir; arayüz `dist` üzerinden sunulur. Yalnızca `DATABASE_URL` zorunludur. İlk kurulumda Production ortamına `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_PASSWORD` eklenebilir; kullanıcı tablosu boşsa ilk yönetici oluşturulur. Mevcut hesaplara dokunulmaz. İlk giriş doğrulandıktan sonra bu üç kurulum değişkenini kaldırın. Bunları `VITE_` önekiyle tanımlamayın. Yönetici geçici parolasını Ayarlar üzerinden değiştirmelidir.

Sohbet ve bildirimler `/api/sync` üzerinden yetkili API uçlarını yeniler. Ağ kesintisi veya farklı sunucu nüsxelerine yönlendirme, oturumu veya kayıtları kaybettirmez. Mola uyarıları etkin API istekleri sırasında kontrol edilir; tüm tarayıcılar kapalıyken arka plan zamanlayıcısı çalışmaz.

`.env`, yerel veriler ve ekran görüntüleri repoya eklenmez. Henüz veritabanı bağlanmadıysa uygulamanın başlamaması beklenen davranıştır.

- **Build:** `npm run build` (`/dist` statik arayüzü ve `server.js` sunucusunu derler)
- **Start:** `npm start`
- Vercel'de ek bir WebSocket hizmeti veya API anahtarı gerekmez. Yerelde `npm run dev`, sunuculu ortamlarda `npm start` kullanılabilir.
