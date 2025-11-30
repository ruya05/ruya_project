using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Agora.Rtc;

public class SecureAgoraVideoStream : MonoBehaviour
{
    [Header("Video Display")]
    public GameObject videoScreen;

    [Header("Status Display")]
    public TextMeshProUGUI statusText;

    [Header("Connection Settings")]
    public bool autoConnectWhenReady = true;
    public bool autoReconnect = true;
    public int maxReconnectAttempts = 5;
    [Range(5f, 30f)] public float connectionTimeout = 15f;
    [Range(2f, 10f)] public float disconnectTimeout = 5f; 

    private IRtcEngine rtcEngine;
    private VideoSurface videoSurface;

    private bool isConnected = false;
    private bool isVideoReceiving = false;
    private bool isDisconnecting = false; 
    private uint remoteUserId = 0;
    private int reconnectAttempts = 0;
    private float connectionTimer = 0f;

    private string agoraAppId;
    private string agoraChannel;
    private string agoraToken;

    private float lastFrameTime;
    private int frameCount;
    private float fps;

    private UserEventHandler userEventHandler;


    private bool waitingForLeaveChannel = false;
    private Coroutine disconnectCoroutine;

    void Start()
    {
        try
        {
            if (videoScreen == null)
            {
                LogError("Video screen GameObject not assigned!");
                UpdateStatus("ERROR: No video screen");
                return;
            }

            LogInfo("Initializing Secure Agora Video Stream...");

            if (autoConnectWhenReady)
            {
                LogInfo("Waiting for user to authenticate via VRUIManager...");

                if (CredentialManager.Instance != null)
                {
                    CredentialManager.Instance.OnAuthenticationSuccess += OnCredentialsReady;
                    CredentialManager.Instance.OnDisconnectComplete += OnDisconnectRequested;

                    if (CredentialManager.Instance.AreCredentialsReady())
                    {
                        LogInfo("Credentials already ready - connecting now");
                        StartCoroutine(ConnectWithExistingCredentials());
                    }
                }
            }
        }
        catch (Exception e)
        {
            LogError($"Start error: {e.Message}\n{e.StackTrace}");
            UpdateStatus($"ERROR: {e.Message}");
        }
    }

    private void OnCredentialsReady()
    {
        LogInfo("OnCredentialsReady event received!");


        if (isDisconnecting)
        {
            LogWarning("Disconnect in progress - ignoring credentials");
            return;
        }

        if (isConnected)
        {
            LogInfo("Already connected - ignoring");
            return;
        }

        StartCoroutine(ConnectWithExistingCredentials());
    }

    private void OnDisconnectRequested()
    {
        LogInfo("OnDisconnectRequested event received!");

        if (isDisconnecting)
        {
            LogWarning("Already disconnecting - ignoring");
            return;
        }

        if (disconnectCoroutine != null)
        {
            StopCoroutine(disconnectCoroutine);
        }
        disconnectCoroutine = StartCoroutine(DisconnectSequence());
    }

    IEnumerator DisconnectSequence()
    {
        LogInfo("═══════════════════════════════════");
        LogInfo("AGORA DISCONNECT SEQUENCE START");
        LogInfo("═══════════════════════════════════");

        isDisconnecting = true;
        UpdateStatus("Disconnecting from video...");

        if (rtcEngine != null && isConnected)
        {

            LogInfo("Sending LeaveChannel request to Agora...");
            waitingForLeaveChannel = true;

            try
            {
                rtcEngine.LeaveChannel();
            }
            catch (Exception e)
            {
                LogError($"LeaveChannel error: {e.Message}");
                waitingForLeaveChannel = false;
            }


            float elapsed = 0f;
            while (waitingForLeaveChannel && elapsed < disconnectTimeout)
            {
                elapsed += Time.deltaTime;
                yield return null;
            }

            if (waitingForLeaveChannel)
            {
                LogWarning($"LeaveChannel callback timeout after {disconnectTimeout}s");
                waitingForLeaveChannel = false;
            }
            else
            {
                LogInfo("Agora confirmed channel left");
            }


            if (videoSurface != null)
            {
                LogInfo("Destroying video surface...");
                videoSurface.SetEnable(false);
                Destroy(videoSurface);
                videoSurface = null;
            }


            isConnected = false;
            isVideoReceiving = false;
            remoteUserId = 0;
            reconnectAttempts = 0;

            LogInfo("Local Agora cleanup complete");
        }
        else
        {
            LogInfo("No active Agora connection to disconnect");
        }

        UpdateStatus("Video disconnected");


        isDisconnecting = false;

        LogInfo("═══════════════════════════════════");
        LogInfo("AGORA DISCONNECT COMPLETE");
        LogInfo("═══════════════════════════════════");
    }

