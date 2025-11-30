import requests
import time
import json
from ..config import LAMBDA_ENDPOINT, ROBOT_ID

def check_internet():
    """Check if internet connection is available"""
    try:
        requests.get("https://www.google.com", timeout=5)
        return True
    except requests.ConnectionError:
        return False
    except Exception:
        return False

def wait_for_internet():
    """Wait for internet connection with status messages"""
    print("🔍 Checking internet connection...")
    
    while not check_internet():
        print("❌ No internet connection. Retrying in 3 seconds...")
        time.sleep(3)
    
    print("✅ Internet connected!")
    return True

def register_session():
    """Call Lambda to get session code"""
    try:
        print(f"📡 Registering robot {ROBOT_ID} with AWS...")
        response = requests.post(
            LAMBDA_ENDPOINT,
            json={"robot_id": ROBOT_ID},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            session_code = data['session_code']
            agora_channel = data['agora_channel']
            
            print(f"✅ Session Code: {session_code}")
            print(f"📺 Agora Channel: {agora_channel}")
            
            return session_code, agora_channel
        else:
            print(f"❌ Registration failed: {response.text}")
            return None, None
            
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        return None, None
    except Exception as e:
        print(f"❌ Error registering: {e}")
        return None, None
