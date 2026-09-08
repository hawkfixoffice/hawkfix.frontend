#!/bin/sh
# Из public/img/*.jpg делает адаптивные производные в public/img/out/
# Карточки — 3:2 (800/1200), герой — 16:9 (1200/1800/2600). webp + jpg-фолбэк.
set -e
SRC=public/img
OUT=public/img/out
rm -rf "$OUT"; mkdir -p "$OUT"

crop_to () { # файл ширина ratio_w ratio_h выход
  f=$1; w=$2; rw=$3; rh=$4; out=$5
  h=$(( w * rh / rw ))
  ffmpeg -v error -y -i "$f" \
    -vf "scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}" \
    -q:v 3 "$out.jpg"
  cwebp -quiet -q 78 -m 6 "$out.jpg" -o "$out.webp"
}

for f in "$SRC"/*.jpg; do
  key=$(basename "$f" .jpg)
  case "$key" in
    hero)
      for w in 1200 1800 2600; do crop_to "$f" $w 16 9 "$OUT/$key-$w"; done ;;
    hero-alt)
      for w in 900 1400; do crop_to "$f" $w 4 3 "$OUT/$key-$w"; done ;;
    *)
      for w in 800 1200; do crop_to "$f" $w 3 2 "$OUT/$key-$w"; done ;;
  esac
done
echo "готово: $(ls "$OUT" | wc -l | tr -d ' ') файлов, $(du -sh "$OUT" | cut -f1)"
