/**
 * @vitest-environment node
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { register } from '../../../electron/ipc/backup.js';
import { loadSettings, saveSettings } from '../../../electron/farmSettings.js';
import { loadStats, saveStats } from '../../../electron/farmStats.js';
import { loadFreeGamesSettings, saveFreeGamesSettings, restoreClaimedGames } from '../../../electron/ipc/freeGames.js';
import { dialog, app } from 'electron';
import AdmZip from 'adm-zip';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name) => {
      if (name === 'userData') return 'mock-userdata';
      if (name === 'downloads') return 'mock-downloads';
      return 'mock-temp';
    }),
    getVersion: vi.fn(() => '1.0.2'),
  },
  dialog: {
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
  }
}));

// Mock AdmZip
const mockZipInstance = {
  addFile: vi.fn(),
  writeZip: vi.fn(),
  getEntry: vi.fn(),
  readAsText: vi.fn(),
};
vi.mock('adm-zip', () => {
  const MockZip = function() {
    return mockZipInstance;
  };
  return {
    default: MockZip
  };
});

// Mock domain modules
vi.mock('../../../electron/farmSettings.js', () => ({
  loadSettings: vi.fn(() => ({ phase1DurationMin: 5 })),
  saveSettings: vi.fn(),
}));

vi.mock('../../../electron/farmStats.js', () => ({
  loadStats: vi.fn(() => ({ sessions: [] })),
  saveStats: vi.fn(),
}));

vi.mock('../../../electron/ipc/freeGames.js', () => ({
  loadFreeGamesSettings: vi.fn(() => ({ onlyGames: true })),
  saveFreeGamesSettings: vi.fn(),
  restoreClaimedGames: vi.fn(),
}));

// Mock fs module partially
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    default: {
      ...actual,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => '[]'),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      copyFileSync: vi.fn(),
      rmSync: vi.fn(),
      unlinkSync: vi.fn(),
    }
  };
});

describe('Backup IPC Handler', () => {
  const handlers = {};
  const mockIpcMain = {
    handle: (channel, cb) => {
      handlers[channel] = cb;
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    register(mockIpcMain);
  });

  test('backup:export successfully packages config files into zip', async () => {
    dialog.showSaveDialog.mockResolvedValue({ filePath: 'mock-export.steammini-backup' });

    const result = await handlers['backup:export'](null, '76561198271597868');

    expect(result.success).toBe(true);
    expect(result.filePath).toBe('mock-export.steammini-backup');
    expect(dialog.showSaveDialog).toHaveBeenCalled();
    expect(mockZipInstance.addFile).toHaveBeenCalledTimes(5); // manifest + 4 configs
    expect(mockZipInstance.writeZip).toHaveBeenCalledWith('mock-export.steammini-backup');
  });

  test('backup:import restores settings and claimed games successfully', async () => {
    dialog.showOpenDialog.mockResolvedValue({ filePaths: ['mock-import.steammini-backup'] });
    
    mockZipInstance.getEntry.mockImplementation((name) => {
      if (name === 'manifest.json') return {};
      if (name === 'farm-settings.json') return {};
      if (name === 'farm-stats.json') return {};
      if (name === 'free-games-settings.json') return {};
      if (name === 'claimed-games.json') return {};
      return null;
    });

    mockZipInstance.readAsText.mockImplementation((entry) => {
      // Since entry is just an empty object mock, we can check by passing name/identifying it
      // In backup.js, we call zip.readAsText(entry)
      return JSON.stringify({
        schemaVersion: 1,
        appVersion: '1.0.2',
        phase1DurationMin: 10,
        sessions: [],
        onlyGames: false,
        claimed: ['123']
      });
    });

    const result = await handlers['backup:import'](null, '76561198271597868');

    expect(result.success).toBe(true);
    expect(saveSettings).toHaveBeenCalled();
    expect(saveStats).toHaveBeenCalled();
    expect(saveFreeGamesSettings).toHaveBeenCalled();
    expect(restoreClaimedGames).toHaveBeenCalled();
  });

  test('backup:import rejects backup from incompatible schema version', async () => {
    dialog.showOpenDialog.mockResolvedValue({ filePaths: ['mock-import.steammini-backup'] });
    
    mockZipInstance.getEntry.mockImplementation((name) => {
      if (name === 'manifest.json') return {};
      return null;
    });

    mockZipInstance.readAsText.mockReturnValue(JSON.stringify({
      schemaVersion: 999, // incompatible schema
      appVersion: '1.0.2'
    }));

    const result = await handlers['backup:import'](null, '76561198271597868');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Несовместимая версия схемы');
    expect(saveSettings).not.toHaveBeenCalled();
  });

  test('backup:import rolls back to pre-restore backup if extraction throws an error', async () => {
    dialog.showOpenDialog.mockResolvedValue({ filePaths: ['mock-import.steammini-backup'] });
    
    mockZipInstance.getEntry.mockImplementation((name) => {
      if (name === 'manifest.json') return {};
      if (name === 'farm-settings.json') return {};
      return null;
    });

    mockZipInstance.readAsText.mockImplementation(() => {
      return JSON.stringify({
        schemaVersion: 1,
        appVersion: '1.0.2'
      });
    });

    // Make saveSettings throw an error during restore
    saveSettings.mockImplementation(() => {
      throw new Error('Disk Full');
    });

    const result = await handlers['backup:import'](null, '76561198271597868');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Disk Full');
    // Ensure rollback copied files back
    expect(fs.copyFileSync).toHaveBeenCalled();
  });
});
