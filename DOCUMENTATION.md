# SteamMini Project Documentation

![SteamMini Logo](https://img.shields.io/badge/SteamMini-App-blue?style=for-the-badge&logo=steam)

## Оглавление
1. [Архитектура проекта](#1-архитектура-проекта)
2. [Компоненты и страницы](#2-компоненты-и-страницы)
3. [Интеграции](#3-интеграции)
4. [Статус реализации](#4-статус-реализации)
5. [Соглашения проекта](#5-соглашения-проекта)
6. [Тестирование](#6-тестирование)

---

## 1. Архитектура проекта

Приложение построено на базе **Electron + Vite** с использованием нативного **Vanilla JavaScript**. 

### 1.1 Структура папок

*   **`/electron/`** — Код главного процесса Electron (Main Process).
    *   `main.js` — Точка входа Electron. Создает окно, инициализирует IPC-обработчики.
    *   `preload.cjs` — Скрипт предзагрузки (Context Bridge). Прокидывает API (`electronAuth`) в Renderer.
    *   `auth/` — Логика авторизации через Electron (управление окнами и сессиями).
    *   `idleManager.js` — Управление процессами имитации игры (до 32 одновременно).
    *   `idleWorker.js` — Воркер-процесс для поддержания статуса "в игре".
    *   `farmStats.js` — Логика сбора и хранения статистики фарма (карточки, время).
    *   `farmSettings.js` — Управление системными настройками фарма.
    *   `notifications.js` — Система нативных уведомлений ОС.
    *   `updater.cjs` — Модуль авто-обновления через GitHub Releases.
    *   `achievementBridge.js`, `cardsBridge.js`, `recentGames.js` — Модули для работы с достижениями, карточками и списком последних игр.
*   **`/src/`** — Код клиентской части (Renderer Process).
    *   `api/` — Взаимодействие с внешними API (Steam, Auth).
    *   `components/` — Переиспользуемые UI-компоненты.
    *   `pages/` — Основные экраны приложения (Home, Login, Library, Wishlist, FarmStats, FarmSettings, CardsInventory, GameDetail).
    *   `store/` — Глобальное состояние приложения (простой Pub/Sub).
    *   `utils/` — Вспомогательные утилиты (`autoFarm.js`, `cache.js`, `storage.js`, `toast.js`).
    *   `main.js` — Точка входа Frontend-части.
*   **`/dist/`**, **`/dist_electron/`** — Скомпилированные файлы для продакшена.

### 1.2 Взаимодействие процессов (Main ↔ Renderer ↔ Preload)

Взаимодействие построено по строгой схеме изоляции контекста (`contextIsolation: true`, `nodeIntegration: false`).

*   **Renderer Process (`/src/`)** вызывает методы из `window.electronAuth`.
*   **Preload (`preload.cjs`)** использует `ipcRenderer.invoke` или `ipcRenderer.send` для отправки сообщений в Main.
*   **Main Process (`main.js`)** слушает события через `ipcMain.handle` и `ipcMain.on` и выполняет системные/браузерные задачи.

### 1.3 IPC-каналы

| Группа | Канал | Назначение |
| :--- | :--- | :--- |
| **Auth** | `auth:steam-direct`, `auth:openid` | Логин через окно Steam или системный браузер. |
| **Steam** | `steam:fetch-html`, `steam:is-installed` | Запросы к Steam Community и проверка локальных файлов. |
| **Idle** | `idle:start`, `idle:stop`, `idle:active` | Управление процессами имитации игры. |
| **Stats** | `stats:get`, `stats:record-drop` | Получение и запись статистики выпавших карточек. |
| **Settings**| `settings:get`, `settings:save` | Чтение и сохранение глобальных настроек приложения. |
| **Market** | `market:sell-item`, `market:get-price` | Интеграция с Торговой площадкой (продажа, цены). |
| **Achievements** | `achievements:load`, `achievements:unlock` | Управление достижениями (SAM-style). |
| **Updater** | `update:check`, `update:install` | Проверка и установка обновлений. |
| **FreeGames** | `freeGames:get`, `freeGames:auto-claim-epic` | Получение списка бесплатных игр и ручной/автоматический фоновый клейминг. |

---

## 2. Компоненты и страницы

### 2.1 Страницы (`/src/pages/`)

| Страница | Описание |
| :--- | :--- |
| **`library.js`** | Библиотека с фильтрами и режимом **Auto-Farm**. |
| **`gameDetail.js`** | Детальная информация об игре: достижения, карточки, управление idle. |
| **`farmStats.js`** | Визуализация статистики: количество дропов, время в пути, история. |
| **`farmSettings.js`** | Настройка поведения авто-фарма, уведомлений и интерфейса. |
| **`cardsInventory.js`**| Просмотр всех карточек пользователя с возможностью массовой продажи. |
| **`wishlist.js`** | Список желаемого с ценами и скидками. |

### 2.2 UI-Компоненты (`/src/components/`)

Используются кастомные DOM-элементы без сторонних UI-библиотек.

*   `topNav.js` — Верхняя навигация. Подписывается на `store.subscribe('currentRoute')` и `user`. Управляет вкладками платформ (Steam, Epic, GOG) и открытием попапа профиля. Отображает **farm-indicator** — динамический бейдж статуса авто-фарма (фаза, таймер, клик для перехода на Library).
*   `userPopup.js` | `dropdown.js` | `contextMenu.js` — Кастомные всплывающие меню и селекты, заменяющие нативные HTML-элементы для сохранения стилистики приложения.
*   `internalBrowser.js` — Встроенный браузер (через `<webview>`), динамически меняющий сессии (`persist:steam` vs `persist:egs`) в зависимости от открываемого домена (Epic vs Steam), позволяя сохранять авторизацию для разных платформ.
*   `titlebar.js` — Кастомный заголовок окна для Electron с кнопками управления окном (свернуть/развернуть/закрыть). Обращается к `window.electronAuth`.

### 2.3 Store (Состояние)

`store/index.js` реализует простой паттерн Pub/Sub (Publish-Subscribe).
*   **Состояния:** `user` (объект с именем/аватаром), `isAuthenticated` (boolean), `popupOpen` (boolean), `currentRoute` (string), `platform` (string), `theme` (string), `lang` (string), `auth` (токены Steam).
*   **Методы:** `get(key)`, `set(key, val)`, `subscribe(key, cb)`, `update(key, obj)`, а также методы бизнес-логики (`initAuth`, `fetchUserProfile`, `loginSteamDirect`, `loginOpenId`, `loginManual`, `logout`).

---

## 3. Интеграции

### 3.1 Market (Auto-Sell)
Приложение позволяет выставлять карточки на продажу напрямую из интерфейса.
*   **Цены**: Запрашиваются через `market:get-price` (анализ гистограммы цен).
*   **Массовая продажа**: Очередь запросов в Main Process для обхода лимитов Steam.

### 3.2 Achievements (SAM)
Позволяет просматривать, разблокировать и блокировать достижения в любой игре через `achievementBridge.js`.

### 3.3 Auto-Farm & Idle (Обновлено)
Алгоритм работает в два автоматических этапа:
1.  **🔥 Прогрев (Phase 1)**: Запуск до 32 игр одновременно для набивки 2 часов (условие дропа).
2.  **▶ Фармится (Phase 2)**: Поочередный запуск игр для фактического получения карточек.
*   **Stall detection**: Автоматический переход к следующей игре, если дропа нет более 30 минут.

### 3.4 Auto-Updater
Реализован через `electron-updater`. Проверяет наличие новых релизов на GitHub при запуске. Поддерживает фоновую загрузку и установку при перезапуске.

### 3.5 Steam API (`/src/api/steam.js`)

Все вызовы проксируются через Vite Dev Server (`/api/steam`, `/api/store`, `/api/community`) для обхода CORS.

| Endpoints | Назначение | Как обрабатываются |
| :--- | :--- | :--- |
| `/IPlayerService/GetOwnedGames/v1/` | Получение библиотеки | Возвращает массив игр. Используется в `library.js`. Сортируется по `playtime_forever`. |
| `/ISteamUser/GetPlayerSummaries/v2/` | Получение профиля | Возвращает имя, аватар и статус. При отсутствии API-ключа может откатываться на парсинг публичного XML-профиля (`/?xml=1`). |
| `/IWishlistService/GetWishlistSortedFiltered/v1/` | Получение вишлиста (Обогащенный) | В JSON-формате передаются данные. Возвращает игры со скидками, тэгами, отзывами. Используется в `wishlist.js`. |
| `/IWishlistService/GetWishlist/v1/` | Получение вишлиста (Базовый) | Запасной fallback-метод, если `GetWishlistSortedFiltered` недоступен (например, ошибка 400). |
| `/profiles/[ID]/badges/` | Получение карточек | Парсинг HTML-страницы значков для определения оставшихся карточек (`getRemainingCardDrops`). |
| `/pointssummary/ajaxgetasyncconfig` | Скрытый endpoint (через Electron) | Используется в процессе авторизации (`auth.js`) для извлечения `webapi_token` на основе файлов cookies сессии. |

### 3.6 Безопасность и Ключи

*   **WebAPI Key**: В текущей версии API-ключ захардкожен в `src/api/steam.js` (`GLOBAL_API_KEY`) для упрощения работы всех пользователей.
*   **Сессии**: Для парсинга приватных страниц (например, прогресса значков) используется `net.fetch` в Electron, который автоматически прокидывает Cookies текущей сессии Steam.

### 3.7 Epic Games / Бесплатные раздачи

Реализована полноценная интеграция с **Epic Games Store** и агрегатором раздач (GamerPower):
*   **Списки раздач**: Парсятся напрямую с `freeGamesPromotions` Epic Games и API GamerPower.
*   **Авто-сбор (Auto-Claimer)**: Работает через `egsClaimer.js`. Скрипт открывает скрытое окно `BrowserWindow`, использующее сессию `persist:egs`. 
*   **Обход защиты EGS**: Скрипт использует нативные вызовы `.click()` в комбинации с `MouseEvent` для успешного взаимодействия с React-интерфейсом окна чекаута (iframe-оплата).
*   **Кэширование**: Успешные заявки кэшируются в `claimed-games.json`, чтобы предотвратить спам-запросы при повторных запусках.

### 3.8 Хранение данных

*   **Кэш (`utils/cache.js`)**: Кэширование запросов на уровне `localStorage` с поддержкой TTL (Time To Live). Формат: `cache_${key}`. По умолчанию TTL: 1 час.
*   **Крипто-Хранилище (`utils/storage.js`)**: Обёртка над `localStorage` с использованием `CryptoJS` (алгоритм AES). Используется для хранения ключей (`steam_credentials`) и базовых настроек (`preferences`).

---

## 4. Статус реализации

| **Настройки UI и фона** | Utils | ✅ Реализовано |

---

## 5. Соглашения проекта

### 5.1 Стиль кода и нейминг

*   **Файлы**: Именование plików в формате `camelCase.js` (например, `steamLogin.js`, `topNav.js`).
*   **Модули**: Используются исключительно ES Modules (`import`/`export`).
*   **Вёрстка (CSS)**: 
    *   Стили инкапсулируются внутри JS-файлов компонентов через `document.createElement('style')`.
    *   **Дизайн-система "Инь и Ян"**: Строгое использование CSS-переменных (Tokens) из `variables.css` (`var(--color-bg-base)`, `var(--color-accent-green)`). Прямые HEX-коды запрещены.
    *   **Интерактивность**: Все кнопки и ссылки обязаны иметь состояния `:hover`, `:active` (со скейлом) и `:focus-visible`.
    *   Анимации (fade-in, transform) добавляются только ключевыми кадрами CSS.
*   **Промисы**: Используется везде синтаксис `async`/`await`. Старые цепочки опущены.

### 5.2 Архитектурные решения

1.  **Отсутствие фреймворков (No Frameworks)**: Из-за небольшого размера компонентов, разработчик выбрал Vanilla JS (через `createElement` и `.innerHTML`). Это требует ручной "сборки/разборки" компонентов, но позволяет полностью контролировать DOM без накладных расходов VDOM-фреймворков.
2.  **Замена нативных UI-контролов**: Принято решение заменять стандартные `<select>`, всплывающие окна и контекстные меню на самописные элементы (например `dropdown.js`), чтобы Windows/macOS элементы не разрушали темную дизайн-систему (Dark Mode Glassmorphism).
3.  **Безопасность токенов (CORS & AES)**: 
    *   CORS обходится не отключением webSecurity в Electron, а проксированием через встроенный сервер Vite (`vite.config.js`). 
    *   Токены в `localStorage` зашифрованы ключом с помощью AES (`CryptoJS`). Хоть это и не абсолютная защита, но предотвращает банальное копирование через F12.
4.  **Pub/Sub State Manager**: Отказ от Vuex/Redux в пользу крошечного экземпляра `Store()`. Компоненты подписываются на изменения через `store.subscribe('key', cb)`.

---

## 6. Тестирование

Проект покрыт юнит-тестами на базе **Vitest 4**. Тесты изолированы от реального Steam API и Electron — используются только моки.

### 6.1 Стек

| Пакет | Назначение |
| :--- | :--- |
| `vitest` | Тест-раннер и assertion-библиотека |
| `@vitest/ui` | Браузерный UI для просмотра тестов |
| `@vitest/coverage-v8` | Покрытие кода (провайдер V8) |
| `jsdom` | Эмуляция DOM для компонентных тестов |

### 6.2 Структура тестов

```
src/tests/
├── setup.ts                    — глобальные моки (electronAuth, localStorage, fake timers)
├── mocks/
│   ├── games.mock.js           — тестовые данные игр и карточек
│   └── badgesHtml.mock.js      — HTML-фикстуры страницы /badges/
├── unit/
│   ├── autoFarm.test.js        — 20 тестов · AutoFarm (Phase 1 & 2, state)
│   └── badgesParser.test.js    — 13 тестов · HTML-парсинг карточек
├── components/
│   └── topNav.test.js          — 10 тестов · Farm Indicator (DOM)
└── ipc/
    └── idleManager.test.js     — 10 тестов · IdleManager (node env)
```

### 6.3 Конфигурация (`vitest.config.ts`)

*   **Среда по умолчанию**: `jsdom` — для DOM-тестов компонентов.
*   **Среда IPC-тестов**: `node` — задаётся через файловый docblock `@vitest-environment node` в `idleManager.test.js`.
*   **Покрытие**: провайдер `v8`, порог 80% по строкам и функциям для ключевых модулей.
*   **Fake timers**: включены глобально в `setup.ts` через `vi.useFakeTimers()` — все таймеры в `autoFarm.js` управляются без реального ожидания.

### 6.4 Запуск тестов

| Команда | Описание |
| :--- | :--- |
| `npm test` | Одноразовый запуск всех тестов |
| `npm run test:watch` | Watch-режим (перезапуск при изменениях) |
| `npm run test:ui` | Браузерный интерфейс Vitest UI |
| `npm run test:cover` | Запуск с отчётом покрытия (HTML + text) |

### 6.5 Соглашения по тестам

*   Каждый `test()` проверяет **один сценарий** — запрещены множественные несвязанные `expect` в одном тесте.
*   `beforeEach(() => resetAutoFarm(autoFarm))` — сброс состояния синглтона перед каждым тестом.
*   Все зависимости (`store`, `steamApi`, `toast`, `electronAuth`, `child_process`) — **моки**. Реальные сетевые запросы и Steam API не используются.
*   Тесты с таймерами управляются через `vi.advanceTimersByTime()` — без `await sleep()`.
