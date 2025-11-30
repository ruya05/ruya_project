# JetHexa Robot Controller

This side of project controls the JetHexa robot, integrating ROS, Firebase, and a web interface on the robot.

## Project Structure

- `src/`: Source code
  - `main.py`: Main entry point for the robot controller.
  - `lidar_controller.py`: Lidar and obstacle avoidance logic.
  - `utils/`: Utility modules (OLED, Network, Web Server, Firebase).
  - `config.py`: Configuration constants.
- `config/`: Configuration files (Firebase credentials).
- `templates/`: HTML templates for the web interface.
- `scripts/`: Helper scripts (e.g., startup script).
- `requirements.txt`: Python dependencies.

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Ensure ROS environment is set up (Melodic).

3. Place your Firebase service account JSON in `config/`.

## Running

To start the robot system:

```bash
./scripts/start_robot.sh
```

Or run manually:

```bash
python3 src/main.py
```

## Features

- **OLED Display**: Shows status, IP, and pairing code.
- **Web Interface**: `agora_v1.html` served on port 8000.
- **Firebase Control**: Remote teleoperation via Firebase Realtime Database.
- **Lidar Obstacle Avoidance**: Autonomous obstacle avoidance using YDLIDAR/RPLIDAR.
