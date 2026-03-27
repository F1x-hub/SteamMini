import store from '../store/index.js';
import steamApi from '../api/steam.js';
import toast from './toast.js';

/**
 * IME Fast Mode Configuration
 */
const DEFAULT_FARM_CONFIG = {
  phase1_duration_ms: 5 * 60 * 1000,    // 5 minutes simultaneously
  phase2_per_game_ms: 5 * 1000,         // 5 seconds per game
  max_concurrent: 30,                   // max games simultaneously
  check_drops_after_cycle: true,        // refresh drops after each full cycle
};

class AutoFarm {
  constructor() {
    this.isActive = false;
    this.phase = null; // 'simultaneous' | 'sequential'
    
    this.eligibleGames = [];         // List of games with remaining drops
    this.currentLoopGames = [];      // Games for the current cycle (max 30)
    this.currentIndex = 0;           // Index for sequential phase
    
    // Status tracking
    this.phaseTimeLeft = 0;
    this.countdownTimer = null;
    this._cancelLoop = null;
    this._timers = new Set();

    this._notifyStateChange();
  }

  /** Get current config merged with defaults */
  _getConfig() {
    const settings = this._settings || {};
    
    return {
      phase1_duration_ms: (settings.phase1DurationMin * 60 * 1000) || DEFAULT_FARM_CONFIG.phase1_duration_ms,
      phase2_per_game_ms: (settings.phase2DurationSec * 1000) || DEFAULT_FARM_CONFIG.phase2_per_game_ms,
      max_concurrent: settings.maxConcurrent || DEFAULT_FARM_CONFIG.max_concurrent,
      check_drops_after_cycle: true,
    };
  }

  /**
   * Start auto-farming using IME Fast Mode algorithm
   * @param {Array} games - [{appid, name, playtime_forever, ...}]
   * @param {Object} cardDropsData - {appid: remainingDrops}
   */
  async start(games, cardDropsData) {
    if (this.isActive) return;

    console.log('[AutoFarm] Starting IME Fast Mode with drops data:', Object.keys(cardDropsData).length, 'entries');
    
    // Получить настройки фермы
    let settings = { 
      phase1DurationMin: 5, 
      phase2DurationSec: 5, 
      maxConcurrent: 30,
      whitelist: [],
      blacklist: [],
      notifications: { onCardDrop: true, onAllReceived: true, onFarmComplete: true }
    };
    try {
      if (window.electronAuth && window.electronAuth.settingsGet) {
         settings = await window.electronAuth.settingsGet();
      }
    } catch(e) { console.error('Failed to load settings', e); }
    
    this._settings = settings;

    // Build eligible games list (all games with drops)
    this.eligibleGames = games
      .filter(g => {
        const appIdStr = String(g.appid);
        const hasDrops = (cardDropsData[appIdStr] || 0) > 0;
        if (!hasDrops) return false;
        
        // Filter by whitelist / blacklist
        if (settings.whitelist && settings.whitelist.length > 0) {
           return settings.whitelist.includes(appIdStr);
        }
        if (settings.blacklist && settings.blacklist.length > 0) {
           return !settings.blacklist.includes(appIdStr);
        }
        return true;
      })
      .map(g => ({
        appid: g.appid.toString(),
        name: g.name,
        remaining: cardDropsData[String(g.appid)],
        hoursPlayed: (g.playtime_forever || 0) / 60,
      }));

    if (this.eligibleGames.length === 0) {
      toast.show('Нет игр с оставшимися карточками для фарма.', 'warning');
      return;
    }

    this.isActive = true;
    this._startCountdown();
    this._runMainLoop();
    
    toast.show('▶ Авто-фарм запущен (IME Fast Mode)', 'success');
    this._notifyStateChange();
  }

