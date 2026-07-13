export class AnimationKiller {
  scan(root: Element): void {
    for (const anim of root.getAnimations({ subtree: true })) {
      if (!(anim instanceof CSSAnimation)) continue;

      const timing = anim.effect?.getComputedTiming();
      if (timing?.iterations !== Infinity) continue;

      const target = anim.effect instanceof KeyframeEffect ? anim.effect.target : null;
      anim.cancel();

      if (target instanceof HTMLElement) {
        const opacity = getComputedStyle(target).opacity;
        if (opacity === '0') {
          target.style.opacity = '1';
        }
      }
    }
  }
}
