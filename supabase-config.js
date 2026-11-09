// ============================================================
// Supabase 雲端同步設定（與 firebase-config.js 擇一使用；兩者都填時以 Firebase 優先）
// ------------------------------------------------------------
// ・維持 null：不使用 Supabase。
// ・填入設定：Supabase 主控台 → Project Settings → API（或 Data API）取得
//   Project URL 與 anon / publishable key（這是公開金鑰，可放在網頁中）。
// ・資料表與權限請先執行 supabase-setup.sql。
// ============================================================

window.SUPABASE_CONFIG = null;

// 範例：
// window.SUPABASE_CONFIG = {
//   url: "https://xxxxxxxxxxxx.supabase.co",
//   anonKey: "eyJhbGciOi...（或 sb_publishable_...）"
// };
