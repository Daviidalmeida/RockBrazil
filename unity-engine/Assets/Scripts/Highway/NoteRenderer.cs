using System.Collections.Generic;
using UnityEngine;
using RockBrazil.Unity.Charts;
using RockBrazil.Unity.Pool;
using RockBrazil.Unity.Core;

namespace RockBrazil.Unity.Highway
{
    public class NoteRenderer : MonoBehaviour
    {
        public NoteHighwayController highway;
        public MusicSyncController sync;
        public ObjectPoolManager pool;

        [Header("Lane Colors")]
        public Color[] laneColors = new Color[]
        {
            new Color(0.18f, 0.80f, 0.44f), // 0: Green
            new Color(0.91f, 0.30f, 0.24f), // 1: Red
            new Color(0.95f, 0.77f, 0.06f), // 2: Yellow
            new Color(0.20f, 0.60f, 0.86f), // 3: Blue
            new Color(0.90f, 0.49f, 0.13f)  // 4: Orange
        };

        private List<NoteData> activeChartNotes = new List<NoteData>();
        private readonly Dictionary<int, GameObject> activeNoteObjects = new Dictionary<int, GameObject>();

        public void SetChart(ChartData chart)
        {
            activeChartNotes = chart != null ? chart.notes : new List<NoteData>();
            ClearAllActiveVisuals();
        }

        public void ClearAllActiveVisuals()
        {
            foreach (var kvp in activeNoteObjects)
            {
                if (kvp.Value != null)
                {
                    pool.ReturnNote(kvp.Value);
                }
            }
            activeNoteObjects.Clear();
        }

        private void Update()
        {
            if (sync == null || highway == null || activeChartNotes == null || activeChartNotes.Count == 0)
                return;

            float currentAudioTime = sync.CurrentAudioTime;
            float travelTime = highway.TravelTime;

            // Visible window: [currentAudioTime - 0.25s, currentAudioTime + travelTime + 0.1s]
            float windowMin = currentAudioTime - 0.25f;
            float windowMax = currentAudioTime + travelTime + 0.1f;

            for (int i = 0; i < activeChartNotes.Count; i++)
            {
                var note = activeChartNotes[i];

                if (note.hit || note.missed)
                {
                    if (activeNoteObjects.TryGetValue(note.id, out GameObject obj))
                    {
                        pool.ReturnNote(obj);
                        activeNoteObjects.Remove(note.id);
                    }
                    continue;
                }

                // Check if note is within visible window
                if (note.time >= windowMin && note.time <= windowMax)
                {
                    float progress = highway.CalculateNormalizedProgress(note.time, currentAudioTime);

                    if (!activeNoteObjects.TryGetValue(note.id, out GameObject noteObj))
                    {
                        noteObj = pool.GetNote();
                        activeNoteObjects[note.id] = noteObj;
                    }

                    if (noteObj != null)
                    {
                        Vector3 pos = highway.GetWorldPositionForLane(note.lane, progress);
                        noteObj.transform.position = pos;
                        noteObj.SetActive(true);
                    }
                }
                else
                {
                    // Out of view
                    if (activeNoteObjects.TryGetValue(note.id, out GameObject noteObj))
                    {
                        pool.ReturnNote(noteObj);
                        activeNoteObjects.Remove(note.id);
                    }
                }
            }
        }
    }
}
