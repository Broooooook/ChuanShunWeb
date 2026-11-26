# 全順工時記錄（網頁版）：接手說明（給任何 AI 助手／開發者）

> 這是公開儲存庫，**這裡不放任何個人資訊**。完整的接手說明在擁有者的私人 Android 儲存庫 `AGENTS.md`，有權限的話請先讀那份。
> 擁有者不懂程式：**一律用繁體中文、白話說明**，能直接做的就直接做。

## 這是什麼
化學品槽車司機用的工時／車趟／薪資記錄 PWA，介面與操作比照同一位作者的 Android 版（私人儲存庫）。
- 網址：https://broooooook.github.io/ChuanShunWeb/（GitHub Pages，push 到 main 約 1 分鐘後上線）
- 純 HTML/CSS/JS（ES Modules），**沒有外部套件、沒有建置步驟**
- 資料只存在使用者自己的瀏覽器（IndexedDB，localStorage 另存一份），沒有伺服器
- 備份 JSON 格式和 Android 版相同，可互相匯入（日期＝epochDay、時間＝secondOfDay）

## 一定要遵守
1. **個人資料（薪資、打卡紀錄、同事名字）絕對不能放進這個儲存庫。** 唯一例外是 `js/defaults.js` 的公司共用「目的地＋酸別」清單（擁有者同意公開）。
2. **介面和操作要跟 Android 版一樣**；網頁版額外的功能可以保留在原位。計算規則（`js/core/`）要和 Android 版逐條對應，改一邊就要改另一邊。
3. 每趟獎金預設 400、夜點 300。2X＝一般加班（車趟×2，勞基法當休息日），3X＝特別加班（車趟×3，當國定假日），互斥、3X 優先。
4. 勞基法加班費試算**只供參考，不計入薪資**。
5. 簽章檔、金鑰之類的東西不可以放進程式碼儲存庫。

## 檔案
- `js/core/`：計算規則。`shift.js`（跨日／晚班：19:59 之後上班且跨夜，卡片歸到下班那天；`interval()` 算實際起訖）、`trips.js`、`billing.js`（計酬區間）、`labor.js`（勞基法：46 小時月上限、12 小時日上限、第 34 條兩班間隔 11 小時）、`validation.js`、`salary.js`、`actions.js`、`backup.js`、`statement.js`、`zip.js`
- `js/ui/`：畫面（`home.js`、`history.js`、`stats.js`、`settings.js`、`tripDialog.js`、`dom.js`、`files.js`）
- `js/store.js`：儲存；`sw.js`：離線快取（有網路一律抓新版）

## 改版流程
1. 改程式（記得 Android 版也要對應修改）。
2. `sw.js` 的 `CACHE` 版本字串、`js/app.js` 的 `APP_VERSION` 都要改。
3. `node --test tests/*.test.mjs` 全部通過。
4. commit、push 到 main，約 1 分鐘後確認網站已更新。
5. **更新這份文件和私人儲存庫的 AGENTS.md**（版本、改了什麼、待辦）。

## 目前版本
- 1.2.2（2026-11-26）：下班打卡後，「開始下一班」大按鈕改成一半寬、靠左、紅色的「本日再打卡」；沒按的話 23:30 起回到新一天（`js/core/actions.js` 的 `DAY_RESET_SECOND`）。Android 1.9.1 同步。
- 1.2.1（2026-11-26）：設定頁顯示的版本號改成自動跟 `APP_VERSION` 一致（原本寫死 1.1.0）。
- 1.2.0（2026-11-26）：勞基法試算加上「兩班間隔不到 11 小時（第 34 條）」提醒。
- 1.1.1：移除沒有作用的「下班打卡後重置」設定。

## 不做的事（擁有者決定）
桌面小工具、定時通知、伺服器、Google 雲端同步。
