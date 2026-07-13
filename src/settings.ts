export type BrowserBoostSettings = {
  enabled: boolean;
  minMessagesBeforeCompact: number;
  viewportBufferScreens: number;
  codeBlockThresholdPx: number;
  killAnimations: boolean;
};

const DEFAULTS: BrowserBoostSettings = {
  enabled: true,
  minMessagesBeforeCompact: 10,
  viewportBufferScreens: 1.5,
  codeBlockThresholdPx: 300,
  killAnimations: true,
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

  save(settings: Partial<BrowserBoostSettings>): void {
    this.current = { ...this.current, ...settings };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      // Silencieux — les settings en mémoire restent cohérents.
    }
  }
}
