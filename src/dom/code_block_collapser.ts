const STABLE_DELAY_MS = 800;
const PREVIEW_LINES = 6;

type CodeBlock = {
  readonly pre: HTMLElement;
  readonly code: HTMLElement;
  readonly fragment: DocumentFragment;
  readonly resizeObserver: ResizeObserver;
  readonly button: HTMLButtonElement;
  collapsed: boolean;
};

export class CodeBlockCollapser {
  private readonly blocks = new Map<HTMLElement, CodeBlock>();
  private readonly mutationObserver: MutationObserver;
  private scanRaf: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly thresholdPx: number,
  ) {
    this.mutationObserver = new MutationObserver(() => this.scheduleScan());
    this.mutationObserver.observe(root, { childList: true, subtree: true });
    this.scheduleScan();
  }

  disconnect(): void {
    if (this.scanRaf !== null) {
      cancelAnimationFrame(this.scanRaf);
      this.scanRaf = null;
    }

    this.mutationObserver.disconnect();

    for (const block of this.blocks.values()) {
      this.restore(block);
    }

    this.blocks.clear();
  }

  private scheduleScan(): void {
    if (this.scanRaf !== null) return;
    this.scanRaf = requestAnimationFrame(() => {
      this.scanRaf = null;
      this.scan();
    });
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

      // Attend la stabilisation de la hauteur — signale la fin du streaming.
      stableTimer = window.setTimeout(() => {
        stableTimer = null;
        if (!this.blocks.has(pre)) this.collapse(pre, ro);
      }, STABLE_DELAY_MS);
    });

    ro.observe(pre);
  }

  private collapse(pre: HTMLElement, resizeObserver: ResizeObserver): void {
    const code = pre.querySelector<HTMLElement>('code');
    if (code === null) return;

    const fullText = code.textContent ?? '';
    const lines = fullText.split('\n');
    const lineCount = lines.length;

    // Snapshot statique de la live NodeList avant de déplacer quoi que ce soit.
    const nodes = [...code.childNodes];

    // Déplace tous les nœuds syntaxiqués (spans, etc.) dans un DocumentFragment.
    // Hors du DOM = zéro paint, zéro layout, zéro style recalc côté renderer.
    // React ne voit rien : on opère sur les feuilles <code>, pas sur les
    // containers que React reconcilie.
    const fragment = new DocumentFragment();
    fragment.append(...nodes);

    // Remplace par un aperçu texte brut : un seul text node, aucun span.
    code.textContent =
      lines.slice(0, PREVIEW_LINES).join('\n') +
      (lineCount > PREVIEW_LINES ? '\n…' : '');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'browser-boost-show-more';
    button.textContent = `Show all ${lineCount} lines`;

    const block: CodeBlock = {
      pre,
      code,
      fragment,
      resizeObserver,
      button,
      collapsed: true,
    };

    this.blocks.set(pre, block);
    button.addEventListener('click', () => this.restore(block));
    pre.appendChild(button);
  }

  private restore(block: CodeBlock): void {
    if (!block.collapsed) return;

    // Vide le text node de preview et remet les nœuds originaux —
    // syntax highlighting intact, aucune re-parse.
    block.code.textContent = '';
    block.code.append(...block.fragment.childNodes);
    block.button.remove();
    block.resizeObserver.disconnect();
    block.collapsed = false;
    this.blocks.delete(block.pre);
  }
}
