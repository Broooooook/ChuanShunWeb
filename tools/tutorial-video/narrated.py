# 依配音長度重新排秒數，合成：畫面＋配音＋背景音樂
import json, subprocess, os, sys
V = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/全順工時記錄開發專案/配音'
S = '/home/user/vidtool/slides'
T = '/home/user/vidtool/tmp_audio'
os.makedirs(T, exist_ok=True)
scenes = json.load(open('/home/user/vidtool/scenes.json'))
order = ['intro'] + [f'{i:02d}' for i in range(len(scenes))]
order.insert(3, 'iphone')
base = {'intro': 5, 'iphone': 8, 'outro': 9}
for i, s in enumerate(scenes):
    base[f'{i:02d}'] = s['secs'] + 0.5
order.append('outro')

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).decode())

LEAD = 0.4
plan = []
for k in order:
    v = f'{V}/{k}.wav'
    d = max(base[k] * 0.8, dur(v) + LEAD + 0.8)
    plan.append((k, v, round(d, 2)))
# 每段：前面空 0.4 秒再唸，補靜音到該段長度
segs = []
for k, v, d in plan:
    o = f'{T}/{k}.wav'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', v, '-af', f'adelay={int(LEAD*1000)}:all=1,apad,atrim=0:{d},aresample=44100',
                    '-ac', '1', '-ar', '44100', o], check=True)
    segs.append(o)
with open(f'{T}/list.txt', 'w') as f:
    for o in segs:
        f.write(f"file '{o}'\n")
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'{T}/list.txt', '-c', 'pcm_s16le', f'{T}/voice.wav'], check=True)
total = sum(d for _, _, d in plan)
subprocess.run(['python3', '/home/user/vidtool/music.py', str(total + 1), f'{T}/bgm.wav'], check=True)
with open(f'{T}/vlist.txt', 'w') as f:
    for k, _, d in plan:
        f.write(f"file '{S}/{k}.png'\nduration {d}\n")
    f.write(f"file '{S}/outro.png'\n")
out = '/home/user/vidtool/tutorial_voice.mp4'
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', f'{T}/vlist.txt', '-i', f'{T}/voice.wav', '-i', f'{T}/bgm.wav',
                '-filter_complex', '[1:a]volume=1.0[v];[2:a]volume=0.09[m];[v][m]amix=inputs=2:duration=first:normalize=0[a]',
                '-map', '0:v', '-map', '[a]', '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '23', '-preset', 'medium',
                '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out], check=True)
print('total', round(total, 1), 'sec', out)
