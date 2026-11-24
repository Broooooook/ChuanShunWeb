# 全順工時記錄（網頁版）

記錄上下班、車趟，自動計算工時、薪資與勞基法加班費（參考）。
可安裝到 iPhone、Android、Windows 11（PWA），**資料只存在使用者自己的裝置**，不會上傳任何伺服器。

## 使用
- 網址打開後「加入主畫面／安裝」，之後從圖示開啟
- 設定 → 匯出備份：每週存一份到手機外面（LINE、iCloud、雲端硬碟）
- 備份檔格式與 Android 版相同，可互相匯入

## 開發
- 純 HTML／CSS／JavaScript（ES Modules），不需建置、不依賴外部套件
- `js/core/`：計算規則（與 Android 版相同），`js/ui/`：畫面
- 測試：`node --test tests/*.test.mjs`
- 改版時請更新 `sw.js` 的 `CACHE` 版本字串
