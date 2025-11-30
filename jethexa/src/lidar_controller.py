#!/usr/bin/env python3
# encoding: utf-8
import os
import sys
import math
import time
import rospy
import subprocess
import signal
import threading
import numpy as np
from jethexa_app import Heart
import jethexa_sdk.misc as misc
import jethexa_sdk.pid as pid
import geometry_msgs.msg as geo_msg
import sensor_msgs.msg as sensor_msg
import sensor_msgs.point_cloud2 as pc2
from jethexa_controller import client
from std_srvs.srv import Empty, Trigger, TriggerRequest, TriggerResponse
from std_srvs.srv import SetBool, SetBoolRequest, SetBoolResponse
from jethexa_controller_interfaces.srv import SetInt64, SetInt64Request, SetInt64Response
from jethexa_controller_interfaces.srv import SetFloat64List, SetFloat64ListRequest, SetFloat64ListResponse
from laser_geometry import LaserProjection
import Jetson.GPIO as GPIO

MAX_SCAN_ANGLE = 360
KEY2_GPIO_PIN = 25  # KEY2 is on GPIO 25

class LidarController:
    def __init__(self, name):
        rospy.init_node(name, anonymous=False)
        self.name = name
        self.running_mode = 0
        self.threshold = 0.5
        self.scan_angle = math.radians(80)
        self.speed = 0.08
        self.last_act = 0
        self.timestamp = 0
        self.is_turning = False
        self.pid_yaw = pid.PID(0.8, 0, 0.05)
        self.pid_dist = pid.PID(0.6, 0, 0.05)
        self.lock = threading.RLock()
        self.lidar_sub = None
        self.jethexa = client.Client(self)
        self.lidar_type = ""
        self.start_scan = self.__empty
        self.stop_scan = self.__empty
        self.laser_projection = LaserProjection()
        self.lidar_launch = None  # Store roslaunch process

        # Auto-detect or set lidar type
        if "LIDAR_TYPE" in os.environ:
            self.lidar_type = os.environ["LIDAR_TYPE"]
        else:
            rospy.loginfo("No LIDAR_TYPE set, using RPLIDAR behavior for EAI G4")
            self.lidar_type = "RPLIDAR"

        if "YDLIDAR" in self.lidar_type:
            try:
                rospy.wait_for_service("/stop_scan", timeout=5)
                rospy.wait_for_service("/start_scan", timeout=5)
                self.stop_scan = rospy.ServiceProxy("/stop_scan", Empty)
                self.start_scan = rospy.ServiceProxy("/start_scan", Empty)
                self.stop_scan()
                rospy.loginfo("YDLIDAR initialized")
            except:
                rospy.logwarn("YDLIDAR services not available")
        elif "RPLIDAR" in self.lidar_type:
            try:
                rospy.wait_for_service("/stop_motor", timeout=5)
                rospy.wait_for_service("/start_motor", timeout=5)
                self.stop_scan = rospy.ServiceProxy("/stop_motor", Empty)
                self.start_scan = rospy.ServiceProxy("/start_motor", Empty)
                self.stop_scan()
                rospy.loginfo("RPLIDAR/EAI G4 initialized")
            except:
                rospy.logwarn("RPLIDAR/EAI motor services not available, continuing anyway")
        else:
            rospy.logwarn("Unknown LIDAR type, continuing without motor control")

        self.enter_srv = rospy.Service(self.name + "/enter", Trigger, self.enter_srv_callback)
        self.exit_srv = rospy.Service(self.name + "/exit", Trigger, self.exit_srv_callback)
        self.set_running_srv = rospy.Service(self.name + "/set_running", SetInt64, self.set_running_srv_callback)
        self.set_parameters_srv = rospy.Service(self.name + "/set_parameters", SetFloat64List, self.set_parameters_srv_callback)
        self.heart = Heart(self.name + "/heartbeat", 5, lambda _: self.exit_srv_callback(None))
        
        # Setup KEY2 button on GPIO 25
        self.setup_key2_button()
        
        # Register shutdown hook for clean exit
        rospy.on_shutdown(self.shutdown_hook)
        
        # Wait for KEY2 press before starting
        rospy.loginfo("="*60)
        rospy.loginfo("READY - Press KEY2 to start obstacle avoidance")
        rospy.loginfo("="*60)
        self.wait_for_key2_to_start()

    def __empty(self):
        pass

    def setup_key2_button(self):
        """Setup KEY2 button for toggling obstacle avoidance"""
        try:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(KEY2_GPIO_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
            rospy.loginfo(f"KEY2 button configured on GPIO {KEY2_GPIO_PIN}")
        except Exception as e:
            rospy.logerr(f"Failed to setup KEY2: {e}")

    def wait_for_key2_to_start(self):
        """Wait for KEY2 press before starting the system"""
        rospy.loginfo("Waiting for KEY2 press...")
        
        # Wait for button press
        previous_state = GPIO.input(KEY2_GPIO_PIN)
        while not rospy.is_shutdown():
            current_state = GPIO.input(KEY2_GPIO_PIN)
            
            # Detect button press (HIGH to LOW transition)
            if previous_state == 1 and current_state == 0:
                rospy.loginfo("KEY2 pressed! Starting system...")
                time.sleep(0.3)  # Debounce
                break
            
            previous_state = current_state
            time.sleep(0.05)
        
        # Now start the system
        self.auto_start_system()
        
        # Start button monitoring thread for toggling
        self.key2_thread = threading.Thread(target=self.monitor_key2, daemon=True)
        self.key2_thread.start()
        rospy.loginfo("KEY2 monitoring started - Press KEY2 to toggle obstacle avoidance")

    def monitor_key2(self):
        """Monitor KEY2 button presses"""
        previous_state = GPIO.input(KEY2_GPIO_PIN)
        
        while not rospy.is_shutdown():
            try:
                current_state = GPIO.input(KEY2_GPIO_PIN)
                
                # Detect button press (HIGH to LOW transition)
                if previous_state == 1 and current_state == 0:
                    self.toggle_obstacle_avoidance()
                    time.sleep(0.3)  # Debounce delay
                
                previous_state = current_state
                time.sleep(0.05)  # Poll every 50ms
                
            except Exception as e:
                rospy.logerr(f"KEY2 monitoring error: {e}")
                break

    def toggle_obstacle_avoidance(self):
        """Toggle obstacle avoidance on/off when KEY2 is pressed"""
        with self.lock:
            if self.running_mode == 1:  # Currently ON - turn OFF
                rospy.loginfo("="*60)
                rospy.loginfo("KEY2 PRESSED - STOPPING OBSTACLE AVOIDANCE")
                rospy.loginfo("="*60)
                self.running_mode = 0
                self.jethexa.traveling(gait=0)  # Stop robot
                rospy.loginfo("Robot stopped. Press KEY2 again to resume.")
            else:  # Currently OFF - turn ON
                rospy.loginfo("="*60)
                rospy.loginfo("KEY2 PRESSED - STARTING OBSTACLE AVOIDANCE")
                rospy.loginfo("="*60)
                self.running_mode = 1
                rospy.loginfo("Obstacle avoidance active!")

    def launch_lidar_driver(self):
        """Launch the lidar driver using subprocess"""
        try:
            rospy.loginfo("Launching lidar driver...")
            
            # Launch using subprocess
            self.lidar_launch = subprocess.Popen(
                ['roslaunch', 'jethexa_peripherals', 'lidar.launch'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid  # Create new process group for clean shutdown
            )
            
            rospy.loginfo("Lidar driver launched successfully!")
            return True
        except Exception as e:
            rospy.logerr(f"Failed to launch lidar driver: {e}")
            return False

    def auto_start_system(self):
        """Automatically start lidar and obstacle avoidance mode"""
        try:
            # Always launch the lidar driver
            rospy.loginfo("Launching lidar driver...")
            if not self.launch_lidar_driver():
                rospy.logerr("Failed to start lidar driver!")
                return
            
            # Wait for lidar data
            rospy.loginfo("Waiting for lidar data...")
            try:
                rospy.wait_for_message('/scan', sensor_msg.LaserScan, timeout=10.0)
                rospy.loginfo("Lidar data detected!")
            except rospy.ROSException:
                rospy.logerr("ERROR: No lidar data after 10 seconds!")
                rospy.logerr("Please check lidar connection and LIDAR_TYPE configuration.")
                return
            
            rospy.sleep(0.5)
            
            rospy.loginfo("Entering lidar app...")
            self.enter_srv_callback(None)
            
            rospy.sleep(0.5)
            
            rospy.loginfo("Activating obstacle avoidance (Mode 1)...")
            req = SetInt64Request()
            req.data = 1
            self.set_running_srv_callback(req)
            
            rospy.loginfo("="*60)
            rospy.loginfo("OBSTACLE AVOIDANCE ACTIVE!")
            rospy.loginfo(f"Threshold: {self.threshold}m | Speed: {self.speed}m/s")
            rospy.loginfo("Robot will walk forward and turn away from obstacles")
            rospy.loginfo("Press Ctrl+C to stop")
            rospy.loginfo("="*60)
            
        except Exception as e:
            rospy.logerr(f"Failed to auto-start system: {e}")

    def shutdown_hook(self):
        """Clean shutdown - stop robot and lidar"""
        rospy.loginfo("="*60)
        rospy.loginfo("SHUTTING DOWN - Stopping robot...")
        rospy.loginfo("="*60)
        
        # Cleanup GPIO
        try:
            GPIO.cleanup()
            rospy.loginfo("GPIO cleaned up!")
        except Exception as e:
            rospy.logerr(f"Error cleaning up GPIO: {e}")
        
        # Stop the robot FIRST - most important!
        try:
            with self.lock:
                self.running_mode = 0  # Disable obstacle avoidance
            self.jethexa.traveling(gait=0)  # Stop walking
            rospy.loginfo("Robot stopped!")
            rospy.sleep(0.5)
        except Exception as e:
            rospy.logerr(f"Error stopping robot: {e}")
        
        # Stop lidar scanning
        try:
            self.stop_scan()
            rospy.loginfo("Lidar scan stopped!")
        except Exception as e:
            rospy.logerr(f"Error stopping lidar scan: {e}")
        
        # Shutdown lidar driver if we launched it
        if self.lidar_launch is not None:
            try:
                rospy.loginfo("Stopping lidar driver...")
                # Kill the entire process group
                os.killpg(os.getpgid(self.lidar_launch.pid), signal.SIGTERM)
                self.lidar_launch.wait(timeout=3)
                rospy.loginfo("Lidar driver stopped!")
            except Exception as e:
                rospy.logerr(f"Error stopping lidar driver: {e}")
        
        rospy.loginfo("Shutdown complete!")

    def reset_value(self):
        self.running_mode = 0
        self.threshold = 0.5
        self.speed = 0.08
        self.last_act = 0
        self.timestamp = 0
        self.is_turning = False
        self.scan_angle = math.radians(80)
        self.pid_yaw.clear()
        self.pid_dist.clear()
        try:
            if self.lidar_sub is not None:
                self.lidar_sub.unregister()
        except Exception as e:
            rospy.logerr(str(e))

    def enter_srv_callback(self, _):
        rospy.loginfo("lidar enter")
        self.reset_value()
        self.start_scan()
        self.lidar_sub = rospy.Subscriber('scan', sensor_msg.LaserScan, self.lidar_callback) 
        return TriggerResponse(success=True)
    
    def exit_srv_callback(self, _):
        rospy.loginfo('lidar exit')
        self.stop_scan()
        self.reset_value()
        self.jethexa.traveling(gait=0)
        return TriggerResponse(success=True)

    def set_running_srv_callback(self, req: SetInt64Request):
        rsp = SetInt64Response(success=True)
        new_running_mode = req.data
        rospy.loginfo("set_running " + str(new_running_mode))
        if not 0 <= new_running_mode <= 3:
            rsp.success = False
            rsp.message = "Invalid running mode {}".format(new_running_mode)
        else:
            with self.lock:
                self.running_mode = new_running_mode
                if self.running_mode == 0:
                    self.jethexa.traveling(gait=0)
        return rsp

    def set_parameters_srv_callback(self, req: SetFloat64ListRequest):
        rsp = SetFloat64ListResponse(success=True)
        new_parameters = req.data
        new_threshold, new_scan_angle, new_speed = new_parameters
        rospy.loginfo("n_t:{:2f}, n_a:{:2f}, n_s:{:2f}".format(new_threshold, new_scan_angle, new_speed))
        if not 0.3 <= new_threshold <= 1.5:
            rsp.success = False
            rsp.message = "New threshold ({:.2f}) is out of range (0.3 ~ 1.5)".format(new_threshold)
            return rsp
        if not new_speed > 0:
            rsp.success = False
            rsp.message = "Invalid speed"
            return rsp

        with self.lock:
            self.threshold = new_threshold
            self.speed = new_speed
        
        return rsp
    
    def move_forward(self):
        """Make robot walk forward using traveling gait"""
        self.jethexa.traveling(
            gait=1,           # RIPPER gait
            stride=40.0,      # stride 40mm
            height=15.0,      # step height 15mm
            direction=0,      # forward
            rotation=0.0,     # no rotation
            time=1,           # time per step
            steps=0,          # continuous walking
            interrupt=True,
            relative_height=False
        )

    def turn_left(self):
        """Turn left to avoid obstacle"""
        rospy.loginfo("Turning LEFT to avoid obstacle")
        self.is_turning = True
        self.jethexa.traveling(
            gait=1,
            stride=30.0,
            height=15.0,
            direction=0,
            rotation=0.6,     # positive rotation = left turn
            time=0.8,
            steps=4,          # turn for 4 steps
            interrupt=True,
            relative_height=False
        )

    def turn_right(self):
        """Turn right to avoid obstacle"""
        rospy.loginfo("Turning RIGHT to avoid obstacle")
        self.is_turning = True
        self.jethexa.traveling(
            gait=1,
            stride=30.0,
            height=15.0,
            direction=0,
            rotation=-0.6,    # negative rotation = right turn
            time=0.8,
            steps=4,          # turn for 4 steps
            interrupt=True,
            relative_height=False
        )

    def lidar_callback(self, lidar_data: sensor_msg.LaserScan):
        cloud = self.laser_projection.projectLaser(lidar_data)
        points = np.array(list(pc2.read_points(cloud, skip_nans=True)), dtype=np.float32)

        # Rotate for RPLIDAR/EAI G4
        if "RPLIDAR" in self.lidar_type:
            points = points * [-1.0, -1.0, 1.0, 1.0, 1.0] 

        with self.lock:
            # OBSTACLE AVOIDANCE MODE
            if self.running_mode == 1:
                # Check if we're still in a turning cooldown period
                if time.time() < self.timestamp:
                    return  # Skip this callback, still turning
                
                # Filter points in front of robot
                points = filter(lambda p: abs(p[1]) < 0.3, points)
                points = filter(lambda p: p[0] <= self.threshold, points)
                points = filter(lambda p: abs(math.atan2(p[1], p[0])) < self.scan_angle / 2, points)
                points = list(points)
                
                if len(points) > 0:  # OBSTACLE DETECTED
                    min_x, min_y, min_z, _, _ = min(points, key=lambda p: p[0])
                    rospy.loginfo(f"Obstacle at x={min_x:.2f}m, y={min_y:.2f}m")
                    
                    if min_y >= 0:  # Obstacle on LEFT side - turn RIGHT
                        self.turn_right()
                    else:  # Obstacle on RIGHT side - turn LEFT
                        self.turn_left()
                    
                    # Wait for turn to complete
                    self.timestamp = time.time() + 3.5
                    
                else:  # NO OBSTACLE - MOVE FORWARD
                    self.is_turning = False
                    rospy.loginfo("Path clear - moving forward")
                    self.move_forward()

            # TRACKING MODE
            elif self.running_mode == 2:
                points = list(filter(lambda p: p[0] > 0.04, points))
                points = map(lambda p: (p[0], p[1], math.sqrt(p[0] * p[0] + p[1] * p[1])), points) 
                points = filter(lambda p: p[2] > 0.25, points)
                point_x, point_y, dist = min(points, key=lambda p: p[2])
                angle = math.atan2(point_y, point_x)

                twist = geo_msg.Twist()
                if dist < self.threshold and abs(0.35 - dist) > 0.04:
                    self.pid_dist.update(0.35 - dist)
                    twist.linear.x = misc.set_range(self.pid_dist.output, -self.speed * 0.7, self.speed * 0.7)
                else:
                    self.pid_dist.clear()

                if dist < self.threshold and abs(math.degrees(angle)) > 5:
                    self.pid_yaw.update(-angle)
                    if twist.linear.x != 0:
                        twist.angular.z = misc.set_range(self.pid_yaw.output, -0.25, 0.25)
                    else:
                        twist.linear.x = misc.set_range(self.pid_dist.output, -self.speed * 6, self.speed * 6)
                else:
                    self.pid_yaw.clear()
                self.jethexa.cmd_vel_pub.publish(twist)

            # TRACKING ROTATION MODE
            elif self.running_mode == 3:
                points = map(lambda p: (p[0], p[1], math.sqrt(p[0] * p[0] + p[1] * p[1])), points)
                points = filter(lambda p: p[2] > 0.25, points)
                point_x, point_y, dist = min(points, key=lambda p: p[2])
                angle = math.atan2(point_y, point_x)

                if dist < self.threshold and abs(math.degrees(angle)) > 5:
                    self.pid_yaw.update(-angle)
                    z = misc.set_range(self.pid_yaw.output, -self.speed * 6, self.speed * 6)
                else:
                    z = 0
                    self.pid_yaw.clear()
                self.jethexa.cmd_vel(0, 0, z)


if __name__ == "__main__":
    node = LidarController('lidar_app')
    
    # Register signal handlers for clean shutdown
    def signal_handler(sig, frame):
        rospy.loginfo("\n" + "="*60)
        rospy.loginfo("Ctrl+C detected! Stopping robot...")
        rospy.loginfo("="*60)
        node.shutdown_hook()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        rospy.spin()
    except KeyboardInterrupt:
        rospy.loginfo("Keyboard interrupt detected!")
    except Exception as e:
        rospy.logerr(str(e))
    finally:
        node.shutdown_hook()
        rospy.loginfo("Exiting...")
