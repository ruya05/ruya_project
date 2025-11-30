#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>
#include <math.h>
#include "time.h"

// ==================== Firebase Add-ons ====================
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ==================== WiFi Settings ====================
const char* ssid = "Nabiha";
const char* password = "24240600";

// ==================== Firebase Settings ====================
#define FIREBASE_HOST "https://ruya-11c11-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_EMAIL "ruya.robot1@gmail.com"
#define FIREBASE_PASSWORD "RuyaPass123."
#define FIREBASE_API_KEY "AIzaSyCujt11VscvrYUVM0ss3cU405vkYpAlaCQ"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ==================== Sensor Settings ====================
const int mq6Pin = 34;
const float RL = 10.0;
const float R0 = 6.78;

// ==================== GPS (Neo-6M) ====================
TinyGPSPlus gps;
HardwareSerial gpsSerial(1);
const int GPS_RX = 16; // GPS TX → ESP32 RX
const int GPS_TX = 17; // GPS RX → ESP32 TX

float lastLat = 0.0;
float lastLng = 0.0;
String lastFixTime = "";
String lastStatus = "No GPS signal available";
bool hasFix = false;

// ==================== NTP Settings ====================
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 14400; // UTC+4 for UAE
const int daylightOffset_sec = 0;

// ==================== Gas Info Structure ====================
struct GasInfo {
  String gas_name;
  float threshold;
  int update_interval_sec;
  unsigned long lastUpdate;
  float a;
  float b;
  bool alertActive;
  int aboveCount;
};

// ✅ LPG, Propane, Butane, Methane
GasInfo gases[] = {
  {"LPG", 100, 5, 0, 1000, -2.3, false, 0},
  {"PROPANE", 100, 5, 0, 1200, -2.25, false, 0},
  {"BUTANE", 100, 5, 0, 1100, -2.2, false, 0},
  {"METHANE", 100, 5, 0, 900, -2.4, false, 0}
};
const int numGases = sizeof(gases) / sizeof(gases[0]);

// ==================== Helper Functions ====================
float getRs(int analogValue) {
  float Vrl = analogValue * 3.3 / 4095.0;
  return ((3.3 - Vrl) / Vrl) * RL;
}

float getPPM(float Rs, GasInfo gas) {
  return gas.a * pow(Rs / R0, gas.b);
}

String getTimestamp() {
  time_t now;
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "0000-00-00T00:00:00+04:00";
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S+04:00", &timeinfo);
  return String(buffer);
}

// ==================== Load Last Known Location from Firebase ====================
void loadLastKnownLocation() {
  Serial.println("🔄 Checking Firebase for last known location...");
  String path = "/robots/spider-01/gasses/gas-1/latest_reading/location";

  if (Firebase.RTDB.getJSON(&fbdo, path)) {
    FirebaseJson &json = fbdo.jsonObject();
    FirebaseJsonData latData, lngData, tsData, stData;

    json.get(latData, "lat");
    json.get(lngData, "lng");
    json.get(tsData, "timestamp");
    json.get(stData, "status");

    if (latData.success && lngData.success) {
      lastLat = latData.to<float>();
      lastLng = lngData.to<float>();
      lastFixTime = tsData.success ? tsData.to<String>() : getTimestamp();
      lastStatus = "Last known location";
      hasFix = true;

      Serial.println("✅ Loaded last location from Firebase:");
      Serial.println("   Lat: " + String(lastLat, 6));
      Serial.println("   Lng: " + String(lastLng, 6));
      Serial.println("   Status: " + lastStatus);
    } else {
      Serial.println("⚠️ No existing location found in Firebase.");
    }
  } else {
    Serial.println("⚠️ Failed to read location: " + fbdo.errorReason());
  }
}

// ==================== GPS Helper ====================
FirebaseJson getGPSLocation() {
  FirebaseJson gpsJson;

  if (gps.location.isValid() && gps.location.isUpdated()) {
    hasFix = true;
    lastLat = gps.location.lat();
    lastLng = gps.location.lng();
    lastFixTime = getTimestamp();
    lastStatus = "Live";

    gpsJson.set("lat", lastLat);
    gpsJson.set("lng", lastLng);
    gpsJson.set("timestamp", lastFixTime);
    gpsJson.set("status", "Live");
    gpsJson.set("map_url", "https://www.google.com/maps?q=" + String(lastLat, 6) + "," + String(lastLng, 6));
  } 
  else if (hasFix) {
    gpsJson.set("lat", lastLat);
    gpsJson.set("lng", lastLng);
    gpsJson.set("timestamp", lastFixTime);
    gpsJson.set("status", "Last known location");
    gpsJson.set("map_url", "https://www.google.com/maps?q=" + String(lastLat, 6) + "," + String(lastLng, 6));
  } 
  else {
    gpsJson.set("status", "No GPS signal available");
  }

  return gpsJson;
}

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  pinMode(mq6Pin, INPUT);

  // Wi-Fi
  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\n✅ WiFi connected: " + WiFi.localIP().toString());

  // Time Sync
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  Serial.println("Syncing time...");
  while (time(nullptr) < 100000) { delay(500); Serial.print("."); }
  Serial.println("\n✅ Time synced: " + getTimestamp());

  // Firebase
  config.api_key = FIREBASE_API_KEY;
  config.database_url = FIREBASE_HOST;
  auth.user.email = FIREBASE_EMAIL;
  auth.user.password = FIREBASE_PASSWORD;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  if (Firebase.ready()) Serial.println("✅ Firebase ready!");

  // GPS
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  Serial.println("GPS module initialized");

  // Load last known location
  loadLastKnownLocation();

  // Initialize/Load Firebase gas config (⚠️ now reads first; only writes defaults if missing)
  for (int i = 0; i < numGases; i++) {
    String gasNode = "/robots/spider-01/gasses/gas-" + String(i + 1);
    String configPath = gasNode + "/config";

    if (Firebase.RTDB.getJSON(&fbdo, configPath.c_str())) {
      FirebaseJson &cfg = fbdo.jsonObject();
      FirebaseJsonData th, upd;
      if (cfg.get(th, "threshold") && th.success) {
        gases[i].threshold = th.to<float>();
      }
      if (cfg.get(upd, "update_interval_sec") && upd.success) {
        gases[i].update_interval_sec = upd.to<int>();
      }
      // Always ensure gas_name present in DB (do not overwrite other fields)
      FirebaseJson ensureName;
      ensureName.set("gas_name", gases[i].gas_name);
      Firebase.RTDB.updateNode(&fbdo, configPath.c_str(), &ensureName);
    } else {
      // If config missing, create it with current defaults (one-time)
      FirebaseJson jsonConfig;
      jsonConfig.set("gas_name", gases[i].gas_name);
      jsonConfig.set("threshold", gases[i].threshold);
      jsonConfig.set("update_interval_sec", gases[i].update_interval_sec);
      Firebase.RTDB.setJSON(&fbdo, configPath.c_str(), &jsonConfig);
    }
  }
}

