import json, os, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
OUT = '/home/user/vidtool/slides'
os.makedirs(OUT, exist_ok=True)
BG = (245, 240, 252)
PURPLE = (103, 80, 164)


def font(sz):
    return ImageFont.truetype(FONT, sz)


def wrap(draw, text, f, maxw):
    lines = []
    for para in text.split('\n'):
        cur = ''
        for ch in para:
            if draw.textlength(cur + ch, font=f) > maxw:
                lines.append(cur); cur = ch
            else:
                cur += ch
        lines.append(cur)
    return lines


def caption_box(img, text, step):
    d = ImageDraw.Draw(img)
    top = 1500
    d.rounded_rectangle((40, top, W - 40, H - 40), radius=36, fill=(255, 255, 255), outline=PURPLE, width=4)
    f = font(48)
    lines = wrap(d, text.replace('\n', ''), f, W - 160)
    lh = 72
    y = top + (H - 40 - top - lh * len(lines)) // 2
    for ln in lines:
        d.text((80, y), ln, font=f, fill=(30, 30, 40))
        y += lh
    if step:
        d.text((W - 200, top - 60), step, font=font(34), fill=PURPLE)


def phone(img, path):
    shot = Image.open(path).convert('RGB')
    h = 1400
    w = int(shot.width * h / shot.height)
    shot = shot.resize((w, h), Image.LANCZOS)
    x = (W - w) // 2; y = 50
    # 陰影與外框
    sh = Image.new('RGBA', (w + 60, h + 60), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((30, 30, w + 30, h + 30), radius=40, fill=(0, 0, 0, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(14))
    img.paste(sh, (x - 30, y - 22), sh)
    frame = Image.new('RGB', (w + 24, h + 24), (35, 35, 40))
    m = Image.new('L', frame.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, *frame.size), radius=44, fill=255)
    img.paste(frame, (x - 12, y - 12), m)
    m2 = Image.new('L', (w, h), 0); ImageDraw.Draw(m2).rounded_rectangle((0, 0, w, h), radius=34, fill=255)
    img.paste(shot, (x, y), m2)


def title_card(name, title, lines, secs):
    img = Image.new('RGB', (W, H), PURPLE)
    d = ImageDraw.Draw(img)
    y = 520
    for ln in wrap(d, title, font(92), W - 160):
        tw = d.textlength(ln, font=font(92)); d.text(((W - tw) / 2, y), ln, font=font(92), fill='white'); y += 130
    y += 60
    for ln in lines:
        for sub in wrap(d, ln, font(52), W - 180):
            tw = d.textlength(sub, font=font(52)); d.text(((W - tw) / 2, y), sub, font=font(52), fill=(235, 228, 250)); y += 84
    p = f'{OUT}/{name}.png'; img.save(p)
    return {'file': p, 'secs': secs}


scenes = json.load(open('/home/user/vidtool/scenes.json'))
chapters = {'上班': '1 上班', '車趟': '2 車趟', '下班': '3 下班', '記錄': '4 記錄', '統計': '5 薪資', '備份': '6 備份'}
slides = [title_card('intro', '全順工時記錄\n網頁版教學', ['iPhone、Android、電腦都能用', '資料只存在你自己的手機', '（影片使用示範資料）'], 5)]
step = '開始'
for i, s in enumerate(scenes):
    for k, v in chapters.items():
        if s['caption'].startswith('【' + k):
            step = v
    img = Image.new('RGB', (W, H), BG)
    phone(img, s['file'])
    caption_box(img, s['caption'], step)
    p = f'{OUT}/{i:02d}.png'; img.save(p)
    slides.append({'file': p, 'secs': s['secs'] + 0.5})
    if i == 1:
        slides.append(title_card('iphone', 'iPhone 怎麼安裝', ['一定要用 Safari 打開網址', '按下面中間的「分享」按鈕', '往下找「加入主畫面」→ 按「新增」', '之後從主畫面的圖示打開，', '資料才不會被清掉'], 8))
slides.append(title_card('outro', '重點整理', [
    '上班按「開始上班」', '每一趟按「新增排程項目」', '下班按「結束班次」',
    '第一次用先到「統計」填本薪', '每個月匯出一次備份！', '', '網址：', 'broooooook.github.io/', 'ChuanShunWeb'], 9))

with open('/home/user/vidtool/list.txt', 'w') as f:
    for s in slides:
        f.write(f"file '{s['file']}'\nduration {s['secs']}\n")
    f.write(f"file '{slides[-1]['file']}'\n")
total = sum(s['secs'] for s in slides)
print('slides', len(slides), 'seconds', total)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', '/home/user/vidtool/list.txt',
                '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-movflags', '+faststart',
                '/home/user/vidtool/tutorial.mp4'], check=True)
