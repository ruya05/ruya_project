using UnityEngine;
using UnityEngine.InputSystem;
using Firebase;
using Firebase.Database;
using Firebase.Auth;
using Firebase.Extensions;
using System.Collections.Generic;
using System;
using System.Collections;
using TMPro;
using UnityEngine.XR;

public class EnhancedSecureVRRobotController : MonoBehaviour
{
    [Header("VR Debug Display")]
    public bool showDebugInVR = true;
    public Transform debugCanvas;
    private TMP_Text debugText;

    [Header("⚠️ CRITICAL DEBUG SETTINGS")]
    public bool showInputDebug = true; 
    public TMP_Text inputDebugText; 

    [Header("Input Detection Thresholds")]
    [Range(0.1f, 0.9f)] public float forwardBackwardThreshold = 0.3f;
    [Range(0.1f, 0.9f)] public float strafeThreshold = 0.5f;
    [Range(0.1f, 0.9f)] public float turnThreshold = 0.3f;
    [Range(1f, 30f)] public float commandRate = 10f;
    [Range(0.05f, 0.5f)] public float deadZone = 0.15f;

    [Header("Meta Quest Pro Settings")]
    public int questTargetFrameRate = 90;
    public bool enableQuestOptimizations = true;

    [Header("Controller Visualization")]
    public GameObject leftControllerModel; 
    public GameObject rightControllerModel; 
    public bool showControllers = true;

    [Header("Safety & Emergency")]
    public float connectionTimeoutSeconds = 10f;
    public float emergencyStopHoldTime = 1f;
    public float firebaseOperationTimeout = 5f;

    [Header("Haptic Feedback")]
    public bool enableHaptics = true;
    [Range(0.0f, 1.0f)] public float emergencyStopHapticIntensity = 0.8f;

    [Header("Development & Debug")]
    public bool enableDebugOutput = true;
    public bool logFirebaseCommands = true; 
    public bool keyboardControlInEditor = true;
    public bool forceKeyboardMode = false;

    
    private Vector2 lastLeftStick = Vector2.zero;
    private Vector2 lastRightStick = Vector2.zero;
    private bool lastLeftGrip = false;
    private bool lastRightGrip = false;

    
    private bool isConnecting = false;
    private bool isDisconnecting = false;
    private bool isInitialized = false;
    private bool canSendCommands = false;
    private bool emergencyStop = false;
    private bool robotOnline = false;

   
    private InputAction keyboardForwardAction;
    private InputAction keyboardBackwardAction;
    private InputAction keyboardLeftAction;
    private InputAction keyboardRightAction;
    private InputAction keyboardTurnLeftAction;
    private InputAction keyboardTurnRightAction;
    private InputAction keyboardEmergencyStopAction;

  
    private FirebaseApp firebaseApp;
    private DatabaseReference databaseRef;
    private FirebaseAuth firebaseAuth;
    private FirebaseUser currentUser;
    private bool firebaseInitialized = false;

   
    private string sessionCode = "";
    private string robotId = "";
    private DatabaseReference sessionRef;

   
    private RobotCommand currentCommand;
    private int commandSequenceNumber = 0;
    private Coroutine commandSendingCoroutine;
    private WaitForSeconds commandRateWait;

    
    private float emergencyStopStartTime = 0f;
    private float lastCommandSentTime = 0f;
    private float lastRobotResponseTime = 0f;

    [System.Serializable]
    public class RobotCommand
    {
        public long timestamp;
        public int seq = 0;

        
        public bool walk_forward;
        public bool walk_backward;
        public bool strafe_left;
        public bool strafe_right;
        public bool turn_left;
        public bool turn_right;
        public bool emergency_stop = false;

       
        public string source = "unity_vr_quest_pro";
        public string robot_id = "";
        public string session_code = "";
        public string operator_id = "";
        public string input_method = "controllers";

        public RobotCommand()
        {
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }

        public void Reset()
        {
            walk_forward = walk_backward = false;
            strafe_left = strafe_right = false;
            turn_left = turn_right = false;
            emergency_stop = false;
        }
    }

    void Awake()
    {
        try
        {
            InitializeKeyboardInputActions();
            LogDebug("EnhancedSecureVRRobotController initialized", LogLevel.Info);
        }
        catch (Exception e)
        {
            LogDebug($"Awake error: {e.Message}", LogLevel.Error);
        }
    }

