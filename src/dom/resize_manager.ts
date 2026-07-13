// resize_manager.ts
export class ResizeManager {
  private readonly observer: ResizeObserver;
  private readonly callbacks = new Map<Element, (rect: DOMRectReadOnly) => void>();

  constructor() {
    this.observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.callbacks.get(entry.target)?.(entry.contentRect);
      }
    });
  }

  observe(element: Element, onResize: (rect: DOMRectReadOnly) => void): void {
    this.callbacks.set(element, onResize);
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
