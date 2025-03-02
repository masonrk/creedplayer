#!/bin/bash
echo "🔧 Installing FFmpeg..."
apt-get update && apt-get install -y ffmpeg
node new.js
