# 拔河賽自動賽程表（GitHub Pages 網頁版・Firebase）

> 另有使用 Supabase 同步的對照版本：[lzfschool/autosche_supa](https://github.com/lzfschool/autosche_supa)，兩者 `index.html` 相同，只差在設定檔。

純前端網頁版，**不需要電腦開著跑伺服器**，直接放在 GitHub Pages 就能使用。
支援手機、平板、大螢幕；設定 Firebase 後可多裝置即時同步。

## 功能

- 多組別賽程（高一、高二、高三、自訂），隨機抽籤、點選勝隊自動晉級、季殿軍賽、頒獎台
- **觀眾唯讀網址**（`?view=1`）：只能看，不會誤觸修改比分
- **裁判／管理者網址**：可點選勝隊、修改名單
- 真正可掃描的 QR Code，方便手機開啟
- 匯出／匯入 JSON 備份
- 兩種同步模式：
  | 模式 | 條件 | 同步範圍 |
  |---|---|---|
  | 💾 單機模式 | `firebase-config.js` 維持 `null`（預設） | 同一台電腦、同一瀏覽器的多個分頁（例：一個分頁操作，一個分頁投影） |
  | 🟢 雲端同步 | 填入 Firebase 設定 | 所有開啟網址的裝置即時同步 |

## 檔案說明

- `index.html`：主程式（全部前端邏輯）
- `firebase-config.js`：雲端同步設定（可留空）
- `supabase-config.js`：Supabase 設定，本版保持 `null`
- `tournament_data.json`：初始賽程資料。瀏覽器第一次開啟、而且還沒有本機資料時會讀取它
- `legacy-本機伺服器版/`：舊的 Python 伺服器與 Cloudflare 穿透版本，已不再使用，只留作參考

## 部署到 GitHub Pages

1. 在 GitHub 建立一個新的 repository（例如 `tug-of-war`），把本資料夾的檔案上傳或 push 上去。
2. 進入 repository → **Settings → Pages**。
3. Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/ (root)`，按 Save。
4. 約 1 分鐘後即可開啟：`https://<你的帳號>.github.io/<repository 名稱>/`

## 開啟多裝置雲端同步（Firebase，免費）

1. 到 <https://console.firebase.google.com> 建立專案（不需啟用 Google Analytics）。
2. 左側 **建構 → Realtime Database → 建立資料庫**，位置可選 `asia-southeast1`（新加坡），安全規則先選「鎖定模式」。
3. 到 **規則** 分頁，貼上以下內容後按「發布」：
   ```json
   {
     "rules": {
       "tugofwar": {
         ".read": true,
         ".write": true
       }
     }
   }
   ```
4. 回到 **專案設定（齒輪）→ 一般 → 你的應用程式**，新增一個「網頁應用程式 `</>`」，複製 `firebaseConfig` 那段設定。
5. 打開 `firebase-config.js`，把 `window.FIREBASE_CONFIG = null;` 改成貼上的設定（要確認有 `databaseURL` 這一行），存檔後再 push 到 GitHub。
6. 重新整理網頁，左上角顯示「🟢 雲端同步中」就成功了。

> ⚠️ 安全提醒：上面的規則允許任何知道網址的人寫入。觀眾請一律分享「👀 觀眾唯讀網址」，裁判網址只給工作人員。
> 每次比賽可以在網址後面加上 `?room=2026校慶` 這類房間名稱，資料就會和其他場次分開。

## 本機測試

直接雙擊 `index.html` 也能用單機模式。若要和 GitHub Pages 環境一樣（例如會讀取 `tournament_data.json`），可在資料夾內執行：

```bash
python -m http.server 8000
```

再開啟 <http://localhost:8000>。
