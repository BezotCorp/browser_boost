import { AnimationKiller } from './dom/animation_killer';
import { CodeBlockCollapser } from './dom/code_block_collapser';
import { MessageVirtualizer } from './dom/message_virtualizer';
import { SettingsStore } from './settings';
import type { SiteAdapter } from './sites/site_adapter';
import { GenerationWatcher } from './dom/generation_watcher';

const HEALTH_CHECK_INTERVAL_MS = 2000;

export class BrowserBoost {
  private readonly settingsStore = new SettingsStore();
  private readonly virtualizer = new MessageVirtualizer(() => this.settingsStore.get());
  private readonly animationKiller = new AnimationKiller();
  private mutationObserver: MutationObserver | null = null;
  private navObserver: MutationObserver | null = null;
  private codeCollapser: CodeBlockCollapser | null = null;
  private initialScanDone = false;
  private mutationRaf: number | null = null;
  private pendingRecords: MutationRecord[] = [];
  private observedRoot: HTMLElement | null = null;
  private healthCheckInterval: number | null = null;
  private readonly generationWatcher = new GenerationWatcher();

  constructor(private readonly adapter: SiteAdapter) {}

  start(): void {
    if (!this.adapter.canRun()) return;

    const settings = this.settingsStore.load();

    this.waitForRoot(() => {
      this.observeConversation();
      this.observeNavigation();
      this.startHealthCheck();
      this.generationWatcher.watch((isGenerating) => {
        if (!isGenerating) {
          this.codeCollapser?.forceStabilizeAll();
        }
      });

      if (settings.enabled) {
        this.virtualizer.activate();
        this.startCodeCollapser();
        this.initialScan();
      }
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

  // ChatGPT peut remonter entièrement sa page sans changement d'URL —
  // observeNavigation() (basé sur location.pathname) ne détecte pas ce cas.
  // Ce check périodique et léger (document.contains, quasi gratuit) vérifie
  // que le root qu'on observe est toujours réellement dans le document ;
  // sinon, tout est réinitialisé comme pour une vraie navigation.
  private startHealthCheck(): void {
    if (this.healthCheckInterval !== null) return;

    this.healthCheckInterval = window.setInterval(() => {
      if (this.observedRoot !== null && !document.contains(this.observedRoot)) {
        this.onNavigate();
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private observeConversation(): void {
    this.mutationObserver?.disconnect();

    this.waitForRoot((root) => {
      this.observedRoot = root;

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
    this.observedRoot = null;

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

        if (this.settingsStore.get().killAnimations) {
          for (const el of messages) {
            this.animationKiller.scan(el);
          }
        }
      }, 0);
    });
  }
}
