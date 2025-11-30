using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

public class CredentialManager : MonoBehaviour
{
    private const string AWS_AUTH_URL = "https://vehn7fk26clzw7y5oehkyln3x40cbupf.lambda-url.ap-southeast-1.on.aws/";
    private const string AWS_DISCONNECT_URL = "https://sijdbslybqjrqbplvolaalepe0xzspc.lambda-url.ap-southeast-1.on.aws/";

    [Header("Credential Status")]
    public bool credentialsLoaded = false;
    public bool isAuthenticating = false;
    public bool isDisconnecting = false;

    [Header("Session Tracking")]
    public string lastUsedSessionCode = "";
    public float lastSessionCodeTime = 0f;

    [Header("Session Info")]
    public string sessionCode = "";
    public string robotId = "";
    public string agoraChannel = "";
    public long sessionExpiresAt = 0;
    public string connectionToken = "";

    [Header("Debug")]
    public bool enableDebugLogs = true;

    [Header("Network Settings")]
    public float requestTimeout = 20f;
    public float disconnectTimeout = 15f;
    public int maxAuthRetries = 3;
    public float retryDelaySeconds = 3f;

    private FirebaseCredentials firebaseCreds;
    private AgoraCredentials agoraCreds;

    public static CredentialManager Instance { get; private set; }

    [Serializable]
    public class FirebaseCredentials
    {
        public string databaseURL;
        public string projectId;
        public string apiKey;
        public string appId;
        public string storageBucket;
    }

    [Serializable]
    public class AgoraCredentials
    {
        public string appId;
        public string channel;
        public string token;
    }

    [Serializable]
    private class AuthRequest
    {
        public string session_code;
        public string connection_token;
    }

    [Serializable]
    private class DisconnectRequest
    {
        public string session_code;
        public string robot_id;
        public string connection_token;
    }

    [Serializable]
    private class SessionInfo
    {
        public string session_code;
        public string robot_id;
        public long expires_at;
        public string agora_channel;
        public string connection_token;
    }

    [Serializable]
    private class AuthenticationResponse
    {
        public bool success;
        public FirebaseCredentials firebase;
        public AgoraCredentials agora;
        public SessionInfo session_info;
        public string message;
        public string error;
        public int retry_after;
    }

    [Serializable]
    private class DisconnectResponse
    {
        public bool success;
        public string message;
        public string error;
        public string warning;
    }

    public event Action OnAuthenticationSuccess;
    public event Action<string> OnAuthenticationFailed;
    public event Action OnSessionExpired;
    public event Action OnDisconnectComplete;

