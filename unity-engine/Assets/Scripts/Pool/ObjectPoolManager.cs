using System.Collections.Generic;
using UnityEngine;

namespace RockBrazil.Unity.Pool
{
    public class ObjectPoolManager : MonoBehaviour
    {
        [Header("Prefabs")]
        public GameObject notePrefab;
        public GameObject hitSparkPrefab;

        [Header("Initial Capacities")]
        public int notePoolCapacity = 60;
        public int sparkPoolCapacity = 40;

        private readonly Queue<GameObject> notePool = new Queue<GameObject>();
        private readonly Queue<GameObject> sparkPool = new Queue<GameObject>();

        private void Awake()
        {
            InitializePool(notePool, notePrefab, notePoolCapacity, "NotePool_Container");
            InitializePool(sparkPool, hitSparkPrefab, sparkPoolCapacity, "SparkPool_Container");
        }

        private void InitializePool(Queue<GameObject> pool, GameObject prefab, int capacity, string containerName)
        {
            if (prefab == null) return;

            var container = new GameObject(containerName).transform;
            container.SetParent(this.transform);

            for (int i = 0; i < capacity; i++)
            {
                var obj = Instantiate(prefab, container);
                obj.SetActive(false);
                pool.Enqueue(obj);
            }
        }

        public GameObject GetNote()
        {
            if (notePool.Count > 0)
            {
                var obj = notePool.Dequeue();
                return obj;
            }
            if (notePrefab != null)
            {
                return Instantiate(notePrefab);
            }
            return new GameObject("Runtime_Note");
        }

        public void ReturnNote(GameObject obj)
        {
            if (obj == null) return;
            obj.SetActive(false);
            notePool.Enqueue(obj);
        }

        public GameObject GetHitSpark()
        {
            if (sparkPool.Count > 0)
            {
                var obj = sparkPool.Dequeue();
                return obj;
            }
            if (hitSparkPrefab != null)
            {
                return Instantiate(hitSparkPrefab);
            }
            return null;
        }

        public void ReturnHitSpark(GameObject obj)
        {
            if (obj == null) return;
            obj.SetActive(false);
            sparkPool.Enqueue(obj);
        }
    }
}
