// ==================== GLOBAL VARIABLES ====================
let currentUser = null; // Stores authenticated user object
let gasData = {}; // Real-time gas sensor readings from Firebase
let charts = {}; // Chart.js instances for visualizations
let alertsData = []; // Array of triggered alerts
let alertsInitialized = {}; // Tracks which gas sensors have been initialized for alerts
let emailAlertsEnabled = false; // Email notification toggle state
let alertEmail = ''; // Email address for alert notifications

// Alert queue system - manages multiple simultaneous alerts
let alertQueue = []; // Queue of pending alerts to display
let isAlertModalVisible = false; // Prevents overlapping modals

// Per-user alert dismissals (persisted in Firebase)
