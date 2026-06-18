export type VirtualizedBlock = {
  readonly id: number;
  readonly element: HTMLElement;
  height: number;
  compacted: boolean;
  observed: boolean;
  resizeObserver: ResizeObserver | null;
};
