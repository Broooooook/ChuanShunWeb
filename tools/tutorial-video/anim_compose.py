# 合成動畫版教學：片頭卡＋partA 錄影＋iPhone 卡＋partB 錄影＋片尾卡；配音依時間軸放上，加原創背景音樂
import json, subprocess, sys, os
VO = sys.argv[1]  # 配音資料夾（<id>.mp3）
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/user/vidtool/tutorial_anim.mp4'
T = '/home/user/vidtool/tmp_anim'; os.makedirs(T, exist_ok=True)
S = '/home/user/vidtool/slides'
tl = json.load(open('/home/user/vidtool/anim/timeline.json'))
A, B = tl[0], tl[1]

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).decode())

items = []  # (image, seconds)
voices = []  # (id, start)
cur = 0.0
def card(img, vid):
    global cur
    d = dur(f'{VO}/{vid}.mp3') + 1.4
    voices.append((vid, cur + 0.5)); items.append((img, d)); cur += d
def part(P):
    global cur
    fr = P['frames']
    for i, (f, t) in enumerate(fr):
        st = 0 if i == 0 else t
        nxt = fr[i + 1][1] if i + 1 < len(fr) else P['length']
        items.append((f, max(0.001, nxt - st)))
    for e in P['events']:
        voices.append((e['id'], cur + e['t'] + 0.25))
    cur += P['length']

card(f'{S}/intro.png', 'intro')
part(A)
card(f'{S}/iphone.png', 'iphone')
part(B)
card(f'{S}/outro.png', 'outro')
items[-1] = (items[-1][0], items[-1][1] + 1.0); cur += 1.0
print('total', round(cur, 1))

# 分段做成 mp4 再接起來（避免不同圖片格式混在一起出錯）
ENC = ['-vf', 'fps=30,scale=1080:1920,format=yuv420p', '-c:v', 'libx264', '-crf', '22', '-preset', 'medium', '-r', '30']
segs = []
groups = []  # 連續的錄影畫面歸成一組
for img, d in items:
    is_card = img.endswith('.png')
    if is_card or not groups or groups[-1][0] == 'card':
        groups.append(['card' if is_card else 'rec', []])
    groups[-1][1].append((img, d))
for gi, (kind, lst) in enumerate(groups):
    o = f'{T}/seg{gi:02d}.mp4'
    if kind == 'card':
        img, d = lst[0]
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-t', f'{d:.3f}', '-i', img, *ENC, o], check=True)
    else:
        with open(f'{T}/l{gi}.txt', 'w') as f:
            for img, d in lst:
                f.write(f"file '{img}'\nduration {d:.4f}\n")
            f.write(f"file '{lst[-1][0]}'\n")
        tot = sum(d for _, d in lst)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'{T}/l{gi}.txt', *ENC, '-t', f'{tot:.3f}', o], check=True)
    segs.append(o)
with open(f'{T}/v.txt', 'w') as f:
    for o in segs:
        f.write(f"file '{o}'\n")

# 配音軌
inputs, filt = [], []
for i, (vid, st) in enumerate(voices):
    inputs += ['-i', f'{VO}/{vid}.mp3']
    filt.append(f'[{i}:a]adelay={int(st*1000)}:all=1,aresample=44100[a{i}]')
mix = ''.join(f'[a{i}]' for i in range(len(voices)))
filt.append(f'{mix}amix=inputs={len(voices)}:normalize=0,apad,atrim=0:{cur:.3f}[out]')
subprocess.run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', ';'.join(filt), '-map', '[out]', '-ac', '1', f'{T}/voice.wav'], check=True)
subprocess.run(['python3', '/home/user/vidtool/music.py', str(cur + 1), f'{T}/bgm.wav'], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'{T}/v.txt', '-i', f'{T}/voice.wav', '-i', f'{T}/bgm.wav',
                '-filter_complex', '[1:a]volume=1.0[v];[2:a]volume=0.10[m];[v][m]amix=inputs=2:duration=first:normalize=0[a]',
                '-map', '0:v', '-map', '[a]', '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', OUT], check=True)
print('done', OUT)
