# Развёртывание

## Дома, в локальной сети

Самый простой и самый быстрый вариант: 4K-ремукс идёт по гигабиту без единой
перекодировки, наружу ничего не торчит.

```bash
npm install && npm run build
npm start
```

Держать запущенным между перезагрузками — systemd:

```ini
# /etc/systemd/system/kinoteka.service
[Unit]
Description=Kinoteka
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=media
WorkingDirectory=/opt/kinoteka
ExecStart=/usr/bin/node server/src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now kinoteka
journalctl -u kinoteka -f
```

## Docker

```bash
docker compose up -d --build
```

`compose.yaml` монтирует вашу папку с фильмами только на чтение — контейнер не
сможет ничего испортить в библиотеке.

## Наружу, для друзей

Раздавать порт 8080 в интернет напрямую не надо: пойдёт HTTP, код доступа
уедет открытым текстом. Нужен HTTPS.

### Caddy — самый короткий путь

Сам получает и продлевает сертификат Let's Encrypt.

```caddyfile
# /etc/caddy/Caddyfile
kino.example.com {
    reverse_proxy localhost:8080 {
        flush_interval -1
    }
    request_body {
        max_size 10MB
    }
}
```

`flush_interval -1` важен: без него прокси буферизует видеопоток и перемотка
начинает тормозить.

В `.env` включите:

```ini
TRUST_PROXY=true
```

Иначе сервер не поймёт, что соединение защищено, и не поставит на cookie флаг
`Secure`.

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name kino.example.com;

    ssl_certificate     /etc/letsencrypt/live/kino.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kino.example.com/privkey.pem;

    # Фильм — это часы одного соединения.
    proxy_read_timeout 3600s;
    send_timeout       3600s;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Без этого видео буферизуется и перемотка становится вязкой.
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

### Без белого IP

Если провайдер не даёт внешний адрес — Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:8080
```

Учтите: бесплатный тариф Cloudflare не предназначен для длительного видео,
для регулярного просмотра лучше VPN до дома (WireGuard) — тогда телевизор
друга ходит в вашу сеть напрямую.

## Перед тем как открыть доступ

- [ ] `ACCESS_CODE` задан и не тривиальный
- [ ] `SESSION_SECRET` задан явно (`openssl rand -hex 32`)
- [ ] `TRUST_PROXY=true`, если стоит обратный прокси
- [ ] HTTPS работает, HTTP редиректит на него
- [ ] Папки в `MEDIA_ROOTS` смонтированы только на чтение
- [ ] Сервер запущен под непривилегированным пользователем

## Обновление

```bash
git pull
npm install
npm run build
sudo systemctl restart kinoteka
```

Индекс библиотеки и профили лежат в `DATA_DIR` (по умолчанию `./data`) и
переживают обновление. Бэкапить стоит именно эту папку — в ней история
просмотра и списки; сам индекс восстанавливается пересканированием.

## Диагностика

**Каталог пустой.** Не задан `TMDB_API_KEY`. Проверьте: `curl localhost:8080/api/health`
— поле `metadata` должно быть `true`.

**Библиотека пустая.** `npm run scan` и смотрите лог: он пишет, сколько файлов
нашёл и какие названия не сопоставились с каталогом.

**Не сопоставился фильм.** Переименуйте ближе к оригинальному названию и году:
`Название (2014).mkv`. Затем `npm run scan -- --force`.

**Видео не играет на телевизоре, а на ноутбуке играет.** Кодек. См.
[TV.md](TV.md) — там таблица совместимости и команда для перепаковки в MP4.

**Перемотка думает секундами.** Либо прокси буферизует (см. выше), либо у файла
индекс в конце — перепакуйте с `-movflags +faststart`.
