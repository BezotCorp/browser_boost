import type { BrowserBoostSettings } from '../settings';
import { ViewportManager } from './viewport_manager';
import type { VirtualizedBlock } from './virtualized_block';

const COMPACT_BATCH_SIZE = 250;
const VIEWPORT_RECONCILE_DELAY_MS = 100;

export class MessageVirtualizer {
  private blocks = new Map<HTMLElement, VirtualizedBlock>();
  private nextId = 1;
  private compactQueue: VirtualizedBlock[] = [];
  private compactScheduled = false;
  private reconcileTimer: number | null = null;
  private readonly viewportManager = new ViewportManager(() => this.getSettings());

  constructor(private getSettings: () => BrowserBoostSettings) {}

  registerMessages(messages: HTMLElement[]): void {
    for (const message of messages) {
      if (this.blocks.has(message)) continue;
      this.prepareVisibleElement(message);
      this.blocks.set(message, this.createBlock(message));
    }

    this.scheduleViewportReconcile();
  }

  reconcileViewport(): void {
    const settings = this.getSettings();
    if (!settings.enabled) return;

    const blocks = this.getLiveBlocks();
    if (blocks.length < settings.minMessagesBeforeCompact) return;

    const toDetach: VirtualizedBlock[] = [];

    for (const block of blocks) {
      const insideActiveRange = this.viewportManager.isBlockInsideActiveRange(block);

      if (insideActiveRange) {
        this.restore(block);
      } else if (!block.detached) {
        toDetach.push(block);
      }
    }

    this.compactQueue = toDetach;
    this.scheduleCompactQueue();
  }

  scheduleViewportReconcile(): void {
    if (this.reconcileTimer !== null) {
      window.clearTimeout(this.reconcileTimer);
    }

    this.reconcileTimer = window.setTimeout(() => {
      this.reconcileTimer = null;
      this.reconcileViewport();
    }, VIEWPORT_RECONCILE_DELAY_MS);
  }

  restoreAll(): void {
    this.compactQueue = [];
    this.compactScheduled = false;

    if (this.reconcileTimer !== null) {
      window.clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }

    for (const block of this.blocks.values()) {
      this.restore(block);
    }
  }

  countDetached(): number {
    return [...this.blocks.values()].filter((block) => block.detached).length;
  }

  countTotal(): number {
    return this.getLiveBlocks().length;
  }

  private scheduleCompactQueue(): void {
    const settings = this.getSettings();
    if (!settings.enabled) return;
    if (this.compactScheduled) return;
    if (this.compactQueue.length === 0) return;

    this.compactScheduled = true;
    this.runNextCompactBatch();
  }

  private runNextCompactBatch(): void {
    const runner = () => {
      const batch = this.compactQueue.splice(0, COMPACT_BATCH_SIZE);

      for (const block of batch) {
        this.detach(block);
      }

      if (this.compactQueue.length > 0) {
        this.runNextCompactBatch();
      } else {
        this.compactScheduled = false;
      }
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(runner, { timeout: 500 });
    } else {
      globalThis.setTimeout(runner, 0);
    }
  }

  private createBlock(element: HTMLElement): VirtualizedBlock {
    const placeholder = document.createElement('button');
    placeholder.type = 'button';
    placeholder.className = 'browser-boost-placeholder';
    placeholder.dataset.browserBoostPlaceholder = 'true';

    const block: VirtualizedBlock = {
      id: this.nextId++,
      element,
      placeholder,
      height: Math.max(64, element.getBoundingClientRect().height),
      detached: false,
    };

    placeholder.addEventListener('click', () => this.restore(block));

    return block;
  }

  private detach(block: VirtualizedBlock): void {
    if (block.detached) return;
    if (!document.body.contains(block.element)) return;
    if (this.viewportManager.isBlockInsideActiveRange(block)) return;

    const rect = block.element.getBoundingClientRect();
    block.height = Math.max(64, rect.height || block.height);

    block.placeholder.style.height = `${block.height}px`;
    block.placeholder.textContent = `BrowserBoost: message compacted #${block.id} — click to restore`;

    block.element.replaceWith(block.placeholder);
    block.detached = true;
  }

  private restore(block: VirtualizedBlock): void {
    if (!block.detached) return;
    if (!document.body.contains(block.placeholder)) return;

    block.placeholder.replaceWith(block.element);
    block.detached = false;
    this.prepareVisibleElement(block.element);
  }

  private prepareVisibleElement(element: HTMLElement): void {
    element.style.contentVisibility = 'auto';
    element.style.containIntrinsicSize = '80px';
  }

  private getLiveBlocks(): VirtualizedBlock[] {
    return [...this.blocks.values()].filter((block) => {
      return document.body.contains(block.element) || document.body.contains(block.placeholder);
    });
  }
}
