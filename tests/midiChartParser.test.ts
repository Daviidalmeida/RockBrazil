import { describe, it, expect, beforeAll } from 'vitest';
import { MidiChartParser } from '../src/audio/midiChartParser';
import * as fs from 'fs';
import * as path from 'path';
import { ensureFixtureFilesExist } from './fixtures/midiFixture';

describe('MidiChartParser - Leitor de Gráficos MIDI do Rock Band / Clone Hero', () => {
  let midiPath: string;
  let iniPath: string;

  beforeAll(() => {
    const fixtures = ensureFixtureFilesExist();
    midiPath = fixtures.midiPath;
    iniPath = fixtures.iniPath;
  });

  it('deve extrair metadados do song.ini corretamente', () => {
    expect(fs.existsSync(iniPath)).toBe(true);
    const iniText = fs.readFileSync(iniPath, 'utf8');
    const meta = MidiChartParser.parseSongIni(iniText);
    expect(meta.name).toBe('Synthetic Rock Test');
    expect(meta.artist).toBe('RockBrazil Engine');
    expect(meta.charter).toBe('RockBrazil Core');
  });

  it('deve analisar arquivo MIDI sintético e gerar notas para todas as 4 dificuldades', () => {
    expect(fs.existsSync(midiPath)).toBe(true);
    const buffer = fs.readFileSync(midiPath);
    const parsed = MidiChartParser.parse(buffer);

    expect(parsed.EASY.length).toBe(12);
    expect(parsed.MEDIUM.length).toBe(24);
    expect(parsed.HARD.length).toBe(36);
    expect(parsed.EXPERT.length).toBe(48);

    expect(parsed.duration).toBeGreaterThanOrEqual(20);
    expect(parsed.bpm).toBe(120);

    // Validar notas individuais
    const firstNote = parsed.EXPERT[0];
    expect(firstNote.time).toBeGreaterThan(0);
    expect(firstNote.lane).toBeGreaterThanOrEqual(0);
    expect(firstNote.lane).toBeLessThanOrEqual(4);

    // Verificar que existem notas com sustentação
    const sustains = parsed.EXPERT.filter((n) => n.duration > 0);
    expect(sustains.length).toBeGreaterThan(0);
  });
});
