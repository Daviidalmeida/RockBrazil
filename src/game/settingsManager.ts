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
      visualEffectsEnabled: true
    };

    try {
      const stored = localStorage.getItem('rockbrazil_settings');
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore
    }

    return defaultSettings;
  }
}
