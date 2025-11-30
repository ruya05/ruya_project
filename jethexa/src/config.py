import os

LAMBDA_ENDPOINT = "YOUR_LAMBDA_ENDPOINT"
ROBOT_ID = "jethexa_001"

# Base directory is the parent of the 'src' directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Path to the service account key in the config directory
SERVICE_ACCOUNT_PATH = os.path.join(BASE_DIR, "config", "service_account.json")

DATABASE_URL = "YOUR_DATABASE_URL"
HTML_FILENAME = "agora_v1.html"
WEB_SERVER_PORT = 8000
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")
