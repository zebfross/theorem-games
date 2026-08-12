#!/bin/sh
# Derive the site's dark-background mark from the master artwork.
#
# The logo as drawn is dark-on-white, and its green is very nearly --felt, so
# it cannot go on this site as-is: the mark would sit invisible against the
# background. This inverts it the way the favicon is inverted — the mark
# becomes --ink, the gold is left alone, and the white becomes transparent.
#
# The white doing double duty is the reason this works rather than a problem.
# The controller's interior and the counters inside "theorem" are the same
# white as the background, so making white transparent lets felt show through
# all three, which is exactly what the dark version wants.
#
#   tools/make-logo.sh ~/Downloads/the-mark.png logo.png
#
# The fuzz values are chosen against the artwork's real palette: the mark is
# #173A2B, the gold #E5B957, the ground #FEFEFD. 45% reaches the antialiased
# green-to-white blends without reaching the gold, which sits 56% away.

set -eu
[ $# -eq 2 ] || { echo "usage: $0 <master.png> <out.png>" >&2; exit 2; }

magick "$1" \
  -fuzz 12% -transparent '#FEFEFD' \
  -fuzz 45% -fill '#f2ece1' -opaque '#173A2B' \
  -trim +repage -resize 200x -strip "$2"

magick identify -format '  %f  %wx%h  %b\n' "$2"
