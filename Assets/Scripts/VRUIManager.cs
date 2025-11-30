using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

public class VRUIManager : MonoBehaviour
{
    [Header("UI Panels")]
    public GameObject loginPanel;
    public GameObject connectedPanel;
    public GameObject loadingPanel;

    [Header("Login Panel Elements")]
    public TMP_InputField codeInputField;
    public Button connectButton;
    public TMP_Text loginStatusText;
    public TMP_Text loginTitleText;
    public TMP_Text instructionsText;

    [Header("Connected Panel Elements")]
    public TMP_Text robotInfoText;
    public TMP_Text sessionTimerText;
    public Button disconnectButton;
    public Image connectionStatusIndicator;
    public TMP_Text connectionStatusText;

    [Header("Loading Panel Elements")]
    public TMP_Text loadingText;
    public Image loadingSpinner;
    public Slider progressBar;
    public TMP_Text progressText;

    [Header("Visual Feedback")]
    public GameObject successParticles;
    public AudioSource feedbackAudio;
    public AudioClip successSound;
    public AudioClip errorSound;
    public AudioClip clickSound;

    [Header("Debug Panel")]
    public TMP_Text debugOutputText;
    public GameObject debugPanel;
    public bool showDebugPanel = false;

    [Header("Settings")]
    public bool autoFocusCodeInput = true;
    public float transitionDuration = 0.3f;
    public float spinnerSpeed = 200f;

    [Header("Colors")]
    public Color successColor = new Color(0.2f, 0.8f, 0.3f);
    public Color errorColor = new Color(0.9f, 0.2f, 0.2f);
    public Color warningColor = new Color(1f, 0.7f, 0.1f);
    public Color infoColor = new Color(0.3f, 0.6f, 1f);

    private bool isConnected = false;
    private bool isConnecting = false;
    private bool isDisconnecting = false;
    private Coroutine timerCoroutine;
    private Coroutine loadingAnimationCoroutine;
    private Coroutine currentAuthCoroutine;

    void Start()
    {
        LogDebug("=== VR UI Manager Started ===");

        if (CredentialManager.Instance == null)
        {
            LogDebug("CRITICAL: CredentialManager not found!");
            ShowError("System Error", "CredentialManager missing - Please restart");
            return;
        }

        CredentialManager.Instance.OnAuthenticationSuccess += OnAuthenticationSuccess;
        CredentialManager.Instance.OnAuthenticationFailed += OnAuthenticationFailed;
        CredentialManager.Instance.OnDisconnectComplete += OnDisconnectComplete;

        SetupButtonListeners();
        InitializeUI();
        ShowLoginPanel();

        if (autoFocusCodeInput && codeInputField != null)
        {
            codeInputField.ActivateInputField();
        }

        UpdateLoginStatus("Welcome! Enter your 6-digit robot code", infoColor);

        if (debugPanel != null)
        {
            debugPanel.SetActive(showDebugPanel);
        }

        LogDebug("=== Initialization Complete ===");
    }

    void InitializeUI()
    {
        if (loginTitleText != null)
        {
            loginTitleText.text = "ROBOT CONTROL";
            loginTitleText.fontSize = 48;
            loginTitleText.fontStyle = FontStyles.Bold;
        }

        if (instructionsText != null)
        {
            instructionsText.text = "Enter the 6-digit code,displayed on your robot";
            instructionsText.fontSize = 24;
        }

        if (codeInputField != null)
        {
            codeInputField.characterLimit = 6;
            codeInputField.placeholder.GetComponent<TMP_Text>().text = "ABC123";
            codeInputField.textComponent.fontSize = 36;
            codeInputField.textComponent.fontStyle = FontStyles.Bold;
            codeInputField.textComponent.alignment = TextAlignmentOptions.Center;
        }

        if (connectButton != null)
        {
            var btnText = connectButton.GetComponentInChildren<TMP_Text>();
            if (btnText != null)
            {
                btnText.text = "CONNECT";
                btnText.fontSize = 28;
                btnText.fontStyle = FontStyles.Bold;
            }
        }

        if (disconnectButton != null)
        {
            var btnText = disconnectButton.GetComponentInChildren<TMP_Text>();
            if (btnText != null)
            {
                btnText.text = "DISCONNECT";
                btnText.fontSize = 24;
            }
        }

        if (progressBar != null)
        {
            progressBar.value = 0;
        }
    }

    void SetupButtonListeners()
    {
        if (connectButton != null)
        {
            connectButton.onClick.RemoveAllListeners();
            connectButton.onClick.AddListener(() => {
                PlaySound(clickSound);
                OnConnectButtonPressed();
            });
        }

        if (disconnectButton != null)
        {
            disconnectButton.onClick.RemoveAllListeners();
            disconnectButton.onClick.AddListener(() => {
                PlaySound(clickSound);
                OnDisconnectButtonPressed();
            });
        }
    }

