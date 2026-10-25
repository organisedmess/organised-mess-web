"""Cut product shots out of their white studio background → transparent WebP.

Background = near-white pixels connected to the image border (so white parts
inside the product survive). Edge alpha is softened by a small blur of the mask.
Usage: python3 tools/cutout.py SRC_DIR FALLBACK_DIR site/internal/tools/img [maxpx]
Needs Pillow, numpy, scipy. SRC_DIR = larger uncut crops; FALLBACK_DIR = hand-masked shots used when a crop's border isn't white.
"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src, fallback, out = sys.argv[1], sys.argv[2], sys.argv[3]
MAXPX = int(sys.argv[4]) if len(sys.argv) > 4 else 720
os.makedirs(out, exist_ok=True)

def cutout(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    mn, mx = a.min(axis=2), a.max(axis=2)
    # near-white and low-saturation: candidate background
    cand = (mn > 228) & ((mx - mn) < 22)
    # keep only candidates connected to the border
    lab, n = ndimage.label(cand)
    border = np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))
    border = border[border != 0]
    bg = np.isin(lab, border)
    # grow slightly into the anti-aliased rim, then feather
    bg = ndimage.binary_dilation(bg, iterations=1)
    alpha = (~bg).astype(np.uint8) * 255
    alpha = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.copy(); rgba.putalpha(alpha)
    # trim to content
    bbox = alpha.point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        pad = 4
        bbox = (max(0, bbox[0]-pad), max(0, bbox[1]-pad), min(im.width, bbox[2]+pad), min(im.height, bbox[3]+pad))
        rgba = rgba.crop(bbox)
    # scale to MAXPX on the long side (never upscale)
    w, h = rgba.size
    s = min(1.0, MAXPX / max(w, h))
    if s < 1:
        rgba = rgba.resize((max(1, round(w*s)), max(1, round(h*s))), Image.LANCZOS)
    edge = np.concatenate([bg[0, :], bg[-1, :], bg[:, 0], bg[:, -1]])
    return rgba, edge.mean()

keys = sorted(set(os.path.splitext(f)[0] for d in (src, fallback) for f in os.listdir(d)))
for k in keys:
    p = os.path.join(src, k + '.jpg')
    if not os.path.exists(p): p = os.path.join(fallback, k + '.jpg')
    im, frac = cutout(p)
    used = p
    if frac < 0.6 and os.path.exists(os.path.join(fallback, k + '.jpg')) and p != os.path.join(fallback, k + '.jpg'):
        # the crop's background isn't white — use the hand-masked photo instead
        used = os.path.join(fallback, k + '.jpg'); im, frac = cutout(used)
        print('  fallback:', k, f'bg {frac:.2f}')
    im.save(os.path.join(out, k + '.webp'), 'WEBP', quality=88, method=6)
    print(f'{k:36} {Image.open(p).size} → {im.size}  bg {frac:.2f}')
