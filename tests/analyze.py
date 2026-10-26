#!/usr/bin/env python3
"""把渲染截图降采样成可读的色块字符画，用于无图像通道时检查画面结构。"""
import sys
from PIL import Image

path = sys.argv[1] if len(sys.argv) > 1 else 'tests/preview.png'
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 76

im = Image.open(path).convert('RGB')
w, h = im.size
rows = max(1, int(cols * h / w * 0.5))
im = im.resize((cols, rows), Image.BILINEAR)
px = im.load()


def classify(r, g, b):
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx < 40:
        return '#'
    if b > r * 1.18 and b > g * 1.05 and b > 110:
        return '~'
    if g > r * 1.08 and g > b * 1.12 and g > 70:
        return 'g'
    if g > b * 1.15 and r > 90 and abs(r - g) < 45 and g > r * 0.85:
        return 'y'  # 黄绿/麦田
    if r > 180 and g > 155 and b < 160:
        return 'd'
    if r > g * 1.12 and g > b * 1.05 and r > 80:
        return 'w'
    if mx - mn < 22 and 45 <= mx <= 210:
        return 's'
    if mx > 210:
        return '.'
    return '?'


lines = []
for y in range(rows):
    line = ''.join(classify(*px[x, y]) for x in range(cols))
    lines.append(line)
print('\n'.join(lines))
print()
# 色块统计
from collections import Counter
c = Counter(''.join(lines))
print('blocks:', dict(c))
print('size:', (w, h))