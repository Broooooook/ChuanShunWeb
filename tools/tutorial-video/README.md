# 教學影片製作工具

用「示範假資料」錄製網頁版操作畫面，加上中文字幕，輸出直式 1080×1920 的 mp4。**不會用到任何人的真實資料。**

1. 在網頁版資料夾開本機伺服器：`python3 -m http.server 8765`
2. 準備：`npm i puppeteer-core@23`、Google Chrome、ffmpeg、Python Pillow、中文字型（文泉驛正黑 `wqy-zenhei.ttc`）
3. `node record.js`：錄畫面（輸出 frames/ 與 scenes.json；腳本裡的路徑是 /home/user/vidtool，換地方執行時請一起改）
4. `python3 compose.py`：加字幕、片頭片尾，輸出 tutorial.mp4

介面改版後，照上面重跑一次就能更新影片；畫面上的按鈕文字改了的話，要同步改 record.js 裡對應的文字。

## 配音版
5. 旁白文字在 `旁白.json`（由 scenes.json 的字幕整理；Claude 專案檔案「教學影片/」裡有一份）。在 Windows 上用內建台灣中文語音「Microsoft Hanhan」（PowerShell System.Speech）把每段唸成 `<id>.wav`。（edge-tts 自然語音被使用者電腦的安全設定擋住，要用的話需先取得使用者同意安裝。）
6. `python3 narrated.py <wav 資料夾>`：依每段配音長度調整畫面秒數，加上 `music.py` 自己合成的原創背景音樂（無版權問題），輸出 tutorial_voice.mp4。