    IEnumerator ConnectWithExistingCredentials()
    {

        if (isDisconnecting)
        {
            LogError("Cannot connect - disconnect in progress");
            UpdateStatus("ERROR: Disconnect in progress");
            yield break;
        }

        UpdateStatus("Getting Agora credentials...");
        LogInfo("Getting Agora credentials from CredentialManager...");

        if (CredentialManager.Instance == null)
        {
            LogError("CredentialManager is null!");
            UpdateStatus("ERROR: No CredentialManager");
            yield break;
        }

        try
        {
            var agoraCreds = CredentialManager.Instance.GetAgoraCredentials();

            if (agoraCreds == null)
            {
                LogError("Failed to get Agora credentials");
                UpdateStatus("ERROR: No Agora credentials");
                yield break;
            }

            agoraAppId = agoraCreds.appId;
            agoraChannel = agoraCreds.channel;
            agoraToken = agoraCreds.token ?? "";

            if (string.IsNullOrEmpty(agoraAppId) || string.IsNullOrEmpty(agoraChannel))
            {
                LogError("Invalid Agora credentials");
                UpdateStatus("ERROR: Invalid credentials");
                yield break;
            }

            LogInfo($"Got Agora credentials");
            LogInfo($"   App ID: {agoraAppId.Substring(0, Math.Min(8, agoraAppId.Length))}...");
            LogInfo($"   Channel: {agoraChannel}");
        }
        catch (Exception e)
        {
            LogError($"Error getting Agora credentials: {e.Message}");
            UpdateStatus("ERROR: Credential error");
            yield break;
        }

        yield return StartCoroutine(InitializeAgoraEngine());

        if (rtcEngine != null)
        {
            JoinChannel();
        }
    }

    IEnumerator InitializeAgoraEngine()
    {
        LogInfo("Initializing Agora RTC Engine...");
        UpdateStatus("Initializing video engine...");

        RtcEngineContext context = new RtcEngineContext
        {
            appId = agoraAppId,
            channelProfile = CHANNEL_PROFILE_TYPE.CHANNEL_PROFILE_LIVE_BROADCASTING,
            audioScenario = AUDIO_SCENARIO_TYPE.AUDIO_SCENARIO_DEFAULT
        };

        try
        {
            rtcEngine = Agora.Rtc.RtcEngine.CreateAgoraRtcEngine();

            if (rtcEngine == null)
            {
                LogError("Failed to create Agora RTC Engine!");
                UpdateStatus("ERROR: Engine creation failed");
                yield break;
            }

            int result = rtcEngine.Initialize(context);
            if (result != 0)
            {
                LogError($"Failed to initialize engine. Error code: {result}");
                UpdateStatus($"ERROR: Init failed ({result})");
                yield break;
            }

            userEventHandler = new UserEventHandler(this);
            rtcEngine.InitEventHandler(userEventHandler);

            rtcEngine.SetClientRole(CLIENT_ROLE_TYPE.CLIENT_ROLE_AUDIENCE);

            ConfigureVideoSettings();

            LogInfo("Agora engine initialized");
        }
        catch (Exception e)
        {
            LogError($"Exception during initialization: {e.Message}\n{e.StackTrace}");
            UpdateStatus($"ERROR: {e.Message}");
            yield break;
        }

        yield return null;
    }

