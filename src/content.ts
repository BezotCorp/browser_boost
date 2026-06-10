type VirtualizedMessage = {
  id: number;
  element: HTMLElement;
  placeholder: HTMLElement;
  height: number;
  detached: boolean;
};

const CONFIG = {
  keepLastMessages: 40,
  minMessagesBeforeCompact: 70,
  scanIntervalMs: 1500,
};

class ChatGptDomBoost {
  private messages = new Map<HTMLElement, VirtualizedMessage>();
  private nextId = 1;
  private enabled = true;
  private observer: MutationObserver | null = null;
  private scanTimer: number | null = null;

  start(): void {
    this.injectToolbar();
    this.scan();
    this.observe();
    this.scanTimer = window.setInterval(() => this.scan(), CONFIG.scanIntervalMs);
  }

  private observe(): void {
    this.observer?.disconnect();

    this.observer = new MutationObserver(() => {
      window.requestIdleCallback?.(() => this.scan()) ?? window.setTimeout(() => this.scan(), 100);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private scan(): void {
    if (!this.enabled) return;

    const elements = this.findMessageElements();

    for (const element of elements) {
      if (!this.messages.has(element)) {
        this.register(element);
      }
    }

    this.compactOldMessages();
  }

  private findMessageElements(): HTMLElement[] {
    const directMessages = [...document.querySelectorAll<HTMLElement>('[data-message-author-role]')];

    if (directMessages.length > 0) {
      return this.uniqueVisible(directMessages);
    }

    const fallbackMessages = [
      ...document.querySelectorAll<HTMLElement>('main article'),
      ...document.querySelectorAll<HTMLElement>("main [class*='group']"),
    ];

    return this.uniqueVisible(fallbackMessages).filter((element) => {
      const text = element.innerText?.trim() ?? '';
      return text.length > 20;
    });
  }

  private uniqueVisible(elements: HTMLElement[]): HTMLElement[] {
    const seen = new Set<HTMLElement>();

    return elements.filter((element) => {
      if (seen.has(element)) return false;
      seen.add(element);

      if (!document.body.contains(element)) return false;
      if (element.dataset.cgptDomBoostPlaceholder === 'true') return false;

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  private register(element: HTMLElement): void {
    const placeholder = document.createElement('div');
    placeholder.className = 'cgpt-dom-boost-placeholder';
    placeholder.dataset.cgptDomBoostPlaceholder = 'true';

    const id = this.nextId++;

    const record: VirtualizedMessage = {
      id,
      element,
      placeholder,
      height: Math.max(64, element.getBoundingClientRect().height),
      detached: false,
    };

    placeholder.addEventListener('click', () => this.restore(record));

    this.messages.set(element, record);
  }

  private compactOldMessages(): void {
    const records = [...this.messages.values()].filter(
      (record) => document.body.contains(record.element) || document.body.contains(record.placeholder),
    );

    if (records.length < CONFIG.minMessagesBeforeCompact) return;

    const maxCompactIndex = records.length - CONFIG.keepLastMessages;

    for (let index = 0; index < maxCompactIndex; index++) {
      const record = records[index];
      if (!record || record.detached) continue;

      this.compact(record);
    }
  }

  private compact(record: VirtualizedMessage): void {
    if (!document.body.contains(record.element)) return;

    const rect = record.element.getBoundingClientRect();
    record.height = Math.max(record.height, rect.height, 64);

    record.placeholder.style.height = `${record.height}px`;
    record.placeholder.textContent = `Message compacté #${record.id} — cliquer pour restaurer`;

    record.element.replaceWith(record.placeholder);
    record.detached = true;
  }

  private restore(record: VirtualizedMessage): void {
    if (!record.detached) return;
    if (!document.body.contains(record.placeholder)) return;

    record.placeholder.replaceWith(record.element);
    record.detached = false;
  }

  private restoreAll(): void {
    for (const record of this.messages.values()) {
      this.restore(record);
    }
  }

  private toggle(): void {
    this.enabled = !this.enabled;

    if (!this.enabled) {
      this.restoreAll();
    } else {
      this.scan();
    }

    this.updateToolbar();
  }

  private injectToolbar(): void {
    if (document.querySelector('.cgpt-dom-boost-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'cgpt-dom-boost-toolbar';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.dataset.action = 'toggle';
    toggleButton.addEventListener('click', () => this.toggle());

    const restoreButton = document.createElement('button');
    restoreButton.type = 'button';
    restoreButton.textContent = 'Restore all';
    restoreButton.addEventListener('click', () => this.restoreAll());

    toolbar.append(toggleButton, restoreButton);
    document.body.appendChild(toolbar);

    this.updateToolbar();
  }

  private updateToolbar(): void {
    const button = document.querySelector<HTMLButtonElement>(".cgpt-dom-boost-toolbar button[data-action='toggle']");

    if (!button) return;

    button.textContent = this.enabled ? 'DOM Boost ON' : 'DOM Boost OFF';
  }
}

new ChatGptDomBoost().start();