    public void OnConnectButtonPressed()
    {
        LogDebug("Connect Button Pressed");

        if (isDisconnecting)
        {
            LogDebug("Disconnect in progress - please wait");
            UpdateLoginStatus("Please wait - Disconnecting...", warningColor);
            PlaySound(errorSound);
            ShakeElement(connectButton.transform);
            return;
        }

        if (isConnecting)
        {
            LogDebug("Already connecting - ignoring");
            return;
        }

        if (codeInputField == null)
        {
            ShowError("Configuration Error", "Input field missing");
            return;
        }

        string code = codeInputField.text?.ToUpper().Trim() ?? "";

        if (string.IsNullOrEmpty(code))
        {
            UpdateLoginStatus("Please enter a code", warningColor);
            ShakeElement(codeInputField.transform);
            PlaySound(errorSound);
            return;
        }

        if (code.Length != 6)
        {
            UpdateLoginStatus($"Code must be 6 characters", warningColor);
            ShakeElement(codeInputField.transform);
            PlaySound(errorSound);
            return;
        }

        if (CredentialManager.Instance == null)
        {
            ShowError("System Error", "Credential system unavailable");
            return;
        }

        if (CredentialManager.Instance.lastUsedSessionCode == code)
        {
            float timeSinceLastUse = Time.time - CredentialManager.Instance.lastSessionCodeTime;
            if (timeSinceLastUse < 5f)
            {
                UpdateLoginStatus($"Wait {Mathf.CeilToInt(5f - timeSinceLastUse)}s before retrying same code", warningColor);
                ShakeElement(connectButton.transform);
                PlaySound(errorSound);
                return;
            }
        }

        StartCoroutine(AuthenticateWithCode(code));
    }

    IEnumerator AuthenticateWithCode(string code)
    {
        LogDebug($"=== Starting Authentication: {code} ===");

        isConnecting = true;
        ShowLoadingPanel($"Connecting to robot {code}...");
        StartLoadingAnimation();

        if (connectButton != null)
            connectButton.interactable = false;

        currentAuthCoroutine = StartCoroutine(CredentialManager.Instance.AuthenticateWithAWS(code));

        yield return currentAuthCoroutine;

        currentAuthCoroutine = null;

        if (connectButton != null)
            connectButton.interactable = true;
    }

    void OnAuthenticationSuccess()
    {
        LogDebug("Authentication Success!");

        isConnected = true;
        isConnecting = false;
        StopLoadingAnimation();

        PlaySound(successSound);
        if (successParticles != null)
        {
            successParticles.SetActive(true);
            StartCoroutine(HideAfterDelay(successParticles, 2f));
        }

        StartCoroutine(TransitionToConnected());
    }

    IEnumerator TransitionToConnected()
    {
        UpdateLoadingProgress(1f, "Connected!");
        yield return new WaitForSeconds(0.5f);

        ShowConnectedPanel();
        StartSessionTimer();
    }

    void OnAuthenticationFailed(string errorMessage)
    {
        LogDebug($"Authentication Failed: {errorMessage}");

        isConnecting = false;
        isDisconnecting = false;
        StopLoadingAnimation();

        PlaySound(errorSound);

        StartCoroutine(ShowErrorThenLogin(errorMessage));

        if (connectButton != null)
            connectButton.interactable = true;
    }

    IEnumerator ShowErrorThenLogin(string errorMessage)
    {
        UpdateLoadingProgress(0f, $"ERROR: {errorMessage}");
        yield return new WaitForSeconds(2f);

        ShowLoginPanel();
        ShowError("Connection Failed", errorMessage);
    }

    public void OnDisconnectButtonPressed()
    {
        LogDebug("Disconnect Button Pressed");

        if (isDisconnecting)
        {
            LogDebug("Already disconnecting - ignoring");
            return;
        }

        StartCoroutine(DisconnectSequence());
    }

    IEnumerator DisconnectSequence()
    {
        LogDebug("UI DISCONNECT SEQUENCE START");

        isDisconnecting = true;

        if (timerCoroutine != null)
        {
            StopCoroutine(timerCoroutine);
            timerCoroutine = null;
        }

        ShowLoadingPanel("Disconnecting from robot...");
        StartLoadingAnimation();

        if (disconnectButton != null)
            disconnectButton.interactable = false;

        UpdateLoadingProgress(0.1f, "Leaving video channel...");
        LogDebug("Waiting for Agora disconnect...");
        yield return new WaitForSeconds(0.5f);

        UpdateLoadingProgress(0.3f, "Stopping robot commands...");
        LogDebug("Waiting for Firebase cleanup...");
        yield return new WaitForSeconds(0.5f);

        UpdateLoadingProgress(0.5f, "Notifying server...");
        LogDebug("Calling AWS disconnect...");

        if (CredentialManager.Instance != null && CredentialManager.Instance.credentialsLoaded)
        {
            yield return StartCoroutine(CredentialManager.Instance.DisconnectFromAWS());
        }
        else
        {
            LogDebug("No credentials to disconnect");
        }

        UpdateLoadingProgress(0.9f, "Finalizing...");
        yield return new WaitForSeconds(0.3f);

        UpdateLoadingProgress(1f, "Disconnected!");
        yield return new WaitForSeconds(0.3f);
    }

