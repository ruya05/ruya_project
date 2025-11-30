# AWS Lambda Backend Functions

This directory contains three serverless functions that power the VR Robot Control System authentication and session management.

## Functions Overview

### 1. Registration Lambda
- **Path**: `registration/`
- **Purpose**: Robot calls this to create new session and get 6-digit code
- **Trigger**: Called by robot when user requests new session
- **Runtime**: Python 3.9

### 2. Authentication Lambda
- **Path**: `authentication/`
- **Purpose**: VR client validates session code and receives credentials
- **Trigger**: Called when user enters 6-digit code in VR headset
- **Runtime**: Python 3.9

### 3. Disconnect Lambda
- **Path**: `disconnect/`
- **Purpose**: Clean disconnection and session state cleanup
- **Trigger**: Called when VR client presses disconnect button
- **Runtime**: Python 3.9

## Architecture Flow
```
┌──────────┐         ┌──────────────┐         ┌──────────┐
│  Robot   │────1───►│ Registration │────2───►│ DynamoDB │
│          │         │    Lambda    │         │          │
└──────────┘         └──────────────┘         └──────────┘
     │                                              │
     │ Display                                      │
     │ Code                                         │
     │                                              │
     ▼                                              │
┌──────────┐         ┌──────────────┐              │
│   User   │────3───►│     VR       │              │
│          │         │   Headset    │              │
└──────────┘         └──────────────┘              │
                            │                       │
                            │                       │
                         4  │                       │
                            ▼                       ▼
                     ┌──────────────┐         ┌──────────┐
                     │    Auth      │────5───►│ DynamoDB │
                     │   Lambda     │◄────6───┤          │
                     └──────────────┘         └──────────┘
                            │
                            │ 7. Return
                            │ Credentials
                            ▼
                     ┌──────────────┐
                     │     VR       │
                     │   Headset    │
                     └──────────────┘
```

**Flow Steps:**
1. Robot calls Registration Lambda
2. Lambda creates session in DynamoDB, returns 6-digit code
3. Robot displays code, user enters in VR
4. VR calls Authentication Lambda with code
5. Lambda validates session in DynamoDB
6. Returns Firebase + Agora credentials
7. VR client connects to Firebase and Agora

## Prerequisites

### AWS Services Required
- **AWS Lambda**: 3 functions
- **DynamoDB**: 1 table (`robot_sessions`)
- **IAM**: Execution role with permissions
- **Secrets Manager**: Firebase and Agora credentials (for authentication function)

### Tools Required
- AWS CLI configured
- Python 3.9 or later
- Bash shell (for deploy scripts)

## Quick Setup

### Step 1: Create DynamoDB Table
```bash
aws dynamodb create-table \
    --table-name robot_sessions \
    --attribute-definitions \
        AttributeName=session_code,AttributeType=S \
    --key-schema \
        AttributeName=session_code,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region ap-southeast-1
```

### Step 2: Create IAM Role

Create execution role with these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:ap-southeast-1:*:table/robot_sessions"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:ap-southeast-1:*:secret:prod/jethexa/firebase-*",
        "arn:aws:secretsmanager:ap-southeast-1:*:secret:prod/jethexa/agora-*"
      ]
    }
  ]
}
```

### Step 3: Create Secrets (for Authentication Lambda)

**Firebase Secret:**
```bash
aws secretsmanager create-secret \
    --name prod/jethexa/firebase \
    --secret-string '{
      "databaseURL": "https://your-project.firebaseio.com",
      "projectId": "your-project-id",
      "apiKey": "your-api-key",
      "appId": "your-app-id",
      "storageBucket": "your-bucket.appspot.com"
    }' \
    --region ap-southeast-1
```

**Agora Secret:**
```bash
aws secretsmanager create-secret \
    --name prod/jethexa/agora \
    --secret-string '{
      "appId": "your-agora-app-id",
      "appCertificate": "your-agora-certificate"
    }' \
    --region ap-southeast-1
```

### Step 4: Deploy Functions
```bash
# Deploy registration function (called by robot)
cd registration
chmod +x deploy.sh
./deploy.sh

# Deploy authentication function (called by VR client)
cd ../authentication
chmod +x deploy.sh
./deploy.sh

