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

## 動畫版（目前主要版本：真實操作、手指游標、無字幕、自然語音）
7. 配音檔在 `tutorial-audio` 分支的 `tools/tutorial-video/voice/`（edge-tts，聲音 zh-TW-HsiaoYuNeural，`--rate=+12% --pitch=+6Hz`）。
8. 算出每段配音長度寫成 `durations.json`（{id: 秒數}），`node record2.js durations.json` 錄真實操作（畫面 1080×1920，用 CSS zoom 放大，所以對話框的 vh 有另外修正）。
9. `python3 anim_compose.py <配音資料夾> <輸出.mp4>`：接上片頭／iPhone／片尾卡片（slides/ 由 compose.py 產生），依時間軸放配音，加 music.py 原創背景音樂。
