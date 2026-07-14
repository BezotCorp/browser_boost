const BUTTON_SELECTOR = '#composer-submit-button';
const POLL_MS = 250;

export class GenerationWatcher {
  private observer: MutationObserver | null = null;
  private button: HTMLElement | null = null;
  private pollTimer: number | null = null;

  // Observe le bouton unique du composer (stop pendant génération, send au
  // repos) via son data-testid. Signal net et immédiat, sans délai arbitraire
  // à deviner — remplace l'heuristique de silence utilisée jusqu'ici.
  watch(onStateChange: (isGenerating: boolean) => void): void {
    this.findButton(onStateChange);
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.button = null;

    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private findButton(onStateChange: (isGenerating: boolean) => void): void {
    const button = document.querySelector<HTMLElement>(BUTTON_SELECTOR);

    if (button === null) {
      this.pollTimer = window.setTimeout(() => this.findButton(onStateChange), POLL_MS);
      return;
    }

    this.button = button;
    onStateChange(this.isGenerating(button));

    this.observer = new MutationObserver(() => {
      if (this.button === null) return;
      onStateChange(this.isGenerating(this.button));
    });

    this.observer.observe(button, { attributes: true, attributeFilter: ['data-testid'] });
  }

  private isGenerating(button: HTMLElement): boolean {
    return button.dataset.testid === 'stop-button';
  }
}
