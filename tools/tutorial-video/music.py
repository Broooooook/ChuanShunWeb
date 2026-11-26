# 原創背景音樂：柔和的鋼琴感和弦＋簡單琶音（I–V–vi–IV，C 大調），輸出 wav
import numpy as np, wave, sys

SR = 44100
BPM = 84
beat = 60 / BPM
dur_total = float(sys.argv[1]) if len(sys.argv) > 1 else 240
out = sys.argv[2] if len(sys.argv) > 2 else '/home/user/vidtool/bgm.wav'

def note(freq, length, amp=0.2, attack=0.02, decay=1.8):
    t = np.arange(int(SR * length)) / SR
    env = np.minimum(1, t / attack) * np.exp(-t / decay)
    tone = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * 2 * freq * t) + 0.1 * np.sin(2 * np.pi * 3 * freq * t)
    return amp * env * tone

def hz(m):
    return 440 * 2 ** ((m - 69) / 12)

chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]  # C G Am F
bar = beat * 4
n_bars = int(dur_total / bar) + 1
buf = np.zeros(int(SR * (n_bars * bar + 4)))

def add(sig, start):
    i = int(start * SR)
    buf[i:i + len(sig)] += sig[: len(buf) - i]

for b in range(n_bars):
    ch = chords[b % 4]
    t0 = b * bar
    for m in ch:  # 長音和弦（pad）
        add(note(hz(m), bar + 1.5, amp=0.06, attack=0.4, decay=3.5), t0)
    add(note(hz(ch[0] - 12), bar + 1, amp=0.09, attack=0.05, decay=2.5), t0)  # 低音
    pattern = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12, ch[2] + 12]
    for k, m in enumerate(pattern):  # 八分音符琶音
        add(note(hz(m), beat * 1.5, amp=0.045, attack=0.01, decay=0.6), t0 + k * beat / 2)

buf = buf[: int(SR * dur_total)]
# 頭尾淡入淡出
fade = int(SR * 3)
buf[:fade] *= np.linspace(0, 1, fade)
buf[-fade:] *= np.linspace(1, 0, fade)
buf = buf / np.max(np.abs(buf)) * 0.8
data = (buf * 32767).astype(np.int16)
with wave.open(out, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())
print('ok', out, dur_total)