    void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
            Log("CredentialManager Instance created");
        }
        else
        {
            Log("Duplicate CredentialManager - destroying");
            Destroy(gameObject);
        }
    }

    void Start()
    {
        isDisconnecting = false;
        isAuthenticating = false;

        Log("CredentialManager initialized");
        Log($"Platform: {Application.platform}");
        Log($"Internet: {Application.internetReachability}");
        Log($"State Reset: isDisconnecting={isDisconnecting}, isAuthenticating={isAuthenticating}");
    }

    public IEnumerator AuthenticateWithAWS(string userEnteredCode)
    {
        Log("Authentication started");
        Log($"Session code: {userEnteredCode}");

        isAuthenticating = true;
        credentialsLoaded = false;

        if (string.IsNullOrEmpty(userEnteredCode) || userEnteredCode.Length != 6)
        {
            LogError("Invalid code format");
            OnAuthenticationFailed?.Invoke("Invalid code format (must be 6 characters)");
            isAuthenticating = false;
            yield break;
        }

        string code = userEnteredCode.ToUpper().Trim();

        if (isDisconnecting)
        {
            LogWarning("Disconnect in progress - waiting...");
            OnAuthenticationFailed?.Invoke("Please wait, disconnecting...");
            isAuthenticating = false;
            yield break;
        }

        UnityWebRequest request = null;

        try
        {
            var requestBody = new AuthRequest
            {
                session_code = code,
                connection_token = connectionToken
            };
            string jsonBody = JsonUtility.ToJson(requestBody);

            Log($"Sending authentication request...");

            request = new UnityWebRequest(AWS_AUTH_URL, "POST");
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(jsonBody);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.timeout = (int)requestTimeout;
        }
        catch (Exception e)
        {
            LogError($"Failed to create request: {e.Message}");
            OnAuthenticationFailed?.Invoke($"Request creation failed: {e.Message}");
            isAuthenticating = false;
            yield break;
        }

        var operation = request.SendWebRequest();

        float elapsed = 0f;
        while (!operation.isDone && elapsed < requestTimeout)
        {
            elapsed += Time.deltaTime;
            yield return null;
        }

        if (!operation.isDone)
        {
            LogError($"Request timeout after {requestTimeout}s");
            request.Abort();
            OnAuthenticationFailed?.Invoke("Connection timeout - Check your network");
            isAuthenticating = false;
            request.Dispose();
            yield break;
        }

        Log($"Request completed in {elapsed:F2}s");
        Log($"Status: {request.responseCode}");

        try
        {
            if (request.result == UnityWebRequest.Result.Success)
            {
                Log("Request successful");

                string responseText = request.downloadHandler.text;
                AuthenticationResponse response = JsonUtility.FromJson<AuthenticationResponse>(responseText);

                if (response == null || !response.success)
                {
                    string error = response?.error ?? response?.message ?? "Unknown error";
                    LogError($"Server error: {error}");
                    OnAuthenticationFailed?.Invoke(GetUserFriendlyError(error));
                }
                else if (response.firebase == null || response.agora == null || response.session_info == null)
                {
                    LogError("Incomplete response");
                    OnAuthenticationFailed?.Invoke("Incomplete server response");
                }
                else
                {
                    Log("Storing credentials...");

                    this.firebaseCreds = response.firebase;
                    this.agoraCreds = response.agora;
                    this.sessionCode = response.session_info.session_code;
                    this.robotId = response.session_info.robot_id;
                    this.agoraChannel = response.session_info.agora_channel;
                    this.sessionExpiresAt = response.session_info.expires_at;
                    this.connectionToken = response.session_info.connection_token;

                    credentialsLoaded = true;

                    Log($"Credentials stored:");
                    Log($"Session: {this.sessionCode}");
                    Log($"Robot: {this.robotId}");
                    Log($"Channel: {this.agoraChannel}");
                    Log($"Connection Token: {this.connectionToken.Substring(0, Math.Min(8, this.connectionToken.Length))}...");

                    Log("Triggering OnAuthenticationSuccess");
                    OnAuthenticationSuccess?.Invoke();
                }
            }
            else
            {
                LogError($"Request failed: {request.error}");
                LogError($"Status: {request.responseCode}");

                string friendlyError = GetFriendlyError(request.responseCode);
                OnAuthenticationFailed?.Invoke(friendlyError);
            }
        }
        catch (Exception e)
        {
            LogError($"Exception: {e.Message}");
            OnAuthenticationFailed?.Invoke($"Error: {e.Message}");
        }
        finally
        {
            request.Dispose();
        }

        isAuthenticating = false;

        if (credentialsLoaded)
        {
            Log("AUTHENTICATION SUCCESSFUL");
        }
        else
        {
            Log("AUTHENTICATION FAILED");
        }
    }

    public IEnumerator DisconnectFromAWS()
    {
        Log("DISCONNECT FROM AWS - BLOCKING MODE");

        if (!credentialsLoaded || string.IsNullOrEmpty(sessionCode))
        {
            LogWarning("No active session to disconnect");
            ClearAllCredentials();
            OnDisconnectComplete?.Invoke();
            yield break;
        }

        isDisconnecting = true;

        Log($"Sending disconnect request to AWS...");
        Log($"Session: {sessionCode}");
        Log($"Robot: {robotId}");
        Log($"Connection Token: {connectionToken.Substring(0, Math.Min(8, connectionToken.Length))}...");
        Log("BLOCKING all reconnection until confirmed");

        UnityWebRequest request = null;
        bool disconnectVerified = false;
        string disconnectError = "";

        try
        {
            var requestBody = new DisconnectRequest
            {
                session_code = sessionCode,
                robot_id = robotId,
                connection_token = connectionToken
            };
            string jsonBody = JsonUtility.ToJson(requestBody);

            request = new UnityWebRequest(AWS_DISCONNECT_URL, "POST");
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(jsonBody);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.timeout = (int)disconnectTimeout;
        }
        catch (Exception e)
        {
            LogError($"Failed to create disconnect request: {e.Message}");
            disconnectError = e.Message;
        }

        if (request != null)
        {
            var operation = request.SendWebRequest();

            float elapsed = 0f;
            while (!operation.isDone && elapsed < disconnectTimeout)
            {
                elapsed += Time.deltaTime;
                yield return null;
            }

            if (!operation.isDone)
            {
                LogError($"Disconnect TIMEOUT after {disconnectTimeout}s");
                request.Abort();
                disconnectError = "Timeout - may still be connected on server";
            }
            else
            {
                Log($"Disconnect response received in {elapsed:F2}s");
                Log($"Status: {request.responseCode}");

                if (request.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        string responseText = request.downloadHandler.text;
                        Log($"Response: {responseText}");

                        DisconnectResponse response = JsonUtility.FromJson<DisconnectResponse>(responseText);

                        if (response != null && response.success)
                        {
                            Log("AWS CONFIRMED: vr_connected = false in DynamoDB");
                            Log($"Message: {response.message}");

                            if (!string.IsNullOrEmpty(response.warning))
                            {
                                LogWarning($"Warning: {response.warning}");
                            }

                            disconnectVerified = true;
                        }
                        else
                        {
                            disconnectError = response?.error ?? "Unknown error";
                            LogError($"AWS disconnect failed: {disconnectError}");
                        }
                    }
                    catch (Exception e)
                    {
                        disconnectError = $"Failed to parse response: {e.Message}";
                        LogError($"{disconnectError}");
                    }
                }
                else
                {
                    disconnectError = $"HTTP {request.responseCode}: {request.error}";
                    LogError($"AWS request failed: {disconnectError}");
                }
            }

            request.Dispose();
        }

        if (disconnectVerified)
        {
            Log("Disconnect verified - clearing credentials");
            ClearAllCredentials();
        }
        else
        {
            LogError("Disconnect NOT verified!");
            LogError($"Reason: {disconnectError}");
            LogError("Clearing credentials anyway (local cleanup)");

            ClearAllCredentials();
        }

        isDisconnecting = false;

        if (disconnectVerified)
        {
            Log("DISCONNECT COMPLETE & VERIFIED");
            Log("Safe to reconnect with same PIN");
        }
        else
        {
            Log("DISCONNECT INCOMPLETE");
            Log($"Error: {disconnectError}");
            Log("Wait 60 seconds before reconnecting");
        }

        OnDisconnectComplete?.Invoke();
    }

    string GetFriendlyError(long responseCode)
    {
        switch (responseCode)
        {
            case 404:
                return "Session not found - Check code on robot";
            case 403:
                return "Session expired - Generate new code";
            case 409:
                return "Robot already connected - Disconnect first or wait 60 seconds";
            case 429:
                return "Too many failed attempts - Wait and try again";
            case 0:
                return "Cannot connect - Check internet";
            default:
                return "Connection failed - Try again";
        }
    }

    string GetUserFriendlyError(string serverError)
    {
        if (serverError.Contains("already connected"))
            return "Robot already connected - Press disconnect first";
        if (serverError.Contains("expired"))
            return "Session expired - Generate new code on robot";
        if (serverError.Contains("not found"))
            return "Invalid code - Check robot display";
        if (serverError.Contains("Too many"))
            return serverError;

        return serverError;
    }

    public FirebaseCredentials GetFirebaseCredentials()
    {
        if (!credentialsLoaded)
        {
            LogWarning("Credentials not loaded");
            return null;
        }
        return firebaseCreds;
    }

    public AgoraCredentials GetAgoraCredentials()
    {
        if (!credentialsLoaded)
        {
            LogWarning("Credentials not loaded");
            return null;
        }
        return agoraCreds;
    }

    public bool AreCredentialsReady()
    {
        bool ready = credentialsLoaded &&
                     !isAuthenticating &&
                     !isDisconnecting &&
                     firebaseCreds != null &&
                     agoraCreds != null &&
                     !string.IsNullOrEmpty(sessionCode) &&
                     !string.IsNullOrEmpty(robotId) &&
                     !string.IsNullOrEmpty(connectionToken);

        return ready;
    }

    public bool IsSessionExpired()
    {
        if (sessionExpiresAt == 0) return true;
        long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return currentTime >= sessionExpiresAt;
    }

    public long GetTimeRemaining()
    {
        if (sessionExpiresAt == 0) return 0;
        long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return Math.Max(0, (sessionExpiresAt - currentTime) / 1000);
    }

    public void ClearAllCredentials()
    {
        Log("Clearing ALL credentials and session info");

        credentialsLoaded = false;
        firebaseCreds = null;
        agoraCreds = null;
        sessionCode = "";
        robotId = "";
        agoraChannel = "";
        sessionExpiresAt = 0;
        connectionToken = "";

        Log("All credentials cleared");
    }

    private void Log(string msg)
    {
        if (enableDebugLogs)
            Debug.Log($"[CredentialManager] {msg}");
    }

    private void LogWarning(string msg)
    {
        Debug.LogWarning($"[CredentialManager] {msg}");
    }

    private void LogError(string msg)
    {
        Debug.LogError($"[CredentialManager] {msg}");
    }

    void OnApplicationQuit()
    {
        if (credentialsLoaded)
        {
            Log("Application quitting - disconnecting...");
            SendDisconnectRequestSync();
        }
    }

    void OnDestroy()
    {
        if (credentialsLoaded && Application.isPlaying)
        {
            Log("CredentialManager destroying - disconnecting...");
            SendDisconnectRequestSync();
        }
    }

    void SendDisconnectRequestSync()
    {
        if (string.IsNullOrEmpty(sessionCode) || string.IsNullOrEmpty(robotId))
        {
            LogWarning("No session to disconnect");
            return;
        }

        Log("SYNCHRONOUS DISCONNECT (BLOCKING)");

        try
        {
            var requestBody = new DisconnectRequest
            {
                session_code = sessionCode,
                robot_id = robotId,
                connection_token = connectionToken
            };
            string jsonBody = JsonUtility.ToJson(requestBody);

            UnityWebRequest request = new UnityWebRequest(AWS_DISCONNECT_URL, "POST");
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(jsonBody);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.timeout = 10;

            Log($"Sending disconnect: {sessionCode}");

            var operation = request.SendWebRequest();

            float maxWait = 10f;
            float waited = 0f;
            while (!operation.isDone && waited < maxWait)
            {
                System.Threading.Thread.Sleep(100);
                waited += 0.1f;
            }

            if (operation.isDone && request.result == UnityWebRequest.Result.Success)
            {
                Log("Disconnect confirmed by AWS");
                var response = JsonUtility.FromJson<DisconnectResponse>(request.downloadHandler.text);
                if (response != null && response.success)
                {
                    Log($"{response.message}");
                }
            }
            else
            {
                LogWarning($"Disconnect may not have completed: {request.error}");
            }

            request.Dispose();
            ClearAllCredentials();
        }
        catch (Exception e)
        {
            LogError($"Sync disconnect error: {e.Message}");
            ClearAllCredentials();
        }
    }
}