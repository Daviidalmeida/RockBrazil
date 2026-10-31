import { describe, it, expect, beforeEach } from 'vitest';
import {
  AudioSourceResolver,
  AdminUploadProvider,
  AuthorizedLibraryProvider
} from '../src/game/rockai/audioSourceResolver';
import { PreparedAudio } from '../src/game/rockai/contracts';
import { SongLibrary } from '../src/game/songLibrary';

describe('V13.9.2 — AudioSourceResolver Test Suite', () => {
  let resolver: AudioSourceResolver;

  beforeEach(() => {
    resolver = new AudioSourceResolver();
  });

  it('1. Returns AWAITING_ANALYZABLE_AUDIO when only YouTube video exists without authorized audio', async () => {
    const result = await resolver.resolve(
      'rockai-44XYEeD1A1U',
      '44XYEeD1A1U',
      'Under the Bridge',
      'Red Hot Chili Peppers'
    );

    expect(result.status).toBe('AWAITING_ANALYZABLE_AUDIO');
    expect(result.message).toContain('VÍDEO CADASTRADO / ÁUDIO PARA ANÁLISE INDISPONÍVEL');
    expect(result.audio).toBeUndefined();
  });

  it('2. Resolves successfully when AdminUploadProvider has attached audio', async () => {
    const mockAudio: PreparedAudio = {
      name: 'under-the-bridge.mp3',
      format: 'audio/mp3',
      duration: 264.0,
      sampleRate: 44100,
      channels: 2,
      buffer: new Float32Array(44100 * 5),
      peaks: [0.5, 0.8]
    };

    AdminUploadProvider.setAudio('rockai-44XYEeD1A1U', mockAudio);

    const result = await resolver.resolve(
      'rockai-44XYEeD1A1U',
      '44XYEeD1A1U',
      'Under the Bridge',
      'Red Hot Chili Peppers'
    );

    expect(result.status).toBe('RESOLVED_AUTHORIZED');
    expect(result.sourceType).toBe('ADMIN_UPLOAD');
    expect(result.audio).toBeDefined();
    expect(result.audio?.duration).toBe(264.0);

    // Clean up
    AdminUploadProvider.removeAudio('rockai-44XYEeD1A1U');
  });

  it('3. Supports custom authorized providers through extensible registerProvider()', async () => {
    let queried = false;
    resolver.registerProvider({
      name: 'CustomLicensedVaultProvider',
      resolveAudio: async (songId) => {
        queried = true;
        if (songId === 'custom-licensed-song') {
          return {
            name: 'licensed.wav',
            format: 'audio/wav',
            duration: 180.0,
            sampleRate: 44100,
            channels: 1,
            buffer: new Float32Array(100),
            peaks: []
          };
        }
        return null;
      }
    });

    const res = await resolver.resolve('custom-licensed-song', 'abc12345678');
    expect(queried).toBe(true);
    expect(res.status).toBe('RESOLVED_AUTHORIZED');
    expect(res.audio?.name).toBe('licensed.wav');
  });

  it('4. Strictly prohibits scraping or bypassing: never produces audio from raw YouTube URL without provider', async () => {
    const res = await resolver.resolve(
      'rockai-illegal-scrape-attempt',
      'dQw4w9WgXcQ',
      'Never Gonna Give You Up',
      'Rick Astley'
    );

    expect(res.status).toBe('AWAITING_ANALYZABLE_AUDIO');
    expect(res.audio).toBeUndefined();
    expect(res.message).toBe('VÍDEO CADASTRADO / ÁUDIO PARA ANÁLISE INDISPONÍVEL');
  });
});
