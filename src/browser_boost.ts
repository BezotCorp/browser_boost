import { MessageVirtualizer } from './dom/message_virtualizer';
import { SettingsStore } from './settings';
import type { SiteAdapter } from './sites/site_adapter';

export class BrowserBoost {
  private readonly settingsStore = new SettingsStore();
  private readonly virtualizer = new MessageVirtualizer(() => this.settingsStore.get());
  private observer: MutationObserver | null = null;
  private scrollListener: (() => void) | null = null;
  private toolbar: HTMLElement | null = null;
  private initialScanDone = false;

  constructor(private readonly adapter: SiteAdapter) {}

  start(): void {
    const settings = this.settingsStore.load();

    if (!this.adapter.canRun()) return;

    this.injectToolbar();
    this.updateToolbar();

    this.observe();

    if (settings.enabled) {
      this.initialScan();
    }

    this.observeScroll();
  }

  private observe(): void {
    this.observer?.disconnect();

    const root = this.adapter.findConversationRoot();
    if (!root) {
      window.setTimeout(() => this.observe(), 250);
      return;
    }

    this.observer = new MutationObserver((records) => {
      const settings = this.settingsStore.get();
      if (!settings.enabled) return;

      const messages = this.adapter.extractMessagesFromMutation(records);
      if (messages.length === 0) return;

      this.virtualizer.registerMessages(messages);
      this.updateToolbar();
    });

    this.observer.observe(root, {
      childList: true,
      subtree: true,
    });
  }

  private initialScan(): void {
    if (this.initialScanDone) return;

    const root = this.adapter.findConversationRoot();

    if (!root) {
      window.setTimeout(() => this.initialScan(), 250);
      return;
    }

    this.initialScanDone = true;

    window.setTimeout(() => {
      const messages = this.adapter.findMessages();
      this.virtualizer.registerMessages(messages);
      this.updateToolbar();
    }, 0);
  }

  private observeScroll(): void {
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener, { capture: true });
    }

    this.scrollListener = () => {
      const settings = this.settingsStore.get();
      if (!settings.enabled) return;

      this.virtualizer.scheduleViewportReconcile();
      this.updateToolbar();
    };

    window.addEventListener('scroll', this.scrollListener, {
      passive: true,
      capture: true,
    });
  }

  private toggleEnabled(): void {
    const current = this.settingsStore.get();
    const next = { ...current, enabled: !current.enabled };

    this.settingsStore.save(next);

    if (!next.enabled) {
      this.virtualizer.restoreAll();
    } else {
      this.initialScanDone = false;
      this.initialScan();
      this.virtualizer.scheduleViewportReconcile();
    }

    this.updateToolbar();
  }

  private restoreAll(): void {
    this.virtualizer.restoreAll();
    this.updateToolbar();
  }

  private injectToolbar(): void {
    if (document.querySelector('.browser-boost-toolbar')) return;

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
    restore.textContent = 'Restore';
    restore.addEventListener('click', () => this.restoreAll());

    toolbar.append(status, toggle, restore);
    document.documentElement.appendChild(toolbar);

    this.toolbar = toolbar;
  }

  private updateToolbar(): void {
    const settings = this.settingsStore.get();

    const status = document.querySelector<HTMLElement>('[data-browser-boost-status]');
    const toggle = document.querySelector<HTMLButtonElement>('[data-browser-boost-toggle]');

    if (status) {
      status.textContent = `BrowserBoost · ${this.virtualizer.countDetached()}/${this.virtualizer.countTotal()} compacted`;
    }

    if (toggle) {
      toggle.textContent = settings.enabled ? 'ON' : 'OFF';
    }
  }
}
