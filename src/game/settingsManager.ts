import { GameSettings } from '../types';

export class SettingsManager {
  private settings: GameSettings;

  constructor() {
    this.settings = this.loadSettings();
  }

  getSettings(): GameSettings {
    return { ...this.settings };
  }

  saveSettings(newSettings: Partial<GameSettings>): GameSettings {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem('rockbrazil_settings', JSON.stringify(this.settings));
    } catch {
      // Ignore
    }
    return this.getSettings();
  }

  private loadSettings(): GameSettings {
    const defaultSettings: GameSettings = {
      musicVolume: 0.85,
      sfxVolume: 0.9,
      audioOffsetMs: 0,
      noteSpeedMultiplier: 1.0,
      visualEffectsEnabled: true,
      effectsMode: 'NORMAL',
      muteOnMiss: true
    };

    try {
      const stored = localStorage.getItem('rockbrazil_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Respeita explicitamente true ou false salvos anteriormente.
        // Se a propriedade nunca foi salva (undefined ou null), define como true por padrão.
        const muteOnMiss = parsed.muteOnMiss !== undefined && parsed.muteOnMiss !== null
          ? Boolean(parsed.muteOnMiss)
          : true;
        return { ...defaultSettings, ...parsed, muteOnMiss };
      }
    } catch {
      // Ignore
    }

    return defaultSettings;
  }
}
