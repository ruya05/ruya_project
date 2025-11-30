#!/usr/bin/env python3
# unified_robot_startup.py - Complete startup and teleoperation script
import sys
import subprocess
import rospy
import time
import os
import threading

# Add the parent directory to sys.path to allow imports if run directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config import (
    ROBOT_ID, SERVICE_ACCOUNT_PATH, DATABASE_URL, 
    HTML_FILENAME, WEB_SERVER_PORT
)
from src.utils.network import wait_for_internet, register_session
from src.utils.oled import OLEDDisplay
from src.utils.web_server import start_web_server
from src.utils.firebase_controller import FirebaseJetHexaController

def main():
    print("=" * 60)
    print("🚀 JetHexa Robot Startup Sequence")
    print("=" * 60)
    
    # STEP 1: Stop the default JetHexa service first
    print("🛑 Stopping default jethexa_bringup.service...")
    try:
        subprocess.run(['sudo', 'systemctl', 'stop', 'jethexa_bringup.service'], check=True)
        print("✅ jethexa_bringup.service stopped")
        time.sleep(5)  # Give it a moment to fully stop
    except subprocess.CalledProcessError as e:
        print(f"⚠️ Warning: Could not stop jethexa_bringup.service: {e}")
    
    # STEP 2: Start roscore
    print("🚀 Starting roscore...")
    try:
        # Start roscore in background
        subprocess.Popen(['roscore'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("✅ roscore started")
        time.sleep(5)  # Give roscore time to fully initialize
    except Exception as e:
        print(f"⚠️ Warning: Could not start roscore: {e}")
    
    # STEP 3: Start base launch file - ROBOT STANDS HERE (NO INTERNET NEEDED!)
    print("🤖 Starting jethexa base controller...")
    try:
        subprocess.Popen(['roslaunch', 'jethexa_bringup', 'base.launch'], 
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("✅ Base controller started")
        time.sleep(8)  # Wait for controller to initialize and auto-stand
        print("✅ Robot should be standing NOW (before internet check)")
        
        # Kill the default OLED display node so we can control it
        print("🔧 Stopping all OLED display nodes...")
        try:
            # Specifically kill the known OLED node
            oled_nodes = ['/oled_display/oled_display_node', '/oled_display']
            
            for node in oled_nodes:
                try:
                    print(f"🔧 Attempting to kill node: {node}")
                    result = subprocess.run(['rosnode', 'kill', node], 
                                          capture_output=True, text=True, timeout=3)
                    if result.returncode == 0:
                        print(f"✅ Killed node: {node}")
                    else:
                        print(f"⚠️ Node {node} not found or already stopped")
                except Exception as e:
                    print(f"⚠️ Could not kill {node}: {e}")
            
            time.sleep(2)
            print("✅ OLED node cleanup complete")
        except Exception as e:
            print(f"⚠️ Error stopping OLED nodes: {e}")
            
    except Exception as e:
        print(f"⚠️ Warning: Could not start base controller: {e}")
    
    # STEP 4: Initialize OLED display
    oled = OLEDDisplay()
    oled_available = oled.initialize()
    
    if oled_available:
        print("🧹 Clearing OLED screen completely...")
        # Clear multiple times to ensure old content is gone
        for _ in range(3):
            oled.clear_screen()
            time.sleep(0.2)
        print("✅ OLED cleared and ready")
    
    # STEP 5: NOW check internet connection (robot is already standing!)
    print("\n" + "=" * 60)
    print("🤖 Robot is standing and functional!")
    print("🌐 Now checking internet for remote control...")
    print("=" * 60 + "\n")
    
    if oled_available:
        oled.start_continuous_display("No WiFi")
    
    wait_for_internet()
    
    # STEP 6: Register session and get PIN
    if oled_available:
        oled.display_message("Getting PIN...")
    
    session_code, agora_channel = register_session()
    
    if not session_code:
        print("❌ Failed to retrieve session code. Exiting...")
        if oled_available:
            oled.display_message("Reg Failed")
        return
    
    # STEP 7: Display PIN on OLED
    if oled_available:
        oled.stop_display()
        oled.start_continuous_display(f"PIN:{session_code}")
    
    print(f"\n{'=' * 60}")
    print(f"📌 Session Code: {session_code}")
    print(f"📺 Agora Channel: {agora_channel}")
    print(f"{'=' * 60}\n")
    
    # Wait a moment for PIN to be visible
    time.sleep(2)
    
    # STEP 8: Check if service account file exists
    if not os.path.exists(SERVICE_ACCOUNT_PATH):
        print(f"❌ Service account file not found: {SERVICE_ACCOUNT_PATH}")
        if oled_available:
            oled.display_message("Config Error")
        return
    
    # STEP 9: Start web server
    print("\n🌐 Starting web server...")
    start_web_server()
    print(f"📄 HTML file accessible at: http://localhost:{WEB_SERVER_PORT}/{HTML_FILENAME}")
    
    # Launch Chromium with full path
    subprocess.Popen([
       '/usr/bin/chromium-browser',
       '--password-store=basic',
       f'http://localhost:{WEB_SERVER_PORT}/{HTML_FILENAME}'
    ])
    print(f"🌐 Opening {HTML_FILENAME} in Chromium...")
    
    # STEP 10: Start teleoperation controller
    try:
        print("\n🤖 Starting teleoperation controller...")
        # Keep displaying the PIN on OLED - don't stop it
        
        controller = FirebaseJetHexaController(SERVICE_ACCOUNT_PATH, DATABASE_URL, ROBOT_ID, session_code)
        controller.start_listening()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        if oled_available:
            oled.display_message("Error!")
        rospy.logerr(str(e))

if __name__ == "__main__":
    main()