# Deploy disconnect function (called by VR client)
cd ../disconnect
chmod +x deploy.sh
./deploy.sh
```

### Step 5: Get Function URLs
```bash
# Get URLs for each function
aws lambda get-function-url-config --function-name vr-robot-registration --region ap-southeast-1
aws lambda get-function-url-config --function-name vr-robot-authentication --region ap-southeast-1
aws lambda get-function-url-config --function-name vr-robot-disconnect --region ap-southeast-1
```

### Step 6: Update Application Code

**In Unity CredentialManager.cs:**
```csharp
private const string AWS_AUTH_URL = "https://YOUR_AUTH_LAMBDA.lambda-url.ap-southeast-1.on.aws/";
private const string AWS_DISCONNECT_URL = "https://YOUR_DISCONNECT_LAMBDA.lambda-url.ap-southeast-1.on.aws/";
```

**In Robot Code:**
```python
REGISTRATION_URL = "https://YOUR_REGISTRATION_LAMBDA.lambda-url.ap-southeast-1.on.aws/"
```

## DynamoDB Table Schema

### Primary Key
- `session_code` (String) - 6-character alphanumeric code

### Attributes

**Core Session Info:**
- `robot_id` (String) - Unique robot identifier
- `created_at` (Number) - Unix timestamp in milliseconds
- `expires_at` (Number) - Unix timestamp in milliseconds (30 min from creation)
- `status` (String) - "active", "connected", "disconnected", "expired"

**Connection State:**
- `vr_connected` (Boolean) - Whether VR client is connected
- `vr_connected_at` (Number) - When VR connected (timestamp)
- `vr_disconnected_at` (Number) - When VR disconnected (timestamp)
- `connection_token` (String) - UUID for request validation
- `authorized_ip` (String) - IP address of connected VR client

**Agora Configuration:**
- `agora_channel` (String) - Agora RTC channel name

**Rate Limiting (for failed attempts):**
- `failed_attempts` (Number) - Count of failed authentication attempts
- `lockout_until` (Number) - Timestamp when lockout expires
- `last_attempt` (Number) - Timestamp of last attempt

## Testing

### Test Registration Lambda
```bash
curl -X POST https://YOUR_REGISTRATION_LAMBDA.lambda-url.ap-southeast-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{"robot_id": "spider-01"}'
```

Expected response:
```json
{
  "success": true,
  "session_code": "ABC123",
  "expires_at": 1234567890000,
  "agora_channel": "jethexa_ABC123",
  "message": "Session registered successfully"
}
```

### Test Authentication Lambda
```bash
curl -X POST https://YOUR_AUTH_LAMBDA.lambda-url.ap-southeast-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{"session_code": "ABC123"}'
```

Expected response:
```json
{
  "success": true,
  "firebase": {...},
  "agora": {...},
  "session_info": {...}
}
```

### Test Disconnect Lambda
```bash
curl -X POST https://YOUR_DISCONNECT_LAMBDA.lambda-url.ap-southeast-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{
    "session_code": "ABC123",
    "robot_id": "spider-01",
    "connection_token": "your-token"
  }'
```

## Monitoring

### View CloudWatch Logs
```bash
# Registration logs
aws logs tail /aws/lambda/vr-robot-registration --follow

# Authentication logs
aws logs tail /aws/lambda/vr-robot-authentication --follow

# Disconnect logs
aws logs tail /aws/lambda/vr-robot-disconnect --follow
```

### Check DynamoDB Table
```bash
# List all sessions
aws dynamodb scan --table-name robot_sessions --region ap-southeast-1

# Get specific session
aws dynamodb get-item \
    --table-name robot_sessions \
    --key '{"session_code": {"S": "ABC123"}}' \
    --region ap-southeast-1
```

## Security Features

### Session Security
- Connection tokens (UUID) validated on each request
- IP address tracking for authorized devices
- Stale connection detection (60-second timeout)
- Conditional DynamoDB updates to prevent race conditions

### Token Generation
- Agora RTC tokens with 30-minute expiration
- Secure random connection tokens
- Firebase anonymous authentication

## Troubleshooting

### "AccessDeniedException" Error
**Problem:** Lambda doesn't have DynamoDB permissions

**Solution:**
```bash
# Attach policy to Lambda execution role
aws iam attach-role-policy \
    --role-name lambda-execution-role \
    --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
```

### "ResourceNotFoundException" Error
**Problem:** DynamoDB table doesn't exist

**Solution:** Create table using Step 1 command above

### "Secret not found" Error
**Problem:** AWS Secrets Manager secrets not created

**Solution:** Create secrets using Step 3 commands above

### Agora Token Not Generated
**Problem:** `agora-token-builder` package not installed

**Solution:**
```bash
cd authentication
pip install agora-token-builder -t .
zip -r lambda_function.zip .
# Redeploy function
```

### Session Code Already Used
**Problem:** Session code collision (rare)

**Solution:** Code automatically regenerates if collision detected (max 5 retries)

## Cleanup

To remove all AWS resources:
```bash
# Delete Lambda functions
aws lambda delete-function --function-name vr-robot-registration
aws lambda delete-function --function-name vr-robot-authentication
aws lambda delete-function --function-name vr-robot-disconnect

# Delete DynamoDB table
aws dynamodb delete-table --table-name robot_sessions

# Delete secrets
aws secretsmanager delete-secret --secret-id prod/jethexa/firebase --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id prod/jethexa/agora --force-delete-without-recovery
```

## Additional Resources

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [DynamoDB Documentation](https://docs.aws.amazon.com/dynamodb/)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [Agora Token Builder](https://github.com/AgoraIO/Tools/tree/master/DynamicKey/AgoraDynamicKey/python)