  /**
   * Main cyclic loop: Simultaneous -> Sequential -> Refresh -> Repeat
   */
  async _runMainLoop() {
    const config = this._getConfig();

    try {
      while (this.isActive) {
        // 1. Prepare batch for this cycle
        this.currentLoopGames = this.eligibleGames.slice(0, config.max_concurrent);
        if (this.currentLoopGames.length === 0) break;

        // --- STEP 1: Simultaneous Phase (5 minutes) ---
        this.phase = 'simultaneous';
        console.log(`[AutoFarm] Phase 1: Simultaneous (${this.currentLoopGames.length} games)`);
        
        // Запустить все (Promise.all для быстрого старта Phase 1)
        await Promise.all(this.currentLoopGames.map(game => window.electronAuth.idleStart(game.appid)));

        
        if (!this.isActive) break;

        await this._waitWithTick(config.phase1_duration_ms);
        
        // Остановить все
        if (this.currentLoopGames.length > 0) {
          await Promise.all(this.currentLoopGames.map(game => window.electronAuth.idleStop(game.appid)));
        }

        if (!this.isActive) break;

        // --- STEP 2: Refresh Drops ---
        console.log('[AutoFarm] Refreshing drops after Phase 1');
        await this._refreshEligibleGames();
        if (this.eligibleGames.length === 0) break;
        
        // Update batch for sequential phase (in case some games finished)
        this.currentLoopGames = this.eligibleGames.slice(0, config.max_concurrent);

        // --- STEP 3: Sequential Phase (5 seconds per game) ---
        this.phase = 'sequential';
        console.log(`[AutoFarm] Phase 2: Sequential (${this.currentLoopGames.length} games)`);
        
        for (let i = 0; i < this.currentLoopGames.length; i++) {
          if (!this.isActive) break;
          
          this.currentIndex = i;
          const game = this.currentLoopGames[i];
          
          this.currentSequentialAppId = game.appid;
          this._notifyStateChange();
          
          await window.electronAuth.idleStart(game.appid);
          await this._waitWithTick(config.phase2_per_game_ms);
          await window.electronAuth.idleStop(game.appid);
          
          this.currentSequentialAppId = null;
          this._notifyStateChange();
          
          console.log(`[AutoFarm] Refreshing drops after game ${game.appid}`);
          await this._refreshEligibleGames();
        }

        if (!this.isActive) break;

        // --- STEP 4: Final refresh after full cycle ---
        console.log('[AutoFarm] Refreshing drops after full cycle');
        await this._refreshEligibleGames();
      }
    } catch (e) {
      console.error('[AutoFarm] Main loop crashed:', e);
    }

    if (!this.isActive) {
       // Loop stopped manually
       if (window.electronAuth && window.electronAuth.statsEndSession) {
         window.electronAuth.statsEndSession();
       }
    } else {
       // Loop ended because no more eligible games
       this.stop();
       toast.show('🎉 Авто-фарм завершён! Все карточки получены.', 'success');
       if (this._settings?.notifications?.onFarmComplete && window.electronAuth?.notifyFarmComplete) {
         window.electronAuth.notifyFarmComplete(this._totalSessionDrops || 0);
       }
    }
  }

  /** Update eligible games list from API */
  async _refreshEligibleGames() {
    try {
      const cardDropsMap = await steamApi.getRemainingCardDrops();
      store.set('cardDropsMap', cardDropsMap);
      
      const previousMap = {};
      this.eligibleGames.forEach(g => {
         previousMap[g.appid] = g.remaining;
      });
      
      this._totalSessionDrops = this._totalSessionDrops || 0;

      // Update our known list
      const updatedList = [];
      for (const game of this.eligibleGames) {
        const remaining = (cardDropsMap[game.appid] !== undefined) ? cardDropsMap[game.appid] : 0;
        const prev = previousMap[game.appid] || 0;
        
        if (remaining < prev) {
           const dropped = prev - remaining;
           this._totalSessionDrops += dropped;
           
           for (let i = 0; i < dropped; i++) {
             if (window.electronAuth && window.electronAuth.statsRecordDrop) {
               await window.electronAuth.statsRecordDrop(game.appid, game.name);
             }
             if (this._settings?.notifications?.onCardDrop && window.electronAuth?.notifyCardDrop) {
               window.electronAuth.notifyCardDrop(game.name);
             }
           }
           
           if (remaining === 0 && this._settings?.notifications?.onAllReceived && window.electronAuth?.notifyAllReceived) {
              window.electronAuth.notifyAllReceived(game.name);
           }
        }
        
        if (remaining > 0) {
          updatedList.push({ ...game, remaining });
        }
      }
      this.eligibleGames = updatedList;
      this._notifyStateChange();
    } catch (e) {
      console.error('[AutoFarm] Failed to refresh drops:', e);
    }
  }

  /** Utility wait with cancellation support */
  _waitWithTick(ms) {
    return new Promise(resolve => {
      let remaining = Math.ceil(ms / 1000);
      this.phaseTimeLeft = remaining;
      this._notifyStateChange();

      const prevCancel = this._cancelLoop;
      
      // Separate timeout that actually resolves the wait
      const resolveTimer = setTimeout(() => {
        clearInterval(tickInterval);
        resolve();
      }, ms);
      this._timers.add(resolveTimer);

      // Separate interval just for updating state visually
      const tick = () => {
        if (!this.isActive) {
          clearInterval(tickInterval);
          clearTimeout(resolveTimer);
          resolve();
          return;
        }

        remaining--;
        this.phaseTimeLeft = remaining;
        this._notifyStateChange();

        if (remaining <= 0) {
          clearInterval(tickInterval);
          // resolve() handled by resolveTimer
        }
      };

      const tickInterval = setInterval(tick, 1000);
      this._timers.add(tickInterval);

      this._cancelLoop = () => {
        if (prevCancel) prevCancel();
        clearInterval(tickInterval);
        clearTimeout(resolveTimer);
        resolve();
      };
    });
  }

