import { GameSettings } from '../types';

export function reducedEffects(settings?: GameSettings): boolean {
  return settings?.effectsMode === 'REDUCED' || settings?.visualEffectsEnabled === false ||
    (typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
}

export function applyEffectsPreference(settings: GameSettings): boolean {
  const reduced = reducedEffects(settings);
  if (typeof document !== 'undefined') document.documentElement.dataset.effects = reduced ? 'reduced' : 'normal';
  return reduced;
}