    void ConfigureVideoSettings()
    {
        try
        {
            rtcEngine.EnableVideo();

            VideoEncoderConfiguration config = new VideoEncoderConfiguration
            {
                dimensions = new VideoDimensions { width = 1280, height = 720 },
                frameRate = 30,
                bitrate = 2000,
                minBitrate = 1000,
                orientationMode = ORIENTATION_MODE.ORIENTATION_MODE_ADAPTIVE,
                degradationPreference = DEGRADATION_PREFERENCE.MAINTAIN_FRAMERATE,
                mirrorMode = VIDEO_MIRROR_MODE_TYPE.VIDEO_MIRROR_MODE_DISABLED
            };

            rtcEngine.SetVideoEncoderConfiguration(config);

            LogInfo("Video settings configured");
        }
        catch (Exception e)
        {
            LogError($"Error configuring video: {e.Message}");
        }
    }

    void JoinChannel()
    {
        try
        {
            LogInfo($"Joining Agora channel: {agoraChannel}");
            UpdateStatus($"Connecting to {agoraChannel}...");

            ChannelMediaOptions options = new ChannelMediaOptions();
            options.autoSubscribeAudio.SetValue(true);
            options.autoSubscribeVideo.SetValue(true);
            options.publishCameraTrack.SetValue(false);
            options.publishMicrophoneTrack.SetValue(false);
            options.clientRoleType.SetValue(CLIENT_ROLE_TYPE.CLIENT_ROLE_AUDIENCE);

            string token = string.IsNullOrEmpty(agoraToken) ? "" : agoraToken;
            int result = rtcEngine.JoinChannel(token, agoraChannel, 0, options);

            if (result != 0)
            {
                LogError($"Failed to join channel. Error: {result}");
                UpdateStatus($"ERROR: Join failed ({result})");
            }
        }
        catch (Exception e)
        {
            LogError($"Exception joining channel: {e.Message}\n{e.StackTrace}");
            UpdateStatus($"ERROR: {e.Message}");
        }
    }

    void SetupRemoteVideo(uint uid)
    {
        try
        {
            if (videoSurface != null)
            {
                Destroy(videoSurface);
            }

            videoSurface = videoScreen.AddComponent<VideoSurface>();

            if (videoSurface == null)
            {
                LogError("Failed to add VideoSurface component!");
                return;
            }

            videoSurface.SetForUser(uid, agoraChannel, VIDEO_SOURCE_TYPE.VIDEO_SOURCE_REMOTE);
            videoSurface.SetEnable(true);

            LogInfo($"Video surface configured for UID {uid}");
        }
        catch (Exception e)
        {
            LogError($"Error setting up remote video: {e.Message}\n{e.StackTrace}");
        }
    }

    void HandleConnectionTimeout()
    {
        reconnectAttempts++;

        if (reconnectAttempts >= maxReconnectAttempts)
        {
            LogError($"Max reconnection attempts ({maxReconnectAttempts}) reached");
            UpdateStatus("ERROR: Connection failed");
            Cleanup();
            return;
        }

        LogInfo($"Reconnection attempt {reconnectAttempts}/{maxReconnectAttempts}");
        UpdateStatus($"Reconnecting ({reconnectAttempts}/{maxReconnectAttempts})...");

        float reconnectDelay = Mathf.Min(2.0f * reconnectAttempts, 10.0f);
        StartCoroutine(DisconnectSequence());
        Invoke(nameof(JoinChannel), reconnectDelay);
    }

