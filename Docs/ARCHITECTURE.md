# System Architecture

This document provides a detailed technical overview of the VR Robot Control System architecture.

## System Overview

The VR Robot Control System is a distributed application consisting of multiple components:

1. **VR Client** - Unity application running on Meta Quest Pro
2. **Authentication Service** - AWS Lambda functions for session management
3. **Real-time Database** - Firebase for command synchronization
4. **Video Streaming** - Agora RTC for low-latency video
5. **Session Storage** - DynamoDB for session state
6. **Robot Controller** - Embedded system on quadruped robot

## Architecture Diagram
```
                            CLOUD LAYER
┌────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐ │
│  │  AWS Lambda  │      │   DynamoDB   │      │   Agora.io   │ │
│  │              │◄────►│              │      │   RTC Cloud  │ │
│  │ - Auth       │      │ - Sessions   │      │              │ │
│  │ - Disconnect │      │ - State      │      │ - Video      │ │
│  └──────────────┘      └──────────────┘      └──────────────┘ │
│         │                                             │         │
│         │              ┌──────────────┐              │         │
│         │              │   Firebase   │              │         │
│         │              │   Realtime   │              │         │
│         │              │   Database   │              │         │
│         │              │              │              │         │
│         │              │ - Commands   │              │         │
│         │              │ - Gas Data   │              │         │
│         │              └──────────────┘              │         │
│         │                     │                      │         │
└─────────┼─────────────────────┼──────────────────────┼─────────┘
          │                     │                      │
          │  CLIENT LAYER       │                      │
┌─────────▼─────────────────────▼──────────────────────▼─────────┐
│                                                                  │
│                    VR CLIENT (Meta Quest Pro)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │CredentialMgr  │  │ Robot        │  │ Video Stream │  │  │
│  │  │               │  │ Controller   │  │              │  │  │
│  │  │ - Auth        │  │              │  │ - Agora      │  │  │
│  │  │ - Sessions    │  │ - Input      │  │ - Display    │  │  │
│  │  └───────────────┘  │ - Commands   │  └──────────────┘  │  │
│  │                     │ - Firebase   │                     │  │
│  │  ┌───────────────┐  └──────────────┘  ┌──────────────┐  │  │
│  │  │ VRUIManager   │                    │ Gas Monitor  │  │  │
│  │  │               │                    │              │  │  │
│  │  │ - UI States   │                    │ - Sensors    │  │  │
│  │  │ - Feedback    │                    │ - Alerts     │  │  │
│  │  └───────────────┘                    └──────────────┘  │  │
│  │                                                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
          │                     │                      │
          │  ROBOT LAYER        │                      │
┌─────────▼─────────────────────▼──────────────────────▼─────────┐
│                                                                  │
│                    ROBOT (Spider-01)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ Movement      │  │ Camera       │  │ Gas Sensors  │  │  │
│  │  │ Control       │  │              │  │              │  │  │
│  │  │               │  │ - Streaming  │  │ - 4x MQ      │  │  │
│  │  │ - Motors      │◄─┤ - Firebase   │  │ - Firebase   │  │  │
│  │  │ - IMU         │  │   Commands   │  │   Publish    │  │  │
│  │  └───────────────┘  └──────────────┘  └──────────────┘  │  │
│  │                                                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. VR Client (Unity Application)

**CredentialManager.cs**
- Handles authentication with AWS Lambda
- Manages session lifecycle
- Stores credentials securely in memory
- Implements connection token validation
- Handles graceful disconnect

**EnhancedSecureVRRobotController.cs**
- Processes VR controller input
- Implements dead-zone filtering
- Sends commands to Firebase at 10 Hz
- Handles emergency stop conditions
- Supports dual input (VR + keyboard)

**SecureAgoraVideoStream.cs**
- Manages Agora RTC connection
- Handles video rendering
- Implements auto-reconnect
- Monitors FPS and quality
- Provides connection status

**VRUIManager.cs**
- Manages UI state transitions
- Handles user authentication flow
- Displays session timer
- Shows error messages
- Provides visual feedback

**GasSensorDisplay.cs / GasUI.cs**
- Fetches sensor data from Firebase
- Displays real-time gas levels
- Shows threshold warnings
- Updates every 2 seconds

**QuestVirtualKeyboard.cs**
- Integrates MRTK keyboard
- Handles text input in VR
- Manages input field focus

### 2. Authentication Service (AWS Lambda)

**Authentication Lambda**
- Validates 6-digit session codes
- Queries DynamoDB for session data
- Checks robot availability
- Generates connection tokens
- Returns credentials (Firebase + Agora)
- Updates session state

**Disconnect Lambda**
- Validates connection tokens
- Updates DynamoDB (vr_connected = false)
- Clears connection state
- Logs disconnect events

### 3. Session Storage (DynamoDB)

**Table: robot_sessions**

Primary Key: `session_code` (String)

Attributes:
- `session_code`: 6-character code
- `robot_id`: Unique robot identifier
- `expires_at`: Unix timestamp (milliseconds)
- `vr_connected`: Boolean connection status
- `connection_token`: UUID for validation
- `connected_at`: Connection timestamp
- `disconnected_at`: Disconnection timestamp
- `firebase_url`: Firebase database URL
- `firebase_project_id`: Firebase project ID
- `firebase_api_key`: Firebase API key
- `firebase_app_id`: Firebase application ID
- `firebase_storage_bucket`: Firebase storage bucket
- `agora_app_id`: Agora application ID
- `agora_channel`: Agora channel name
- `agora_token`: Agora authentication token

### 4. Real-time Database (Firebase)

**Database Structure**:
```
/
├── sessions/
│   └── {session_code}/
│       ├── connection_status/
│       │   ├── status: "connected" | "disconnected"
│       │   ├── timestamp: number
│       │   └── platform: string
│       └── robot_commands/
│           └── latest/
│               ├── timestamp: number
│               ├── seq: number
│               ├── walk_forward: boolean
│               ├── walk_backward: boolean
│               ├── strafe_left: boolean
│               ├── strafe_right: boolean
│               ├── turn_left: boolean
│               ├── turn_right: boolean
│               ├── emergency_stop: boolean
│               ├── source: string
│               ├── robot_id: string
│               ├── session_code: string
│               └── operator_id: string
│
└── robots/
    └── {robot_id}/
        └── gasses/
            ├── gas-1/
            │   ├── config/
            │   │   ├── gas_name: "LPG"
            │   │   ├── threshold: number
            │   │   └── update_interval_sec: number
            │   └── latest_reading/
            │       ├── timestamp: string
            │       ├── value_ppm: number
            │       └── location/
            │           ├── lat: number
            │           ├── lng: number
            │           └── status: string
            ├── gas-2/ (Propane)
            ├── gas-3/ (Butane)
            └── gas-4/ (Methane)
