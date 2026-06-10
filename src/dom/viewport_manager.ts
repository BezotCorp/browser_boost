import type { BrowserBoostSettings } from '../settings';
import type { VirtualizedBlock } from './virtualized_block';

export type ViewportRange = {
  top: number;
  bottom: number;
};

export class ViewportManager {
  constructor(private readonly getSettings: () => BrowserBoostSettings) {}

  getActiveRange(): ViewportRange {
    const settings = this.getSettings();
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 800);
    const buffer = viewportHeight * settings.viewportBufferScreens;
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;

    return {
      top: Math.max(0, scrollTop - buffer),
      bottom: scrollTop + viewportHeight + buffer,
    };
  }

  isBlockInsideActiveRange(block: VirtualizedBlock): boolean {
    const range = this.getActiveRange();
    const rect = this.getCurrentRect(block);
    const top = rect.top + (window.scrollY || document.documentElement.scrollTop || 0);
    const bottom = top + rect.height;

    return bottom >= range.top && top <= range.bottom;
  }

  private getCurrentRect(block: VirtualizedBlock): DOMRect | { top: number; height: number } {
    if (block.detached) {
      return block.placeholder.getBoundingClientRect();
    }

    return block.element.getBoundingClientRect();
  }
}
