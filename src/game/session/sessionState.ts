/**
 * ROCKBRAZIL BETA V6 — SESSION STATE MACHINE
 * Formal session lifecycle states inspired by commercial Unity rhythm engines.
 */
export enum SessionState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  READY = 'READY',
  COUNTDOWN = 'COUNTDOWN',
  WAITING_AUDIO = 'WAITING_AUDIO',
  PLAYING = 'PLAYING',
  BUFFERING = 'BUFFERING',
  PAUSED = 'PAUSED',
  FAILED = 'FAILED',
  FINISHED = 'FINISHED'
}
