using System;
using System.Collections;
using UnityEngine;
using RockBrazil.Unity.Charts;
using RockBrazil.Unity.Core;
using RockBrazil.Unity.Highway;
using RockBrazil.Unity.Judgment;

namespace RockBrazil.Unity.Session
{
    public enum SessionState
    {
        IDLE,
        PREPARING,
        COUNTDOWN,
        PLAYING,
        PAUSED,
        FINISHED
    }

    public class GameSessionController : MonoBehaviour
    {
        public static event Action<SessionState> OnStateChanged;
        public static event Action<string> OnCountdownTick;

        [Header("References")]
        public MusicSyncController sync;
        public NoteHighwayController highway;
        public NoteRenderer noteRenderer;
        public HitJudgmentSystem judgment;

        [Header("State")]
        public SessionState currentState = SessionState.IDLE;
        public ChartData currentChart;
        public Difficulty currentDifficulty = Difficulty.MEDIUM;

        private Coroutine sessionRoutine;

        public void StartSession(ChartData chart, Difficulty difficulty)
        {
            if (sessionRoutine != null)
            {
                StopCoroutine(sessionRoutine);
            }
            sessionRoutine = StartCoroutine(SessionRoutine(chart, difficulty));
        }

        private IEnumerator SessionRoutine(ChartData chart, Difficulty difficulty)
        {
            currentState = SessionState.PREPARING;
            OnStateChanged?.Invoke(currentState);
            OnCountdownTick?.Invoke("ROCK BRASIL");

            currentChart = chart;
            currentDifficulty = difficulty;

            // Setup highway and judgment
            highway.SetupLanes(difficulty);
            judgment.Initialize(chart.notes);
            noteRenderer.SetChart(chart);

            yield return new WaitForSeconds(0.5f);

            // Countdown sequence: 3... 2... 1... ROCK BRASIL!
            currentState = SessionState.COUNTDOWN;
            OnStateChanged?.Invoke(currentState);

            OnCountdownTick?.Invoke("3");
            yield return new WaitForSeconds(1.0f);

            OnCountdownTick?.Invoke("2");
            yield return new WaitForSeconds(1.0f);

            OnCountdownTick?.Invoke("1");
            yield return new WaitForSeconds(1.0f);

            OnCountdownTick?.Invoke("ROCK BRASIL!");
            yield return new WaitForSeconds(0.4f);

            OnCountdownTick?.Invoke(""); // clear countdown overlay

            // Start music playback
            currentState = SessionState.PLAYING;
            OnStateChanged?.Invoke(currentState);
            sync.StartPlayback(chart.offsetSeconds);
        }

        public void PauseSession()
        {
            if (currentState == SessionState.PLAYING)
            {
                currentState = SessionState.PAUSED;
                sync.Pause();
                OnStateChanged?.Invoke(currentState);
            }
        }

        public void ResumeSession()
        {
            if (currentState == SessionState.PAUSED)
            {
                currentState = SessionState.PLAYING;
                sync.Resume();
                OnStateChanged?.Invoke(currentState);
            }
        }

        public void EndSession()
        {
            currentState = SessionState.FINISHED;
            sync.Stop();
            OnStateChanged?.Invoke(currentState);
        }
    }
}
