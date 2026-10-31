import {
  SongMetadataInput,
  RockAIJobProgress,
  RockAIJobStatus,
  JobProgressCallback,
  AutochartGenerationResult
} from './contracts';
import { MusicSourceManager } from './musicSourceManager';
import { AudioPreparationService } from './audioPreparationService';
import { GuitarStemSeparator } from './guitarStemSeparator';
import { ChartGenerationEngine } from './chartGenerationEngine';
import { ChartValidationService } from './chartValidationService';
import { ChartVideoAlignmentService } from './chartVideoAlignmentService';

export class RockAIJobManager {
  private activeJobs = new Map<string, { status: RockAIJobStatus; isCancelled: boolean }>();

  /**
   * Starts a real autochart generation job.
   */
  public async executeJob(
    input: SongMetadataInput,
    onProgress?: JobProgressCallback
  ): Promise<AutochartGenerationResult> {
    const songDraft = MusicSourceManager.registerSong(input);
    const jobId = `job-${songDraft.id}-${Date.now()}`;
    this.activeJobs.set(jobId, { status: 'QUEUED', isCancelled: false });

    const reportProgress = (step: string, percent: number, result?: AutochartGenerationResult, error?: string) => {
      const current = this.activeJobs.get(jobId);
      const status: RockAIJobStatus = error ? 'FAILED' : (current?.isCancelled ? 'CANCELLED' : (percent >= 100 ? 'COMPLETED' : 'PROCESSING'));
      if (current) current.status = status;

      onProgress?.({
        jobId,
        status,
        currentStep: step,
        progressPercent: percent,
        result,
        error
      });
    };

    const checkCancellation = () => {
      const current = this.activeJobs.get(jobId);
      if (current?.isCancelled) {
        throw new Error('Processamento cancelado pelo usuário.');
      }
    };

    try {
      // Step 1: Preparando áudio...
      reportProgress('Preparando áudio...', 10);
      checkCancellation();

      if (!input.audioFile) {
        throw new Error('Áudio autorizado não fornecido. A ROCK AI requer áudio real para análise.');
      }

      let arrayBuffer: ArrayBuffer;
      if (input.audioFile instanceof Blob) {
        arrayBuffer = await input.audioFile.arrayBuffer();
      } else if (input.audioFile instanceof ArrayBuffer) {
        arrayBuffer = input.audioFile;
      } else {
        throw new Error('Formato de dados de áudio inválido.');
      }

      const preparedAudio = await AudioPreparationService.prepareAudio(
        arrayBuffer,
        input.audioFileName || 'song.wav'
      );
      reportProgress('Áudio decodificado com sucesso.', 20);
      checkCancellation();

      // Step 2: Separando instrumentos...
      reportProgress('Separando instrumentos...', 30);
      const stemSeparator = new GuitarStemSeparator();
      const isolatedStem = await stemSeparator.separateGuitar(preparedAudio);
      reportProgress('Stem de guitarra isolado.', 45);
      checkCancellation();

      // Step 3 & 4 & 5: Analisando guitarra, detectando ritmo e gerando charts...
      reportProgress('Analisando guitarra e detectando ritmo...', 55);
      const generated = ChartGenerationEngine.generate(isolatedStem.audio);
      reportProgress('Gerando charts para as 4 dificuldades...', 75);
      checkCancellation();

      // Step 6: Validando notas...
      reportProgress('Validando notas...', 85);
      const validationReport = ChartValidationService.validate(generated.charts, preparedAudio.duration);
      if (!validationReport.isValid) {
        console.warn('[RockAIJobManager] Avisos de validação:', validationReport.errors);
      }
      checkCancellation();

      // Step 7: Preparando sincronização...
      reportProgress('Preparando sincronização...', 95);
      const initialAlignment = ChartVideoAlignmentService.createInitialAlignment(
        songDraft.id,
        songDraft.youtubeVideoId
      );
      ChartVideoAlignmentService.saveAlignment(initialAlignment);

      const finalResult: AutochartGenerationResult = {
        songId: songDraft.id,
        title: songDraft.title,
        artist: songDraft.artist,
        youtubeVideoId: songDraft.youtubeVideoId,
        duration: Number(preparedAudio.duration.toFixed(2)),
        bpm: generated.bpm,
        charts: generated.charts,
        qualityMetrics: generated.metrics,
        alignment: {
          chartVideoOffsetMs: initialAlignment.chartVideoOffsetMs,
          status: initialAlignment.status
        },
        generatedAt: new Date().toISOString()
      };

      reportProgress('Concluído com sucesso!', 100, finalResult);
      return finalResult;
    } catch (err: any) {
      const errMsg = err?.message || 'Erro durante a geração de charts com IA.';
      reportProgress('Falha no processamento.', 0, undefined, errMsg);
      throw err;
    }
  }

  public cancelJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.isCancelled = true;
      job.status = 'CANCELLED';
    }
  }
}
