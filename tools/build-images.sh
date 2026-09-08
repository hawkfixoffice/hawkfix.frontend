#!/bin/sh
# Из assets/photos/*.jpg (мастера, в сборку не попадают) делает адаптивные
# производные в public/img/out/.
#
# ПРАВИЛО ПРОЕКТА: вся растровая графика сайта отдаётся ТОЛЬКО в WebP.
# Формат поддерживают все браузеры из нашей матрицы, а jpg-дубли — это лишние
# 5 МБ в сборке и вторая ветка в <picture> без пользы. Исключение одно:
# og-картинки (public/og/*.png) — их читают краулеры соцсетей.
#
# Карточки — 3:2 (800/1200/1600), герой — 16:9 (1200/1800/2600),
# hero-alt — 4:3 (900/1400/2000).
set -e
SRC=assets/photos
OUT=public/img/out
rm -rf "$OUT"; mkdir -p "$OUT"

crop_to () { # файл ширина ratio_w ratio_h выход-без-расширения
  f=$1; w=$2; rw=$3; rh=$4; out=$5
  h=$(( w * rh / rw ))
  # lanczos даёт заметно более чистое уменьшение, чем билинейный по умолчанию
  ffmpeg -v error -y -i "$f" \
    -vf "scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}" \
    -q:v 2 "$out.tmp.jpg"
  cwebp -quiet -q 82 -m 6 -sharp_yuv -metadata none "$out.tmp.jpg" -o "$out.webp"
  rm -f "$out.tmp.jpg"
}

for f in "$SRC"/*.jpg; do
  key=$(basename "$f" .jpg)
  case "$key" in
    hero)     for w in 1200 1800 2600; do crop_to "$f" $w 16 9 "$OUT/$key-$w"; done ;;
    hero-alt) for w in 900 1400 2000;  do crop_to "$f" $w 4 3  "$OUT/$key-$w"; done ;;
    *)        for w in 800 1200 1600;  do crop_to "$f" $w 3 2  "$OUT/$key-$w"; done ;;
  esac
done
echo "готово: $(ls "$OUT" | wc -l | tr -d ' ') файлов, $(du -sh "$OUT" | cut -f1)"