    void Update()
    {
        try
        {
            if (!isVideoReceiving && isConnected && !isDisconnecting)
            {
                connectionTimer += Time.deltaTime;
                if (connectionTimer > connectionTimeout)
                {
                    LogWarning("Connection timeout - no video received");
                    HandleConnectionTimeout();
                    connectionTimer = 0f;
                }
            }

            if (isVideoReceiving && !isDisconnecting)
            {
                frameCount++;
                float deltaTime = Time.time - lastFrameTime;

                if (deltaTime >= 1f)
                {
                    fps = frameCount / deltaTime;
                    frameCount = 0;
                    lastFrameTime = Time.time;

                    if (fps < 15)
                    {
                        LogWarning($"Low FPS: {fps:F1}");
                    }

                    if (statusText != null)
                    {
                        string quality = fps >= 25 ? "Excellent" : fps >= 15 ? "Good" : "Poor";
                        statusText.text = $"Video: {quality} ({fps:F1} FPS)";
                    }
                }
            }
        }
        catch (Exception e)
        {
            LogError($"Update error: {e.Message}");
        }
    }

    void Cleanup()
    {
        try
        {
            LogInfo("Cleaning up Agora resources...");

            CancelInvoke();

            if (disconnectCoroutine != null)
            {
                StopCoroutine(disconnectCoroutine);
            }

            if (rtcEngine != null)
            {
                rtcEngine.DisableVideo();
                rtcEngine.DisableAudio();
                rtcEngine.Dispose();
                rtcEngine = null;
            }

            if (videoSurface != null)
            {
                Destroy(videoSurface);
                videoSurface = null;
            }

            isConnected = false;
            isVideoReceiving = false;
            isDisconnecting = false;
            remoteUserId = 0;
            reconnectAttempts = 0;

            LogInfo("Cleanup complete");
        }
        catch (Exception e)
        {
            LogError($"Cleanup error: {e.Message}");
        }
    }

    void UpdateStatus(string message)
    {
        if (statusText != null)
        {
            try
            {
                statusText.text = message;
            }
            catch (Exception e)
            {
                Debug.LogError($"Status text error: {e.Message}");
            }
        }
    }

    private void LogInfo(string message) => Debug.Log($"[SecureAgora] {message}");
    private void LogWarning(string message) => Debug.LogWarning($"[SecureAgora] {message}");
    private void LogError(string message) => Debug.LogError($"[SecureAgora] {message}");

    void OnApplicationQuit() => Cleanup();

    void OnDestroy()
    {
        if (CredentialManager.Instance != null)
        {
            CredentialManager.Instance.OnAuthenticationSuccess -= OnCredentialsReady;
            CredentialManager.Instance.OnDisconnectComplete -= OnDisconnectRequested;
        }

        Cleanup();
    }

    public bool IsConnected() => isConnected && isVideoReceiving && !isDisconnecting;
    public float GetFPS() => fps;
    public bool IsDisconnecting() => isDisconnecting;

    internal class UserEventHandler : IRtcEngineEventHandler
    {
        private readonly SecureAgoraVideoStream parent;

        internal UserEventHandler(SecureAgoraVideoStream parent)
        {
            this.parent = parent;
        }

        public override void OnJoinChannelSuccess(RtcConnection connection, int elapsed)
        {
            parent.LogInfo($"Joined channel '{connection.channelId}'");
            parent.isConnected = true;
            parent.reconnectAttempts = 0;
            parent.connectionTimer = 0f;
            parent.UpdateStatus("Connected - Waiting for robot video...");
        }

        public override void OnLeaveChannel(RtcConnection connection, RtcStats stats)
        {
            parent.LogInfo($"OnLeaveChannel callback received");
            parent.LogInfo($"   Duration: {stats.duration}s");

 
            parent.waitingForLeaveChannel = false;

            parent.isConnected = false;
            parent.isVideoReceiving = false;

            if (parent.videoSurface != null)
            {
                parent.videoSurface.SetEnable(false);
            }

            parent.UpdateStatus("Left video channel");
        }

        public override void OnUserJoined(RtcConnection connection, uint uid, int elapsed)
        {
            parent.LogInfo($"Robot camera joined: UID {uid}");
            parent.remoteUserId = uid;
            parent.StartCoroutine(SetupVideoOnMainThread(uid));
            parent.UpdateStatus($"Robot connected (UID: {uid})");
        }

