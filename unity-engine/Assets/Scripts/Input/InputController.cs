using System;
using UnityEngine;

namespace RockBrazil.Unity.Input
{
    public class InputController : MonoBehaviour
    {
        public static event Action<int> OnLanePressed;
        public static event Action<int> OnLaneReleased;

        [Header("Key Bindings")]
        public KeyCode[] keyboardLaneBindings = new KeyCode[]
        {
            KeyCode.A, // Lane 0 (Green)
            KeyCode.S, // Lane 1 (Red)
            KeyCode.J, // Lane 2 (Yellow)
            KeyCode.K, // Lane 3 (Blue)
            KeyCode.L  // Lane 4 (Orange)
        };

        public KeyCode[] altBindings = new KeyCode[]
        {
            KeyCode.Alpha1,
            KeyCode.Alpha2,
            KeyCode.Alpha3,
            KeyCode.Alpha4,
            KeyCode.Alpha5
        };

        private readonly bool[] laneState = new bool[5];

        private void Update()
        {
            // Keyboard checks
            for (int i = 0; i < 5; i++)
            {
                bool isDown = UnityEngine.Input.GetKeyDown(keyboardLaneBindings[i]) || UnityEngine.Input.GetKeyDown(altBindings[i]);
                bool isUp = UnityEngine.Input.GetKeyUp(keyboardLaneBindings[i]) || UnityEngine.Input.GetKeyUp(altBindings[i]);

                if (isDown)
                {
                    laneState[i] = true;
                    OnLanePressed?.Invoke(i);
                }
                else if (isUp)
                {
                    laneState[i] = false;
                    OnLaneReleased?.Invoke(i);
                }
            }

            // Mobile Multi-touch checks
            if (UnityEngine.Input.touchCount > 0)
            {
                for (int t = 0; t < UnityEngine.Input.touchCount; t++)
                {
                    Touch touch = UnityEngine.Input.GetTouch(t);
                    int lane = MapTouchToLane(touch.position);
                    if (lane >= 0 && lane < 5)
                    {
                        if (touch.phase == TouchPhase.Began)
                        {
                            OnLanePressed?.Invoke(lane);
                        }
                        else if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                        {
                            OnLaneReleased?.Invoke(lane);
                        }
                    }
                }
            }
        }

        public void TriggerTouchLaneDown(int lane)
        {
            if (lane >= 0 && lane < 5)
            {
                laneState[lane] = true;
                OnLanePressed?.Invoke(lane);
            }
        }

        public void TriggerTouchLaneUp(int lane)
        {
            if (lane >= 0 && lane < 5)
            {
                laneState[lane] = false;
                OnLaneReleased?.Invoke(lane);
            }
        }

        private int MapTouchToLane(Vector2 screenPos)
        {
            // Lower 35% of screen is the fret touch zone
            if (screenPos.y > Screen.height * 0.35f) return -1;
            float normX = screenPos.x / Screen.width;
            int lane = Mathf.FloorToInt(normX * 5f);
            return Mathf.Clamp(lane, 0, 4);
        }

        public bool IsLaneHeld(int lane)
        {
            return lane >= 0 && lane < 5 && laneState[lane];
        }
    }
}
