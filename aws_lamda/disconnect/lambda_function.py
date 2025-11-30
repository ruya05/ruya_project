import json
import boto3
import time
from botocore.exceptions import ClientError

REGION = 'ap-southeast-1'
dynamodb = boto3.resource('dynamodb', region_name=REGION)
sessions_table = dynamodb.Table('robot_sessions')

def lambda_handler(event, context):
    
    print("=" * 60)
    print("DISCONNECT LAMBDA INVOKED")
    print("=" * 60)
    print(f"Region: {REGION}")
    print(f"Request ID: {context.aws_request_id}")
    print(f"Function ARN: {context.invoked_function_arn}")
    
    import boto3
    sts = boto3.client('sts')
    try:
        identity = sts.get_caller_identity()
        print(f"Caller Identity: {identity}")
    except Exception as e:
        print(f"Could not get caller identity: {e}")
    
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
    
    try:
        body_str = event.get('body', '{}')
        body = json.loads(body_str)
        session_code = body.get('session_code', '').upper().strip()
        robot_id = body.get('robot_id', '')
        
        print(f"Session code: {session_code}")
        print(f"Robot ID: {robot_id}")
        
        if not session_code:
            print("Missing session_code")
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': 'Missing session_code parameter'
                })
            }
        
        print(f"Querying DynamoDB table: {sessions_table.table_name}")
        print(f"   Table ARN: {sessions_table.table_arn}")
        
        try:
            response = sessions_table.get_item(Key={'session_code': session_code})
            print(f"DynamoDB GetItem successful")
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_msg = e.response['Error']['Message']
            print(f"DynamoDB error: {error_code}")
            print(f"   Message: {error_msg}")
            
            if error_code == 'AccessDeniedException':
                print("=" * 60)
                print("PERMISSION DENIED!")
                print("=" * 60)
                print("Lambda execution role does not have permission to access DynamoDB.")
                print(f"Required permission: dynamodb:GetItem on {sessions_table.table_arn}")
                print("")
                print("FIX:")
                print("1. Go to IAM Console")
                print("2. Find Lambda execution role")
                print("3. Add DynamoDB permissions")
                print("=" * 60)
            
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': f'Database error: {error_code}',
                    'details': error_msg
                })
            }
        
        if 'Item' not in response:
            print(f"Session not found: {session_code}")
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'message': 'Session not found (already expired or deleted)',
                    'warning': 'Session may have already expired'
                })
            }
        
        session = response['Item']
        print(f"Session found")
        
        vr_connected = session.get('vr_connected', False)
        if not vr_connected:
            print(f"Session already disconnected")
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'success': True,
                    'message': 'Session already disconnected',
                    'warning': 'VR was not connected'
                })
            }
        
        current_time = int(time.time() * 1000)
        print(f"Updating session to disconnected state...")
        
        try:
            sessions_table.update_item(
                Key={'session_code': session_code},
                UpdateExpression='SET vr_connected = :false, vr_disconnected_at = :time, #status = :status',
                ExpressionAttributeNames={
                    '#status': 'status'
                },
                ExpressionAttributeValues={
                    ':false': False,
                    ':time': current_time,
                    ':status': 'disconnected'
                }
            )
            print("DynamoDB UpdateItem successful")
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_msg = e.response['Error']['Message']
            print(f"DynamoDB update failed: {error_code}")
            print(f"   Message: {error_msg}")
            
            if error_code == 'AccessDeniedException':
                print("=" * 60)
                print("PERMISSION DENIED!")
                print("=" * 60)
                print("Lambda execution role does not have permission to update DynamoDB.")
                print(f"Required permission: dynamodb:UpdateItem on {sessions_table.table_arn}")
                print("=" * 60)
            
            return {
                'statusCode': 500,
                'headers': headers,
                'body': json.dumps({
                    'success': False,
                    'error': f'Failed to update session: {error_code}',
                    'details': error_msg
                })
            }
        
        print("\n" + "=" * 60)
        print("DISCONNECT SUCCESSFUL")
        print("=" * 60)
        print(f"Session: {session_code}")
        print(f"Disconnected at: {current_time}")
        print("=" * 60)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'success': True,
                'message': 'Disconnected successfully',
                'session_code': session_code,
                'disconnected_at': current_time
            })
        }
    
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {str(e)}")
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({
                'success': False,
                'error': 'Invalid JSON in request body'
            })
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
