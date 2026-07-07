# OpenRouter via FOXDPI VPN

Маршрутизация запросов к `openrouter.ai` с prod VPS через FOXDPI (WireGuard).

## ⚠️ Если VPS (217.12.37.32) не пингуется / zovus.ru лежит

После эксперимента с Amnezia (`awg0`) сеть VPS могла отвалиться. **Зайди в консоль хостинга (VNC/serial)** и выполни:

```bash
bash /tmp/openrouter-vpn/emergency-recover-console.sh
```

Или вручную:

```bash
systemctl disable --now awg-quick@awg0 openrouter-vpn-routes.timer
awg-quick down awg0; ip link del awg0
rm -f /etc/amnezia/amneziawg/awg0.conf
systemctl restart aura-ai
```

Скрипты лежат в репозитории: `scripts/openrouter-vpn/`

## Откат на VPS (aura-ai)

```bash
sudo bash /usr/local/sbin/rollback-openrouter-vpn.sh
```

Снимок состояния до установки: `/var/lib/aura-ai/rollback/openrouter-vpn-latest/`

## Откат peer на FOXDPI

```bash
# на FOXDPI (91.184.240.82), pubkey aura-ai peer:
sudo bash rollback-foxdpi-peer.sh 4StafijHZOL6smIjCSnBPHOYAMxv3lNGpR1d0KORZ38=
```

(уже выполнено при откате awg-эксперимента)

## Установка (Latvia proxy — основной путь)

На **Latvia VPS** (`45.156.20.127`, Beget `intrepid-margarita-2`):

```bash
sudo bash install-lv-proxy.sh
```

На **Zovus VPS** в `/opt/aura-ai/.env.local`:

```bash
OPENROUTER_HTTPS_PROXY=http://45.156.20.127:3128
```

Приложение ходит в OpenRouter через Latvia proxy (`src/lib/openrouter-fetch.ts`).  
При ошибке proxy — fallback на **wg-foxdpi** (split-route, дом).

## Установка wg0 (fallback / дом)

```bash
export FOXDPI_SSH_PASS='...'   # пароль root FOXDPI
sudo bash install-openrouter-vpn-wg0.sh
```

## Проверка

```bash
curl -sI https://openrouter.ai/api/v1/models | head -3
wg show wg-foxdpi
ip route | grep wg-foxdpi
```