    void InitializeKeyboardInputActions()
    {
        try
        {
            keyboardForwardAction = new InputAction("Forward", InputActionType.Button, "<Keyboard>/w");
            keyboardBackwardAction = new InputAction("Backward", InputActionType.Button, "<Keyboard>/s");
            keyboardLeftAction = new InputAction("Left", InputActionType.Button, "<Keyboard>/a");
            keyboardRightAction = new InputAction("Right", InputActionType.Button, "<Keyboard>/d");
            keyboardTurnLeftAction = new InputAction("TurnLeft", InputActionType.Button, "<Keyboard>/q");
            keyboardTurnRightAction = new InputAction("TurnRight", InputActionType.Button, "<Keyboard>/e");
            keyboardEmergencyStopAction = new InputAction("EmergencyStop", InputActionType.Button, "<Keyboard>/space");

            keyboardForwardAction?.Enable();
            keyboardBackwardAction?.Enable();
            keyboardLeftAction?.Enable();
            keyboardRightAction?.Enable();
            keyboardTurnLeftAction?.Enable();
            keyboardTurnRightAction?.Enable();
            keyboardEmergencyStopAction?.Enable();

            LogDebug("Keyboard input actions initialized", LogLevel.Info);
        }
        catch (Exception e)
        {
            LogDebug($"Failed to initialize keyboard actions: {e.Message}", LogLevel.Error);
        }
    }

    void Start()
    {
        if (CredentialManager.Instance == null)
        {
            LogDebug("CredentialManager not found!", LogLevel.Error);
            return;
        }

        try
        {
            if (enableQuestOptimizations)
                Application.targetFrameRate = questTargetFrameRate;

            currentCommand = new RobotCommand();

            if (commandRate <= 0f) commandRate = 10f;
            commandRateWait = new WaitForSeconds(1f / commandRate);

            if (debugCanvas != null)
            {
                debugText = debugCanvas.GetComponentInChildren<TMP_Text>();
            }

           
            SetupControllerVisualization();

            LogDebug("Waiting for authentication...", LogLevel.Info);

            CredentialManager.Instance.OnAuthenticationSuccess += OnCredentialsReady;
            CredentialManager.Instance.OnDisconnectComplete += OnDisconnectRequested;

            if (CredentialManager.Instance.AreCredentialsReady())
            {
                LogDebug("Credentials ready - initializing", LogLevel.Info);
                StartCoroutine(InitializeWithExistingCredentials());
            }

            
            if (showInputDebug && inputDebugText != null)
            {
                inputDebugText.text = "Waiting for input...";
            }
        }
        catch (Exception e)
        {
            LogDebug($"Start error: {e.Message}\n{e.StackTrace}", LogLevel.Error);
        }
    }


    void SetupControllerVisualization()
    {
        if (!showControllers) return;

        if (leftControllerModel != null)
        {
            leftControllerModel.SetActive(true);
            LogDebug("Left controller model enabled", LogLevel.Info);
        }

        if (rightControllerModel != null)
        {
            rightControllerModel.SetActive(true);
            LogDebug("Right controller model enabled", LogLevel.Info);
        }
    }

    private void OnCredentialsReady()
    {
        LogDebug("OnCredentialsReady event received!", LogLevel.Info);

        if (isDisconnecting)
        {
            LogDebug("Disconnect in progress - ignoring credentials", LogLevel.Warning);
            return;
        }

        if (isInitialized || isConnecting)
        {
            LogDebug("Already initialized/connecting - ignoring", LogLevel.Warning);
            return;
        }

        StartCoroutine(InitializeWithExistingCredentials());
    }

    private void OnDisconnectRequested()
    {
        LogDebug("OnDisconnectRequested event received!", LogLevel.Info);

        if (isDisconnecting)
        {
            LogDebug("Already disconnecting - ignoring", LogLevel.Warning);
            return;
        }

        StartCoroutine(DisconnectSequence());
    }