  // ─── Control methods ────────────────────────────────────

  async pause() {
    if (!this.isActive) return;

    this.isActive = false;
    if (this._cancelLoop) {
      this._cancelLoop();
      this._cancelLoop = null;
    }
    this._stopCountdown();
    for (const t of this._timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this._timers.clear();

    // Kill all current idles
    if (this.phase === 'simultaneous') {
      for (const game of this.currentLoopGames) {
        try { await window.electronAuth.idleStop(game.appid); } catch(e){}
      }
    } else if (this.phase === 'sequential' && this.currentLoopGames[this.currentIndex]) {
      try { await window.electronAuth.idleStop(this.currentLoopGames[this.currentIndex].appid); } catch(e){}
    }

    toast.show('⏸ Фарм приостановлен', 'info');
    this._notifyStateChange();
  }

  async resume() {
    if (this.isActive || this.eligibleGames.length === 0) return;
    
    this.isActive = true;
    this._startCountdown();
    this._runMainLoop();
    
    toast.show('▶ Фарм возобновлён', 'success');
    this._notifyStateChange();
  }

  async stop() {
    this.isActive = false;
    if (this._cancelLoop) {
      this._cancelLoop();
      this._cancelLoop = null;
    }
    this._stopCountdown();
    for (const t of this._timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this._timers.clear();

    // Stop all current idles based on phase
    if (this.currentLoopGames.length > 0) {
       for (const game of this.currentLoopGames) {
         try { await window.electronAuth.idleStop(game.appid); } catch(e){}
       }
    }

    this.eligibleGames = [];
    this.currentLoopGames = [];
    this.phase = null;
    this.phaseTimeLeft = 0;
    this.currentIndex = 0;
    this.currentSequentialAppId = null;

    if (window.electronAuth && window.electronAuth.statsEndSession) {
      window.electronAuth.statsEndSession().catch(console.error);
    }

    this._notifyStateChange();
  }

  // ─── Helpers ────────────────────────────────────────────

  _startCountdown() {
    if (this.countdownTimer) return;
    this.countdownTimer = setInterval(() => {
      if (this.isActive) this._notifyStateChange();
    }, 1000);
  }

  _stopCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  _notifyStateChange() {
    const gamesMetadata = {};

    // Map all eligible games to metadata for UI badges
    this.eligibleGames.forEach(g => {
      gamesMetadata[g.appid] = {
        remaining: g.remaining,
        hoursPlayed: g.hoursPlayed,
        state: 'idle', // default base state
      };
    });

    // Ensure all currentLoopGames are present, even if drops went to 0
    this.currentLoopGames.forEach(g => {
      if (!gamesMetadata[g.appid]) {
        gamesMetadata[g.appid] = {
          remaining: g.remaining,
          hoursPlayed: g.hoursPlayed,
          state: 'idle',
        };
      }
    });

    // Overlays for current loop
    if (this.isActive) {
      if (this.phase === 'simultaneous') {
        this.currentLoopGames.forEach(g => {
          if (gamesMetadata[g.appid]) gamesMetadata[g.appid].state = 'simultaneous';
        });
      } else if (this.phase === 'sequential') {
        this.currentLoopGames.forEach((g) => {
          if (gamesMetadata[g.appid]) {
            gamesMetadata[g.appid].state = (this.currentSequentialAppId === g.appid) 
               ? 'sequential-active' 
               : 'sequential-queue';
          }
        });
      }
    }

    const totalRemaining = this.eligibleGames.reduce((acc, g) => acc + g.remaining, 0);

    let phaseTimeLeft = this.phaseTimeLeft || 0;

    store.set('autoFarmStatus', {
      isActive: this.isActive,
      phase: this.phase,
      eligibleCount: this.eligibleGames.length,
      totalRemaining,
      phaseTimeLeft,
      
      // Current phase info
      currentBatch: this.currentLoopGames.map(g => g.appid),
      currentIndex: this.currentIndex,
      currentSequentialAppId: this.currentSequentialAppId,
      // no next action time parameter
      
      // Legacy compatibility for UI
      currentFarmGame: (this.phase === 'sequential' && this.currentSequentialAppId) 
        ? this.currentLoopGames.find(g => g.appid === this.currentSequentialAppId) || null
        : null,

      gamesMetadata,
    });
  }
}

const autoFarm = new AutoFarm();
export default autoFarm;
