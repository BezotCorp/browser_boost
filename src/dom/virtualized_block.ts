export type VirtualizedBlock = {
  readonly id: number;
  readonly element: HTMLElement;
  height: number; // cached au moment de l'enregistrement
  compacted: boolean;
  observed: boolean; // enregistré dans l'IntersectionObserver
};
