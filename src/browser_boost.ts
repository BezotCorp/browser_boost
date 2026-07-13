import { AnimationKiller } from './dom/animation_killer';
import { CodeBlockCollapser } from './dom/code_block_collapser';
import { MessageVirtualizer } from './dom/message_virtualizer';
import { SettingsStore } from './settings';
import type { SiteAdapter } from './sites/site_adapter';

export class BrowserBoost {
  private readonly settingsStore = new SettingsStore();
  private readonly virtualizer = new MessageVirtualizer(() => this.settingsStore.get());
  private readonly animationKiller = new AnimationKiller();
  private mutationObserver: MutationObserver | null = null;
  private navObserver: MutationObserver | null = null;
  private codeCollapser: CodeBlockCollapser | null = null;
  private initialScanDone = false;
  private toolbarUpdateRaf: number | null = null;
  private mutationRaf: number | null = null;
  private pendingRecords: MutationRecord[] = [];
  private statusEl: HTMLElement | null = null;
  private toggleEl: HTMLButtonElement | null = null;

  constructor(private readonly adapter: SiteAdapter) {}

  start(): void {
    if (!this.adapter.canRun()) return;

    const settings = this.settingsStore.load();

    this.injectToolbar();
    this.waitForRoot(() => {
      this.observeConversation();
      this.observeNavigation();

      if (settings.enabled) {
        this.virtualizer.activate();
        this.startCodeCollapser();
        this.initialScan();
      }

      this.updateToolbar();
    });
  }

  private waitForRoot(onReady: (root: HTMLElement) => void): void {
    const root = this.adapter.findConversationRoot();
    if (root === null) {
      window.setTimeout(() => this.waitForRoot(onReady), 250);
      return;
    }
    onReady(root);
  }

  private observeConversation(): void {
    this.mutationObserver?.disconnect();

    this.waitForRoot((root) => {
      this.mutationObserver = new MutationObserver((records) => {
        if (!this.settingsStore.get().enabled) return;

        this.pendingRecords.push(...records);

        if (this.mutationRaf !== null) return;
        this.mutationRaf = requestAnimationFrame(() => {
          this.mutationRaf = null;
          const toProcess = this.pendingRecords.splice(0);
          const settings = this.settingsStore.get();

          const messages = this.adapter.extractMessagesFromMutation(toProcess);
          if (messages.length > 0) {
            this.virtualizer.registerMessages(messages);

            // Scoped aux éléments qui viennent de changer, pas à la
            // conversation entière — sinon le coût du scan grandit avec
            // la taille de la conversation, exactement ce qu'on corrige.
            if (settings.killAnimations) {
              for (const el of messages) {
                this.animationKiller.scan(el);
              }
            }
          }

          const removed = this.adapter.extractMessagesFromRemoval(toProcess);
          if (removed.length > 0) {
            this.virtualizer.unregisterMessages(removed);
          }

          if (messages.length > 0 || removed.length > 0) {
            this.scheduleToolbarUpdate();
          }
        });
      });

      this.mutationObserver.observe(root, { childList: true, subtree: true });
    });
  }

  private observeNavigation(): void {
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
    this.virtualizer.reset();
    this.codeCollapser?.disconnect();
    this.codeCollapser = null;
    this.initialScanDone = false;
    this.mutationObserver?.disconnect();

    if (this.mutationRaf !== null) {
      cancelAnimationFrame(this.mutationRaf);
      this.mutationRaf = null;
    }
    this.pendingRecords = [];

    if (this.settingsStore.get().enabled) {
      this.virtualizer.activate();
      this.startCodeCollapser();
      this.observeConversation();
      this.initialScan();
    }

    this.scheduleToolbarUpdate();
  }

  private startCodeCollapser(): void {
    this.waitForRoot((root) => {
      const settings = this.settingsStore.get();
      this.codeCollapser?.disconnect();
      this.codeCollapser = new CodeBlockCollapser(root, settings.codeBlockThresholdPx);
    });
  }

  private initialScan(): void {
    if (this.initialScanDone) return;

    this.waitForRoot(() => {
      this.initialScanDone = true;

      window.setTimeout(() => {
        const messages = this.adapter.findMessages();
        this.virtualizer.registerMessages(messages);

        // Couvre le cas d'activation en cours de génération : un indicateur
        // "thinking" déjà en boucle au moment où l'extension démarre.
        if (this.settingsStore.get().killAnimations) {
          for (const el of messages) {
            this.animationKiller.scan(el);
          }
        }

        this.scheduleToolbarUpdate();
      }, 0);
    });
  }

  private toggleEnabled(): void {
    const current = this.settingsStore.get();
    this.settingsStore.save({ enabled: !current.enabled });

    if (this.settingsStore.get().enabled) {
      this.virtualizer.activate();
      this.startCodeCollapser();
      this.initialScanDone = false;
      this.initialScan();
    } else {
      this.virtualizer.deactivate();
      this.codeCollapser?.disconnect();
      this.codeCollapser = null;
    }

    this.updateToolbar();
  }

  private restoreAll(): void {
    this.virtualizer.restoreAll();
    this.codeCollapser?.disconnect();
    this.codeCollapser = null;
    if (this.settingsStore.get().enabled) {
      this.startCodeCollapser();
    }
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
