using System;
using System.Collections.Generic;
using UnityEngine;
using RockBrazil.Unity.Charts;
using RockBrazil.Unity.Core;
using RockBrazil.Unity.Input;

namespace RockBrazil.Unity.Judgment
{
    public enum HitRating
    {
        PERFECT,
        GREAT,
        GOOD,
        MISS
    }

    [Serializable]
    public class JudgmentResult
    {
        public HitRating rating;
        public float deltaMs;
        public int noteId;
        public int lane;
        public int points;
        public int currentCombo;
        public int currentMultiplier;
    }

    public class HitJudgmentSystem : MonoBehaviour
    {
        public static event Action<JudgmentResult> OnNoteJudged;

        [Header("Windows (ms)")]
        public float perfectWindowMs = 45f;
        public float greatWindowMs = 90f;
        public float goodWindowMs = 140f;

        [Header("Scoring")]
        public int perfectBaseScore = 100;
        public int greatBaseScore = 75;
        public int goodBaseScore = 50;

        [Header("State")]
        public int score = 0;
        public int combo = 0;
        public int maxCombo = 0;
        public int multiplier = 1;

        public MusicSyncController sync;
        private List<NoteData> notes = new List<NoteData>();

        private void OnEnable()
        {
            InputController.OnLanePressed += HandleLanePressed;
        }

        private void OnDisable()
        {
            InputController.OnLanePressed -= HandleLanePressed;
        }

        public void Initialize(List<NoteData> chartNotes)
        {
            notes = chartNotes ?? new List<NoteData>();
            score = 0;
            combo = 0;
            maxCombo = 0;
            multiplier = 1;
        }

        private void Update()
        {
            if (sync == null || notes == null) return;
            float currentTime = sync.CurrentAudioTime;

            // Miss checking for notes that passed beyond goodWindowMs
            float missThreshold = (goodWindowMs / 1000f);
            for (int i = 0; i < notes.Count; i++)
            {
                var note = notes[i];
                if (!note.hit && !note.missed && (currentTime - note.time) > missThreshold)
                {
                    note.missed = true;
                    ProcessMiss(note);
                }
            }
        }

        private void HandleLanePressed(int lane)
        {
            if (sync == null || notes == null) return;
            float currentTime = sync.CurrentAudioTime;
            float maxWindowSec = goodWindowMs / 1000f;

            NoteData bestCandidate = null;
            float minDelta = float.MaxValue;

            for (int i = 0; i < notes.Count; i++)
            {
                var n = notes[i];
                if (n.hit || n.missed) continue;
                if (n.lane != lane) continue;

                float delta = Mathf.Abs(currentTime - n.time);
                if (delta <= maxWindowSec && delta < minDelta)
                {
                    minDelta = delta;
                    bestCandidate = n;
                }
            }

            if (bestCandidate != null)
            {
                bestCandidate.hit = true;
                ProcessHit(bestCandidate, minDelta * 1000f);
            }
        }

        private void ProcessHit(NoteData note, float deltaMs)
        {
            HitRating rating;
            int basePoints;

            if (deltaMs <= perfectWindowMs)
            {
                rating = HitRating.PERFECT;
                basePoints = perfectBaseScore;
            }
            else if (deltaMs <= greatWindowMs)
            {
                rating = HitRating.GREAT;
                basePoints = greatBaseScore;
            }
            else
            {
                rating = HitRating.GOOD;
                basePoints = goodBaseScore;
            }

            combo++;
            if (combo > maxCombo) maxCombo = combo;

            // Multiplier progression: every 10 combo increases multiplier up to 4x
            multiplier = Mathf.Clamp(1 + (combo / 10), 1, 4);
            int pointsEarned = basePoints * multiplier;
            score += pointsEarned;

            var result = new JudgmentResult
            {
                rating = rating,
                deltaMs = deltaMs,
                noteId = note.id,
                lane = note.lane,
                points = pointsEarned,
                currentCombo = combo,
                currentMultiplier = multiplier
            };

            OnNoteJudged?.Invoke(result);
        }

        private void ProcessMiss(NoteData note)
        {
            combo = 0;
            multiplier = 1;

            var result = new JudgmentResult
            {
                rating = HitRating.MISS,
                deltaMs = 999f,
                noteId = note.id,
                lane = note.lane,
                points = 0,
                currentCombo = 0,
                currentMultiplier = 1
            };

            OnNoteJudged?.Invoke(result);
        }
    }
}
