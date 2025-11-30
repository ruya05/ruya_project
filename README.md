Ru’ya Gas-Sensing Robotic System

Real-time monitoring and control system for the Ru’ya gas-sensing robotic platform.
This repository contains the Web Application for live dashboard monitoring and the ESP32 Arduino code for gas sensor data acquisition and WiFi transmission.

Table of Contents

Overview

Key Features

System Architecture

Technical Stack

Setup Instructions

Project Structure

Usage Guide

Configuration Parameters

Security Considerations

Troubleshooting

Documentation & References

License

Overview

The Ru’ya WebApp and ESP32 Arduino code provide real-time environmental monitoring and visualization for industrial inspection and gas leak detection.

ESP32: Reads multiple MQ-series gas sensors (LPG, Propane, Butane, Methane), converts analog readings into PPM, and pushes them to Firebase using C++ code in Arduino IDE.

WebApp: Displays live sensor data, visual alerts, and historical trends using an interactive dashboard.

Use Cases:

Pipeline inspection and industrial safety monitoring

Remote site surveillance for hazardous environments

Emergency response and gas leak alerting

Key Features
Web Application

Real-time sensor data dashboard

Threshold-based color-coded alerts (Green = Safe, Yellow = Caution, Red = Danger)

Multiple pages: index.html, setting.html, profile.html

Historical trend charts for gas sensor readings

Firebase Realtime Database integration for live updates

Responsive design for desktop and mobile

ESP32 Arduino Code

Supports multiple MQ-series gas sensors (LPG, Propane, Butane, Methane)

Analog-to-PPM conversion implemented in C++

WiFi connectivity to send readings to Firebase

Includes calibration sketch (calibration_sketch.ino)

Handles network interruptions and reconnects automatically

System Architecture
[ESP32 with Gas Sensors] --> WiFi --> [Firebase Realtime Database] --> [WebApp Dashboard]


Data Flow:

ESP32 reads sensor data every 2 seconds

Converts analog readings to PPM in C++ code

Sends JSON-formatted data to Firebase

WebApp fetches live updates and visualizes readings

Technical Stack

Web Application:

HTML, CSS, JavaScript

Tailwind CSS / Bootstrap for responsive UI

Leaflet.js and leaflet.css for map integration (if applicable)

Chart.js for data visualization

Firebase Realtime Database

ESP32 Arduino Code (C++):

Arduino IDE / PlatformIO

Libraries: WiFi, FirebaseESP32, MQ Sensor libraries

C++ for sensor reading, WiFi connectivity, and data push logic

Setup Instructions
Prerequisites

Arduino IDE or PlatformIO

ESP32 board package installed

Firebase project with Realtime Database

Node.js / npm (optional for WebApp development)

ESP32 Setup

Open arduinoide_sketch.ino in Arduino IDE

Configure WiFi credentials:

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";


Configure Firebase credentials in C++:

#define FIREBASE_HOST "your-project-id.firebaseio.com"
#define FIREBASE_AUTH "your-database-secret"


Upload the sketch to ESP32

Optional: Run calibration_sketch.ino for sensor calibration

WebApp Setup

Open the WebApp/ folder in your editor

Configure Firebase in config.js:

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  databaseURL: "https://your-project-id.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};


Open index.html in a browser or deploy via Firebase Hosting

Project Structure
Ruya_WebandESP_Code/
├── ESP32_Code/
│   ├── arduinoide_sketch.ino       # Main sensor reading and Firebase push code
│   └── calibration_sketch.ino      # Sensor calibration code
├── WebApp/
│   ├── index.html                  # Main dashboard page
│   ├── setting.html                # Settings page
│   ├── profile.html                # Profile page
│   ├── style.css                   # Dashboard styling
│   ├── leaflet.css                 # Map styling for sensors
│   ├── app.js                      # Main JS for Firebase fetching & charting
│   └── config.js                   # Firebase configuration
└── README.md                       # Project overview and instructions

Usage Guide

Power ESP32 with sensors connected

Ensure ESP32 connects to WiFi and Firebase

Open WebApp in a browser

Live sensor readings and visual alerts appear automatically

Use calibration_sketch.ino for sensor calibration if needed

Dashboard Features:

Color-coded alerts for gas thresholds

Historical line charts with automatic refresh every 2 seconds

Multiple pages (index.html, setting.html, profile.html)

Supports multiple sensors simultaneously

Configuration Parameters
Parameter	Default	Description
sensorReadInterval	2000ms	Interval between sensor readings
gasThresholds	See code	Thresholds for each gas sensor (PPM)
wifiReconnectInterval	5000ms	Time before attempting WiFi reconnect
firebaseWriteInterval	2000ms	Frequency of sending data to Firebase
Security Considerations

Firebase rules restrict unauthorized writes

ESP32 connects via WPA2-secured WiFi

Only authorized WebApp clients can read live data

API keys and credentials must not be exposed publicly

Troubleshooting

ESP32 Issues:

Verify WiFi credentials

Monitor serial output for errors

Confirm Firebase database URL is correct

WebApp Issues:

No live data → Check Firebase config and database rules

Charts not updating → Refresh browser, check console

Sensor Calibration:

Use calibration_sketch.ino

Ensure MQ sensors have correct load resistor and warm-up time
