#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  КЕНТОФОН — установка на чистый VPS (Ubuntu 24.04) одной командой
#
#  curl -fsSL https://raw.githubusercontent.com/mascarti/kentofon/main/install.sh | bash
#
#  Ставит: сайт + сервер звонков, HTTPS (Caddy, сертификат Let's Encrypt),
#  свой TURN-сервер (coturn), чтобы звонки проходили через любой мобильный интернет.
#  Повторный запуск = обновление (аккаунты и ключи сохраняются).
#
#  Свой домен вместо IP:   curl ... | DOMAIN=call.mysite.ru bash
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${REPO:-https://github.com/mascarti/kentofon.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/kentofon
ENV_FILE=/etc/kentofon.env
ARG_DOMAIN="${DOMAIN:-}"

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mОшибка: %s\033[0m\n' "$*"; exit 1; }

main() {
[ "$(id -u)" -eq 0 ] || die "запусти от root (или через sudo)"
. /etc/os-release
[ "${ID:-}" = ubuntu ] || warn "Проверено на Ubuntu 24.04, у тебя ${PRETTY_NAME:-неизвестная ОС} — пробую"

# ---------- пакеты ----------
say "Ставлю пакеты (node, caddy, coturn)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates openssl nodejs caddy coturn >/dev/null
NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
[ "$NODE_MAJOR" -ge 18 ] || die "нужен Node.js 18+, а тут $(node -v). Переустанови сервер на Ubuntu 24.04"

# ---------- IP ----------
is_private() { [[ "$1" =~ ^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.) ]]; }
LOCAL_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
PUBLIC_IP="${IP:-}"
if [ -z "$PUBLIC_IP" ]; then
  if [ -n "$LOCAL_IP" ] && ! is_private "$LOCAL_IP"; then
    PUBLIC_IP="$LOCAL_IP"
  else
    PUBLIC_IP="$(curl -4 -fsS --max-time 6 https://ipv4-internet.yandex.net/api/v0/ip 2>/dev/null | tr -d '"' || true)"
    [ -n "$PUBLIC_IP" ] || PUBLIC_IP="$(curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null || true)"
  fi
fi
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "не смог узнать внешний IP. Запусти так: curl ... | IP=1.2.3.4 bash"
say "Внешний IP: $PUBLIC_IP"

# ---------- код ----------
say "Скачиваю Кентофон"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset -q --hard FETCH_HEAD
else
  rm -rf "$APP_DIR"
  git clone -q --depth 1 -b "$BRANCH" "$REPO" "$APP_DIR"
fi
[ -f "$APP_DIR/dist/kentofon.js" ] || die "в репозитории нет dist/kentofon.js"

# ---------- настройки (ключи сохраняются между обновлениями) ----------
SECRET="" ; TURN_SECRET="" ; DOMAIN=""
if [ -f "$ENV_FILE" ]; then
  SECRET="$(sed -n 's/^SECRET=//p' "$ENV_FILE")"
  TURN_SECRET="$(sed -n 's/^TURN_SECRET=//p' "$ENV_FILE")"
  DOMAIN="$(sed -n 's/^DOMAIN=//p' "$ENV_FILE")"
fi
[ -n "$SECRET" ] || SECRET="$(openssl rand -hex 32)"
[ -n "$TURN_SECRET" ] || TURN_SECRET="$(openssl rand -hex 32)"
DOMAIN="${ARG_DOMAIN:-$DOMAIN}"

umask 077
cat > "$ENV_FILE" <<EOF
PORT=3000
HOST=127.0.0.1
DATA_DIR=/var/lib/kentofon
SECRET=$SECRET
TURN_HOST=$PUBLIC_IP
TURN_PORT=3478
TURN_SECRET=$TURN_SECRET
DOMAIN=$DOMAIN
EOF
umask 022

# ---------- сервис ----------
say "Запускаю сервер звонков"
cat > /etc/systemd/system/kentofon.service <<EOF
[Unit]
Description=Kentofon calls
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $APP_DIR/dist/kentofon.js
Restart=always
RestartSec=2
DynamicUser=yes
StateDirectory=kentofon
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q kentofon
systemctl restart kentofon

# ---------- TURN ----------
say "Настраиваю свой TURN-сервер"
EXTERNAL="$PUBLIC_IP"
if [ -n "$LOCAL_IP" ] && [ "$LOCAL_IP" != "$PUBLIC_IP" ]; then EXTERNAL="$PUBLIC_IP/$LOCAL_IP"; fi
cat > /etc/turnserver.conf <<EOF
# Кентофон — TURN
listening-port=3478
external-ip=$EXTERNAL
min-port=49152
max-port=65535
fingerprint
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=kentofon
no-cli
no-tls
no-dtls
no-tcp-relay
no-multicast-peers
user-quota=12
total-quota=120
stale-nonce=600
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.19.255.255
denied-peer-ip=240.0.0.0-255.255.255.255
syslog
simple-log
EOF
if [ -f /etc/default/coturn ]; then
  if grep -q 'TURNSERVER_ENABLED' /etc/default/coturn; then
    sed -i -E 's/^#?\s*TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
  else
    echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
  fi
fi
systemctl enable -q coturn
systemctl restart coturn

# ---------- HTTPS ----------
say "Настраиваю HTTPS"
if [ -n "$DOMAIN" ]; then
  SITE="$DOMAIN"
  cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
else
  # Сертификат прямо на IP: Let's Encrypt даёт такие только в профиле shortlived (на 6 дней,
  # Caddy продлевает сам). Нужен Caddy 2.11+, в Ubuntu он старый — качаю свежий с GitHub.
  SITE="$PUBLIC_IP"
  CADDY_VER="$(/usr/bin/caddy version 2>/dev/null | sed -E 's/^v?([0-9]+\.[0-9]+).*/\1/')"
  if [ "$(printf '%s\n2.11\n' "$CADDY_VER" | sort -V | head -1)" != "2.11" ]; then
    case "$(uname -m)" in x86_64) ARCH=amd64 ;; aarch64|arm64) ARCH=arm64 ;; *) die "неизвестная архитектура $(uname -m)" ;; esac
    TAG="$(curl -fsSL --max-time 20 https://api.github.com/repos/caddyserver/caddy/releases/latest | sed -n 's/.*"tag_name": *"\(v[^"]*\)".*/\1/p' | head -1)"
    [ -n "$TAG" ] || TAG="v2.11.4"
    TMP="$(mktemp -d)"
    curl -fsSL --max-time 120 -o "$TMP/caddy.tgz" "https://github.com/caddyserver/caddy/releases/download/$TAG/caddy_${TAG#v}_linux_$ARCH.tar.gz" \
      || die "не скачался Caddy с GitHub. Можно поставить с доменом: curl ... | DOMAIN=твой.домен bash"
    tar -xzf "$TMP/caddy.tgz" -C "$TMP" caddy
    install -m 755 "$TMP/caddy" /usr/bin/caddy
    rm -rf "$TMP"
    apt-mark hold caddy >/dev/null
    echo "Caddy обновлён до $TAG"
  fi
  cat > /etc/caddy/Caddyfile <<EOF
https://$PUBLIC_IP {
	tls {
		issuer acme {
			profile shortlived
		}
	}
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
fi
/usr/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || die "Caddyfile не прошёл проверку"
systemctl enable -q caddy
systemctl restart caddy

# ---------- файрвол (если включён) ----------
if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  say "Открываю порты в ufw"
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 3478 >/dev/null
  ufw allow 49152:65535/udp >/dev/null
fi

# ---------- проверка ----------
say "Проверяю"
for _ in $(seq 1 20); do curl -fsS --max-time 2 http://127.0.0.1:3000/healthz >/dev/null 2>&1 && break; sleep 1; done
curl -fsS --max-time 2 http://127.0.0.1:3000/healthz >/dev/null 2>&1 || die "сервер звонков не стартовал. Логи: journalctl -u kentofon -n 50"
systemctl is-active -q coturn || warn "TURN не запустился. Логи: journalctl -u coturn -n 50"

HTTPS_OK=""
for _ in $(seq 1 45); do
  if curl -fsS --max-time 4 "https://$SITE/healthz" >/dev/null 2>&1; then HTTPS_OK=1; break; fi
  sleep 2
done

echo
if [ -n "$HTTPS_OK" ]; then
  printf '\033[1;32m✅ Кентофон работает:  https://%s\033[0m\n' "$SITE"
else
  warn "Сервер запущен, но сертификат ещё не получен. Подожди пару минут и открой https://$SITE"
  warn "Если не открывается — проверь, что порты 80 и 443 открыты (файрвол в панели хостинга)."
  warn "Логи: journalctl -u caddy -n 50"
  if [ -z "$DOMAIN" ]; then
    warn "Если сертификат на IP так и не выдался — поставь через бесплатный домен:"
    warn "curl -fsSL https://raw.githubusercontent.com/mascarti/kentofon/main/install.sh | DOMAIN=${PUBLIC_IP//./-}.sslip.io bash"
  fi
fi
echo "Порты, которые должны быть открыты: 80/tcp, 443/tcp, 3478/tcp+udp, 49152-65535/udp"
echo "Обновить потом: запусти эту же команду ещё раз."
}

main "$@" </dev/null
