# Run analysis — Breakaway Roping
How the AI analysis in this app works, what is wired, and what is not.
## The idea
The contestant records a **walk-around benchmark** — themselves and the
animal, standing still, head to hooves — before they film any runs. That
yields their resting geometry and, where an animal is involved, its
conformation. Every run afterwards is measured as a **deviation from that
benchmark**, so coaching is against their own body rather than against a
generic ideal that fits nobody.
Three things the walk-around buys that a single reference frame does not:
- **Known scale.** Head to hooves standing still is a real vertical
  extent, so measurements are true proportions rather than pixel ratios.
- **Camera-motion rejection.** The same subject from many angles is how
  you tell a real position change from the camera moving.
- **A personal baseline.** Deviation from their own rest position is a
  defensible coaching statement; an absolute joint angle is not.
## Where it runs
On the phone. Only the numbers are uploaded — a few kilobytes instead of
a few hundred megabytes — and the video stays on the device unless the
contestant explicitly shares it. This is the pattern proven on Clay AI
Coach and mandated by `00_RODEOAPPS_SHARED_SPINE.md`.
## Why faults have codes
`src/lib/pose/event.ts` holds a fixed taxonomy. Faults are emitted from
measurements against that list, never written as prose by a model.
That matters most for coaches. A coach report counts how many people on a
roster share a fault, and the count is only meaningful if the fault is
named identically every time. Ask a model to describe runs and the same
fault comes back three different ways across three contestants, tallying
as three separate one-person problems — which is exactly the pattern the
coach needed to see. A model may still write the paragraph a human reads.
It does not get to decide what happened, and it never invents a category.
**Codes are permanent once shipped.** Reword a label freely; never change
what a code means. Retire it, add a new one, bump the taxonomy version.
## What is wired
- `capture.ts` — live guidance during the walk-around, coverage scoring,
  and automatic detection of which capture method is being used
- `embedding.ts` — 128-d geometric identity embedding, weighted for a
  mounted subject where the legs are occluded
- `baseline.ts` — capture to baseline, folding repeat captures together
- `judge.ts` — measurements to coded faults, and faults to a coach tally
- `event.ts` — this event’s feature vector and fault taxonomy
## How it works today

Analysis runs through the `analyse-run` Edge Function on the shared
Rodeo-OS project, using the pattern already proven in BarrelConnect:

1. You pick a clip of one run. It stays on the phone.
2. The app extracts twelve keyframes with `expo-video-thumbnails` and
   uploads only those — a few hundred kilobytes instead of a few hundred
   megabytes, which is what makes this work on arena wifi.
3. The function sends them to a vision model under a **strict JSON
   schema** and stores the structured result in `run_video_analyses`.
4. `/analyze` renders it: an overall mark, a score and note per phase,
   coded faults with the evidence behind each, and key moments.

**The model selects fault codes; it never invents them.** The schema
supplies this event's codes as an `enum`, taken directly from
`src/lib/pose/event.ts` — the same list this app labels them with. That
is what keeps a coach report countable: ask a model to describe runs
freely and one fault comes back three ways across three contestants,
tallying as three separate one-person problems. It still writes the
paragraph a human reads. It does not decide what happened.

A code with no local label renders as the raw code rather than being
hidden. A fault the roper cannot see is worse than an ugly one, and it is
the only way anybody would notice the two lists drifting apart.

**Keep the codes in step.** `supabase/functions/analyse-run/events.ts` in
Rodeo-OS holds the server's copy. Adding a fault here means adding it
there in the same change, or the model can never emit it.

## What the pose engine is still for

`src/lib/pose/` is not dead code, and it is not what `/analyze` calls
today. It is the on-device path: capture guidance, a geometric identity
embedding, baseline building, and a judge that turns measurements into
the same coded faults. It consumes `PoseFrame[]` and nothing produces
them yet.

**No pose model is connected.** This needs a VisionCamera frame processor
with a TFLite MoveNet or BlazePose model. Clay AI Coach's
`src/native/PoseDetector.ts` is the closest working reference and should
port with a model swap.

**No animal pose model exists.** MoveNet and BlazePose do not detect
quadrupeds and there is no drop-in. `horse.ts` defines the seam:
`registerHorsePoseAdapter()`. Until one is registered,
`horseAvailable()` returns false, the pipeline runs contestant-only, and
animal-attributed faults are simply not emitted. Nothing breaks and
nothing is faked — **check `horseAvailable()` before showing an animal
report rather than rendering an empty one.**

The benchmark makes this much cheaper than it looks: locating a horse's
joints mid-run at speed is hard, locating them once on a still animal
from a dozen angles is not, and `trackFromSeeds()` turns the run-time
problem into following points already found.

The two paths are complementary rather than competing. The vision model
reads a run the way a coach watching from the fence would. The pose
engine measures against the contestant's own geometry, works with no
signal, and costs nothing per run. When a model is connected, the
existing taxonomy means both emit the same codes.

**Thresholds are unfitted.** The values in `event.ts` come from coaching
convention, not from data. They are deliberately data rather than logic —
once there are enough measured runs with results attached they should be
fitted against what actually produced good ones. That is why measuring
and judging are separate functions: refitting must not require
recomputing history.

## What it costs to run

Each analysis is one vision call over twelve images. `OPENAI_API_KEY`
must be set in the Rodeo-OS project under Edge Functions → Secrets, or
the function returns a clear error and the screen says so. There is no
free fallback and nothing is faked: an analyser that invented a score
because a key was missing would be worse than one that said it could not
run.