    void OnDisconnectComplete()
    {
        LogDebug("DISCONNECT COMPLETE");

        isConnected = false;
        isConnecting = false;
        isDisconnecting = false;

        StopLoadingAnimation();

        ShowLoginPanel();
        UpdateLoginStatus("Disconnected successfully. Ready to reconnect.", successColor);

        if (connectButton != null)
            connectButton.interactable = true;

        if (disconnectButton != null)
            disconnectButton.interactable = true;

        PlaySound(clickSound);

        LogDebug("UI ready for new connection");
    }

    void StartSessionTimer()
    {
        if (timerCoroutine != null)
            StopCoroutine(timerCoroutine);

        timerCoroutine = StartCoroutine(UpdateSessionTimer());
    }

    IEnumerator UpdateSessionTimer()
    {
        while (isConnected)
        {
            if (CredentialManager.Instance != null)
            {
                if (CredentialManager.Instance.IsSessionExpired())
                {
                    LogDebug("Session expired!");
                    ShowError("Session Expired", "Please reconnect with a new code");
                    yield return StartCoroutine(DisconnectSequence());
                    yield break;
                }

                long secondsLeft = CredentialManager.Instance.GetTimeRemaining();
                int minutes = (int)(secondsLeft / 60);
                int seconds = (int)(secondsLeft % 60);

                if (sessionTimerText != null)
                {
                    sessionTimerText.text = $"{minutes:D2}:{seconds:D2}";

                    if (minutes < 5)
                    {
                        sessionTimerText.color = warningColor;
                        if (minutes < 2)
                        {
                            sessionTimerText.color = errorColor;
                        }
                    }
                    else
                    {
                        sessionTimerText.color = successColor;
                    }
                }

                if (connectionStatusIndicator != null)
                {
                    connectionStatusIndicator.color = successColor;
                }

                if (connectionStatusText != null)
                {
                    connectionStatusText.text = "Connected";
                    connectionStatusText.color = successColor;
                }
            }

            yield return new WaitForSeconds(1f);
        }
    }

    void ShowLoginPanel()
    {
        LogDebug("UI: Showing login panel");
        StartCoroutine(FadePanel(loginPanel, true));
        StartCoroutine(FadePanel(connectedPanel, false));
        StartCoroutine(FadePanel(loadingPanel, false));
    }

    void ShowConnectedPanel()
    {
        LogDebug("UI: Showing connected panel");
        StartCoroutine(FadePanel(loginPanel, false));
        StartCoroutine(FadePanel(connectedPanel, true));
        StartCoroutine(FadePanel(loadingPanel, false));

        if (robotInfoText != null && CredentialManager.Instance != null)
        {
            string info = $"<b>Robot:</b> {CredentialManager.Instance.robotId}\n" +
                         $"<b>Session:</b> {CredentialManager.Instance.sessionCode}\n";

            robotInfoText.text = info;
        }
    }

    void ShowLoadingPanel(string message)
    {
        LogDebug($"UI: Showing loading panel - {message}");
        StartCoroutine(FadePanel(loginPanel, false));
        StartCoroutine(FadePanel(connectedPanel, false));
        StartCoroutine(FadePanel(loadingPanel, true));

        if (loadingText != null)
            loadingText.text = message;

        if (progressBar != null)
            progressBar.value = 0;
    }

    IEnumerator FadePanel(GameObject panel, bool fadeIn)
    {
        if (panel == null) yield break;

        CanvasGroup canvasGroup = panel.GetComponent<CanvasGroup>();
        if (canvasGroup == null)
        {
            canvasGroup = panel.AddComponent<CanvasGroup>();
        }

        float start = fadeIn ? 0f : 1f;
        float end = fadeIn ? 1f : 0f;
        float elapsed = 0f;

        panel.SetActive(true);

        while (elapsed < transitionDuration)
        {
            elapsed += Time.deltaTime;
            float t = elapsed / transitionDuration;
            canvasGroup.alpha = Mathf.Lerp(start, end, t);
            yield return null;
        }

        canvasGroup.alpha = end;

        if (!fadeIn)
        {
            panel.SetActive(false);
        }
    }

