export class ViewportManager {
  private readonly observer: IntersectionObserver;
  private readonly callbacks = new Map<Element, (visible: boolean) => void>();

  constructor(bufferScreens: number) {
    const pct = Math.round(bufferScreens * 100);
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.callbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { rootMargin: `${pct}% 0px`, threshold: 0 },
    );
  }

  observe(element: Element, onChange: (visible: boolean) => void): void {
    this.callbacks.set(element, onChange);
    this.observer.observe(element);
  }

  unobserve(element: Element): void {
    this.callbacks.delete(element);
    this.observer.unobserve(element);
  }

  disconnect(): void {
    this.observer.disconnect();
    this.callbacks.clear();
  }
}
