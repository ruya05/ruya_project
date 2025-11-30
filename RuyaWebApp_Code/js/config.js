// ==================== FIREBASE CONFIGURATION ====================
// TODO: Replace with your Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyCujt11VscvrYUVM0ss3cU405vkYpAlaCQ",
    authDomain: "ruya-11c11.firebaseapp.com",
    databaseURL: "https://ruya-11c11-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ruya-11c11",
    // Use the default Storage bucket domain (.appspot.com)
    storageBucket: "ruya-11c11.appspot.com",
    messagingSenderId: "323310829346",
    appId: "1:323310829346:web:e519e9380214e1be5faf7b",
    measurementId: "G-HTDP98354H"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
