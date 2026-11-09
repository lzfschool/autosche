// ============================================================
// 雲端多人即時同步設定（Firebase Realtime Database，免費方案即可）
// ------------------------------------------------------------
// ・維持 null：單機模式。資料存在各自的瀏覽器，同一台電腦的多個分頁會同步，
//   但手機、平板之間不會同步。
// ・填入設定：所有開啟同一網址的裝置即時同步（設定步驟見 README.md）。
// ============================================================

// Firebase 專案：autosche（網頁應用程式 autosche-web）
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCX1-oi6A2O7h0tqT3qzGh69nxxKaAEd-U",
  authDomain: "autosche.firebaseapp.com",
  databaseURL: "https://autosche-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "autosche",
  storageBucket: "autosche.firebasestorage.app",
  messagingSenderId: "646016652900",
  appId: "1:646016652900:web:7f86e7a28cba07cff23171",
  measurementId: "G-M3B3YSGBSZ"
};

// 資料房間名稱：每次比賽可換一個名字，就會得到一份全新的賽程。
// 也可以直接在網址加上 ?room=名稱 臨時切換。
window.SYNC_ROOM = "default";
