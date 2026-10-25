using System;
using UnityEngine;

namespace RockBrazil.Core
{
    public enum PlaybackSourceType
    {
        DspAudioSource,
        YouTubeWebGL
    }

    /// <summary>
    /// ROCKBRAZIL V7 — MUSIC SYNC CONTROLLER (C# / Unity)
    /// High-precision unified reference clock for rhythm gameplay.
    /// - Uses AudioSettings.dspTime when playing via Unity AudioSource.
    /// - Interfaces with YouTube WebGL IFrame API via WebGL bridge when streaming.
    /// - Enforces single offset calculation: totalOffset = songOffsetMs + userOffsetMs.
    /// - Implements visual pre-roll during countdown (progressing from -travelTime to 0.0s).
    /// - Guarantees non-decreasing monotonic time without network jitter drift.
    /// </summary>
    public class MusicSyncController : MonoBehaviour
    {
        [Header("Audio Reference")]
        [SerializeField] private AudioSource audioSource;
        [SerializeField] private PlaybackSourceType sourceType = PlaybackSourceType.DspAudioSource;

        [Header("Calibration Offsets (Seconds)")]
        [SerializeField] private float songOffsetSec = 0f;
        [SerializeField] private float userOffsetSec = 0f;

        // State Tracking
        private double dspStartTime = 0.0;
        private float lastReportedTime = 0f;
        private float frozenTime = 0f;
        private float visualPrerollTime = 0f;
        private bool isCountdown = true;
        private bool isPrerollActive = false;
        private bool isPaused = false;
        private bool isBuffering = false;

        // YouTube WebGL Streamed Time
        private float youTubeReportedTime = 0f;
        private bool isYouTubePlaying = false;

        public float TotalOffsetSec => songOffsetSec + userOffsetSec;
        public bool IsBuffering => isBuffering;
        public bool IsPaused => isPaused;
        public bool IsCountdown => isCountdown;

        private void Awake()
        {
            if (audioSource == null)
            {
                audioSource = GetComponent<AudioSource>();
            }
        }

        public void SetOffsets(float songOffsetMs, float userOffsetMs = 0f)
        {
            songOffsetSec = songOffsetMs / 1000f;
            userOffsetSec = userOffsetMs / 1000f;
        }

        public void StartCountdown(float prerollDurationSec)
        {
            isCountdown = true;
            isPaused = false;
            isBuffering = false;
            lastReportedTime = 0f;
            frozenTime = 0f;

            if (prerollDurationSec > 0f)
            {
                isPrerollActive = true;
                visualPrerollTime = -prerollDurationSec;
            }
            else
            {
                isPrerollActive = false;
                visualPrerollTime = 0f;
            }
        }

        public void SetPrerollProgress(float progress01, float prerollDurationSec)
        {
            if (isCountdown && isPrerollActive)
            {
                visualPrerollTime = -prerollDurationSec * (1.0f - Mathf.Clamp01(progress01));
            }
        }

        public void StartPlayback(PlaybackSourceType type)
        {
            sourceType = type;
            isCountdown = false;
            isPrerollActive = false;
            isPaused = false;
            isBuffering = false;

            if (sourceType == PlaybackSourceType.DspAudioSource && audioSource != null)
            {
                dspStartTime = AudioSettings.dspTime;
                audioSource.Play();
            }
        }

        public void Pause()
        {
            if (!isPaused)
            {
                frozenTime = GetTime();
                isPaused = true;
                if (sourceType == PlaybackSourceType.DspAudioSource && audioSource != null)
                {
                    audioSource.Pause();
                }
            }
        }

        public void Resume()
        {
            if (isPaused)
            {
                isPaused = false;
                if (sourceType == PlaybackSourceType.DspAudioSource && audioSource != null)
                {
                    audioSource.UnPause();
                }
            }
        }

        public void SetBuffering(bool buffering)
        {
            if (buffering && !isBuffering)
            {
                frozenTime = GetTime();
                isBuffering = true;
            }
            else if (!buffering && isBuffering)
            {
                isBuffering = false;
            }
        }

        /// <summary>
        /// Called from WebGL JavaScript bridge with current YouTube video playback time
        /// </summary>
        public void OnYouTubeTimeUpdate(float videoTimeSeconds, bool playing)
        {
            youTubeReportedTime = videoTimeSeconds;
            isYouTubePlaying = playing;
            if (playing && isBuffering)
            {
                isBuffering = false;
            }
        }

        /// <summary>
        /// High-precision non-decreasing reference time (in seconds).
        /// When GetTime() == note.time, the note aligns mathematically with the strike line center.
        /// </summary>
        public float GetTime()
        {
            if (isCountdown)
            {
                return isPrerollActive ? visualPrerollTime : 0f;
            }

            if (isPaused || isBuffering)
            {
                return Mathf.Max(0f, frozenTime);
            }

            float calculatedTime;
            if (sourceType == PlaybackSourceType.DspAudioSource)
            {
                double dspElapsed = AudioSettings.dspTime - dspStartTime;
                calculatedTime = (float)dspElapsed + TotalOffsetSec;
            }
            else
            {
                calculatedTime = youTubeReportedTime + TotalOffsetSec;
            }

            // Monotonic non-decreasing protection
            float finalTime = Mathf.Max(lastReportedTime, calculatedTime);
            lastReportedTime = finalTime;
            frozenTime = finalTime;

            return finalTime;
        }

        public void ResetClock()
        {
            isCountdown = true;
            isPrerollActive = false;
            visualPrerollTime = 0f;
            isPaused = false;
            isBuffering = false;
            lastReportedTime = 0f;
            frozenTime = 0f;
            youTubeReportedTime = 0f;
        }
    }
}
