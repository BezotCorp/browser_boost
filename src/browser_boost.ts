import { MessageVirtualizer } from './dom/message_virtualizer';
import { SettingsStore } from './settings';
import type { SiteAdapter } from './sites/site_adapter';

export class BrowserBoost {
  private readonly settingsStore = new SettingsStore();
  private readonly virtualizer = new MessageVirtualizer(() => this.settingsStore.get());
  private observer: MutationObserver | null = null;
  private initialScanDone = false;
  private toolbarUpdateRaf: number | null = null;
  private statusEl: HTMLElement | null = null;
  private toggleEl: HTMLButtonElement | null = null;

  constructor(private readonly adapter: SiteAdapter) {}

  start(): void {
    const settings = this.settingsStore.load();
    if (!this.adapter.canRun()) return;

    this.injectToolbar();
    this.observe();

    if (settings.enabled) {
      this.virtualizer.activate();
      this.initialScan();
    }

    this.updateToolbar();
  }

  private observe(): void {
    this.observer?.disconnect();

    const root = this.adapter.findConversationRoot();
    if (root === null) {
      window.setTimeout(() => this.observe(), 250);
      return;
    }

    this.observer = new MutationObserver((records) => {
      if (!this.settingsStore.get().enabled) return;

      const messages = this.adapter.extractMessagesFromMutation(records);
      if (messages.length === 0) return;

      this.virtualizer.registerMessages(messages);
      this.scheduleToolbarUpdate();
    });

    this.observer.observe(root, { childList: true, subtree: true });
  }

  private initialScan(): void {
    if (this.initialScanDone) return;

    const root = this.adapter.findConversationRoot();
    if (root === null) {
      window.setTimeout(() => this.initialScan(), 250);
      return;
    }

    this.initialScanDone = true;
    window.setTimeout(() => {
      const messages = this.adapter.findMessages();
      this.virtualizer.registerMessages(messages);
      this.scheduleToolbarUpdate();
    }, 0);
  }

  private toggleEnabled(): void {
    const current = this.settingsStore.get();
    const next = { ...current, enabled: !current.enabled };
    this.settingsStore.save(next);

    if (next.enabled) {
      this.virtualizer.activate();
      this.initialScanDone = false;
      this.initialScan();
    } else {
      this.virtualizer.deactivate();
    }

    this.updateToolbar();
  }

  private restoreAll(): void {
    this.virtualizer.restoreAll();
    this.updateToolbar();
  }

  private scheduleToolbarUpdate(): void {
    if (this.toolbarUpdateRaf !== null) return;
    this.toolbarUpdateRaf = requestAnimationFrame(() => {
      this.toolbarUpdateRaf = null;
      this.updateToolbar();
    });
  }

  private injectToolbar(): void {
    if (document.querySelector('.browser-boost-toolbar') !== null) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'browser-boost-toolbar';

    const status = document.createElement('span');
    status.dataset.browserBoostStatus = 'true';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.dataset.browserBoostToggle = 'true';
    toggle.addEventListener('click', () => this.toggleEnabled());

    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = 'Restore All';
    restore.addEventListener('click', () => this.restoreAll());

    toolbar.append(status, toggle, restore);
    document.documentElement.appendChild(toolbar);

    // Cacher les refs pour éviter document.querySelector à chaque updateToolbar
    this.statusEl = status;
    this.toggleEl = toggle;
  }

  private updateToolbar(): void {
    const settings = this.settingsStore.get();
    if (this.statusEl !== null) {
      this.statusEl.textContent = `BrowserBoost · ${this.virtualizer.countCompacted()}/${this.virtualizer.countTotal()} compacted`;
    }
    if (this.toggleEl !== null) {
      this.toggleEl.textContent = settings.enabled ? 'ON' : 'OFF';
    }
  }
}
