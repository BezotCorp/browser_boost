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

  // Restaure tout et libère tous les observateurs.
  // Appeler reset() plutôt que deactivate() lors d'une navigation SPA
  // pour vider aussi la map de blocs.
  deactivate(): void {
    if (this.registrationRaf !== null) {
      cancelAnimationFrame(this.registrationRaf);
      this.registrationRaf = null;
    }

    this.pendingRegistration = [];

    for (const block of this.blocks.values()) {
      block.resizeObserver?.disconnect();
      block.resizeObserver = null;
      block.observed = false;
      this.restore(block);
    }

    this.viewportManager?.disconnect();
    this.viewportManager = null;
  }

  // Utilisé lors des navigations SPA pour repartir d'un état propre.
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

    // Toutes les lectures getBoundingClientRect en un seul layout pass,
    // avant toute écriture — évite les forced reflows.
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
        resizeObserver: null,
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

    // IntersectionObserver gère la visibilité → compact/restore natif.
    vm.observe(block.element, (visible) => {
      if (visible) this.restore(block);
      else this.compact(block);
    });

    // ResizeObserver maintient la hauteur à jour pendant que l'élément
    // est visible — évite les scroll jumps sur les blocs à contenu dynamique
    // (code blocks qui s'expandent, images qui chargent tardivement, etc.)
    const ro = new ResizeObserver(([entry]) => {
      if (!block.compacted) {
        block.height = Math.max(64, entry.contentRect.height);
      }
    });
    ro.observe(block.element);
    block.resizeObserver = ro;
  }

  private compact(block: VirtualizedBlock): void {
    if (block.compacted) return;
    // height explicite préserve la scroll position.
    // content-visibility:hidden skipe le rendu du sous-arbre entier —
    // React ne touche pas à la structure DOM.
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
