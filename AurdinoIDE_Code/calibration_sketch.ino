/******************************************************
 * MQ-6 Calibration Code for ESP32
 * --------------------------------
 * Measures Rs in clean air to calculate R0 (baseline resistance)
 * which is used for gas concentration calculations.
 ******************************************************/

#define MQ6_PIN 34   // Analog pin where MQ-6 is connected
const int RL_VALUE = 20; // Load resistor value in kilo-ohms (20KΩ typical)

void setup() {
  Serial.begin(115200);  // Start serial communication
  delay(2000);
  Serial.println("=== MQ-6 Calibration Started ===");
  Serial.println("Keep the sensor in CLEAN AIR (no LPG/Propane nearby)");
  Serial.println("Heating up for 20 seconds...");
  delay(20000); // Preheat the sensor for stable readings
}

void loop() {
  const int samples = 50;  // Number of readings to average
  float rsSum = 0.0;       // Sum of Rs values

  Serial.println("Reading sensor values...");

  // Take multiple analog readings to average Rs
  for (int i = 0; i < samples; i++) {
    int adcValue = analogRead(MQ6_PIN);                  // Read raw ADC value
    float sensorVoltage = (adcValue / 4095.0) * 3.3;    // Convert ADC to voltage
    float rs = (3.3 - sensorVoltage) * RL_VALUE / sensorVoltage; // Calculate Rs
    rsSum += rs;

    delay(200); // Short delay between samples
  }

  float rsAverage = rsSum / samples;    // Average Rs over all samples

  // Datasheet: Rs/R0 ≈ 10 in clean air → calculate R0
  float Ro = rsAverage / 10.0;

  // Print calibration results
  Serial.println("------------------------------------");
  Serial.print("Average Rs: ");
  Serial.print(rsAverage, 2);
  Serial.println(" kΩ");

  Serial.print("Calculated Ro (in clean air): ");
  Serial.print(Ro, 2);
  Serial.println(" kΩ");

  Serial.println("------------------------------------");
  Serial.println("Use this Ro value in your main code.");
  Serial.println("Example: float R0 = " + String(Ro, 2) + ";");

  while(true) delay(1000); // Stop here after calibration (one-time run)
}

