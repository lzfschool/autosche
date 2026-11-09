// ============================================================
// 雲端多人即時同步設定（Firebase Realtime Database，免費方案即可）
// ------------------------------------------------------------
// ・維持 null：單機模式。資料存在各自的瀏覽器，同一台電腦的多個分頁會同步，
//   但手機、平板之間不會同步。
// ・填入設定：所有開啟同一網址的裝置即時同步（設定步驟見 README.md）。
// ============================================================

window.FIREBASE_CONFIG = null;

// 範例（把 Firebase 主控台「專案設定 → 你的應用程式 → SDK 設定」那段貼過來）：
// window.FIREBASE_CONFIG = {
//   apiKey: "AIza....",
//   authDomain: "your-project.firebaseapp.com",
//   databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
//   projectId: "your-project",
//   appId: "1:1234567890:web:abcdef"
// };

// 資料房間名稱：每次比賽可換一個名字，就會得到一份全新的賽程。
// 也可以直接在網址加上 ?room=名稱 臨時切換。
window.SYNC_ROOM = "default";