        private IEnumerator SetupVideoOnMainThread(uint uid)
        {
            yield return null;
            parent.SetupRemoteVideo(uid);
        }

        public override void OnUserOffline(RtcConnection connection, uint uid, USER_OFFLINE_REASON_TYPE reason)
        {
            parent.LogInfo($"Robot camera offline: UID {uid}, Reason: {reason}");

            if (uid == parent.remoteUserId)
            {
                parent.remoteUserId = 0;
                parent.isVideoReceiving = false;

                if (parent.videoSurface != null)
                {
                    parent.videoSurface.SetEnable(false);
                }

                parent.UpdateStatus("Robot disconnected");

                if (parent.autoReconnect && reason == USER_OFFLINE_REASON_TYPE.USER_OFFLINE_DROPPED && !parent.isDisconnecting)
                {
                    parent.HandleConnectionTimeout();
                }
            }
        }

        public override void OnFirstRemoteVideoFrame(RtcConnection connection, uint uid, int width, int height, int elapsed)
        {
            parent.LogInfo($"First video frame: {width}x{height}");
            parent.isVideoReceiving = true;
            parent.connectionTimer = 0f;
            parent.UpdateStatus($"Streaming: {width}x{height}");
        }

        public override void OnRemoteVideoStateChanged(RtcConnection connection, uint uid, REMOTE_VIDEO_STATE state, REMOTE_VIDEO_STATE_REASON reason, int elapsed)
        {
            switch (state)
            {
                case REMOTE_VIDEO_STATE.REMOTE_VIDEO_STATE_DECODING:
                    parent.UpdateStatus("Receiving video");
                    parent.isVideoReceiving = true;
                    break;
                case REMOTE_VIDEO_STATE.REMOTE_VIDEO_STATE_FROZEN:
                    parent.LogWarning("Video frozen");
                    parent.UpdateStatus("WARNING: Video frozen");
                    break;
                case REMOTE_VIDEO_STATE.REMOTE_VIDEO_STATE_STOPPED:
                    parent.UpdateStatus("Video stopped");
                    parent.isVideoReceiving = false;
                    break;
            }
        }

        public override void OnConnectionLost(RtcConnection connection)
        {
            parent.LogWarning("Connection lost!");
            parent.UpdateStatus("Connection lost - Reconnecting...");
            parent.isConnected = false;

            if (parent.autoReconnect && !parent.isDisconnecting)
            {
                parent.HandleConnectionTimeout();
            }
        }

        public override void OnConnectionStateChanged(RtcConnection connection, CONNECTION_STATE_TYPE state, CONNECTION_CHANGED_REASON_TYPE reason)
        {
            switch (state)
            {
                case CONNECTION_STATE_TYPE.CONNECTION_STATE_CONNECTED:
                    parent.UpdateStatus("Connected");
                    parent.reconnectAttempts = 0;
                    break;
                case CONNECTION_STATE_TYPE.CONNECTION_STATE_RECONNECTING:
                    if (!parent.isDisconnecting)
                    {
                        parent.UpdateStatus("Reconnecting...");
                        parent.HandleConnectionTimeout();
                    }
                    break;
                case CONNECTION_STATE_TYPE.CONNECTION_STATE_FAILED:
                    parent.LogError($"Connection failed: {reason}");
                    parent.UpdateStatus("ERROR: Connection failed");
                    if (parent.autoReconnect && parent.reconnectAttempts < parent.maxReconnectAttempts && !parent.isDisconnecting)
                    {
                        parent.HandleConnectionTimeout();
                    }
                    break;
            }
        }

        public override void OnError(int error, string msg)
        {
            parent.LogError($"Agora Error {error}: {msg}");
            parent.UpdateStatus($"ERROR: {error}");
        }

        public override void OnNetworkQuality(RtcConnection connection, uint remoteUid, int txQuality, int rxQuality)
        {
            if (rxQuality >= 4)
            {
                parent.LogWarning($"Poor network quality: RX={rxQuality}");
            }
        }
    }
}