// ==================== Loop ====================
void loop() {
  // Continuous GPS parsing
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Diagnostic every 5s
  static unsigned long lastDebug = 0;
  if (millis() - lastDebug > 5000) {
    lastDebug = millis();
    Serial.println("========== GPS DEBUG ==========");
    Serial.print("Chars processed: "); Serial.println(gps.charsProcessed());
    Serial.print("Sentences with fix: "); Serial.println(gps.sentencesWithFix());
    Serial.print("Satellites: "); Serial.println(gps.satellites.value());
    Serial.print("HDOP: "); Serial.println(gps.hdop.hdop());

    if (gps.location.isValid()) {
      Serial.print("Lat: "); Serial.println(gps.location.lat(), 6);
      Serial.print("Lng: "); Serial.println(gps.location.lng(), 6);
    } else if (hasFix) {
      Serial.println("Using last known location:");
      Serial.print("Lat: "); Serial.println(lastLat, 6);
      Serial.print("Lng: "); Serial.println(lastLng, 6);
    } else {
      Serial.println("❌ No valid GPS fix yet...");
    }
    Serial.println("==============================");
  }

  // Wi-Fi reconnection
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(ssid, password);
    delay(2000);
  }

  unsigned long now = millis();
  int analogValue = analogRead(mq6Pin);
  float Rs = getRs(analogValue);

  for (int i = 0; i < numGases; i++) {
    GasInfo &gas = gases[i];

    if (now - gas.lastUpdate >= (unsigned long)gas.update_interval_sec * 1000) {
      // 🔁 Re-read threshold & interval from DB so edits apply live
      String gasNode = "/robots/spider-01/gasses/gas-" + String(i + 1);
      String configPath = gasNode + "/config";
      if (Firebase.RTDB.getJSON(&fbdo, configPath.c_str())) {
        FirebaseJson &cfg = fbdo.jsonObject();
        FirebaseJsonData th, upd;
        if (cfg.get(th, "threshold") && th.success) {
          gas.threshold = th.to<float>();
        }
        if (cfg.get(upd, "update_interval_sec") && upd.success) {
          gas.update_interval_sec = upd.to<int>();
        }
      }

      float ppm = getPPM(Rs, gas);

      // ✅ Round gas concentration to 2 decimal places
      ppm = round(ppm * 100.0) / 100.0;

      String timestamp = getTimestamp();
      FirebaseJson gpsData = getGPSLocation();

      // Latest reading
      FirebaseJson jsonLatest;
      jsonLatest.set("timestamp", timestamp);
      jsonLatest.set("value_ppm", ppm);
      jsonLatest.set("location", gpsData);
      Firebase.RTDB.setJSON(&fbdo, gasNode + "/latest_reading", &jsonLatest);

      // Historical reading
      FirebaseJson jsonHist;
      jsonHist.set("timestamp", timestamp);
      jsonHist.set("value_ppm", ppm);
      jsonHist.set("location", gpsData);
      Firebase.RTDB.pushJSON(&fbdo, gasNode + "/historical_readings", &jsonHist);

      // Alert logic
      if (ppm > gas.threshold) {
        gas.aboveCount++;
        if (!gas.alertActive && gas.aboveCount >= 2) {
          FirebaseJson jsonAlert;
          jsonAlert.set("gas_name", gas.gas_name);
          jsonAlert.set("timestamp", timestamp);
          jsonAlert.set("value_ppm", ppm);
          jsonAlert.set("threshold", gas.threshold);
          jsonAlert.set("alert_type", "HIGH_CONCENTRATION");
          jsonAlert.set("status", "active");
          jsonAlert.set("location", gpsData);

          if (Firebase.RTDB.pushJSON(&fbdo, gasNode + "/alerts", &jsonAlert)) {
            Serial.println("⚠️ ALERT TRIGGERED: " + gas.gas_name + " = " + String(ppm, 2) + " ppm");
            gas.alertActive = true;
          }
        }
      } else {
        gas.aboveCount = 0;
        if (gas.alertActive) {
          gas.alertActive = false;
          Serial.println("✅ ALERT RESET: " + gas.gas_name + " back to normal.");
        }
      }

      gas.lastUpdate = now;
      Serial.println("Updated " + gas.gas_name + " PPM: " + String(ppm, 2) + " (threshold " + String(gas.threshold, 2) + ")");
    }
  }

  delay(200);
}



