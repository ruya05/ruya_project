# External Dependencies Setup Guide

This document lists all external SDKs and packages required to run the VR Robot Control project.

## Unity Packages (Installed via Package Manager)

### Core Unity Packages

Add these via Unity Editor > Window > Package Manager > Add package by name:
```json
{
  "dependencies": {
    "com.unity.textmeshpro": "3.0.6",
    "com.unity.inputsystem": "1.5.1",
    "com.unity.xr.management": "4.3.3",
    "com.unity.xr.openxr": "1.7.0"
  }
}
```

### Installation Steps:
1. Open Unity project
2. Go to Window > Package Manager
3. Click "+" button > Add package by name
4. Enter package name (e.g., `com.unity.textmeshpro`)
5. Click "Add"

## External SDKs (Manual Import Required)

### 1. Meta XR SDK (Oculus Integration)

**Version**: 57.0 or later  
**Download**: [Meta Developer Portal](https://developer.oculus.com/downloads/package/unity-integration/)

**Installation**:
1. Download OculusIntegration.unitypackage from Meta Developer Portal
2. Unity: Assets > Import Package > Custom Package
3. Select OculusIntegration.unitypackage
4. Import all

**Required Components**:
- OVR Manager
- OVR Camera Rig
- XR Plugin Management (Oculus)

**Configuration**:
```
Edit > Project Settings > XR Plug-in Management
- Enable "Oculus" under Android tab
- Oculus > Target Devices: Quest Pro
```

### 2. Firebase SDK for Unity

**Version**: 11.6.0 or later  
**Download**: [Firebase Unity SDK](https://firebase.google.com/download/unity)

**Required Modules**:
- FirebaseAuth.unitypackage
- FirebaseDatabase.unitypackage

**Installation**:
1. Download Firebase Unity SDK (dotnet4/unity-2021+)
2. Extract the zip file
3. Import packages:
   - Assets > Import Package > Custom Package
   - Select FirebaseAuth.unitypackage > Import All
   - Select FirebaseDatabase.unitypackage > Import All

**Configuration**:
1. Download google-services.json from Firebase Console
2. Place in: Assets/StreamingAssets/google-services.json
3. Firebase will auto-configure on first run

**Firebase Console Setup**:
1. Create Firebase project at console.firebase.google.com
2. Add Android app with package name: com.yourcompany.vrrobotcontrol
3. Enable Realtime Database
4. Set Database Rules:
```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "robots": {
      ".read": true,
      ".write": "auth != null"
    },
    "sessions": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```
5. Download google-services.json

### 3. Agora RTC SDK for Unity

**Version**: 4.2.2 or later  
**Download**: [Agora Unity SDK](https://docs.agora.io/en/video-calling/get-started/get-started-sdk?platform=unity)

**Installation**:
1. Download Agora Video SDK for Unity
2. Extract and copy to: Assets/Agora-RTC-Plugin/
   OR use Unity Package Manager:
   - Add package from git URL:
   - https://github.com/AgoraIO-Extensions/Agora-Unity-RTC-SDK.git

**Agora Console Setup**:
1. Create account at console.agora.io
2. Create new project
3. Get App ID (save for Lambda configuration)
4. Enable token authentication (recommended)

### 4. MRTK (Mixed Reality Toolkit) - For Virtual Keyboard

**Version**: 2.8.3 (MRTK2) or 3.0+ (MRTK3)  
**Download**: [MRTK GitHub](https://github.com/microsoft/MixedRealityToolkit-Unity)

**Installation (MRTK2)**:

Option 1 - Unity Package Manager:
1. Window > Package Manager
2. Add package from git URL:
   https://github.com/microsoft/MixedRealityToolkit-Unity.git?path=/com.microsoft.mixedreality.toolkit.foundation

Option 2 - Asset Store:
1. Search "Mixed Reality Toolkit" in Asset Store
2. Download and Import

**Required Components**:
- MRTK Foundation
- MRTK Standard Assets
- MRTK Experimental (for NonNativeKeyboard)

**Configuration**:
```
Mixed Reality Toolkit > Add to Scene and Configure
- Profile: DefaultMixedRealityToolkitConfigurationProfile
- Enable Input System
```

## Platform-Specific Setup

### Android Build Configuration

**Required SDK versions**:
```
Android API Level: 29 (Android 10.0) minimum
Target API Level: 32 (Android 12L) or higher
NDK Version: r21d or later
```

**Build Settings**:
```
File > Build Settings > Android
Player Settings:
  - Scripting Backend: IL2CPP
  - Target Architectures: ARM64 ✓
  - Minimum API Level: Android 10.0 (API 29)
  - Target API Level: API 32
  - Internet Access: Require
  - Write Permission: External (SDCard)
```

**XR Settings**:
```
XR Plug-in Management > Android tab:
  ✓ Oculus
  
Oculus Settings:
  - Stereo Rendering Mode: Multiview
  - Target Devices: Quest Pro
  - V2 Signing: ✓
```

## AWS Services Setup

### Required Services:
- AWS Lambda (2 functions)
- DynamoDB (1 table)
- IAM (1 role)

**DynamoDB Table Schema**:
```
Table Name: robot_sessions
Primary Key: session_code (String)

Attributes:
- session_code: String (6 characters)
- robot_id: String
- expires_at: Number (timestamp)
- vr_connected: Boolean
- connection_token: String
- firebase_url: String
- firebase_project_id: String
- firebase_api_key: String
- firebase_app_id: String
- firebase_storage_bucket: String
- agora_app_id: String
- agora_channel: String
- agora_token: String
```

## Network Requirements

### Ports and Protocols:
```
Firebase Realtime Database:
  - Protocol: HTTPS/WebSocket
  - Port: 443
  - Endpoint: *.firebaseio.com

Agora RTC:
  - UDP: 3478, 4000-5000
  - TCP: 443, 1080, 8000-9999
  - Allow: *.agora.io

AWS Lambda:
  - Protocol: HTTPS
  - Port: 443
  - Endpoint: *.lambda-url.*.on.aws
```

## Verification Checklist

After installing all dependencies, verify:

**Unity Editor Console:**
- [ ] No compilation errors
- [ ] Firebase initialized successfully
- [ ] Agora SDK loaded
- [ ] MRTK configured
- [ ] Oculus XR Plugin enabled

**Build Test:**
- [ ] Android build completes without errors
- [ ] APK size < 500 MB
- [ ] App installs on Quest Pro
- [ ] All permissions granted

**Runtime Test:**
- [ ] Firebase connects
- [ ] Agora video initializes
- [ ] Controllers detected
- [ ] Virtual keyboard works

## Troubleshooting

### Firebase Initialization Fails
```
Error: Firebase initialization failed
Solution:
  1. Check google-services.json is in Assets/StreamingAssets/
  2. Verify package name matches Firebase console
  3. Enable anonymous authentication in Firebase Console
```

### Agora Connection Issues
```
Error: Failed to create Agora RTC Engine
Solution:
  1. Check SDK version compatibility
  2. Verify App ID is correct
  3. Check network firewall settings
  4. Enable required ports (UDP 3478, 4000-5000)
```

### MRTK Keyboard Not Appearing
```
Error: NonNativeKeyboard.Instance is null
Solution:
  1. Ensure MRTK Experimental is imported
  2. Check NonNativeKeyboard prefab exists
  3. Verify MRTK is added to scene
  4. Check Input System is enabled
```

### Quest Pro Build Fails
```
Error: Build failed with IL2CPP errors
Solution:
  1. Update to IL2CPP (not Mono)
  2. Set ARM64 architecture only
  3. Update Android SDK to API 32+
  4. Clear Library/ and Temp/ folders
  5. Rebuild
```

## Version Compatibility Matrix

| Component | Tested Version | Minimum Version | Notes |
|-----------|---------------|-----------------|-------|
| Unity | 2021.3.31f1 | 2021.3 LTS | LTS recommended |
| Meta XR SDK | 57.0 | 55.0 | Quest Pro support |
| Firebase Unity | 11.6.0 | 11.0.0 | .NET 4.x required |
| Agora SDK | 4.2.2 | 4.1.0 | Video SDK |
| MRTK | 2.8.3 | 2.8.0 | MRTK2 or MRTK3 |
| Android API | 32 | 29 | Quest Pro needs 29+ |

## Additional Resources

- [Unity XR Documentation](https://docs.unity3d.com/Manual/XR.html)
- [Meta Quest Developer Center](https://developer.oculus.com/)
- [Firebase Unity Setup](https://firebase.google.com/docs/unity/setup)
- [Agora Unity Guide](https://docs.agora.io/en/video-calling/get-started/get-started-sdk?platform=unity)
- [MRTK Documentation](https://learn.microsoft.com/en-us/windows/mixed-reality/mrtk-unity/)
