import {
  SongMetadataInput,
  RockAIJobProgress,
  RockAIJobStatus,
  JobProgressCallback,
  AutochartGenerationResult
} from './contracts';
import { MusicSourceManager } from './musicSourceManager';
import { AudioPreparationService } from './audioPreparationService';
import { RealGuitarStemAdapter } from './realGuitarStemAdapter';
import { SpotifyBasicPitchAdapter } from './spotifyBasicPitchAdapter';
import { ChartGenerationEngine } from './chartGenerationEngine';
import { ChartValidationService } from './chartValidationService';
import { ChartVideoAlignmentService } from './chartVideoAlignmentService';

export class RockAIJobManager {
  private activeJobs = new Map<string, { status: RockAIJobStatus; isCancelled: boolean }>();

  /**
   * Starts a real autochart generation job with Demucs HTDemucs 6S and Spotify Basic Pitch.
   */
  public async executeJob(
    input: SongMetadataInput,
    onProgress?: JobProgressCallback
  ): Promise<AutochartGenerationResult> {
    const songDraft = MusicSourceManager.registerSong(input);
    const jobId = `job-${songDraft.id}-${Date.now()}`;
    this.activeJobs.set(jobId, { status: 'QUEUED', isCancelled: false });

    const reportProgress = (
      step: string,
      percent: number,
      result?: AutochartGenerationResult,
      error?: string
    ) => {
      const current = this.activeJobs.get(jobId);
      const status: RockAIJobStatus = error ? 
        'FAILED' : 
        (current?.isCancelled ? 'CANCELLED' : (percent >= 100 ? 'COMPLETED' : 'PROCESSING'));
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
      reportProgress('Preparando e decodificando áudio PCM...', 10);
      checkCancellation();

      if (!input.audioFile) {
        throw new Error('Áudio autorizado não fornecido. A ROCK AI PRO requer áudio legítimo para análise.');
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
      reportProgress('Áudio PCM 44.1kHz preparado e normalizado.', 20);
      checkCancellation();

      // Step 2: Isolamento de Guitarra (Demucs HTDemucs 6-Stem com fallback DSP)
      reportProgress('Separando faixa de guitarra (Demucs HTDemucs 6S)...', 35);
      const stemAdapter = new RealGuitarStemAdapter();
      const isolatedStem = await stemAdapter.separateGuitar(preparedAudio);
      
      const stemLabel = isolatedStem.metadata.isRealAI ? 
        `Faixa de guitarra isolada via IA (${isolatedStem.metadata.modelName}).` : 
        `Faixa de guitarra isolada via DSP Fallback (${isolatedStem.metadata.modelName}).`;
      reportProgress(stemLabel, 50);
      checkCancellation();

      // Step 3 & 4 & 5: Transcrição Neural (Spotify Basic Pitch) e Dificuldades
      reportProgress('Transcrevendo notas com Spotify Basic Pitch...', 65);
      const basicPitchAdapter = new SpotifyBasicPitchAdapter();
      const generated = await ChartGenerationEngine.generateFromStem(isolatedStem, basicPitchAdapter);

      const transLabel = generated.transcriptionMetadata.isRealAI ?
        `Transcrição neural concluída (${generated.transcriptionMetadata.notesDetectedCount} notas).` :
        `Transcrição YIN DSP concluída (${generated.transcriptionMetadata.notesDetectedCount} notas).`;
      reportProgress(transLabel, 75);
      checkCancellation();

      // Step 6: Validando integridade das 4 dificuldades...
      reportProgress('Validando charts com as 14 regras mandatórias...', 85);
      const validationReport = ChartValidationService.validate(generated.charts, preparedAudio.duration);
      if (!validationReport.isValid) {
        console.warn('[RockAIJobManager] Avisos de validação:', validationReport.errors);
      }
      checkCancellation();

      // Step 7: Preparando calibração e alinhamento...
      reportProgress('Preparando sincronização de vídeo...', 95);
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
        stemMetadata: isolatedStem.metadata,
        transcriptionMetadata: generated.transcriptionMetadata,
        engineMode: generated.engineMode,
        midiExport: generated.midiDataUri,
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
