import type { BrowserBoostSettings } from '../settings';
import type { VirtualizedBlock } from './virtualized_block';

export class MessageVirtualizer {
  private blocks = new Map<HTMLElement, VirtualizedBlock>();
  private nextId = 1;

  constructor(private getSettings: () => BrowserBoostSettings) {}

  registerMessages(messages: HTMLElement[]): void {
    for (const message of messages) {
      if (this.blocks.has(message)) continue;
      this.blocks.set(message, this.createBlock(message));
    }

    this.compact();
  }

  compact(): void {
    const settings = this.getSettings();
    if (!settings.enabled) return;

    const blocks = this.getLiveBlocks();

    if (blocks.length < settings.minMessagesBeforeCompact) return;

    const compactUntil = Math.max(0, blocks.length - settings.keepLastMessages);

    for (let index = 0; index < compactUntil; index++) {
      const block = blocks[index];
      if (!block || block.detached) continue;
      this.detach(block);
    }
  }

  restoreAll(): void {
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
  }

  private getLiveBlocks(): VirtualizedBlock[] {
    return [...this.blocks.values()].filter((block) => {
      return document.body.contains(block.element) || document.body.contains(block.placeholder);
    });
  }
}
