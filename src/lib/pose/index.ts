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
