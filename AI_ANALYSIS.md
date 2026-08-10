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
## What is NOT wired
**No pose model is connected.** The engine consumes `PoseFrame[]` and
nothing currently produces them — there is no pose dependency in
`package.json`. This needs a VisionCamera frame processor with a TFLite
MoveNet or BlazePose model. Clay AI Coach’s `src/native/PoseDetector.ts`
is the closest working reference and should port with a model swap.
**No animal pose model exists.** MoveNet and BlazePose do not detect
quadrupeds and there is no drop-in. `horse.ts` defines the seam:
`registerHorsePoseAdapter()`. Until one is registered,
`horseAvailable()` returns false, the pipeline runs contestant-only,
and animal-attributed faults are simply not emitted. Nothing breaks
and nothing is faked — **check `horseAvailable()` before showing an
animal report rather than rendering an empty one.**

The benchmark makes this much cheaper than it looks: locating a
horse’s joints mid-run at speed is hard, locating them once on a
still animal from a dozen angles is not, and `trackFromSeeds()`
turns the run-time problem into following points already found.
**Thresholds are unfitted.** The values in `event.ts` come from coaching
convention, not from data. They are deliberately data rather than logic —
once there are enough measured runs with results attached they should be
fitted against what actually produced good ones. That is why measuring
and judging are separate functions: refitting must not require
recomputing history.