```

### 5. Video Streaming (Agora RTC)

**Configuration**:
- Video Resolution: 1280x720
- Frame Rate: 30 fps
- Bitrate: 1000-2000 kbps (adaptive)
- Codec: H.264
- Mode: Live Broadcasting
- Role: Audience (VR client)

**Flow**:
1. Robot publishes camera stream to Agora channel
2. VR client subscribes as audience member
3. Agora handles routing and optimization
4. Video displayed on VR headset screen

## Data Flow Sequences

### Authentication Sequence
```
User                VR Client           AWS Lambda          DynamoDB
 |                     |                     |                  |
 ├─Enter Code──────────►                     |                  |
 |                     ├─POST /auth─────────►                  |
 |                     |                     ├─Query Session───►
 |                     |                     │◄─Session Data────┤
 |                     |                     ├─Validate─────────►
 |                     |                     ├─Generate Token───►
 |                     |                     ├─Update State────►
 |                     │◄─Credentials────────┤                  |
 |                     ├─Store Locally───────►                  |
 |                     ├─Connect Firebase────►                  |
 |                     ├─Join Agora──────────►                  |
 │◄─Success───────────┤                     |                  |
 |                     |                     |                  |
```

### Command Flow
```
Controller         VR Client           Firebase          Robot
    |                 |                   |               |
    ├─Thumbstick──────►                   |               |
    |                 ├─Process Input─────►               |
    |                 ├─Build Command────►                |
    |                 ├─Write to DB───────►               |
    |                 |                   ├─Notify────────►
    |                 |                   |               ├─Read Command
    |                 |                   |               ├─Execute Motion
    |                 |                   │◄─Acknowledge──┤
    │◄─Haptic Feedback┤                   |               |
    |                 |                   |               |
