import { PlaybackState } from '../../../types';
import { AudioTimeSource } from '../../timeline/musicTimeline';

export interface TelemetryDiagnostics {
  rawTime: number;
  estimatedTime: number;
  lastIntervalMs: number;
  averageIntervalMs: number;
  jitterMs: number;
  isExtrapolating: boolean;
  sampleCount: number;
  playbackState: PlaybackState;
  isBuffering: boolean;
}

/**
 * ROCKBRAZIL V14.1 — ADAPTIVE CLOCK ESTIMATOR
 *
 * Soluciona de forma arquitetural a quantização de ~200ms do IFrame do YouTube.
 *
 * Funcionamento:
 * 1. Amostra o tempo retornado pela API oficial do YouTube (source.getCurrentTime()).
 * 2. Registra o instante exato de recebimento via performance.now().
 * 3. Entre atualizações discretas (a cada ~200ms), extrapola suavemente o tempo
 *    com base no relógio monotônico local (performance.now()).
 * 4. Ao receber uma nova amostra:
 *    - Se for um seek ou salto (> 1.5s ou < -0.5s), sincroniza imediatamente.
 *    - Se for progressão normal, calcula o jitter e ajusta a taxa sem saltos bruscos.
 * 5. Durante BUFFERING ou PAUSE:
 *    - O estimador congela imediatamente, evitando avanço indevido das notas.
 *    - Na retomada, reinicia a contagem sem saltos retrocessivos ou acumulados.
 * 6. Proteção contra travamento silencioso:
 *    - Se nenhuma amostra chegar em mais de 350ms em PLAYING, pausa a extrapolação
 *      até que uma nova telemetria confirme que o vídeo realmente avançou.
 */
export class AdaptiveClockEstimator {
  private lastRawTime = 0;
  private lastSamplePerfTime = 0;
  private sampleIntervals: number[] = [];
  private lastIntervalMs = 200;
  private averageIntervalMs = 200;
  private jitterMs = 0;
  private sampleCount = 0;
  private isExtrapolating = false;
  private lastReportedEstimated = 0;
  private isFrozen = false;
  private frozenEstimatedTime = 0;

  // Limite máximo de extrapolação autônoma sem confirmação de amostra (segurança contra stall silencioso)
  private readonly MAX_UNCONFIRMED_EXTRAPOLATION_SEC = 0.350;

  /**
   * Atualiza a observação temporal e retorna o tempo estimado contínuo (em segundos).
   */
  public update(source: AudioTimeSource | null, perfNow: number = performance.now()): number {
    if (!source) {
      return this.lastReportedEstimated;
    }

    const state = source.getPlaybackState();
    const isBuffering = source.isBuffering();

    // 1. Se estiver pausado ou em buffering, congela imediatamente
    if (state === PlaybackState.BUFFERING || isBuffering || state === PlaybackState.PAUSED) {
      if (!this.isFrozen) {
        this.isFrozen = true;
        this.frozenEstimatedTime = this.lastReportedEstimated;
      }
      this.isExtrapolating = false;
      return this.frozenEstimatedTime;
    }

    // Se estava congelado e acabou de retomar, reinicializa a referência local
    if (this.isFrozen) {
      this.isFrozen = false;
      this.lastSamplePerfTime = perfNow;
    }

    // 2. Lê a telemetria bruta do player
    const rawTime = source.getCurrentTime();

    // 3. Detecta nova amostra recebida do player
    if (rawTime !== this.lastRawTime || this.sampleCount === 0) {
      if (this.sampleCount > 0 && this.lastSamplePerfTime > 0) {
        const interval = perfNow - this.lastSamplePerfTime;
        const deltaRaw = rawTime - this.lastRawTime;

        // Se for um salto abrupto (seek ou looping), reinicializa o estimador
        if (deltaRaw < -0.5 || deltaRaw > 1.5) {
          this.lastReportedEstimated = rawTime;
          this.sampleIntervals = [];
        } else if (interval > 10 && interval < 1000) {
          // Atualiza estatísticas de intervalo e jitter
          this.lastIntervalMs = interval;
          this.sampleIntervals.push(interval);
          if (this.sampleIntervals.length > 10) {
            this.sampleIntervals.shift();
          }

          const sum = this.sampleIntervals.reduce((a, b) => a + b, 0);
          this.averageIntervalMs = sum / this.sampleIntervals.length;

          // Variância / Desvio padrão do jitter
          const squareDiffs = this.sampleIntervals.map((val) => Math.pow(val - this.averageIntervalMs, 2));
          this.jitterMs = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / this.sampleIntervals.length);
        }
      }

      this.lastRawTime = rawTime;
      this.lastSamplePerfTime = perfNow;
      this.sampleCount++;
      this.isExtrapolating = false;

      // Garante monotonia: nunca volta no tempo
      this.lastReportedEstimated = Math.max(this.lastReportedEstimated, rawTime);
      return this.lastReportedEstimated;
    }

    // 4. Extrapolação suave entre amostras (apenas se PLAYING e sem buffering)
    if (state === PlaybackState.PLAYING && this.lastSamplePerfTime > 0) {
      const elapsedSec = (perfNow - this.lastSamplePerfTime) / 1000;

      // Proteção contra extrapolação excessiva se o player parar sem disparar evento
      const safeElapsedSec = Math.min(elapsedSec, this.MAX_UNCONFIRMED_EXTRAPOLATION_SEC);
      const extrapolated = this.lastRawTime + safeElapsedSec;

      this.isExtrapolating = safeElapsedSec > 0.010;

      // Mantém progressão estritamente monotônica sem recuos
      this.lastReportedEstimated = Math.max(this.lastReportedEstimated, extrapolated);
      return this.lastReportedEstimated;
    }

    return this.lastReportedEstimated;
  }

  /**
   * Reseta o estimador (ex: troca de música ou saída da partida).
   */
  public reset(): void {
    this.lastRawTime = 0;
    this.lastSamplePerfTime = 0;
    this.sampleIntervals = [];
    this.lastIntervalMs = 200;
    this.averageIntervalMs = 200;
    this.jitterMs = 0;
    this.sampleCount = 0;
    this.isExtrapolating = false;
    this.lastReportedEstimated = 0;
    this.isFrozen = false;
    this.frozenEstimatedTime = 0;
  }

  /**
   * Retorna métricas de diagnóstico para o painel administrativo.
   */
  public getDiagnostics(source: AudioTimeSource | null): TelemetryDiagnostics {
    return {
      rawTime: source ? source.getCurrentTime() : 0,
      estimatedTime: this.lastReportedEstimated,
      lastIntervalMs: Math.round(this.lastIntervalMs),
      averageIntervalMs: Math.round(this.averageIntervalMs),
      jitterMs: Number(this.jitterMs.toFixed(1)),
      isExtrapolating: this.isExtrapolating,
      sampleCount: this.sampleCount,
      playbackState: source ? source.getPlaybackState() : PlaybackState.UNINITIALIZED,
      isBuffering: source ? source.isBuffering() : false
    };
  }
}
