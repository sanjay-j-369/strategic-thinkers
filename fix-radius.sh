#!/bin/bash

# generic rounded classes
find frontend/app frontend/components -type f -name "*.tsx" | xargs sed -i '' \
  -e 's/rounded-\[28px\]/rounded-2xl/g' \
  -e 's/rounded-\[24px\]/rounded-xl/g' \
  -e 's/rounded-\[22px\]/rounded-xl/g' \
  -e 's/rounded-\[20px\]/rounded-xl/g' \
  -e 's/rounded-\[16px\]/rounded-xl/g' \
  -e 's/max-w-[0-9a-zA-Z]*xl/max-w-2xl/g'

# Dialog specifically has insane inline styles
sed -i '' -e 's/bg-\[linear-gradient.*?\]/bg-background/g' frontend/components/ui/dialog.tsx
sed -i '' -e 's/shadow-\[0_32px_120px_rgba.*?\]/shadow-lg/g' frontend/components/ui/dialog.tsx

