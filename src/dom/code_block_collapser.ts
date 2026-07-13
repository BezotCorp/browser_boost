const STABLE_DELAY_MS = 800;

type CodeBlockWatch = {
  readonly pre: HTMLElement;
  readonly resizeObserver: ResizeObserver;
  fragment: DocumentFragment | null;
  button: HTMLButtonElement | null;
  collapsed: boolean;
};

export class CodeBlockCollapser {
  private readonly blocks = new Map<HTMLElement, CodeBlockWatch>();
  private readonly mutationObserver: MutationObserver;
  private scanRaf: number | null = null;
  private pendingRecords: MutationRecord[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly thresholdPx: number,
  ) {
    this.mutationObserver = new MutationObserver((records) => this.scheduleScan(records));
    this.mutationObserver.observe(root, { childList: true, subtree: true });
    this.scheduleScan([]);
  }

  disconnect(): void {
    if (this.scanRaf !== null) {
      cancelAnimationFrame(this.scanRaf);
      this.scanRaf = null;
    }

    this.pendingRecords = [];
    this.mutationObserver.disconnect();

    // Déconnecte TOUS les ResizeObserver enregistrés, pas seulement ceux
    // qui ont fini par collapser — sinon les blocs jamais collapsés
    // (petits snippets sous le seuil) fuient indéfiniment, avec une
    // référence forte au <pre> qui empêche le GC de le libérer.
    for (const watch of this.blocks.values()) {
      watch.resizeObserver.disconnect();
      if (watch.collapsed) this.restore(watch);
    }

    this.blocks.clear();
  }

  private scheduleScan(records: MutationRecord[]): void {
    this.pendingRecords.push(...records);
    if (this.scanRaf !== null) return;
    this.scanRaf = requestAnimationFrame(() => {
      this.scanRaf = null;
      const toProcess = this.pendingRecords.splice(0);
      this.scan();
      this.pruneRemoved(toProcess);
    });
  }

  private pruneRemoved(records: MutationRecord[]): void {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const pres = node.matches('pre') ? [node] : [...node.querySelectorAll<HTMLElement>('pre')];
        for (const pre of pres) {
          const watch = this.blocks.get(pre);
          if (watch === undefined) continue;
          watch.resizeObserver.disconnect();
          this.blocks.delete(pre);
        }
      }
    }
  }

  private scan(): void {
    for (const pre of this.root.querySelectorAll<HTMLElement>('pre')) {
      if (!this.blocks.has(pre)) this.watchCodeBlock(pre);
    }
  }

  private watchCodeBlock(pre: HTMLElement): void {
    let stableTimer: number | null = null;

    const ro = new ResizeObserver(([entry]) => {
      if (stableTimer !== null) window.clearTimeout(stableTimer);
      if (entry.contentRect.height < this.thresholdPx) return;

      stableTimer = window.setTimeout(() => {
        stableTimer = null;
        const watch = this.blocks.get(pre);
        if (watch !== undefined && !watch.collapsed) this.collapse(watch);
      }, STABLE_DELAY_MS);
    });

    ro.observe(pre);

    // Enregistré dès l'observation, pas seulement au collapse — c'est ça
    // qui permet à disconnect()/pruneRemoved() de le retrouver et de le
    // nettoyer même s'il ne dépasse jamais le seuil.
    this.blocks.set(pre, {
      pre,
      resizeObserver: ro,
      fragment: null,
      button: null,
      collapsed: false,
    });
  }

  private collapse(watch: CodeBlockWatch): void {
    const code = watch.pre.querySelector<HTMLElement>('code');
    if (code === null) return;

    const lineCount = (code.textContent ?? '').split('\n').length;
    const nodes = [...code.childNodes];
    const fragment = new DocumentFragment();
    fragment.append(...nodes);
    code.textContent = '';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'browser-boost-show-more';
    button.textContent = `Afficher (${lineCount} lignes masquées)`;
    button.addEventListener('click', () => this.restore(watch));

    watch.fragment = fragment;
    watch.button = button;
    watch.collapsed = true;
    watch.pre.appendChild(button);
  }

  private restore(watch: CodeBlockWatch): void {
    if (!watch.collapsed || watch.fragment === null || watch.button === null) return;

    const code = watch.pre.querySelector<HTMLElement>('code');
    if (code !== null) {
      code.textContent = '';
      code.append(...watch.fragment.childNodes);
    }

    watch.button.remove();
    watch.fragment = null;
    watch.button = null;
    watch.collapsed = false;
  }
}
