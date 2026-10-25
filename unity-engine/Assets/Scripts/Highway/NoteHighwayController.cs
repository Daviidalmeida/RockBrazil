using System;
using UnityEngine;
using RockBrazil.Unity.Core;
using RockBrazil.Unity.Charts;

namespace RockBrazil.Unity.Highway
{
    public enum NoteSpeedPreset
    {
        LENTA,   // 1.65s
        NORMAL,  // 1.35s (V7 baseline standard)
        RAPIDA   // 1.05s
    }

    /// <summary>
    /// NoteHighwayController: Manages the 3D rhythm highway in Unity.
    /// Replicates the Guitar Flash / Guitar Hero perspective.
    /// Handles note travel calculation based on musical time, beat pulses, and difficulty lanes.
    /// </summary>
    public class NoteHighwayController : MonoBehaviour
    {
        [Header("Configuration")]
        public NoteSpeedPreset speedPreset = NoteSpeedPreset.NORMAL;
        public float baseTravelTime = 1.35f; // Normal baseline
        public Transform strikeLineTarget;
        public Transform spawnLineTarget;
        public Transform[] laneReceptors; // 3 to 5 lanes

        [Header("Highway Dimensions")]
        public float highwayLength = 30f;
        public float highwayTopWidth = 4f;
        public float highwayBottomWidth = 8f;

        [Header("References")]
        public MusicSyncController syncController;
        public ChartData currentChart;

        public float TravelTime
        {
            get
            {
                switch (speedPreset)
                {
                    case NoteSpeedPreset.LENTA: return 1.65f;
                    case NoteSpeedPreset.RAPIDA: return 1.05f;
                    case NoteSpeedPreset.NORMAL:
                    default:
                        return 1.35f;
                }
            }
        }

        public void SetSpeedPreset(NoteSpeedPreset preset)
        {
            speedPreset = preset;
            Debug.Log($"[NoteHighwayController] Travel time updated to {TravelTime}s (Preset: {speedPreset})");
        }

        public void SetupLanes(Difficulty difficulty)
        {
            int laneCount = ChartLoader.GetAllowedLaneCount(difficulty);
            for (int i = 0; i < laneReceptors.Length; i++)
            {
                if (laneReceptors[i] != null)
                {
                    laneReceptors[i].gameObject.SetActive(i < laneCount);
                }
            }
            Debug.Log($"[NoteHighwayController] Setup {laneCount} active lanes for {difficulty}.");
        }

        /// <summary>
        /// Calculates normalized highway position [0..1] where 0 is at spawn and 1 is at strike line.
        /// </summary>
        public float CalculateNormalizedProgress(float noteTime, float currentAudioTime)
        {
            float timeUntilStrike = noteTime - currentAudioTime;
            float progress = 1.0f - (timeUntilStrike / TravelTime);
            return progress;
        }

        /// <summary>
        /// Converts normalized progress into 3D world coordinates with perspective foreshortening.
        /// </summary>
        public Vector3 GetWorldPositionForLane(int lane, float progress)
        {
            int totalLanes = currentChart != null ? currentChart.laneCount : 5;
            float laneNorm = totalLanes > 1 ? (float)lane / (totalLanes - 1) : 0.5f;
            float xOffsetNorm = (laneNorm - 0.5f) * 2f; // -1 to +1

            float z = Mathf.Lerp(spawnLineTarget.position.z, strikeLineTarget.position.z, progress);
            float y = Mathf.Lerp(spawnLineTarget.position.y, strikeLineTarget.position.y, progress);
            
            // Perspective width scaling
            float currentWidth = Mathf.Lerp(highwayTopWidth, highwayBottomWidth, progress);
            float x = (xOffsetNorm * currentWidth * 0.5f);

            return new Vector3(x, y, z);
        }
    }
}
