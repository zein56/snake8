# SNAKE-8 Online

Build adımı yok. Sadece Node.js 18+ gerekir.

## Localde çalıştır
    npm install
    npm start        # http://localhost:3000
Telefondan denemek için aynı Wi-Fi'da `http://BILGISAYAR_IP:3000` aç.

## VPS (Ubuntu) kurulum
    # Node 20: https://github.com/nodesource/distributions
    unzip snake8.zip -d /var/www/snake8 && cd /var/www/snake8
    npm install --omit=dev
    npm i -g pm2 && PORT=3000 pm2 start server.js --name snake8 && pm2 save && pm2 startup

### Nginx (domain + HTTPS + WebSocket)
    server {
      server_name alanadin.com;
      location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
      }
    }
    sudo certbot --nginx -d alanadin.com     # HTTPS (wss otomatik kullanılır)

## Kontroller
Menüler ve oyun: Klavye (oklar/WASD, Enter, Esc), kol (D-pad/stick, A onay, B geri), dokunma.
Yetenek: WASD=Q, Oklar=Enter/Boşluk, IJKL=O, Kol=A tuşu, Mobil=YETENEK butonu.
Güçlendiriciler: ★ altın (+boy), S kalkan, ▲ taş (yetenekle arkana bırak), ☠ kötü (-3 kare), gri nokta = ceset yemi.

## Yapı
- `public/core.js` ortak oyun motoru (yerel + sunucu aynı kodu çalıştırır)
- `server.js` HTTP + WebSocket (oda/lobi/oyun döngüsü)
- `public/app.js` arayüz, çizim, girdi
