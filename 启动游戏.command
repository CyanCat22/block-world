#!/bin/bash
# 双击这个文件即可用默认浏览器打开游戏
cd "$(dirname "$0")" || exit 1
open "index.html"
