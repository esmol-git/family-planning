#!/usr/bin/env bash
# Стабильность family-calendar на VPS. Запуск: bash /root/harden-family-calendar.sh
set -euo pipefail

echo "==> Certbot auto-renew"
systemctl enable --now certbot.timer
systemctl status certbot.timer --no-pager | head -12
# nginx reload после успешного renew
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/bash
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
certbot renew --dry-run

echo "==> PM2 startup on boot"
npm i -g pm2 >/dev/null 2>&1 || true
cd /opt/family-calendar/apps/api
pm2 describe family-api >/dev/null 2>&1 || pm2 start dist/main.js --name family-api
pm2 save
env PATH=$PATH:/usr/local/bin pm2 startup systemd -u root --hp /root | tail -5
# выполнить напечатанную команду pm2 startup, если ещё не активна:
if ! systemctl is-enabled pm2-root.service >/dev/null 2>&1; then
  pm2 startup systemd -u root --hp /root -s || true
  systemctl enable pm2-root.service 2>/dev/null || true
fi
systemctl enable pm2-root.service 2>/dev/null || true
pm2 save

echo "==> Nginx & Postgres on boot"
systemctl enable --now nginx
systemctl enable --now postgresql

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

echo "==> Daily Postgres backup (03:15)"
mkdir -p /var/backups/family-calendar
cat > /usr/local/bin/backup-family-pg.sh <<'EOF'
#!/bin/bash
set -euo pipefail
# читаем DATABASE_URL из api .env
ENV_FILE=/opt/family-calendar/apps/api/.env
# shellcheck disable=SC1090
set -a
# достаём только DATABASE_URL
DBURL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
set +a
STAMP=$(date +%F)
OUT="/var/backups/family-calendar/family-$STAMP.sql.gz"
export PGPASSWORD
# pg_dump через URL
pg_dump "$DBURL" | gzip -c > "$OUT"
# хранить 14 дней
find /var/backups/family-calendar -name 'family-*.sql.gz' -mtime +14 -delete
echo "backup ok $OUT"
EOF
chmod +x /usr/local/bin/backup-family-pg.sh

cat > /etc/cron.d/family-calendar-backup <<'EOF'
15 3 * * * root /usr/local/bin/backup-family-pg.sh >> /var/log/family-pg-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/family-calendar-backup
# пробный бэкап
/usr/local/bin/backup-family-pg.sh || echo "WARN: backup failed — проверьте DATABASE_URL"

echo "==> Logrotate pm2 / nginx already default"
cat > /etc/logrotate.d/family-calendar <<'EOF'
/var/log/family-pg-backup.log {
  weekly
  rotate 8
  missingok
  notifempty
  compress
}
EOF

echo "==> Unattended security upgrades"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y unattended-upgrades >/dev/null 2>&1 || true
dpkg-reconfigure -f noninteractive unattended-upgrades 2>/dev/null || true

echo "==> Sanity"
systemctl is-active nginx
systemctl is-active postgresql
pm2 status
curl -sI https://family-calendar.esmolakov.ru | head -5
ls -la /var/backups/family-calendar/ | tail -5
echo "DONE"
