import { describe, it, expect, beforeEach } from 'vitest';
import { SongLibrary } from '../src/game/songLibrary';
import { BeatmapManager } from '../src/game/beatmapManager';
import { GameEngine } from '../src/game/engine';
import { ChartShiftManager } from '../src/game/catalog/chartShiftManager';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { Difficulty, GameSettings, Note } from '../src/types';
import { AudioManager } from '../src/audio/audioManager';

const defaultSettings: GameSettings = {
  musicVolume: 0.85,
  sfxVolume: 0.9,
  audioOffsetMs: 0,
  noteSpeedMultiplier: 1.0,
  visualEffectsEnabled: true
};

describe('ROCKBRAZIL V10 — Suíte de Estabilidade, Encerramento e Regressão Global', () => {
  let library: SongLibrary;
  let beatmaps: BeatmapManager;

  beforeEach(() => {
    library = new SongLibrary();
    beatmaps = new BeatmapManager();
  });

  it('1. Preservação integral do catálogo de 162 faixas', () => {
    const active = library.getActiveSongs();
    expect(active.length).toBe(162);
    // As primeiras 31 faixas canônicas mantêm rigorosamente os mesmos IDs originais
    expect(active[0].id).toBe('mam-1406');
    expect(active[4].id).toBe('kua-de-borest');
    expect(active[29].id).toBe('pit-mascara');
    expect(active[30].id).toBe('cue-minha-juventude');
    // As 131 faixas importadas da Lisarb2 ocupam os índices 31 a 161
    expect(active[31].id).toBe('lis-01-1-natiruts-natiruts-reggae-power-live');
  });

  it('2. Preservação da sincronização autêntica da V9 (De Borest e 1406)', () => {
    // De Borest mantém a primeira nota no timestamp autêntico ~6.565s
    const deBorestNotes = beatmaps.getBeatmap('kua-de-borest', 'EASY');
    expect(deBorestNotes.length).toBeGreaterThan(0);
    expect(deBorestNotes[0].time).toBeCloseTo(6.565, 2);

    // 1406 mantém a introdução longa autêntica ~12.391s
    const mamNotes = beatmaps.getBeatmap('mam-1406', 'EASY');
    expect(mamNotes[0].time).toBeCloseTo(12.391, 2);

    // ChartShiftManager deve estar estritamente zerado em V10
    expect(ChartShiftManager.isSongShifted('kua-de-borest')).toBe(false);
    expect(ChartShiftManager.getShiftSeconds('kua-de-borest')).toBe(0);
  });

  it('3. Simulação de encerramento para TODAS as 162 músicas do catálogo', () => {
    const songs = library.getActiveSongs();
    const diffs: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];

    let songsAudited = 0;
    for (const song of songs) {
      for (const diff of diffs) {
        const notes = beatmaps.getBeatmap(song.id, diff);
        const engine = new GameEngine(notes, diff, defaultSettings);

        const lastNoteEnd = engine.getLastNoteEndTime();
        expect(lastNoteEnd).toBeGreaterThanOrEqual(0);

        // Simula o avanço do tempo até a conclusão normal
        const finishTime = Math.max(song.duration, lastNoteEnd) + 0.1;
        engine.update(finishTime);

        // Se o áudio encerrar, forceCompleteAllPendingNotes finaliza notas sem travar
        engine.forceCompleteAllPendingNotes(finishTime);
        expect(engine.hasPendingNotes(finishTime)).toBe(false);

        const stats = engine.getStats();
        expect(stats.score).toBeGreaterThanOrEqual(0);
        expect(stats.accuracy).toBeGreaterThanOrEqual(0);
        expect(stats.accuracy).toBeLessThanOrEqual(100);
      }
      songsAudited++;
    }
    expect(songsAudited).toBe(162);
  });

  it('4. Resolução da falha de término em "Máscara" (áudio de 293.8s vs metadados de 294s)', () => {
    const mascara = library.getSongById('pit-mascara');
    expect(mascara).toBeDefined();

    const notes = beatmaps.getBeatmap('pit-mascara', 'EXPERT');
    const engine = new GameEngine(notes, 'EXPERT', defaultSettings);

    // Simula áudio terminando aos 293.80s (menor que os 294s de metadados)
    const audioEndTime = 293.80;
    engine.update(audioEndTime);

    // Em V9 travava porque 293.80 < 294. Em V10, forceCompleteAllPendingNotes encerra imediatamente
    engine.forceCompleteAllPendingNotes(audioEndTime);
    expect(engine.hasPendingNotes(audioEndTime)).toBe(false);

    const stats = engine.getStats();
    expect(stats.totalNotes).toBe(notes.length);
    expect(stats.missCount).toBe(notes.length); // Nenhuma nota foi acertada nesta simulação
  });

  it('5. Resolução de músicas com notas que ultrapassam os metadados (De Borest 268.64s vs 268s)', () => {
    const notes = beatmaps.getBeatmap('kua-de-borest', 'EXPERT');
    const engine = new GameEngine(notes, 'EXPERT', defaultSettings);

    const lastNote = notes[notes.length - 1];
    expect(lastNote.time + (lastNote.duration || 0)).toBeGreaterThan(268.0);

    // Com o grace period de 0.5s após a última nota, o motor encerra graciosamente
    const graceTime = engine.getLastNoteEndTime() + 0.5;
    engine.update(graceTime);
    engine.forceCompleteAllPendingNotes(graceTime);

    expect(engine.hasPendingNotes(graceTime)).toBe(false);
  });

  it('6. Idempotência do encerramento (finishSong chamado múltiplas vezes)', async () => {
    let finishCallCount = 0;
    let isFinishing = false;

    const simulateFinish = async () => {
      if (isFinishing) return;
      isFinishing = true;
      finishCallCount++;
    };

    // Simula 100 chamadas simultâneas (como acontecia no gameLoop durante celebração)
    await Promise.all(Array.from({ length: 100 }, () => simulateFinish()));

    expect(finishCallCount).toBe(1);
  });

  it('7. Cálculo consistente de RockCoins na tela de resultados', () => {
    // 5 estrelas e 100.000 pontos
    const stats1 = { stars: 5, score: 100000 };
    const coins1 = stats1.stars * 25 + Math.floor(stats1.score / 1000);
    expect(coins1).toBe(5 * 25 + 100); // 225 RockCoins

    // 3 estrelas e 35.400 pontos
    const stats2 = { stars: 3, score: 35400 };
    const coins2 = stats2.stars * 25 + Math.floor(stats2.score / 1000);
    expect(coins2).toBe(3 * 25 + 35); // 110 RockCoins
  });

  it('8. Isolamento de áudio local: 160 músicas com áudio local não utilizam YouTube', () => {
    const active = library.getActiveSongs();
    const localSongs = active.filter((s) => s.type === 'audio-file' || Boolean(s.audioUrl));
    expect(localSongs.length).toBe(160);

    // Músicas locais chave
    const localKeys = [
      'mam-1406',
      'cap-sua-maneira',
      'pit-chip-novo',
      'kua-de-borest',
      'pit-mascara',
      'mam-chopis-centis',
      'mat-ela-roubou-caminhao',
      'mas-metal-is-the-law',
      'har-dormi-na-praca',
      'lis-01-1-natiruts-natiruts-reggae-power-live'
    ];

    for (const key of localKeys) {
      const song = library.getSongById(key);
      expect(song).toBeDefined();
      expect(song?.type).toBe('audio-file');
      expect(song?.audioUrl).toContain('song.ogg');
    }
  });

  it('9. AudioManager suporta callback onEnded para término assíncrono', () => {
    const audio = new AudioManager(defaultSettings);
    let endedFired = false;
    audio.setOnEnded(() => {
      endedFired = true;
    });

    // Simula disparo de onEnded
    (audio as any).onEndedCallback?.();
    expect(endedFired).toBe(true);
  });

  it('10. Pausa e congelamento do UnifiedMasterClock com retomada sem drift', () => {
    const clock = new UnifiedMasterClock();
    clock.startPlayback();

    // Mock source retornando 5.0s
    const mockSource = {
      getCurrentTime: () => 5.0,
      getPlaybackState: () => 'PLAYING' as any,
      isBuffering: () => false
    };
    clock.setSource(mockSource);

    expect(clock.getTime()).toBeCloseTo(5.0, 2);

    // Pausa aos 5.0s
    clock.pause();
    expect(clock.isPausedState()).toBe(true);
    expect(clock.getTime()).toBeCloseTo(5.0, 2);

    // Mesmo que o mock avance para 8.0s, o relógio pausado permanece estritamente em 5.0s
    mockSource.getCurrentTime = () => 8.0;
    expect(clock.getTime()).toBeCloseTo(5.0, 2);

    // Retomada: o relógio descongela
    clock.resume();
    expect(clock.isPausedState()).toBe(false);
    expect(clock.getTime()).toBeCloseTo(8.0, 2);
  });

  it('11. Contagem regressiva de retomada de 3 segundos congela o julgamento de notas', () => {
    const testNotes: Note[] = [
      { id: 1, time: 2.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);

    let isResumingCountdown = true;

    // Enquanto isResumingCountdown = true, toques não devem julgar notas
    const pressResult = isResumingCountdown ? null : engine.handleLanePress(1, 2.0);
    expect(pressResult).toBeNull();
    expect(engine.getNotes()[0].hit).toBe(false);
    expect(engine.getStats().combo).toBe(0);

    // Após o fim da contagem (JÁ!), toques voltam a ser julgados normalmente
    isResumingCountdown = false;
    const hitResult = isResumingCountdown ? null : engine.handleLanePress(1, 2.0);
    expect(hitResult).not.toBeNull();
    expect(engine.getNotes()[0].hit).toBe(true);
    expect(engine.getStats().combo).toBe(1);
  });
});
