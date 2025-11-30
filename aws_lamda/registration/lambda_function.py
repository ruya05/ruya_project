import json
import boto3
import random
import string
import time

# AWS clients
REGION = 'ap-southeast-1'
dynamodb = boto3.resource('dynamodb', region_name=REGION)
sessions_table = dynamodb.Table('robot_sessions')

def generate_session_code():
    """Generate random 6-character alphanumeric code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def lambda_handler(event, context):
    """
    Register a new robot session and return 6-digit code
    """
    
    # CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Content-Type': 'application/json'
    }
    
    # Handle OPTIONS (CORS preflight)
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}
    
    try:
        # Parse request
        body = json.loads(event.get('body', '{}'))
        robot_id = body.get('robot_id', 'jethexa_unknown')
        
        # Generate unique session code
        session_code = generate_session_code()
        
        # Check if code already exists (retry if collision)
        max_retries = 5
        for _ in range(max_retries):
            try:
                response = sessions_table.get_item(Key={'session_code': session_code})
                if 'Item' in response:
                    # Code exists, regenerate
                    session_code = generate_session_code()
                else:
                    break
            except:
                break  # Code is unique
        
        # ✅ FIXED: Calculate expiration time correctly
        # Get current time in milliseconds
        current_time_ms = int(time.time() * 1000)
        
        # Add 30 minutes (in milliseconds)
        expires_at = current_time_ms + (30 * 60 * 1000)
        
        # Create Agora channel name (unique per session)
        agora_channel = f"jethexa_{session_code}"
        
        # Store session in DynamoDB
        session_data = {
            'session_code': session_code,
            'robot_id': robot_id,
            'created_at': current_time_ms,
            'expires_at': expires_at,
            'status': 'active',
            'vr_connected': False,
            'agora_channel': agora_channel
        }
        
        sessions_table.put_item(Item=session_data)
        
        print(f"✅ Session registered: {session_code}")
        print(f"   Robot ID: {robot_id}")
        print(f"   Expires at: {expires_at} ({time.ctime(expires_at/1000)})")
        print(f"   Agora channel: {agora_channel}")
        
        # Return session info to robot
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'session_code': session_code,
                'expires_at': expires_at,
                'agora_channel': agora_channel,
                'message': 'Session registered successfully'
            })
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'error': str(e)
            })
        }


