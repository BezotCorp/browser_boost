import type { BrowserBoostSettings } from '../settings';
import { ViewportManager } from './viewport_manager';
import type { VirtualizedBlock } from './virtualized_block';

export class MessageVirtualizer {
  private readonly blocks = new Map<HTMLElement, VirtualizedBlock>();
  private viewportManager: ViewportManager | null = null;
  private nextId = 1;
  private pendingRegistration: HTMLElement[] = [];
  private registrationRaf: number | null = null;

  constructor(private readonly getSettings: () => BrowserBoostSettings) {}

  activate(): void {
    if (this.viewportManager !== null) return;
    const settings = this.getSettings();
    this.viewportManager = new ViewportManager(settings.viewportBufferScreens);

    if (this.blocks.size >= settings.minMessagesBeforeCompact) {
      for (const block of this.blocks.values()) {
        if (!block.observed) this.startObserving(block);
      }
    }
  }

  deactivate(): void {
    if (this.registrationRaf !== null) {
      cancelAnimationFrame(this.registrationRaf);
      this.registrationRaf = null;
    }
    this.pendingRegistration = [];
    this.viewportManager?.disconnect();
    this.viewportManager = null;
    for (const block of this.blocks.values()) {
      this.restore(block);
      block.observed = false;
    }
  }

  registerMessages(messages: HTMLElement[]): void {
    for (const el of messages) {
      if (!this.blocks.has(el)) this.pendingRegistration.push(el);
    }

    if (this.pendingRegistration.length > 0 && this.registrationRaf === null) {
      this.registrationRaf = requestAnimationFrame(() => {
        this.registrationRaf = null;
        this.flushRegistration();
      });
    }
  }

  // Restaure tout sans déactiver — l'IntersectionObserver re-compacte
  // les éléments off-screen au prochain cycle async.
  restoreAll(): void {
    for (const block of this.blocks.values()) {
      this.restore(block);
    }
  }

  countCompacted(): number {
    let n = 0;
    for (const block of this.blocks.values()) {
      if (block.compacted) n++;
    }
    return n;
  }

  countTotal(): number {
    return this.blocks.size;
  }

  private flushRegistration(): void {
    const pending = this.pendingRegistration.splice(0);
    if (pending.length === 0) return;

    const settings = this.getSettings();

    // Lecture groupée des hauteurs en un seul layout pass
    // (toutes les lectures avant toutes les écritures = pas de forced reflow)
    const heights = pending.map((el) => Math.max(64, el.getBoundingClientRect().height));

    for (let i = 0; i < pending.length; i++) {
      const el = pending[i];
      if (this.blocks.has(el)) continue;
      this.blocks.set(el, {
        id: this.nextId++,
        element: el,
        height: heights[i],
        compacted: false,
        observed: false,
      });
    }

    const vm = this.viewportManager;
    if (vm !== null && this.blocks.size >= settings.minMessagesBeforeCompact) {
      for (const block of this.blocks.values()) {
        if (!block.observed) this.startObserving(block);
      }
    }
  }

  private startObserving(block: VirtualizedBlock): void {
    const vm = this.viewportManager;
    if (vm === null) return;
    block.observed = true;
    vm.observe(block.element, (visible) => {
      if (visible) this.restore(block);
      else this.compact(block);
    });
  }

  private compact(block: VirtualizedBlock): void {
    if (block.compacted) return;
    block.element.style.height = `${block.height}px`;
    block.element.style.contentVisibility = 'hidden';
    block.compacted = true;
  }

  private restore(block: VirtualizedBlock): void {
    if (!block.compacted) return;
    block.element.style.height = '';
    block.element.style.contentVisibility = '';
    block.compacted = false;
  }
}
