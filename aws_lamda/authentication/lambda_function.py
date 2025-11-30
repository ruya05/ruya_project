import json
import boto3
import time
import os
import secrets
from datetime import datetime
from botocore.exceptions import ClientError

try:
    from agora_token_builder import RtcTokenBuilder, Role_Subscriber
    AGORA_TOKEN_AVAILABLE = True
except ImportError:
    print("WARNING: agora-token-builder not installed")
    AGORA_TOKEN_AVAILABLE = False

REGION = 'ap-southeast-1'
dynamodb = boto3.resource('dynamodb', region_name=REGION)
secretsmanager = boto3.client('secretsmanager', region_name=REGION)
sessions_table = dynamodb.Table('robot_sessions')

STALE_CONNECTION_TIMEOUT = 60
TOKEN_EXPIRATION_SECONDS = 1800
AGORA_UID = 0
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = 300


def generate_agora_token(app_id, app_certificate, channel_name, uid=0, expiration_seconds=1800):
    if not AGORA_TOKEN_AVAILABLE:
        print("Cannot generate token - agora-token-builder not installed")
        return ""
    
    try:
        current_timestamp = int(time.time())
        privilege_expired_ts = current_timestamp + expiration_seconds
        
        print(f"Generating Agora token:")
        print(f"   App ID: {app_id}")
        print(f"   Channel: {channel_name}")
        print(f"   UID: {uid}")
        print(f"   Expiration: {expiration_seconds}s")
        
        token = RtcTokenBuilder.buildTokenWithUid(
            app_id, 
            app_certificate, 
            channel_name, 
            uid, 
            Role_Subscriber, 
            privilege_expired_ts
        )
        
        print(f"Token generated successfully (length: {len(token)})")
        return token
        
    except Exception as e:
        print(f"Token generation failed: {str(e)}")
        import traceback
        print(f"   Traceback:\n{traceback.format_exc()}")
        return ""


def get_secrets():
    firebase_creds = None
    agora_creds = None
    
    try:
        print("Retrieving Firebase secret...")
        firebase_secret = secretsmanager.get_secret_value(
            SecretId='prod/jethexa/firebase'
        )
        firebase_creds = json.loads(firebase_secret['SecretString'])
        print("Firebase secret retrieved")
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        print(f"Firebase secret error: {error_code}")
        
        if error_code == 'ResourceNotFoundException':
            print("Using fallback Firebase credentials")
            firebase_creds = {
                "databaseURL": "https://qiyas-dm-default-rtdb.asia-southeast1.firebasedatabase.app/",
                "projectId": "qiyas-dm",
                "apiKey": "AIzaSyA9y2KGGrUDO0tHUy_JMDrlNT_dyC9ZWUM",
                "appId": "1:91239853902:android:9a79b2531c60013ea4b81f",
                "storageBucket": "qiyas-dm.appspot.com"
            }
        else:
            raise e
    
    try:
        print("Retrieving Agora secret...")
        agora_secret = secretsmanager.get_secret_value(
            SecretId='prod/jethexa/agora'
        )
        agora_creds = json.loads(agora_secret['SecretString'])
        print("Agora secret retrieved")
        
        if not agora_creds.get('appId'):
            print("Agora appId missing in secret")
            raise ValueError("Agora appId not configured")
        
        if not agora_creds.get('appCertificate'):
            print("WARNING: Agora appCertificate missing - tokens cannot be generated")
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        print(f"Agora secret error: {error_code}")
        
        if error_code == 'ResourceNotFoundException':
            print("Using placeholder Agora credentials")
            agora_creds = {
                "appId": "233fac35de4c4c5180a4e23f0421256f",
                "appCertificate": ""
            }
        else:
            raise e
    
    return firebase_creds, agora_creds


def check_rate_limit(session_code, source_ip):
    current_time = int(time.time() * 1000)
    rate_limit_key = f"{session_code}_{source_ip}"
    
    try:
        response = sessions_table.get_item(
            Key={'session_code': rate_limit_key}
        )
        
        if 'Item' in response:
            rate_limit_data = response['Item']
            failed_attempts = rate_limit_data.get('failed_attempts', 0)
            lockout_until = rate_limit_data.get('lockout_until', 0)
            
            if lockout_until > current_time:
                remaining_seconds = int((lockout_until - current_time) / 1000)
                print(f"IP {source_ip} is locked out for {remaining_seconds}s")
                return False, remaining_seconds
            
            if failed_attempts >= MAX_FAILED_ATTEMPTS:
                lockout_until = current_time + (LOCKOUT_DURATION * 1000)
                sessions_table.put_item(
                    Item={
                        'session_code': rate_limit_key,
                        'failed_attempts': failed_attempts,
                        'lockout_until': lockout_until,
                        'last_attempt': current_time
                    }
                )
                print(f"IP {source_ip} locked out - too many failed attempts")
                return False, LOCKOUT_DURATION
        
        return True, 0
        
    except Exception as e:
        print(f"Rate limit check error: {str(e)}")
        return True, 0


