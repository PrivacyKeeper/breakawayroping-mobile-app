#!/usr/bin/env bash
# Copies the hand-written engines into each generated app.
set -euo pipefail

OUT_ROOT="${OUT_ROOT:-/workspace/build}"
SHARED=/workspace/shared

# repo:scoring-dir:pose-event
APPS=(
  "breakawayroping-mobile-app:breakaway:breakaway"
  "tiedown-mobile-app:tiedown:tiedown"
  "teamrope-mobile-app:teamroping:teamroping"
  "bulldogging-mobile-app:steerwrestling:steerwrestling"
  "saddlebronc-mobile-app:saddlebronc:saddlebronc"
  "barebackbronc-mobile-app:bareback:bareback"
  "ranchrodeo-mobile-app:ranchrodeo:ranchrodeo"
)

for entry in "${APPS[@]}"; do
  IFS=':' read -r repo scoring event <<< "$entry"
  app="$OUT_ROOT/$repo"

  mkdir -p "$app/src/lib/scoring/$scoring" "$app/src/lib/pose"

  # Shared scoring interface, in every app.
  cp "$SHARED/scoring-core/types.ts" "$app/src/lib/scoring/types.ts"

  # The event engine.
  cp "$SHARED/scoring-$scoring"/*.ts "$app/src/lib/scoring/$scoring/"

  # Roughstock apps also get the shared roughstock core. Its test sits one
  # level up alongside it, because it exercises the core through this app's
  # event wrapper.
  if [[ "$scoring" == "saddlebronc" || "$scoring" == "bareback" ]]; then
    cp "$SHARED/scoring-roughstock/roughstock.ts" "$app/src/lib/scoring/roughstock.ts"
    mv "$app/src/lib/scoring/$scoring/roughstock.test.ts" \
       "$app/src/lib/scoring/roughstock.test.ts"
  fi

  # Pose engine: event-agnostic core plus this event's feature vector and
  # fault taxonomy.
  cp "$SHARED/pose"/*.ts "$app/src/lib/pose/"
  cp "$SHARED/pose-events/$event.ts" "$app/src/lib/pose/event.ts"

  # Barrel export for the scoring folder.
  cat > "$app/src/lib/scoring/index.ts" <<EOF
export * from './types.ts';
export * from './$scoring/index.ts';
EOF

  # Barrel export for pose.
  cat > "$app/src/lib/pose/index.ts" <<'EOF'
// Run analysis engine. Pure functions: no I/O, no network, no React.
//
//   BenchmarkCaptureSession   guides the walk-around and scores it
//   buildBaselines()          capture -> RiderBaseline (+ animal baseline)
//   judgeRun()                measurements -> coded faults
//   tallyFaults()             many runs -> what a coach needs to fix
//
// The feature vector and fault taxonomy for this event are in ./event.ts.

export * from './types.ts';
export * from './landmarks.ts';
export * from './embedding.ts';
export * from './capture.ts';
export * from './baseline.ts';
export * from './horse.ts';
export * from './judge.ts';
export * as event from './event.ts';
EOF

  echo "assembled $repo"
done
