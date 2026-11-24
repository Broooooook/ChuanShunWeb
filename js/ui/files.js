// 存檔／分享／選檔：手機上優先用「分享」（可存到檔案、LINE、Email），電腦上直接下載
export async function saveFile(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const file = new File([blob], name, { type: mime });
  const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; /* 其他錯誤改用下載 */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

export function pickTextFile(accept = '.json,application/json,text/plain') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = async () => { const f = input.files?.[0]; resolve(f ? await f.text() : null); };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