    void UpdateLoginStatus(string message, Color color)
    {
        if (loginStatusText != null)
        {
            loginStatusText.text = message;
            loginStatusText.color = color;
        }

        LogDebug($"Status: {message}");
    }

    void UpdateLoadingProgress(float progress, string message)
    {
        if (progressBar != null)
        {
            progressBar.value = progress;
        }

        if (progressText != null)
        {
            progressText.text = $"{Mathf.RoundToInt(progress * 100)}%";
        }

        if (loadingText != null)
        {
            loadingText.text = message;
        }
    }

    void ShowError(string title, string message)
    {
        UpdateLoginStatus($"ERROR: {title}\n{message}", errorColor);
        PlaySound(errorSound);
    }

    void ShakeElement(Transform element)
    {
        if (element != null)
        {
            StartCoroutine(ShakeAnimation(element));
        }
    }

    IEnumerator ShakeAnimation(Transform element)
    {
        Vector3 originalPos = element.localPosition;
        float duration = 0.5f;
        float elapsed = 0f;
        float magnitude = 10f;

        while (elapsed < duration)
        {
            float x = Random.Range(-1f, 1f) * magnitude;
            float y = Random.Range(-1f, 1f) * magnitude;

            element.localPosition = originalPos + new Vector3(x, y, 0);

            elapsed += Time.deltaTime;
            magnitude = Mathf.Lerp(10f, 0f, elapsed / duration);

            yield return null;
        }

        element.localPosition = originalPos;
    }

    void StartLoadingAnimation()
    {
        if (loadingAnimationCoroutine != null)
        {
            StopCoroutine(loadingAnimationCoroutine);
        }
        loadingAnimationCoroutine = StartCoroutine(AnimateLoadingSpinner());
    }

    void StopLoadingAnimation()
    {
        if (loadingAnimationCoroutine != null)
        {
            StopCoroutine(loadingAnimationCoroutine);
            loadingAnimationCoroutine = null;
        }
    }

    IEnumerator AnimateLoadingSpinner()
    {
        if (loadingSpinner == null) yield break;

        while (true)
        {
            loadingSpinner.transform.Rotate(0, 0, -spinnerSpeed * Time.deltaTime);
            yield return null;
        }
    }

    IEnumerator HideAfterDelay(GameObject obj, float delay)
    {
        yield return new WaitForSeconds(delay);
        if (obj != null)
        {
            obj.SetActive(false);
        }
    }

    void PlaySound(AudioClip clip)
    {
        if (feedbackAudio != null && clip != null)
        {
            feedbackAudio.PlayOneShot(clip);
        }
    }

    void LogDebug(string message)
    {
        string timestamp = System.DateTime.Now.ToString("HH:mm:ss.fff");
        string fullMessage = $"[{timestamp}][VRUIManager] {message}";

        Debug.Log(fullMessage);

        if (debugOutputText != null && showDebugPanel)
        {
            debugOutputText.text = $"{fullMessage}\n{debugOutputText.text}";

            string[] lines = debugOutputText.text.Split('\n');
            if (lines.Length > 25)
            {
                debugOutputText.text = string.Join("\n", lines, 0, 25);
            }
        }
    }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.Return) && loginPanel != null && loginPanel.activeSelf && !isDisconnecting)
        {
            OnConnectButtonPressed();
        }

        if (Input.GetKeyDown(KeyCode.Escape) && isConnected && !isDisconnecting)
        {
            OnDisconnectButtonPressed();
        }

        if (Input.GetKeyDown(KeyCode.F1))
        {
            showDebugPanel = !showDebugPanel;
            if (debugPanel != null)
            {
                debugPanel.SetActive(showDebugPanel);
            }
            LogDebug($"Debug panel: {(showDebugPanel ? "SHOWN" : "HIDDEN")}");
        }
    }

    void OnDestroy()
    {
        if (CredentialManager.Instance != null)
        {
            CredentialManager.Instance.OnAuthenticationSuccess -= OnAuthenticationSuccess;
            CredentialManager.Instance.OnAuthenticationFailed -= OnAuthenticationFailed;
            CredentialManager.Instance.OnDisconnectComplete -= OnDisconnectComplete;
        }

        if (timerCoroutine != null)
            StopCoroutine(timerCoroutine);

        StopLoadingAnimation();

        if (currentAuthCoroutine != null)
            StopCoroutine(currentAuthCoroutine);

        if (isConnected && CredentialManager.Instance != null)
        {
            StartCoroutine(CredentialManager.Instance.DisconnectFromAWS());
        }
    }

    public bool IsConnected() => isConnected;
    public bool IsDisconnecting() => isDisconnecting;
}