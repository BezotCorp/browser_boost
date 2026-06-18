import { MessageVirtualizer } from './dom/message_virtualizer';
import { SettingsStore } from './settings';
import type { SiteAdapter } from './sites/site_adapter';

export class BrowserBoost {
  private readonly settingsStore = new SettingsStore();
  private readonly virtualizer = new MessageVirtualizer(() => this.settingsStore.get());
  private mutationObserver: MutationObserver | null = null;
  private navObserver: MutationObserver | null = null;
  private initialScanDone = false;
  private toolbarUpdateRaf: number | null = null;
  private mutationRaf: number | null = null;
  private pendingRecords: MutationRecord[] = [];
  private statusEl: HTMLElement | null = null;
  private toggleEl: HTMLButtonElement | null = null;

  constructor(private readonly adapter: SiteAdapter) {}

  start(): void {
    const settings = this.settingsStore.load();
    if (!this.adapter.canRun()) return;

    this.injectToolbar();
    this.observeConversation();
    this.observeNavigation();

    if (settings.enabled) {
      this.virtualizer.activate();
      this.initialScan();
    }

    this.updateToolbar();
  }

  private observeConversation(): void {
    this.mutationObserver?.disconnect();

    const root = this.adapter.findConversationRoot();
    if (root === null) {
      window.setTimeout(() => this.observeConversation(), 250);
      return;
    }

    this.mutationObserver = new MutationObserver((records) => {
      if (!this.settingsStore.get().enabled) return;

      // Accumule les records et les traite en un seul batch par frame —
      // évite de payer le coût de extractMessagesFromMutation à chaque token
      // streamé par ChatGPT (plusieurs mutations par seconde pendant la génération).
      this.pendingRecords.push(...records);

      if (this.mutationRaf !== null) return;
      this.mutationRaf = requestAnimationFrame(() => {
        this.mutationRaf = null;
        const toProcess = this.pendingRecords.splice(0);
        const messages = this.adapter.extractMessagesFromMutation(toProcess);
        if (messages.length === 0) return;
        this.virtualizer.registerMessages(messages);
        this.scheduleToolbarUpdate();
      });
    });

    this.mutationObserver.observe(root, { childList: true, subtree: true });
  }

  private observeNavigation(): void {
    // ChatGPT est une SPA — la navigation entre conversations ne recharge pas la page.
    // On observe le <title> comme signal de changement d'URL : c'est fiable,
    // léger, et ne requiert pas d'intercepter history.pushState.
    const titleTarget = document.querySelector('title') ?? document.head;
    let lastPath = location.pathname;

    this.navObserver = new MutationObserver(() => {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      this.onNavigate();
    });

    this.navObserver.observe(titleTarget, { childList: true, subtree: true });
  }

  private onNavigate(): void {
    // Libère tous les observateurs et vide la map de blocs —
    // les éléments de l'ancienne conversation ne sont plus dans le DOM.
    this.virtualizer.reset();
    this.initialScanDone = false;
    this.mutationObserver?.disconnect();

    if (this.mutationRaf !== null) {
      cancelAnimationFrame(this.mutationRaf);
      this.mutationRaf = null;
    }
    this.pendingRecords = [];

    if (this.settingsStore.get().enabled) {
      this.virtualizer.activate();
      this.observeConversation();
      this.initialScan();
    }

    this.scheduleToolbarUpdate();
  }

  private initialScan(): void {
    if (this.initialScanDone) return;

    const root = this.adapter.findConversationRoot();
    if (root === null) {
      window.setTimeout(() => this.initialScan(), 250);
      return;
    }

    this.initialScanDone = true;

    // setTimeout 0 laisse le navigateur terminer le layout initial
    // avant qu'on lise les getBoundingClientRect.
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

    // Refs directes — plus de document.querySelector à chaque updateToolbar.
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