    IEnumerator DisconnectSequence()
    {
        LogDebug("═══════════════════════════════════", LogLevel.Info);
        LogDebug("FIREBASE DISCONNECT SEQUENCE START", LogLevel.Info);
        LogDebug("═══════════════════════════════════", LogLevel.Info);

        isDisconnecting = true;
        canSendCommands = false;

        if (commandSendingCoroutine != null)
        {
            StopCoroutine(commandSendingCoroutine);
            commandSendingCoroutine = null;
            LogDebug("Command sending stopped", LogLevel.Info);
        }

        if (sessionRef != null && firebaseInitialized)
        {
            LogDebug("Sending emergency stop command...", LogLevel.Info);

            var emergencyStopData = new Dictionary<string, object>
            {
                {"timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},
                {"seq", ++commandSequenceNumber},
                {"emergency_stop", true},
                {"walk_forward", false},
                {"walk_backward", false},
                {"strafe_left", false},
                {"strafe_right", false},
                {"turn_left", false},
                {"turn_right", false},
                {"source", "disconnect_emergency_stop"},
                {"robot_id", robotId},
                {"session_code", sessionCode},
                {"operator_id", currentUser?.UserId ?? "unknown"}
            };

            bool emergencyStopSent = false;

            sessionRef.Child("robot_commands").Child("latest").SetValueAsync(emergencyStopData)
                .ContinueWithOnMainThread(task =>
                {
                    emergencyStopSent = true;
                    if (task.IsCompletedSuccessfully)
                    {
                        LogDebug("Emergency stop sent", LogLevel.Info);
                    }
                });

            float elapsed = 0f;
            while (!emergencyStopSent && elapsed < firebaseOperationTimeout)
            {
                elapsed += Time.deltaTime;
                yield return null;
            }

            yield return new WaitForSeconds(0.3f);
        }

        if (sessionRef != null && firebaseInitialized)
        {
            LogDebug("Writing disconnect status to Firebase...", LogLevel.Info);

            bool statusWriteComplete = false;

            var disconnectData = new Dictionary<string, object>
            {
                {"status", "disconnected"},
                {"timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},
                {"reason", "user_disconnect"}
            };

            sessionRef.Child("connection_status").SetValueAsync(disconnectData)
                .ContinueWithOnMainThread(task =>
                {
                    statusWriteComplete = true;
                    if (task.IsCompletedSuccessfully)
                    {
                        LogDebug("Disconnect status written", LogLevel.Info);
                    }
                    else
                    {
                        LogDebug($"Failed to write status: {task.Exception?.Message}", LogLevel.Error);
                    }
                });

            float elapsed = 0f;
            while (!statusWriteComplete && elapsed < firebaseOperationTimeout)
            {
                elapsed += Time.deltaTime;
                yield return null;
            }

            if (!statusWriteComplete)
            {
                LogDebug($"Status write timeout after {firebaseOperationTimeout}s", LogLevel.Warning);
            }
        }

        if (sessionRef != null && firebaseInitialized)
        {
            LogDebug("Clearing stale command data...", LogLevel.Info);

            bool commandClearComplete = false;

            sessionRef.Child("robot_commands").Child("latest").RemoveValueAsync()
                .ContinueWithOnMainThread(task =>
                {
                    commandClearComplete = true;
                    if (task.IsCompletedSuccessfully)
                    {
                        LogDebug("Command data cleared", LogLevel.Info);
                    }
                    else
                    {
                        LogDebug($"Failed to clear commands: {task.Exception?.Message}", LogLevel.Error);
                    }
                });

            float elapsed = 0f;
            while (!commandClearComplete && elapsed < firebaseOperationTimeout)
            {
                elapsed += Time.deltaTime;
                yield return null;
            }

            if (!commandClearComplete)
            {
                LogDebug($"Command clear timeout after {firebaseOperationTimeout}s", LogLevel.Warning);
            }

            yield return new WaitForSeconds(0.3f);
        }

        CleanupFirebase();

        commandSequenceNumber = 0;
        isInitialized = false;
        isConnecting = false;
        robotOnline = false;
        emergencyStop = false;

        isDisconnecting = false;

        LogDebug("═══════════════════════════════════", LogLevel.Info);
        LogDebug("FIREBASE DISCONNECT COMPLETE", LogLevel.Info);
        LogDebug("Ready for reconnection", LogLevel.Info);
        LogDebug("═══════════════════════════════════", LogLevel.Info);
    }

    void CleanupFirebase()
    {
        try
        {
            LogDebug("Cleaning up Firebase resources...", LogLevel.Info);

            if (firebaseAuth != null && currentUser != null)
            {
                firebaseAuth.SignOut();
                currentUser = null;
                LogDebug("Signed out from Firebase Auth", LogLevel.Info);
            }

            sessionRef = null;
            databaseRef = null;
            firebaseAuth = null;

            if (firebaseApp != null)
            {
                firebaseApp.Dispose();
                firebaseApp = null;
                LogDebug("Disposed Firebase app", LogLevel.Info);
            }

            firebaseInitialized = false;
            LogDebug("Firebase cleanup complete", LogLevel.Info);
        }
        catch (Exception e)
        {
            LogDebug($"Firebase cleanup error: {e.Message}", LogLevel.Warning);
        }
    }

    IEnumerator InitializeWithExistingCredentials()
    {
        if (isConnecting)
        {
            LogDebug("Connection already in progress", LogLevel.Warning);
            yield break;
        }

        if (isDisconnecting)
        {
            LogDebug("Disconnect in progress - cannot connect", LogLevel.Warning);
            yield break;
        }

        isConnecting = true;
        LogDebug("Initializing with credentials...", LogLevel.Info);

        try
        {
            sessionCode = CredentialManager.Instance.sessionCode;
            robotId = CredentialManager.Instance.robotId;

            if (string.IsNullOrEmpty(sessionCode) || string.IsNullOrEmpty(robotId))
            {
                LogDebug("Invalid session info", LogLevel.Error);
                isConnecting = false;
                yield break;
            }

            LogDebug($"Session: {sessionCode}, Robot: {robotId}", LogLevel.Info);
        }
        catch (Exception e)
        {
            LogDebug($"Error getting session info: {e.Message}", LogLevel.Error);
            isConnecting = false;
            yield break;
        }

        yield return StartCoroutine(InitializeFirebase());

        if (!firebaseInitialized)
        {
            isConnecting = false;
            yield break;
        }

        yield return StartCoroutine(AuthenticateUser());

        if (currentUser == null)
        {
            isConnecting = false;
            yield break;
        }

        try
        {
            sessionRef = databaseRef.Child("sessions").Child(sessionCode);
            LogDebug($"Session reference: sessions/{sessionCode}", LogLevel.Info);

            var connectedData = new Dictionary<string, object>
            {
                {"status", "connected"},
                {"timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},
                {"platform", Application.platform.ToString()},
                {"operator_id", currentUser.UserId}
            };

            sessionRef.Child("connection_status").SetValueAsync(connectedData);
        }
        catch (Exception e)
        {
            LogDebug($"Failed to create session reference: {e.Message}", LogLevel.Error);
            isConnecting = false;
            yield break;
        }

        yield return StartCoroutine(TestFirebaseConnection());

        commandSequenceNumber = 0;
        LogDebug($"Reset command sequence to 0", LogLevel.Info);

        canSendCommands = true;
        commandSendingCoroutine = StartCoroutine(CommandSendingLoop());

        isInitialized = true;
        isConnecting = false;

        LogDebug("═══════════════════════════════════", LogLevel.Info);
        LogDebug("CONTROLLER FULLY INITIALIZED!", LogLevel.Info);
        LogDebug("═══════════════════════════════════", LogLevel.Info);
    }

    IEnumerator InitializeFirebase()
    {
        LogDebug("Initializing Firebase...", LogLevel.Info);

        bool initComplete = false;
        string errorMsg = "";

        FirebaseApp.CheckAndFixDependenciesAsync().ContinueWithOnMainThread(task =>
        {
            if (task.IsFaulted)
            {
                errorMsg = $"Dependency check faulted: {task.Exception?.GetBaseException().Message}";
                initComplete = true;
                return;
            }

            if (task.IsCanceled)
            {
                errorMsg = "Dependency check canceled";
                initComplete = true;
                return;
            }

            if (task.Result == DependencyStatus.Available)
            {
                try
                {
                    var creds = CredentialManager.Instance.GetFirebaseCredentials();

                    if (creds == null)
                    {
                        errorMsg = "Failed to get Firebase credentials";
                        initComplete = true;
                        return;
                    }

                    var options = new AppOptions
                    {
                        DatabaseUrl = new Uri(creds.databaseURL),
                        ProjectId = creds.projectId,
                        ApiKey = creds.apiKey,
                        AppId = creds.appId
                    };

                    try
                    {
                        firebaseApp = FirebaseApp.Create(options);
                        LogDebug("Created new Firebase app instance", LogLevel.Info);
                    }
                    catch (ArgumentException)
                    {
                        firebaseApp = FirebaseApp.DefaultInstance;
                        LogDebug("Using existing Firebase app instance", LogLevel.Info);
                    }

                    databaseRef = FirebaseDatabase.GetInstance(firebaseApp, creds.databaseURL).RootReference;
                    firebaseAuth = FirebaseAuth.GetAuth(firebaseApp);

                    firebaseInitialized = true;
                    LogDebug("Firebase initialized successfully", LogLevel.Info);
                }
                catch (Exception e)
                {
                    errorMsg = $"Firebase init exception: {e.Message}";
                    LogDebug(errorMsg, LogLevel.Error);
                }
            }
            else
            {
                errorMsg = $"Firebase dependencies not available: {task.Result}";
            }

            initComplete = true;
        });

        float timeout = 30f;
        float elapsed = 0f;
        while (!initComplete && elapsed < timeout)
        {
            elapsed += Time.deltaTime;
            yield return null;
        }

        if (!firebaseInitialized)
        {
            LogDebug($"Firebase init failed: {errorMsg}", LogLevel.Error);
        }
    }

    IEnumerator TestFirebaseConnection()
    {
        if (databaseRef == null)
        {
            LogDebug("Cannot test Firebase - databaseRef is null", LogLevel.Error);
            yield break;
        }

        LogDebug("Testing Firebase connection...", LogLevel.Info);

        bool testComplete = false;

        var testData = new Dictionary<string, object>
        {
            {"timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},
            {"platform", Application.platform.ToString()},
            {"test", "connection_check"}
        };

        databaseRef.Child("connection_test").SetValueAsync(testData).ContinueWithOnMainThread(task =>
        {
            testComplete = true;
            if (task.IsCompletedSuccessfully)
            {
                LogDebug("Firebase connection test: SUCCESS", LogLevel.Info);
                robotOnline = true;
                lastRobotResponseTime = Time.time;
            }
            else
            {
                var ex = task.Exception?.GetBaseException();
                LogDebug($"Firebase test FAILED: {ex?.Message}", LogLevel.Error);
            }
        });

        float timeout = 15f;
        float elapsed = 0f;
        while (!testComplete && elapsed < timeout)
        {
            elapsed += Time.deltaTime;
            yield return null;
        }

        if (!testComplete)
        {
            LogDebug("Firebase connection test TIMEOUT", LogLevel.Error);
        }
    }

    IEnumerator AuthenticateUser()
    {
        LogDebug("Authenticating with Firebase...", LogLevel.Info);

        int maxRetries = 3;
        for (int attempt = 1; attempt <= maxRetries; attempt++)
        {
            LogDebug($"Authentication attempt {attempt}/{maxRetries}", LogLevel.Info);

            bool authComplete = false;

            firebaseAuth.SignInAnonymouslyAsync().ContinueWithOnMainThread(task =>
            {
                authComplete = true;

                if (task.IsFaulted)
                {
                    LogDebug($"Auth faulted: {task.Exception?.GetBaseException().Message}", LogLevel.Error);
                    return;
                }

                if (task.IsCanceled)
                {
                    LogDebug("Auth canceled", LogLevel.Error);
                    return;
                }

                if (task.IsCompletedSuccessfully)
                {
                    currentUser = firebaseAuth.CurrentUser;
                    LogDebug($"Authenticated: {currentUser.UserId.Substring(0, 8)}...", LogLevel.Info);
                }
            });

            float timeout = 15f;
            float elapsed = 0f;
            while (!authComplete && elapsed < timeout)
            {
                elapsed += Time.deltaTime;
                yield return null;
            }

            if (currentUser != null)
            {
                break;
            }
            else if (attempt < maxRetries)
            {
                LogDebug("Retrying authentication in 2 seconds...", LogLevel.Info);
                yield return new WaitForSeconds(2f);
            }
        }

        if (currentUser == null)
        {
            LogDebug("All authentication attempts failed", LogLevel.Error);
        }
    }

    void Update()
    {
        try
        {
            if (isInitialized && canSendCommands && !isDisconnecting)
            {
                if (CredentialManager.Instance != null && CredentialManager.Instance.IsSessionExpired())
                {
                    LogDebug("Session expired!", LogLevel.Warning);
                    canSendCommands = false;
                    SetEmergencyStop(true);
                    return;
                }

                ReadInput();
                HandleEmergencyStop();

            
                if (showInputDebug)
                {
                    UpdateInputDebugDisplay();
                }
            }
        }
        catch (Exception e)
        {
            LogDebug($"Update error: {e.Message}", LogLevel.Error);
        }
    }


    void UpdateInputDebugDisplay()
    {
        if (inputDebugText == null) return;

        string debugInfo = "=== LIVE INPUT DEBUG ===\n";
        debugInfo += $"Platform: {Application.platform}\n";
        debugInfo += $"Editor: {Application.isEditor}\n\n";

        debugInfo += "CURRENT COMMAND:\n";
        debugInfo += $"Forward: {currentCommand.walk_forward}\n";
        debugInfo += $"Backward: {currentCommand.walk_backward}\n";
        debugInfo += $"Left: {currentCommand.strafe_left}\n";
        debugInfo += $"Right: {currentCommand.strafe_right}\n";
        debugInfo += $"Turn L: {currentCommand.turn_left}\n";
        debugInfo += $"Turn R: {currentCommand.turn_right}\n";
        debugInfo += $"E-Stop: {currentCommand.emergency_stop}\n\n";

        debugInfo += "RAW VR INPUT:\n";
        debugInfo += $"Left Stick: {lastLeftStick}\n";
        debugInfo += $"Right Stick: {lastRightStick}\n";
        debugInfo += $"Left Grip: {lastLeftGrip}\n";
        debugInfo += $"Right Grip: {lastRightGrip}\n\n";

        debugInfo += "THRESHOLDS:\n";
        debugInfo += $"Forward/Back: {forwardBackwardThreshold}\n";
        debugInfo += $"Strafe: {strafeThreshold}\n";
        debugInfo += $"Turn: {turnThreshold}\n";
        debugInfo += $"Deadzone: {deadZone}\n\n";

        debugInfo += $"Input Method: {currentCommand.input_method}\n";
        debugInfo += $"Sequence: {commandSequenceNumber}\n";

        inputDebugText.text = debugInfo;
    }

    void ReadInput()
    {
        try
        {
            currentCommand.Reset();
            currentCommand.session_code = sessionCode;
            currentCommand.robot_id = robotId;
            currentCommand.operator_id = currentUser?.UserId ?? "unknown";
            currentCommand.seq = ++commandSequenceNumber;

            bool useKeyboard = forceKeyboardMode ||
                              (keyboardControlInEditor && Application.isEditor) ||
                              !IsVRInputAvailable();

            if (useKeyboard)
            {
                ReadKeyboardInput();
                currentCommand.input_method = "keyboard";
            }
            else
            {
                ReadVRControllerInput();
                currentCommand.input_method = "controllers";
            }

            currentCommand.timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }
        catch (Exception e)
        {
            LogDebug($"ReadInput error: {e.Message}", LogLevel.Error);
        }
    }

 
    bool IsVRInputAvailable()
    {
        var leftHandDevices = new List<UnityEngine.XR.InputDevice>();
        var rightHandDevices = new List<UnityEngine.XR.InputDevice>();

        UnityEngine.XR.InputDevices.GetDevicesAtXRNode(UnityEngine.XR.XRNode.LeftHand, leftHandDevices);
        UnityEngine.XR.InputDevices.GetDevicesAtXRNode(UnityEngine.XR.XRNode.RightHand, rightHandDevices);

        return leftHandDevices.Count > 0 || rightHandDevices.Count > 0;
    }

    void ReadKeyboardInput()
    {
        try
        {
          
            if (keyboardForwardAction != null && keyboardForwardAction.IsPressed())
            {
                currentCommand.walk_forward = true;
                LogDebug("FORWARD pressed", LogLevel.Debug);
            }
            else if (keyboardBackwardAction != null && keyboardBackwardAction.IsPressed())
            {
                currentCommand.walk_backward = true;
                LogDebug("BACKWARD pressed", LogLevel.Debug);
            }

         
            if (keyboardRightAction != null && keyboardRightAction.IsPressed())
            {
                currentCommand.strafe_right = true;
                LogDebug("RIGHT pressed", LogLevel.Debug);
            }
            else if (keyboardLeftAction != null && keyboardLeftAction.IsPressed())
            {
                currentCommand.strafe_left = true;
                LogDebug("LEFT pressed", LogLevel.Debug);
            }

            
            if (keyboardTurnRightAction != null && keyboardTurnRightAction.IsPressed())
            {
                currentCommand.turn_right = true;
                LogDebug("TURN RIGHT pressed", LogLevel.Debug);
            }
            else if (keyboardTurnLeftAction != null && keyboardTurnLeftAction.IsPressed())
            {
                currentCommand.turn_left = true;
                LogDebug("TURN LEFT pressed", LogLevel.Debug);
            }

            
            if (keyboardEmergencyStopAction != null && keyboardEmergencyStopAction.IsPressed())
            {
                currentCommand.emergency_stop = true;
                LogDebug("EMERGENCY STOP pressed", LogLevel.Debug);
            }
        }
        catch (Exception e)
        {
            LogDebug($"Keyboard input error: {e.Message}", LogLevel.Error);
        }
    }

    void ReadVRControllerInput()
    {
        try
        {
            var leftHandDevices = new List<UnityEngine.XR.InputDevice>();
            var rightHandDevices = new List<UnityEngine.XR.InputDevice>();

            UnityEngine.XR.InputDevices.GetDevicesAtXRNode(UnityEngine.XR.XRNode.LeftHand, leftHandDevices);
            UnityEngine.XR.InputDevices.GetDevicesAtXRNode(UnityEngine.XR.XRNode.RightHand, rightHandDevices);


            lastLeftStick = Vector2.zero;
            lastRightStick = Vector2.zero;
            lastLeftGrip = false;
            lastRightGrip = false;

            if (leftHandDevices.Count > 0)
            {
                var leftDevice = leftHandDevices[0];

 
                Vector2 leftStick = Vector2.zero;
                if (leftDevice.TryGetFeatureValue(UnityEngine.XR.CommonUsages.primary2DAxis, out leftStick))
                {
                    lastLeftStick = leftStick; 
                    leftStick = ApplyDeadzone(leftStick);

                    if (leftStick != Vector2.zero)
                    {
                        currentCommand.walk_forward = leftStick.y > forwardBackwardThreshold;
                        currentCommand.walk_backward = leftStick.y < -forwardBackwardThreshold;
                        currentCommand.strafe_right = leftStick.x > strafeThreshold;
                        currentCommand.strafe_left = leftStick.x < -strafeThreshold;

                        if (currentCommand.walk_forward) LogDebug($"⬆️ VR Forward: {leftStick.y:F2}", LogLevel.Debug);
                        if (currentCommand.walk_backward) LogDebug($"⬇️ VR Backward: {leftStick.y:F2}", LogLevel.Debug);
                        if (currentCommand.strafe_left) LogDebug($"⬅️ VR Left: {leftStick.x:F2}", LogLevel.Debug);
                        if (currentCommand.strafe_right) LogDebug($"➡️ VR Right: {leftStick.x:F2}", LogLevel.Debug);
                    }
                }

                float leftGrip = 0f;
                if (leftDevice.TryGetFeatureValue(UnityEngine.XR.CommonUsages.grip, out leftGrip))
                {
                    lastLeftGrip = leftGrip > 0.8f;
                    if (lastLeftGrip)
                    {
                        currentCommand.emergency_stop = true;
                        LogDebug("VR Left Grip E-Stop", LogLevel.Debug);
                    }
                }

                bool leftPrimary = false;
                if (leftDevice.TryGetFeatureValue(UnityEngine.XR.CommonUsages.primaryButton, out leftPrimary))
                {
                    if (leftPrimary)
                    {
                        currentCommand.emergency_stop = true;
                        LogDebug("VR Left Button E-Stop", LogLevel.Debug);
                    }
                }
            }


            if (rightHandDevices.Count > 0)
            {
                var rightDevice = rightHandDevices[0];


                Vector2 rightStick = Vector2.zero;
                if (rightDevice.TryGetFeatureValue(UnityEngine.XR.CommonUsages.primary2DAxis, out rightStick))
                {
                    lastRightStick = rightStick; 
                    rightStick = ApplyDeadzone(rightStick);

                    if (rightStick != Vector2.zero)
                    {
                        currentCommand.turn_right = rightStick.x > turnThreshold;
                        currentCommand.turn_left = rightStick.x < -turnThreshold;

                        if (currentCommand.turn_left) LogDebug($"↩️ VR Turn Left: {rightStick.x:F2}", LogLevel.Debug);
                        if (currentCommand.turn_right) LogDebug($"↪️ VR Turn Right: {rightStick.x:F2}", LogLevel.Debug);
                    }
                }

                float rightGrip = 0f;
                if (rightDevice.TryGetFeatureValue(UnityEngine.XR.CommonUsages.grip, out rightGrip))
                {
                    lastRightGrip = rightGrip > 0.8f;
                    if (lastRightGrip)
                    {
                        currentCommand.emergency_stop = true;
                        LogDebug("VR Right Grip E-Stop", LogLevel.Debug);
                    }
                }

                bool rightPrimary = false;
                if (rightDevice.TryGetFeatureValue(UnityEngine.XR.CommonUsages.primaryButton, out rightPrimary))
                {
                    if (rightPrimary)
                    {
                        currentCommand.emergency_stop = true;
                        LogDebug("VR Right Button E-Stop", LogLevel.Debug);
                    }
                }
            }
        }
        catch (Exception e)
        {
            LogDebug($"VR controller input error: {e.Message}", LogLevel.Error);
        }
    }

    Vector2 ApplyDeadzone(Vector2 input)
    {
        if (input.magnitude < deadZone) return Vector2.zero;

        Vector2 normalized = input.normalized;
        float magnitude = (input.magnitude - deadZone) / (1f - deadZone);
        return normalized * Mathf.Clamp01(magnitude);
    }

    void HandleEmergencyStop()
    {
        try
        {
            bool shouldStop = currentCommand.emergency_stop;

            if (!canSendCommands || !isInitialized || isDisconnecting)
                shouldStop = true;

            if (!robotOnline || Time.time - lastRobotResponseTime > connectionTimeoutSeconds)
                shouldStop = true;

            SetEmergencyStop(shouldStop);
        }
        catch (Exception e)
        {
            LogDebug($"Emergency stop error: {e.Message}", LogLevel.Error);
        }
    }

    void SetEmergencyStop(bool active)
    {
        if (emergencyStop != active)
        {
            emergencyStop = active;

            if (emergencyStop)
            {
                emergencyStopStartTime = Time.time;
                LogDebug("EMERGENCY STOP ACTIVATED!", LogLevel.Warning);

                if (enableHaptics)
                    TriggerHapticPulse(emergencyStopHapticIntensity, 0.1f);
            }
            else
            {
                if (Time.time - emergencyStopStartTime >= emergencyStopHoldTime)
                {
                    LogDebug("Emergency stop released", LogLevel.Info);
                }
            }
        }

        currentCommand.emergency_stop = emergencyStop;
    }

    void TriggerHapticPulse(float intensity, float duration)
    {
        try
        {
            var leftHandDevices = new List<UnityEngine.XR.InputDevice>();
            var rightHandDevices = new List<UnityEngine.XR.InputDevice>();

            UnityEngine.XR.InputDevices.GetDevicesAtXRNode(UnityEngine.XR.XRNode.LeftHand, leftHandDevices);
            UnityEngine.XR.InputDevices.GetDevicesAtXRNode(UnityEngine.XR.XRNode.RightHand, rightHandDevices);

            if (leftHandDevices.Count > 0)
                leftHandDevices[0].SendHapticImpulse(0, intensity, duration);

            if (rightHandDevices.Count > 0)
                rightHandDevices[0].SendHapticImpulse(0, intensity, duration);
        }
        catch
        {

        }
    }

    IEnumerator CommandSendingLoop()
    {
        LogDebug("Command sending loop started", LogLevel.Info);

        while (canSendCommands && !isDisconnecting)
        {
            if (isInitialized && sessionRef != null)
            {
                yield return StartCoroutine(SendCommandToFirebase());
            }

            yield return commandRateWait;
        }

        LogDebug("Command sending loop stopped", LogLevel.Info);
    }

    IEnumerator SendCommandToFirebase()
    {
        if (currentCommand == null || sessionRef == null)
        {
            yield break;
        }

        bool sendComplete = false;

        var commandData = new Dictionary<string, object>
        {
            {"timestamp", currentCommand.timestamp},
            {"seq", currentCommand.seq},
            {"emergency_stop", currentCommand.emergency_stop},
            {"walk_forward", currentCommand.walk_forward},
            {"walk_backward", currentCommand.walk_backward},
            {"strafe_left", currentCommand.strafe_left},
            {"strafe_right", currentCommand.strafe_right},
            {"turn_left", currentCommand.turn_left},
            {"turn_right", currentCommand.turn_right},
            {"source", currentCommand.source},
            {"robot_id", currentCommand.robot_id},
            {"session_code", currentCommand.session_code},
            {"operator_id", currentCommand.operator_id},
            {"input_method", currentCommand.input_method},
            {"platform", Application.platform.ToString()}
        };

        sessionRef.Child("robot_commands").Child("latest").SetValueAsync(commandData)
            .ContinueWithOnMainThread(task =>
            {
                sendComplete = true;

                if (task.IsCompletedSuccessfully)
                {
                    lastCommandSentTime = Time.time;
                    lastRobotResponseTime = Time.time;

                    if (logFirebaseCommands)
                    {
                      
                        string movements = "";
                        if (currentCommand.walk_forward) movements += "FWD ";
                        if (currentCommand.walk_backward) movements += "BWD ";
                        if (currentCommand.strafe_left) movements += "LEFT ";
                        if (currentCommand.strafe_right) movements += "RIGHT ";
                        if (currentCommand.turn_left) movements += "TURN-L ";
                        if (currentCommand.turn_right) movements += "TURN-R ";
                        if (currentCommand.emergency_stop) movements += "E-STOP ";

                        if (!string.IsNullOrEmpty(movements))
                        {
                            LogDebug($"Command sent: seq={currentCommand.seq} | {movements}", LogLevel.Debug);
                        }
                    }
                }
                else
                {
                    LogDebug($"Command send failed: {task.Exception?.Message}", LogLevel.Error);
                }
            });

        float timeout = 5f;
        float elapsed = 0f;
        while (!sendComplete && elapsed < timeout)
        {
            elapsed += Time.deltaTime;
            yield return null;
        }

        if (!sendComplete)
        {
            LogDebug("Command send timeout", LogLevel.Warning);
        }
    }

    enum LogLevel { Debug, Info, Error, Warning }

    void LogDebug(string message, LogLevel level = LogLevel.Debug)
    {
        if (!enableDebugOutput && level == LogLevel.Debug) return;

        string timestamp = DateTime.Now.ToString("HH:mm:ss.fff");
        string prefix = $"[{timestamp}][Controller][{level}]";
        string fullMessage = $"{prefix} {message}";

        switch (level)
        {
            case LogLevel.Debug:
            case LogLevel.Info:
                Debug.Log(fullMessage);
                break;
            case LogLevel.Warning:
                Debug.LogWarning(fullMessage);
                break;
            case LogLevel.Error:
                Debug.LogError(fullMessage);
                break;
        }

        if (showDebugInVR && debugText != null)
        {
            try
            {
                debugText.text = $"{message}\n{debugText.text}";
                string[] lines = debugText.text.Split('\n');
                if (lines.Length > 10)
                {
                    debugText.text = string.Join("\n", lines, 0, 10);
                }
            }
            catch { }
        }
    }

    void OnDestroy()
    {
        try
        {
            if (commandSendingCoroutine != null)
                StopCoroutine(commandSendingCoroutine);

            keyboardForwardAction?.Disable();
            keyboardBackwardAction?.Disable();
            keyboardLeftAction?.Disable();
            keyboardRightAction?.Disable();
            keyboardTurnLeftAction?.Disable();
            keyboardTurnRightAction?.Disable();
            keyboardEmergencyStopAction?.Disable();

            if (CredentialManager.Instance != null)
            {
                CredentialManager.Instance.OnAuthenticationSuccess -= OnCredentialsReady;
                CredentialManager.Instance.OnDisconnectComplete -= OnDisconnectRequested;
            }

            if (sessionRef != null && firebaseInitialized && isInitialized)
            {
                var disconnectData = new Dictionary<string, object>
                {
                    {"status", "disconnected"},
                    {"timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},
                    {"reason", "controller_destroyed"}
                };

                sessionRef.Child("connection_status").SetValueAsync(disconnectData);
                sessionRef.Child("robot_commands").Child("latest").RemoveValueAsync();
            }

            CleanupFirebase();

            LogDebug("Controller destroyed", LogLevel.Info);
        }
        catch (Exception e)
        {
            Debug.LogError($"OnDestroy error: {e.Message}");
        }
    }

    void OnApplicationQuit()
    {
        if (sessionRef != null && firebaseInitialized && isInitialized)
        {
            var disconnectData = new Dictionary<string, object>
            {
                {"status", "disconnected"},
                {"timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()},
                {"reason", "application_quit"}
            };

            sessionRef.Child("connection_status").SetValueAsync(disconnectData);
            sessionRef.Child("robot_commands").Child("latest").RemoveValueAsync();
        }
    }

    public bool IsInitialized() => isInitialized && canSendCommands && !isDisconnecting;
    public bool IsDisconnecting() => isDisconnecting;
    public int GetCommandSequence() => commandSequenceNumber;
    public bool IsEmergencyStopped() => emergencyStop;
}