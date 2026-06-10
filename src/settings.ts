export type BrowserBoostSettings = {
  enabled: boolean;
  viewportBufferScreens: number;
  minMessagesBeforeCompact: number;
};

const DEFAULT_SETTINGS: BrowserBoostSettings = {
  enabled: true,
  viewportBufferScreens: 2,
  minMessagesBeforeCompact: 80,
};

const STORAGE_KEY = 'browserBoostSettings';

export class SettingsStore {
  private settings: BrowserBoostSettings = { ...DEFAULT_SETTINGS };

  load(): BrowserBoostSettings {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.settings;

      const parsed = JSON.parse(raw) as Partial<BrowserBoostSettings> & {
        keepLastMessages?: number;
      };

      this.settings = {
        enabled: parsed.enabled ?? DEFAULT_SETTINGS.enabled,
        viewportBufferScreens: parsed.viewportBufferScreens ?? DEFAULT_SETTINGS.viewportBufferScreens,
        minMessagesBeforeCompact: parsed.minMessagesBeforeCompact ?? DEFAULT_SETTINGS.minMessagesBeforeCompact,
      };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }

    return this.settings;
  }

  save(settings: BrowserBoostSettings): void {
    this.settings = settings;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  get(): BrowserBoostSettings {
    return this.settings;
  }
}
