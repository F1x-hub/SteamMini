const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAuth', {
  appReady: () => ipcRenderer.send('app:ready'),
  /**
   * Direct Steam login — opens BrowserWindow with Steam login page
   * @returns {Promise<{steamId: string, webApiToken: string, mode: string}>}
   */
  steamDirectLogin: () => ipcRenderer.invoke('auth:steam-direct'),

  /**
   * Steam OpenID — opens system browser for Steam OpenID authentication
   * @returns {Promise<{steamId: string, webApiToken: string, mode: string}>}
   */
  openIdLogin: () => ipcRenderer.invoke('auth:openid'),

  /**
   * Listen for auth result events from main process
   * @param {Function} callback 
   */
  onAuthResult: (callback) => {
    ipcRenderer.on('auth:result', (_event, data) => callback(data));
  },

  // Steam Community Parsing
  fetchSteamHtml: (url) => ipcRenderer.invoke('steam:fetch-html', url),
  steamIsInstalled: (appId) => ipcRenderer.invoke('steam:is-installed', appId),
  setRunningGame: (data) => ipcRenderer.invoke('steam:set-running-game', data),
  getRunningGame: () => ipcRenderer.invoke('steam:get-running-game'),
  killGame: (appId) => ipcRenderer.invoke('steam:kill-game', appId),
  steamGetAllInstalled: () => ipcRenderer.invoke('steam:get-all-installed'),
  getRecentGames: () => ipcRenderer.invoke('get-recent-games'),
  steamGetCoverUrl: (appId) => ipcRenderer.invoke('steam:get-cover-url', appId),
  onRecentGamesUpdated: (callback) => ipcRenderer.on('recent-games-updated', () => callback()),

  // Idler controls
  idleStart: (appId) => ipcRenderer.invoke('idle:start', appId),
  idleStop: (appId) => ipcRenderer.invoke('idle:stop', appId),
  idleStopAll: () => ipcRenderer.invoke('idle:stop-all'),
  getIdleActive: () => ipcRenderer.invoke('idle:active'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // Achievements
  achievementsLoad: (appId) => ipcRenderer.invoke('achievements:load', appId),
  achievementsUnlock: (appId, achievementId) => ipcRenderer.invoke('achievements:unlock', { appId, achievementId }),
  achievementsLock: (appId, achievementId) => ipcRenderer.invoke('achievements:lock', { appId, achievementId }),
  achievementsUnlockAll: (appId) => ipcRenderer.invoke('achievements:unlock-all', appId),
  achievementsClose: () => ipcRenderer.invoke('achievements:close'),

  // Cards
  getGameCards: (appId) => ipcRenderer.invoke('game:get-cards', appId),
  cardsGetAll: (steamId) => ipcRenderer.invoke('cards:get-all', steamId),
  cardsGetForApp: (appId, steamId) => ipcRenderer.invoke('cards:get-for-app', { appId, steamId }),
  cardsDebug: () => ipcRenderer.invoke('cards:debug'),
  cardsDebugElectronCookies: () => ipcRenderer.invoke('cards:debug-electron-cookies'),
  cardsDebugAllSessions: () => ipcRenderer.invoke('cards:debug-all-sessions'),

  // Farm Stats, Notification & Settings
  statsGet: () => ipcRenderer.invoke('stats:get'),
  statsRecordDrop: (appId, gameName) => ipcRenderer.invoke('stats:record-drop', appId, gameName),
  statsEndSession: () => ipcRenderer.invoke('stats:end-session'),

  notifyCardDrop: (gameName) => ipcRenderer.invoke('notify:card-drop', gameName),
  notifyAllReceived: (gameName) => ipcRenderer.invoke('notify:all-received', gameName),
  notifyFarmComplete: (totalDrops) => ipcRenderer.invoke('notify:farm-complete', totalDrops),

  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSave: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Inventory
  inventoryGetCards: (steamId, forceRefresh) => ipcRenderer.invoke('inventory:get-cards', steamId, forceRefresh),
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Free Games
  freeGamesGet:         ()       => ipcRenderer.invoke('free-games:get'),
  freeGamesGetSettings:  ()         => ipcRenderer.invoke('free-games:get-settings'),
  freeGamesSaveSettings: (settings) => ipcRenderer.invoke('free-games:save-settings', settings),
  steamClaimFreeGame:   (params) => ipcRenderer.invoke('steam:claim-free-game', params),

  egsLogin:         () => ipcRenderer.invoke('egs:login'),
  egsCheckSession:  () => ipcRenderer.invoke('egs:check-session'),
  egsClaim:         (params) => ipcRenderer.invoke('egs:claim', params),  // Market (Auto-Sell)
  marketGetPrice:      (params) => ipcRenderer.invoke('market:get-price',       params),
  marketSellItem:      (params) => ipcRenderer.invoke('market:sell-item',        params),
  marketAutoSellBatch: (params) => ipcRenderer.invoke('market:auto-sell-batch',  params),
  onAutoSellProgress: (cb) => ipcRenderer.on('market:auto-sell-progress', (_, data) => cb(data)),
  removeAutoSellProgress: () => ipcRenderer.removeAllListeners('market:auto-sell-progress'),
  marketGetHistogram:  (params) => ipcRenderer.invoke('market:get-histogram',    params),
  marketGetItemNameId: (params) => ipcRenderer.invoke('market:get-item-nameid',   params),
  marketGetListings:    (params)     => ipcRenderer.invoke('market:get-listings', params ?? {}),
  marketCancelListing:  (params)     => ipcRenderer.invoke('market:cancel-listing', params),

  marketGetHistory:     (params) => ipcRenderer.invoke('market:get-history',  params),
  steamGetWallet:       (steamId)=> ipcRenderer.invoke('steam:get-wallet',     steamId),
  marketCancelBatch:    (params) => ipcRenderer.invoke('market:cancel-batch',  params),
  onCancelProgress:     (cb)     => ipcRenderer.on('market:cancel-progress',
                                    (_, data) => cb(data)),
  removeCancelProgress: ()       => ipcRenderer.removeAllListeners('market:cancel-progress'),

  // Key Activation
  steamRedeemKey: (params) => ipcRenderer.invoke('steam:redeem-key', params),

  // Auto-Updater
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  
  // App
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  onUpdateDownloading: (callback) => ipcRenderer.on('update:downloading', () => callback()),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_event, data) => callback(data)),
  onUpdateError: (callback) => ipcRenderer.on('update:error', (_event, msg) => callback(msg)),

  // Internal Browser
  onOpenBrowser: (callback) => ipcRenderer.on('open-internal-browser', (_event, url) => callback(url)),

  showInputContextMenu: () => ipcRenderer.send('show-input-context-menu'),
});