def increment_failed_attempts(session_code, source_ip):
    current_time = int(time.time() * 1000)
    rate_limit_key = f"{session_code}_{source_ip}"
    
    try:
        response = sessions_table.get_item(
            Key={'session_code': rate_limit_key}
        )
        
        failed_attempts = 1
        if 'Item' in response:
            failed_attempts = response['Item'].get('failed_attempts', 0) + 1
        
        sessions_table.put_item(
            Item={
                'session_code': rate_limit_key,
                'failed_attempts': failed_attempts,
                'last_attempt': current_time,
                'lockout_until': 0
            }
        )
        
        print(f"Failed attempts for {source_ip}: {failed_attempts}")
        
    except Exception as e:
        print(f"Failed to increment attempts: {str(e)}")


def clear_failed_attempts(session_code, source_ip):
    rate_limit_key = f"{session_code}_{source_ip}"
    
    try:
        sessions_table.delete_item(
            Key={'session_code': rate_limit_key}
        )
        print(f"Cleared failed attempts for {source_ip}")
    except Exception as e:
        print(f"Failed to clear attempts: {str(e)}")


def generate_connection_token():
    return secrets.token_urlsafe(32)


def lambda_handler(event, context):
    
    print("=" * 60)
    print("AUTHENTICATION LAMBDA INVOKED")
    print("=" * 60)
    print(f"Region: {REGION}")
    print(f"Request ID: {context.aws_request_id}")
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Content-Type': 'application/json'
    }
    
    http_method = event.get('requestContext', {}).get('http', {}).get('method')
    if http_method == 'OPTIONS':
        print("OPTIONS request - returning CORS headers")
        return {'statusCode': 200, 'headers': headers, 'body': ''}
    
    source_ip = event.get('requestContext', {}).get('http', {}).get('sourceIp', 'unknown')
    print(f"Source IP: {source_ip}")
    
    try:
        body_str = event.get('body', '{}')
        body = json.loads(body_str)
        session_code = body.get('session_code', '').upper().strip()
        connection_token = body.get('connection_token', '').strip()
        
        print(f"Session code: {session_code}")
        
        if not session_code or len(session_code) != 6:
            print("Invalid session code")
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': 'Invalid session code format'
                })
            }
        
        allowed, lockout_time = check_rate_limit(session_code, source_ip)
        if not allowed:
            return {
                'statusCode': 429,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': f'Too many failed attempts. Try again in {lockout_time} seconds.',
                    'retry_after': lockout_time
                })
            }
        
        print(f"Querying DynamoDB for session: {session_code}")
        
        response = sessions_table.get_item(Key={'session_code': session_code})
        
        if 'Item' not in response:
            print(f"Session '{session_code}' not found")
            increment_failed_attempts(session_code, source_ip)
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': 'Session not found. Check code on robot display.'
                })
            }
        
        session = response['Item']
        print(f"Session found")
        
        current_time = int(time.time() * 1000)
        expires_at = int(session.get('expires_at', 0))
        
        if expires_at < current_time:
            time_diff = (current_time - expires_at) / 1000 / 60
            print(f"Session expired {time_diff:.1f} minutes ago")
            increment_failed_attempts(session_code, source_ip)
            return {
                'statusCode': 403,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': 'Session expired. Robot must generate new code.'
                })
            }
        
        time_remaining = (expires_at - current_time) / 1000 / 60
        print(f"Session valid - {time_remaining:.1f} minutes remaining")
        
        vr_connected = session.get('vr_connected', False)
        vr_connected_at = session.get('vr_connected_at', 0)
        stored_connection_token = session.get('connection_token', '')
        authorized_ip = session.get('authorized_ip', '')
        
        if vr_connected:
            time_since_connected = (current_time - vr_connected_at) / 1000
            
            print(f"Session shows as connected")
            print(f"   Connected at: {vr_connected_at}")
            print(f"   Time since: {time_since_connected:.1f}s")
            print(f"   Authorized IP: {authorized_ip}")
            print(f"   Request IP: {source_ip}")
            
            if connection_token and connection_token == stored_connection_token and source_ip == authorized_ip:
                print("Valid reconnection from authorized device")
                clear_failed_attempts(session_code, source_ip)
            elif time_since_connected > STALE_CONNECTION_TIMEOUT:
                print(f"Stale connection detected - auto-disconnecting...")
                
                try:
                    new_token = generate_connection_token()
                    
                    sessions_table.update_item(
                        Key={'session_code': session_code},
                        UpdateExpression='SET vr_connected = :false, #status = :status, stale_disconnect_at = :time, connection_token = :token, authorized_ip = :ip',
                        ExpressionAttributeNames={'#status': 'status'},
                        ExpressionAttributeValues={
                            ':false': False,
                            ':status': 'disconnected_stale',
                            ':time': current_time,
                            ':token': new_token,
                            ':ip': source_ip
                        }
                    )
                    
                    vr_connected = False
                    stored_connection_token = new_token
                    print("Stale connection cleared - proceeding with new connection")
                    clear_failed_attempts(session_code, source_ip)
                    
                except ClientError as e:
                    print(f"Failed to clear stale connection: {str(e)}")
                    return {
                        'statusCode': 500,
                        'headers': headers,
                        'body': json.dumps({
                            'success': False,
                            'error': 'Failed to clear stale connection'
                        })
                    }
            else:
                wait_time = int(STALE_CONNECTION_TIMEOUT - time_since_connected)
                print(f"Recent connection detected - rejecting")
                increment_failed_attempts(session_code, source_ip)
                return {
                    'statusCode': 409,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'error': f'Robot already connected. Disconnect first or wait {wait_time}s.'
                    })
                }
        
        print(f"Retrieving credentials...")
        firebase_creds, agora_creds = get_secrets()
        
        if not firebase_creds or not agora_creds:
            print("Failed to retrieve credentials")
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': 'Failed to retrieve credentials'
                })
            }
        
        agora_channel = session.get('agora_channel')
        agora_token = ""
        
        app_certificate = agora_creds.get('appCertificate', '')
        
        if app_certificate and AGORA_TOKEN_AVAILABLE:
            print("Generating Agora RTC token...")
            agora_token = generate_agora_token(
                app_id=agora_creds.get('appId'),
                app_certificate=app_certificate,
                channel_name=agora_channel,
                uid=AGORA_UID,
                expiration_seconds=TOKEN_EXPIRATION_SECONDS
            )
            
            if agora_token:
                print(f"Token generated (length: {len(agora_token)})")
            else:
                print("Token generation failed - using empty token")
        
        new_connection_token = stored_connection_token if stored_connection_token else generate_connection_token()
        
        print(f"Updating session to connected state...")
        
        try:
            sessions_table.update_item(
                Key={'session_code': session_code},
                UpdateExpression='SET vr_connected = :val, vr_connected_at = :time, #status = :status, connection_token = :token, authorized_ip = :ip',
                ConditionExpression='vr_connected = :false',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':val': True,
                    ':time': current_time,
                    ':false': False,
                    ':status': 'connected',
                    ':token': new_connection_token,
                    ':ip': source_ip
                }
            )
            
            print("Session marked as connected")
            clear_failed_attempts(session_code, source_ip)
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                print("Race condition detected - another client connected first")
                increment_failed_attempts(session_code, source_ip)
                return {
                    'statusCode': 409,
                    'headers': headers,
                    'body': json.dumps({
                        'success': False,
                        'error': 'Another VR headset connected first. Try again.'
                    })
                }
            else:
                print(f"DynamoDB update failed: {str(e)}")
                raise e
        
        response_data = {
            'success': True,
            'firebase': {
                'databaseURL': firebase_creds.get('databaseURL'),
                'projectId': firebase_creds.get('projectId'),
                'apiKey': firebase_creds.get('apiKey'),
                'appId': firebase_creds.get('appId'),
                'storageBucket': firebase_creds.get('storageBucket', '')
            },
            'agora': {
                'appId': agora_creds.get('appId'),
                'channel': agora_channel,
                'token': agora_token
            },
            'session_info': {
                'session_code': session_code,
                'robot_id': session.get('robot_id'),
                'expires_at': expires_at,
                'agora_channel': agora_channel,
                'connection_token': new_connection_token
            },
            'message': 'Authentication successful'
        }
        
        print("\n" + "=" * 60)
        print("AUTHENTICATION SUCCESSFUL")
        print("=" * 60)
        print(f"Session: {session_code}")
        print(f"Robot: {session.get('robot_id')}")
        print(f"Channel: {agora_channel}")
        print(f"Token: {'Generated' if agora_token else 'Empty'}")
        print(f"Connection Token: {new_connection_token[:8]}...")
        print(f"Authorized IP: {source_ip}")
        print("=" * 60)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(response_data)
        }
    
    except Exception as e:
        print(f"\nUNEXPECTED ERROR: {str(e)}")
        import traceback
        print(f"Traceback:\n{traceback.format_exc()}")
        
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'error': f'Internal server error: {str(e)}'
            })
        }