```

### Disconnect Sequence
```
User           VR Client           AWS Lambda          Firebase       Agora
 |                |                     |                  |            |
 ├─Press Disconnect►                    |                  |            |
 |                ├─Stop Commands───────►                  |            |
 |                ├─Emergency Stop──────────────────────────►           |
 |                ├─POST /disconnect────►                  |            |
 |                |                     ├─Validate Token───►            |
 |                |                     ├─Update State─────►            |
 |                │◄─Confirmed───────────┤                  |            |
 |                ├─Write Status────────────────────────────►           |
 |                ├─Leave Channel─────────────────────────────────────►
 |                ├─Clear Credentials───►                  |            |
 │◄─Complete──────┤                     |                  |            |
 |                |                     |                  |            |
```

## Security Architecture

### Authentication Layers

1. **Session Code Validation**
   - 6-character alphanumeric code
   - Time-limited (60 minutes)
   - One-time use per connection

2. **Connection Token**
   - UUID v4 generated per session
   - Validated on every request
   - Cleared on disconnect

3. **Firebase Anonymous Auth**
   - Automatic authentication
   - UID generation per session
   - Database rules enforcement

4. **Request Validation**
   - Session code + connection token
   - Sequence numbers
   - Timestamp verification

### Error Handling Strategy

**Network Errors**:
- Retry with exponential backoff
- Maximum retry attempts: 3
- Timeout handling at each layer

**State Errors**:
- Automatic state reconciliation
- Emergency stop on critical errors
- Graceful degradation

**User Errors**:
- Clear error messages
- Suggested actions
- Visual feedback

## Performance Optimization

### VR Client Optimizations

1. **Command Rate Limiting**: 10 Hz prevents Firebase throttling
2. **Dead-zone Filtering**: Reduces unnecessary commands
3. **Object Pooling**: Reuses command objects
4. **Coroutine Management**: Efficient async operations
5. **Frame Rate Target**: 90 fps for Quest Pro

### Network Optimizations

1. **Firebase Writes**: Only when commands change
2. **Agora Bitrate**: Adaptive based on conditions
3. **Lambda Cold Start**: Provisioned concurrency
4. **DynamoDB**: On-demand capacity
5. **Gas Sensor Polling**: 2-second intervals

### Memory Management

1. **Credential Caching**: In-memory only
2. **Video Buffer**: Managed by Agora SDK
3. **Command Queue**: Limited size
4. **Log Rotation**: Maximum 10 entries in VR

## Scalability Considerations

### Current Limitations

- **Single Operator**: One VR client per robot
- **Session Limit**: 60 minutes
- **Command Rate**: 10 Hz maximum
- **Video Quality**: 720p maximum

### Future Scalability

1. **Multi-Robot Support**
   - Session routing by robot ID
   - Separate Firebase paths
   - Independent Agora channels

2. **Fleet Management**
   - Central control dashboard
   - Robot status monitoring
   - Command queuing system

3. **Operator Handoff**
   - Token transfer mechanism
   - State synchronization
   - Graceful transitions

## Monitoring and Logging

### VR Client Logging

- Authentication events
- Command transmission
- Video connection status
- Error conditions
- Performance metrics

### Lambda Logging

- CloudWatch Logs integration
- Request/response logging
- Error tracking
- Performance monitoring

### Firebase Monitoring

- Connection status
- Read/write operations
- Rule violations
- Performance metrics

## Disaster Recovery

### Failure Scenarios

**AWS Lambda Unavailable**:
- Error message to user
- Local credential cache (if available)
- Manual fallback instructions

**Firebase Unavailable**:
- Emergency stop activation
- Video continues (Agora independent)
- Reconnection attempts

**Agora Unavailable**:
- Commands continue working
- Video loss notification
- Manual control possible

**Robot Offline**:
- Timeout detection (10 seconds)
- Automatic emergency stop
- Clear error message

### Recovery Procedures

1. **Network Loss**: Auto-reconnect with backoff
2. **Session Expiry**: Force disconnect, new code required
3. **Credential Error**: Clear cache, re-authenticate
4. **Emergency Stop**: Hold for 1 second to release

## Development and Testing

### Local Development

1. Use keyboard controls in Unity Editor
2. Mock Lambda responses for testing
3. Firebase Emulator for database testing
4. Agora test mode for video

### Integration Testing

1. End-to-end authentication flow
2. Command transmission verification
3. Video stream quality testing
4. Emergency stop validation
5. Session expiration handling

### Production Deployment

1. Build Unity project for Quest Pro (Android/ARM64)
2. Deploy Lambda functions with CI/CD
3. Configure Firebase security rules
4. Set up Agora project and channels
5. Create DynamoDB table with indexes
