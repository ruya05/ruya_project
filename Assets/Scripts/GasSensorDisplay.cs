using UnityEngine;
using UnityEngine.Networking;
using System;
using System.Collections;
using System.Collections.Generic;

public class GasMonitor : MonoBehaviour
{
    [Header("Firebase Configuration")]
    [SerializeField] private string firebaseURL = "https://ruya-11c11-default-rtdb.asia-southeast1.firebasedatabase.app";
    [SerializeField] private string robotId = "spider-01";
    [SerializeField] private float updateInterval = 2f;
    [SerializeField] private string authToken = "";

    [Header("Debug Settings")]
    [SerializeField] private bool enableDebugLogs = true;
    [SerializeField] private bool showRawResponses = true;

    private Dictionary<string, GasSensorData> gasSensors = new Dictionary<string, GasSensorData>();

    public event Action<string, GasSensorData> OnGasDataUpdated;
    public event Action<string, float> OnGasValueUpdated;

    void Start()
    {
        DebugLog("=== Gas Monitor Initialized ===");
        DebugLog($"Firebase URL: {firebaseURL}");
        DebugLog($"Robot ID: {robotId}");
        StartCoroutine(MonitorGasSensors());
    }

    IEnumerator MonitorGasSensors()
    {
        while (true)
        {
            yield return StartCoroutine(FetchAllGasData());
            yield return new WaitForSeconds(updateInterval);
        }
    }

    IEnumerator FetchAllGasData()
    {
        string[] gasIds = { "gas-1", "gas-2", "gas-3", "gas-4" };

        foreach (string gasId in gasIds)
        {
            yield return StartCoroutine(FetchGasSensor(gasId));
        }
    }

    IEnumerator FetchGasSensor(string gasId)
    {
        string readingUrl = $"{firebaseURL}/robots/{robotId}/gasses/{gasId}/latest_reading.json";
        string configUrl = $"{firebaseURL}/robots/{robotId}/gasses/{gasId}/config.json";

        if (!string.IsNullOrEmpty(authToken))
        {
            readingUrl += $"?auth={authToken}";
            configUrl += $"?auth={authToken}";
        }

        LatestReading reading = null;
        GasConfig config = null;

        using (UnityWebRequest request = UnityWebRequest.Get(readingUrl))
        {
            yield return request.SendWebRequest();

            if (showRawResponses)
            {
                DebugLog($"Reading URL: {readingUrl}");
                DebugLog($"Response Code: {request.responseCode}");
                DebugLog($"Response: {request.downloadHandler.text}");
            }

            if (request.result == UnityWebRequest.Result.Success)
            {
                try
                {
                    string json = request.downloadHandler.text;

                    if (string.IsNullOrEmpty(json) || json == "null")
                    {
                        DebugWarning($"Empty response for {gasId} reading");
                        yield break;
                    }

                    reading = JsonUtility.FromJson<LatestReading>(json);
                    DebugLog($"Successfully parsed reading for {gasId}: {reading.value_ppm} PPM");
                }
                catch (Exception e)
                {
                    DebugError($"Error parsing reading for {gasId}: {e.Message}");
                    DebugError($"JSON was: {request.downloadHandler.text}");
                }
            }
            else
            {
                DebugError($"Failed to fetch reading for {gasId}: {request.error}");
                DebugError($"Response Code: {request.responseCode}");
                DebugError($"URL: {readingUrl}");
            }
        }

        using (UnityWebRequest request = UnityWebRequest.Get(configUrl))
        {
            yield return request.SendWebRequest();

            if (showRawResponses)
            {
                DebugLog($"Config URL: {configUrl}");
                DebugLog($"Response Code: {request.responseCode}");
                DebugLog($"Response: {request.downloadHandler.text}");
            }

            if (request.result == UnityWebRequest.Result.Success)
            {
                try
                {
                    string json = request.downloadHandler.text;

                    if (string.IsNullOrEmpty(json) || json == "null")
                    {
                        DebugWarning($"Empty response for {gasId} config");
                        yield break;
                    }

                    config = JsonUtility.FromJson<GasConfig>(json);
                    DebugLog($"Successfully parsed config for {gasId}: {config.gas_name}");
                }
                catch (Exception e)
                {
                    DebugError($"Error parsing config for {gasId}: {e.Message}");
                    DebugError($"JSON was: {request.downloadHandler.text}");
                }
            }
            else
            {
                DebugError($"Failed to fetch config for {gasId}: {request.error}");
                DebugError($"Response Code: {request.responseCode}");
                DebugError($"URL: {configUrl}");
            }
        }

        if (reading != null && config != null)
        {
            GasSensorData sensorData = new GasSensorData
            {
                config = config,
                latest_reading = reading
            };

            gasSensors[gasId] = sensorData;

            string statusIcon = reading.value_ppm > config.threshold ? "ALERT" : "OK";
            DebugLog($"[{gasId}] {statusIcon} {config.gas_name}: {reading.value_ppm:F2} PPM (Threshold: {config.threshold})");

            if (reading.value_ppm > config.threshold)
            {
                DebugWarning($"HIGH CONCENTRATION: {config.gas_name} = {reading.value_ppm:F2} PPM (Threshold: {config.threshold})");
            }

            OnGasDataUpdated?.Invoke(gasId, sensorData);
            OnGasValueUpdated?.Invoke(gasId, reading.value_ppm);
        }
        else
        {
            DebugWarning($"Failed to get complete data for {gasId} (Reading: {reading != null}, Config: {config != null})");
        }
    }

    public GasSensorData GetGasData(string gasId)
    {
        return gasSensors.ContainsKey(gasId) ? gasSensors[gasId] : null;
    }

    public float GetGasValue(string gasId)
    {
        if (gasSensors.ContainsKey(gasId) && gasSensors[gasId].latest_reading != null)
        {
            return gasSensors[gasId].latest_reading.value_ppm;
        }
        return 0f;
    }

    public string GetGasName(string gasId)
    {
        if (gasSensors.ContainsKey(gasId) && gasSensors[gasId].config != null)
        {
            return gasSensors[gasId].config.gas_name;
        }
        return "Unknown";
    }

    public Dictionary<string, GasSensorData> GetAllGasData()
    {
        return new Dictionary<string, GasSensorData>(gasSensors);
    }

    public bool HasData()
    {
        return gasSensors.Count > 0;
    }

    void DebugLog(string message)
    {
        if (enableDebugLogs) Debug.Log($"[GasMonitor] {message}");
    }

    void DebugWarning(string message)
    {
        if (enableDebugLogs) Debug.LogWarning($"[GasMonitor] {message}");
    }

    void DebugError(string message)
    {
        if (enableDebugLogs) Debug.LogError($"[GasMonitor] {message}");
    }
}

[Serializable]
public class GasSensorData
{
    public GasConfig config;
    public LatestReading latest_reading;
}

[Serializable]
public class GasConfig
{
    public string gas_name;
    public float threshold;
    public int update_interval_sec;
}

[Serializable]
public class LatestReading
{
    public string timestamp;
    public float value_ppm;
    public Location location;
}

[Serializable]
public class Location
{
    public float lat;
    public float lng;
    public string map_url;
    public string status;
    public string timestamp;
}