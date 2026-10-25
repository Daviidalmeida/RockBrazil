using System;
using System.Collections.Generic;
using UnityEngine;

namespace RockBrazil.Unity.Charts
{
    [Serializable]
    public enum Difficulty
    {
        EASY,
        MEDIUM,
        HARD,
        EXPERT
    }

    [Serializable]
    public class NoteData
    {
        public int id;
        public int lane; // 0..4
        public float time; // seconds
        public float duration; // seconds (for sustain)
        public bool isSustain;
        public bool hit;
        public bool missed;
    }

    [Serializable]
    public class ChartData
    {
        public string songId;
        public string title;
        public string artist;
        public float bpm = 120f;
        public float offsetSeconds = 0f;
        public Difficulty difficulty;
        public int laneCount = 5;
        public List<NoteData> notes = new List<NoteData>();
    }

    /// <summary>
    /// ChartLoader: Loads and validates chart data for Unity runtime.
    /// Strictly enforces lane restrictions per difficulty:
    /// - EASY: 3 lanes (0, 1, 2). Notes with lane > 2 are safely wrapped/remapped.
    /// - MEDIUM: 4 lanes (0, 1, 2, 3). Notes with lane > 3 are safely wrapped/remapped.
    /// - HARD / EXPERT: 5 lanes (0, 1, 2, 3, 4).
    /// </summary>
    public class ChartLoader : MonoBehaviour
    {
        public static int GetAllowedLaneCount(Difficulty difficulty)
        {
            switch (difficulty)
            {
                case Difficulty.EASY: return 3;
                case Difficulty.MEDIUM: return 4;
                case Difficulty.HARD:
                case Difficulty.EXPERT:
                default:
                    return 5;
            }
        }

        public static ChartData SanitizeAndLoad(string jsonContent, Difficulty difficulty)
        {
            var chart = JsonUtility.FromJson<ChartData>(jsonContent);
            if (chart == null)
            {
                chart = new ChartData();
            }

            chart.difficulty = difficulty;
            chart.laneCount = GetAllowedLaneCount(difficulty);

            // Sanitize all notes according to difficulty rules
            var sanitizedNotes = new List<NoteData>();
            int maxLane = chart.laneCount - 1;

            for (int i = 0; i < chart.notes.Count; i++)
            {
                var original = chart.notes[i];
                var note = new NoteData
                {
                    id = original.id > 0 ? original.id : i,
                    time = original.time,
                    duration = original.duration,
                    isSustain = original.duration > 0.15f,
                    hit = false,
                    missed = false
                };

                // Strict lane clamping / remapping
                if (original.lane > maxLane)
                {
                    note.lane = original.lane % chart.laneCount;
                }
                else
                {
                    note.lane = Mathf.Clamp(original.lane, 0, maxLane);
                }

                sanitizedNotes.Add(note);
            }

            // Sort chronologically
            sanitizedNotes.Sort((a, b) => a.time.CompareTo(b.time));
            chart.notes = sanitizedNotes;

            Debug.Log($"[ChartLoader] Loaded chart: '{chart.title}' ({difficulty}) with {chart.notes.Count} notes across {chart.laneCount} lanes.");
            return chart;
        }
    }
}
