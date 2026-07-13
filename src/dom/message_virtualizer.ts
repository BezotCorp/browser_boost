import type { BrowserBoostSettings } from '../settings';
import { ResizeManager } from './resize_manager';
import { ViewportManager } from './viewport_manager';
import type { VirtualizedBlock } from './virtualized_block';

export class MessageVirtualizer {
  private readonly blocks = new Map<HTMLElement, VirtualizedBlock>();
  private viewportManager: ViewportManager | null = null;
  private readonly resizeManager = new ResizeManager();
  private nextId = 1;
  private pendingRegistration: HTMLElement[] = [];
  private registrationRaf: number | null = null;

  constructor(private readonly getSettings: () => BrowserBoostSettings) {}

  activate(): void {
    if (this.viewportManager !== null) return;

    this.viewportManager = new ViewportManager(this.getSettings().viewportBufferScreens);
    this.observeEligibleBlocks();
  }

  deactivate(): void {
    if (this.registrationRaf !== null) {
      cancelAnimationFrame(this.registrationRaf);
      this.registrationRaf = null;
    }

    this.pendingRegistration = [];

    for (const block of this.blocks.values()) {
      this.resizeManager.unobserve(block.element);
      block.observed = false;
      this.restore(block);
    }

    this.viewportManager?.disconnect();
    this.viewportManager = null;
  }

  reset(): void {
    this.deactivate();
    this.blocks.clear();
    this.nextId = 1;
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

  unregisterMessages(messages: HTMLElement[]): void {
    for (const el of messages) {
      const block = this.blocks.get(el);
      if (block === undefined) continue;

      this.resizeManager.unobserve(el);
      this.viewportManager?.unobserve(el);
      this.blocks.delete(el);
    }
  }

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

    this.observeEligibleBlocks();
  }

  // Factorisé depuis activate()/flushRegistration() — les deux répétaient
  // "si le seuil est atteint, démarre l'observation des blocs pas encore
  // observés". Un seul point de vérité pour cette condition.
  private observeEligibleBlocks(): void {
    if (this.viewportManager === null) return;

    const settings = this.getSettings();
    if (this.blocks.size < settings.minMessagesBeforeCompact) return;

    for (const block of this.blocks.values()) {
      if (!block.observed) this.startObserving(block);
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

    this.resizeManager.observe(block.element, (rect) => {
      if (!block.compacted) {
        block.height = Math.max(64, rect.height);
      }
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
