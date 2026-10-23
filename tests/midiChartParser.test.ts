import { describe, it, expect } from 'vitest';
import { MidiChartParser } from '../src/audio/midiChartParser';
import * as fs from 'fs';
import * as path from 'path';

describe('MidiChartParser - Leitor de Gráficos MIDI do Rock Band / Clone Hero', () => {
  const midiPath = path.resolve(__dirname, '../public/custom-songs/acdc_tnt/ACDC - T.N.T/notes.mid');
  const iniPath = path.resolve(__dirname, '../public/custom-songs/acdc_tnt/ACDC - T.N.T/song.ini');

  it('deve extrair metadados do song.ini corretamente', () => {
    if (fs.existsSync(iniPath)) {
      const iniText = fs.readFileSync(iniPath, 'utf8');
      const meta = MidiChartParser.parseSongIni(iniText);
      expect(meta.name).toBe('T.N.T');
      expect(meta.artist).toBe('ACDC');
      expect(meta.charter).toBe('autochart.eu');
    }
  });

  it('deve analisar notes.mid e gerar notas para todas as 4 dificuldades', () => {
    if (fs.existsSync(midiPath)) {
      const buffer = fs.readFileSync(midiPath);
      const parsed = MidiChartParser.parse(buffer);

      expect(parsed.EASY.length).toBe(161);
      expect(parsed.MEDIUM.length).toBe(305);
      expect(parsed.HARD.length).toBe(409);
      expect(parsed.EXPERT.length).toBe(599);

      expect(parsed.duration).toBeGreaterThan(210);
      expect(parsed.bpm).toBe(124);

      // Validar notas individuais
      const firstNote = parsed.EXPERT[0];
      expect(firstNote.time).toBeGreaterThan(3.0);
      expect(firstNote.lane).toBeGreaterThanOrEqual(0);
      expect(firstNote.lane).toBeLessThanOrEqual(4);

      // Verificar que existem notas com sustentação
      const sustains = parsed.EXPERT.filter((n) => n.duration > 0);
      expect(sustains.length).toBeGreaterThan(0);
    }
  });
});
