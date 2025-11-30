using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections.Generic;

public class GasMonitorUI : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private GasMonitor gasMonitor;

    [Header("UI Elements")]
    [SerializeField] private TextMeshProUGUI lpgText;
    [SerializeField] private TextMeshProUGUI propaneText;
    [SerializeField] private TextMeshProUGUI butaneText;
    [SerializeField] private TextMeshProUGUI methaneText;
    [SerializeField] private TextMeshProUGUI statusText;
    [SerializeField] private TextMeshProUGUI timestampText;

    [Header("Visual Feedback")]
    [SerializeField] private Image lpgIndicator;
    [SerializeField] private Image propaneIndicator;
    [SerializeField] private Image butaneIndicator;
    [SerializeField] private Image methaneIndicator;

    [Header("Colors")]
    [SerializeField] private Color normalColor = new Color(0.2f, 0.8f, 0.2f, 1f);
    [SerializeField] private Color warningColor = new Color(1f, 0.9f, 0.2f, 1f);
    [SerializeField] private Color dangerColor = new Color(0.9f, 0.2f, 0.2f, 1f);
    [SerializeField] private Color noDataColor = new Color(0.5f, 0.5f, 0.5f, 1f);

    [Header("Thresholds")]
    [SerializeField] private float warningThreshold = 0.7f;

    private Dictionary<string, GasUIElement> gasUIElements;
    private bool hasReceivedData = false;

    void Start()
    {
        gasUIElements = new Dictionary<string, GasUIElement>
        {
            { "gas-1", new GasUIElement { text = lpgText, indicator = lpgIndicator } },
            { "gas-2", new GasUIElement { text = propaneText, indicator = propaneIndicator } },
            { "gas-3", new GasUIElement { text = butaneText, indicator = butaneIndicator } },
            { "gas-4", new GasUIElement { text = methaneText, indicator = methaneIndicator } }
        };

        if (gasMonitor == null)
        {
            gasMonitor = FindObjectOfType<GasMonitor>();
        }

        if (gasMonitor != null)
        {
            gasMonitor.OnGasDataUpdated += UpdateGasDisplay;
            Debug.Log("[GasMonitorUI] Subscribed to gas data updates");
        }
        else
        {
            Debug.LogError("[GasMonitorUI] GasMonitor not found!");
        }

        InitializeDisplay();
        UpdateStatusText("Connecting to Firebase...");
    }

    void OnDestroy()
    {
        if (gasMonitor != null)
        {
            gasMonitor.OnGasDataUpdated -= UpdateGasDisplay;
        }
    }

    void InitializeDisplay()
    {
        foreach (var kvp in gasUIElements)
        {
            string gasId = kvp.Key;
            GasUIElement uiElement = kvp.Value;

            if (uiElement.text != null)
            {
                string initialGasName = GetGasNameFromId(gasId);
                uiElement.text.text = $"{initialGasName}\n--.-  PPM\n(Waiting...)";
            }

            if (uiElement.indicator != null)
            {
                uiElement.indicator.color = noDataColor;
            }
        }

        if (timestampText != null)
        {
            timestampText.text = "Waiting for data...";
        }
    }

    void UpdateGasDisplay(string gasId, GasSensorData data)
    {
        if (!gasUIElements.ContainsKey(gasId))
        {
            Debug.LogWarning($"[GasMonitorUI] Unknown gas ID: {gasId}");
            return;
        }

        hasReceivedData = true;

        GasUIElement uiElement = gasUIElements[gasId];

        if (data == null || data.latest_reading == null || data.config == null)
        {
            Debug.LogWarning($"[GasMonitorUI] Invalid data for {gasId}");

            if (uiElement.text != null)
            {
                string errorGasName = GetGasNameFromId(gasId);
                uiElement.text.text = $"{errorGasName}\nERROR\n(No Data)";
            }
            if (uiElement.indicator != null)
            {
                uiElement.indicator.color = noDataColor;
            }
            return;
        }

        string gasName = data.config.gas_name;
        float value = data.latest_reading.value_ppm;
        float threshold = data.config.threshold;

        if (uiElement.text != null)
        {
            uiElement.text.text = $"{gasName}\n{value:F2} PPM\n(Max: {threshold})";
        }

        if (uiElement.indicator != null)
        {
            Color indicatorColor = GetColorForValue(value, threshold);
            uiElement.indicator.color = indicatorColor;
        }

        if (timestampText != null)
        {
            timestampText.text = $"Last Update: {System.DateTime.Now:HH:mm:ss}";
        }

        UpdateStatusText("Monitoring Active");

        Debug.Log($"[GasMonitorUI] Updated {gasName}: {value:F2} PPM (Threshold: {threshold})");
    }

    Color GetColorForValue(float value, float threshold)
    {
        if (threshold <= 0)
        {
            return noDataColor;
        }

        float ratio = value / threshold;

        if (ratio >= 1.0f)
        {
            return dangerColor;
        }
        else if (ratio >= warningThreshold)
        {
            return warningColor;
        }
        else
        {
            return normalColor;
        }
    }

    void UpdateStatusText(string status)
    {
        if (statusText != null)
        {
            statusText.text = status;
        }
    }

    string GetGasNameFromId(string gasId)
    {
        switch (gasId)
        {
            case "gas-1": return "LPG";
            case "gas-2": return "PROPANE";
            case "gas-3": return "BUTANE";
            case "gas-4": return "METHANE";
            default: return "UNKNOWN";
        }
    }

    public void ManualUpdate()
    {
        Debug.Log("[GasMonitorUI] Manual update requested");
        UpdateAllDisplays();
    }

    void UpdateAllDisplays()
    {
        if (gasMonitor == null) return;

        var allData = gasMonitor.GetAllGasData();

        if (allData.Count == 0)
        {
            UpdateStatusText("No data available");
            return;
        }

        foreach (var kvp in allData)
        {
            UpdateGasDisplay(kvp.Key, kvp.Value);
        }
    }

    void Update()
    {
        if (!hasReceivedData)
        {
            UpdateStatusText("Waiting for data...");
        }
    }
}

[System.Serializable]
public class GasUIElement
{
    public TextMeshProUGUI text;
    public Image indicator;
}