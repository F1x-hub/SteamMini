import { Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Иконка уведомления — логотип приложения
const ICON = path.join(__dirname, '..', 'build', 'icon.png');

export function notifyCardDrop(gameName) {
  if (!Notification.isSupported()) return;

  new Notification({
    title: '🃏 Карточка получена',
    body: `${gameName}`,
    icon: ICON,
    silent: false,
  }).show();
}

export function notifyAllCardsReceived(gameName) {
  if (!Notification.isSupported()) return;

  new Notification({
    title: '✅ Все карточки получены',
    body: `${gameName} — все карточки собраны`,
    icon: ICON,
    silent: false,
  }).show();
}

export function notifyFarmComplete(totalDrops) {
  if (!Notification.isSupported()) return;

  new Notification({
    title: '🎉 Фарм завершён',
    body: `Получено ${totalDrops} карточек. Больше нет игр с дропами.`,
    icon: ICON,
    silent: false,
  }).show();
}
