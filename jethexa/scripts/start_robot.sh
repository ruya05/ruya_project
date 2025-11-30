#!/bin/bash
# Source ROS environment
source /opt/ros/melodic/setup.bash
source /home/hiwonder/jethexa/devel/setup.bash

# Set LIDAR_TYPE
export LIDAR_TYPE=YDLIDAR_G4

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# Project root is one level up
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Change to project root
cd "$PROJECT_ROOT"

echo "🚀 Starting Robot System from $PROJECT_ROOT"

# Run main script
python3 src/main.py &
MAIN_PID=$!

# Run lidar controller
python3 src/lidar_controller.py &
LIDAR_PID=$!

# Wait for both processes
wait $MAIN_PID
wait $LIDAR_PID
