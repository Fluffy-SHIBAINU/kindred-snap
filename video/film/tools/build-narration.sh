#!/bin/sh
# Places video/vo/beat-1..7.wav on their slots (0, 8, 18, 40, 55, 70, 82 s) as one 92 s track:
# a beat starts at its slot or just after the previous beat ends (never overlapping), and a beat
# longer than its slot is sped up to fit, at most 1.2x (beyond that it spills, it is never cut).
# Re-run whenever the beats are regenerated, then `om voice video/film --audio video/film/assets/narration.wav`.
set -e
cd "$(dirname "$0")/../../.."
VO=video/vo
OUT=video/film/assets/narration.wav
PLACE=video/film/tools/placement.txt
: > "$PLACE"
starts="0 8 18 40 55 70 82"
ends="8 18 40 55 70 82 90"
prev=0
inputs=""
filters=""
mix=""
i=1
for s in $starts; do
  e=$(echo "$ends" | cut -d' ' -f$i)
  f="$VO/beat-$i.wav"
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  tempo=$(awk -v d="$d" -v s="$s" -v e="$e" 'BEGIN{t=d/(e-s-0.15); if(t<1)t=1; if(t>1.2)t=1.2; printf "%.4f", t}')
  at=$(awk -v s="$s" -v p="$prev" 'BEGIN{a=s; if(p+0.12>a)a=p+0.12; printf "%.3f", a}')
  prev=$(awk -v a="$at" -v d="$d" -v t="$tempo" 'BEGIN{printf "%.3f", a+d/t}')
  ms=$(awk -v a="$at" 'BEGIN{printf "%d", a*1000}')
  echo "beat $i: $d s, tempo $tempo, at $at s, ends $prev s"
  echo "$i $at $tempo" >> "$PLACE"
  inputs="$inputs -i $f"
  k=$((i-1))
  filters="$filters[$k:a]aformat=sample_rates=48000:channel_layouts=mono,atempo=$tempo,adelay=$ms[b$i];"
  mix="$mix[b$i]"
  i=$((i+1))
done
ffmpeg -v error -y $inputs -filter_complex "${filters}${mix}amix=inputs=7:normalize=0,apad=whole_dur=92[out]" -map "[out]" -ar 48000 -ac 1 "$OUT"
echo "wrote $OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT") s)"
