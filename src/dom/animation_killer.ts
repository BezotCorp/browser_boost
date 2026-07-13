// dom/animation_killer.ts
export class AnimationKiller {
  scan(root: HTMLElement): void {
    for (const anim of root.getAnimations({ subtree: true })) {
      if (!(anim instanceof CSSAnimation)) continue;

      const timing = anim.effect?.getComputedTiming();
      if (timing?.iterations !== Infinity) continue;

      const target = anim.effect instanceof KeyframeEffect ? anim.effect.target : null;
      anim.cancel();

      // Filet de sécurité : si l'état "de base" sans animation est invisible
      // (le point comptait sur l'animation pour apparaître), on force sa
      // visibilité — sinon l'indicateur disparaît complètement, ce qui
      // ressemble à un plantage plutôt qu'à un "toujours en cours".
      if (target instanceof HTMLElement) {
        const opacity = getComputedStyle(target).opacity;
        if (opacity === '0') {
          target.style.opacity = '1';
        }
      }
    }
  }
}
