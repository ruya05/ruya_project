import time
import os
import rospy
import firebase_admin
from firebase_admin import credentials, db
from geometry_msgs.msg import Twist
from jethexa_controller_interfaces.msg import Traveling

class FirebaseJetHexaController:
    def __init__(self, service_account_path, database_url, robot_id, session_code):
        """Initialize Firebase connection and ROS publishers"""
        try:
            self.robot_id = robot_id
            self.session_code = session_code
            
            # Initialize Firebase Admin SDK
            cred = credentials.Certificate(service_account_path)
            # Check if app is already initialized to avoid error
            try:
                firebase_admin.get_app()
            except ValueError:
                firebase_admin.initialize_app(cred, {
                    'databaseURL': database_url
                })
            
            # Get database reference using session-based path
            self.commands_ref = db.reference(f'sessions/{session_code}/robot_commands/latest')
            print(f"✅ Connected to Firebase successfully!")
            print(f"🤖 Monitoring robot: {robot_id}")
            print(f"📍 Session: {session_code}")
            print(f"📂 Firebase path: sessions/{session_code}/robot_commands/latest")
            
            # Initialize ROS node and publishers
            # Note: init_node should usually be called once per process. 
            # If main.py calls it, we might not need it here, or we check.
            # But the original code called it here.
            # If main.py calls it for other things, we might have a conflict if we call it again with a different name.
            # We'll check if node is initialized.
            if rospy.get_node_uri() is None:
                rospy.init_node('firebase_jethexa_controller_node')
            
            topic_prefix = rospy.get_param("~topic_prefix", "jethexa_controller")
            self.cmd_vel_pub = rospy.Publisher(topic_prefix + '/cmd_vel', Twist, queue_size=1)
            self.traveling_pub = rospy.Publisher(topic_prefix + '/traveling', Traveling, queue_size=1)
            print("✅ ROS publishers initialized!")
            
            # Initialize control state
            self.current_command = {
                'vx': 0, 'vy': 0, 'yaw': 0,
                'walk_forward': False, 'walk_backward': False,
                'strafe_left': False, 'strafe_right': False,
                'turn_left': False, 'turn_right': False,
                'emergency_stop': False
            }
            
            self.msg = Twist()
            
        except Exception as e:
            print(f"❌ Error initializing Firebase or ROS: {e}")
            raise

    def send_movement_command(self):
        """Send movement command based on current command state"""
        print("\n🎮 PROCESSING MOVEMENT COMMAND")
        print("-" * 60)
        
        if self.current_command.get('emergency_stop', False):
            print("🛑 EMERGENCY STOP ACTIVATED")
            self.msg.linear.x = 0.0
            self.msg.linear.y = 0.0
            self.msg.angular.z = 0.0
            self.cmd_vel_pub.publish(self.msg)
            print("✅ Stop command published to ROS")
            return
        
        vx = self.current_command.get('vx', 0)
        vy = self.current_command.get('vy', 0)
        yaw = self.current_command.get('yaw', 0)
        
        print(f"📊 Raw values - VX: {vx}, VY: {vy}, Yaw: {yaw}")
        
        if vx == 0 and vy == 0 and yaw == 0:
            print("🔍 Checking boolean flags...")
            if self.current_command.get('walk_forward', False):
                print("🤖 Moving Forward (from flag)")
                vx = 0.08
            elif self.current_command.get('walk_backward', False):
                print("🤖 Moving Backward (from flag)")
                vx = -0.08
            
            if self.current_command.get('strafe_left', False):
                print("🤖 Strafing Left (from flag)")
                vy = 0.05
            elif self.current_command.get('strafe_right', False):
                print("🤖 Strafing Right (from flag)")
                vy = -0.05
            
            if self.current_command.get('turn_left', False):
                print("🤖 Turning Left (from flag)")
                yaw = 0.25
            elif self.current_command.get('turn_right', False):
                print("🤖 Turning Right (from flag)")
                yaw = -0.25
        
        self.msg.linear.x = vx
        self.msg.linear.y = vy
        self.msg.angular.z = yaw
        
        if vx == 0 and vy == 0 and yaw == 0:
            print("🤖 Stopping (all zeros)")
        else:
            print(f"🚀 Publishing movement - X: {vx}, Y: {vy}, Z: {yaw}")
        
        print(f"📡 Publishing to topic: {self.cmd_vel_pub.name}")
        self.cmd_vel_pub.publish(self.msg)
        print("✅ Movement command published to ROS")
        print("-" * 60)

    def on_command_change(self, event):
        """Callback function when command data changes"""
        try:
            print("\n" + "="*60)
            print("🔔 FIREBASE EVENT RECEIVED!")
            print(f"⏰ Time: {time.strftime('%H:%M:%S')}")
            print(f"📦 Event data type: {type(event.data)}")
            print(f"📦 Event data: {event.data}")
            
            if event.data is None:
                print("⚠️ Event data is None - ignoring")
                return
            
            previous_command = self.current_command.copy()
            print(f"📋 Previous command: {previous_command}")
            
            if isinstance(event.data, dict):
                print("✅ Updating command from dict")
                self.current_command.update(event.data)
            elif hasattr(event, 'path') and event.path:
                field_name = event.path.strip('/')
                print(f"✅ Updating single field: {field_name} = {event.data}")
                if field_name in self.current_command:
                    self.current_command[field_name] = event.data
            else:
                print("🔍 Fetching current state from Firebase")
                current_state = self.commands_ref.get()
                print(f"📥 Fetched state: {current_state}")
                if current_state and isinstance(current_state, dict):
                    self.current_command.update(current_state)
            
            print(f"📋 New command: {self.current_command}")
            
            if previous_command != self.current_command:
                print("✅ Command changed - sending movement")
                self.send_movement_command()
            else:
                print("⚠️ Command unchanged - no movement sent")
            
            self.display_status()
            print("="*60 + "\n")
            
        except Exception as e:
            print(f"❌ Error processing command change: {e}")
            import traceback
            traceback.print_exc()

    def display_status(self):
        """Display current command state"""
        # os.system('cls' if os.name == 'nt' else 'clear') # Optional: clear screen
        print("🤖 Firebase JetHexa Controller")
        print("=" * 60)
        print(f"Robot ID: {self.robot_id}")
        print(f"Session: {self.session_code}")
        print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print()
        
        emergency = self.current_command.get('emergency_stop', False)
        e_status = "🔴 EMERGENCY STOP ACTIVE" if emergency else "✅ Normal Operation"
        print(f"Status: {e_status}")
        print()
        
        print("📊 Velocity Values:")
        print(f"    VX: {self.current_command.get('vx', 0):.2f}")
        print(f"    VY: {self.current_command.get('vy', 0):.2f}")
        print(f"    Yaw: {self.current_command.get('yaw', 0):.2f}")
        print()
        
        print("🎯 Published Movement:")
        print(f"    Linear X:  {self.msg.linear.x:.2f}")
        print(f"    Linear Y:  {self.msg.linear.y:.2f}")
        print(f"    Angular Z: {self.msg.angular.z:.2f}")
        print("\n" + "=" * 60)

    def start_listening(self):
        """Start listening for command changes"""
        print("🔄 Starting Firebase JetHexa controller...")
        print(f"🔄 Monitoring commands for robot: {self.robot_id}")
        print(f"📍 Listening on session: {self.session_code}")
        print(f"📂 Firebase path: sessions/{self.session_code}/robot_commands/latest")
        print("✅ Robot already standing - ready for teleoperation")
        
        # Check what's currently in Firebase at this path
        print("\n🔍 Checking current Firebase data...")
        try:
            current_data = self.commands_ref.get()
            print(f"📦 Current data at path: {current_data}")
            if current_data is None:
                print("⚠️ WARNING: Path exists but data is None!")
                print("   This means Unity might be writing to a different path")
                print(f"   or hasn't written to: sessions/{self.session_code}/robot_commands/latest yet")
                
                # Check the entire session structure
                print("\n🔍 Checking entire session structure...")
                session_ref = db.reference(f'sessions/{self.session_code}')
                session_data = session_ref.get()
                print(f"📦 Session data: {session_data}")
                
                if session_data:
                    print("✅ Session exists! Structure:")
                    import json
                    print(json.dumps(session_data, indent=2))
                else:
                    print("❌ Session doesn't exist yet - waiting for Unity to connect...")
        except Exception as e:
            print(f"❌ Error reading Firebase: {e}")
        
        print("\n" + "="*60)
        print("🎧 LISTENING FOR FIREBASE COMMANDS...")
        print("="*60 + "\n")
        
        self.commands_ref.listen(self.on_command_change)
        
        try:
            while not rospy.is_shutdown():
                time.sleep(0.1)
        except KeyboardInterrupt:
            print("\n\n👋 Stopping Firebase JetHexa controller...")
        
        # Send stop command
        self.msg.linear.x = 0.0
        self.msg.linear.y = 0.0
        self.msg.angular.z = 0.0
        self.cmd_vel_pub.publish(self.msg)
        
        try:
            firebase_admin.delete_app(firebase_admin.get_app())
            print("✅ Firebase connection closed")
        except:
            pass
