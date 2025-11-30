import time
import threading
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import Adafruit_SSD1306

class OLEDDisplay:
    def __init__(self):
        self.screen = None
        self.font_1 = None
        self.running = False
        self.current_message = ""
        self.display_thread = None
        
    def initialize(self):
        """Initialize OLED screen"""
        try:
            self.screen = Adafruit_SSD1306.SSD1306_128_32(rst=None, i2c_bus=1, gpio=1, i2c_address=0x3C)
            self.screen.begin()
            # Note: This path is specific to the robot's filesystem
            self.font_1 = ImageFont.truetype('/home/hiwonder/jethexa/src/jethexa_tutorial/misc/wqy-MicroHei.ttf', 22)
            
            # Clear screen completely
            self.clear_screen()
            print("✅ OLED screen initialized")
            return True
        except Exception as e:
            print(f"❌ Error initializing OLED: {e}")
            return False
    
    def clear_screen(self):
        """Completely clear the OLED screen"""
        if not self.screen:
            return
        try:
            # Create completely black image
            blank = Image.fromarray(np.zeros((32, 128), np.uint8)).convert('1')
            self.screen.image(blank)
            self.screen.display()
        except Exception as e:
            print(f"❌ Error clearing OLED: {e}")
    
    def display_message(self, message):
        """Display message on OLED screen"""
        if not self.screen:
            return
        
        try:
            buf = Image.new('1', (self.screen.width, self.screen.height))
            draw = ImageDraw.Draw(buf)
            draw.rectangle((0, 0, self.screen.width, self.screen.height), outline=0, fill=0)
            draw.text((10, 5), message, font=self.font_1, fill=255)
            self.screen.image(buf)
            self.screen.display()
        except Exception as e:
            print(f"❌ Error displaying on OLED: {e}")
    
    def start_continuous_display(self, message):
        """Start displaying message continuously in background thread"""
        # First clear any previous content
        self.clear_screen()
        
        self.current_message = message
        self.running = True
        
        def display_loop():
            while self.running:
                self.display_message(self.current_message)
                time.sleep(1)
        
        self.display_thread = threading.Thread(target=display_loop, daemon=True)
        self.display_thread.start()
    
    def stop_display(self):
        """Stop continuous display"""
        self.running = False
        if self.display_thread:
            self.display_thread.join(timeout=2)
