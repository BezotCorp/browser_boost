export type BrowserBoostSettings = {
  enabled: boolean;
  minMessagesBeforeCompact: number;
  viewportBufferScreens: number;
  codeBlockThresholdPx: number;
};

const DEFAULTS: BrowserBoostSettings = {
  enabled: true,
  minMessagesBeforeCompact: 10,
  viewportBufferScreens: 1.5,
  codeBlockThresholdPx: 300,
};

const STORAGE_KEY = 'browser_boost_settings';

export class SettingsStore {
  private current: BrowserBoostSettings = { ...DEFAULTS };

  load(): BrowserBoostSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        this.current = { ...DEFAULTS, ...JSON.parse(raw) };
      }
    } catch {
      // localStorage inaccessible ou JSON invalide — on reste sur les defaults.
    }
    return this.current;
  }

  get(): BrowserBoostSettings {
    return this.current;
  }

  save(settings: BrowserBoostSettings): void {
    this.current = settings;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Silencieux — les settings en mémoire restent cohérents.
    }
  }
}
