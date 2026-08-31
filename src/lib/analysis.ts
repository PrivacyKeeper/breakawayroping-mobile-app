// src/lib/analysis.ts
//
// Run analysis, client side.
//
// The whole design in one sentence: the video never leaves the phone, only
// keyframes do. A three-second run at 1080p is a few hundred megabytes; twelve
// JPEGs of it are a few hundred kilobytes. That is the difference between an
// analysis you can run on arena wifi and one you cannot, and it is why the
// source clip is never uploaded.

import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { app as appMeta } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/**
 * How many frames to sample.
 *
 * Twelve is a compromise found the hard way in BarrelConnect: fewer and a
 * decisive instant falls between frames; more and the request gets slow and
 * expensive without telling the coach anything new. The edge function refuses
 * more than 24.
 */
const FRAME_COUNT = 12;

/** Trim the very start and end, which are almost always the arena and the sky. */
const SAMPLE_START = 0.04;
const SAMPLE_END = 0.97;

export type AnalysisFault = {
  code: string;
  severity: 'low' | 'medium' | 'high';
  evidence: string;
};

export type AnalysisPhase = { name: string; score: number; notes: string };

export type AnalysisKeyMoment = {
  timestamp: string;
  description: string;
  type: 'good' | 'improvement';
};

export type RunAnalysis = {
  is_expected_event: boolean;
  confidence: 'high' | 'medium' | 'low';
  overall_score: number;
  summary: string;
  phases: AnalysisPhase[];
  faults: AnalysisFault[];
  strengths: string[];
  improvements: string[];
  key_moments: AnalysisKeyMoment[];
};

export type AnalysisRow = {
  id: string;
  event_code: string;
  status: 'processing' | 'completed' | 'failed';
  error_message: string | null;
  analysis: RunAnalysis | null;
  overall_score: number | null;
  fault_codes: string[];
  created_at: string;
};

export type Progress =
  | { step: 'picking' }
  | { step: 'extracting'; done: number; total: number }
  | { step: 'uploading'; done: number; total: number }
  | { step: 'analysing' };

export type AnalyseResult =
  | { ok: true; analysis: RunAnalysis; analysisId: string }
  | { ok: false; message: string };

/** Pick a run video from the library. Returns null when the user backs out. */
export async function pickRunVideo(): Promise<
  { uri: string; durationMs: number | null } | null
> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      'This needs permission to open your videos. You can turn it on in Settings.',
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    quality: 1,
    videoMaxDuration: 120,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    // expo reports duration in milliseconds; guard anyway, because a value we
    // invent here becomes a wrong timeline in the prompt.
    durationMs:
      typeof asset.duration === 'number' && Number.isFinite(asset.duration) && asset.duration > 0
        ? Math.round(asset.duration)
        : null,
  };
}

/**
 * Pull evenly spaced stills out of the clip.
 *
 * A frame that fails to extract is skipped rather than failing the run: codecs
 * vary, and eleven good frames beat an error message. If none come out we say
 * so, because analysing zero frames would produce a confident description of
 * nothing.
 */
export async function extractFrames(
  videoUri: string,
  durationMs: number | null,
  onProgress?: (done: number, total: number) => void,
): Promise<{ uri: string; timeMs: number }[]> {
  const frames: { uri: string; timeMs: number }[] = [];

  // With no duration we can still sample by absolute offsets, but the spacing
  // is a guess, so keep it short and let the prompt fall back to frame order.
  const span = durationMs ?? FRAME_COUNT * 250;

  for (let i = 0; i < FRAME_COUNT; i++) {
    const fraction = SAMPLE_START + (i / (FRAME_COUNT - 1)) * (SAMPLE_END - SAMPLE_START);
    const timeMs = Math.max(0, Math.round(fraction * span));
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: timeMs,
        quality: 0.7,
      });
      frames.push({ uri, timeMs });
    } catch {
      // Skip it; a gap in the timeline is recoverable, a hard failure is not.
    }
    onProgress?.(i + 1, FRAME_COUNT);
  }

  return frames;
}

async function uploadFrame(
  authUserId: string,
  analysisKey: string,
  frame: { uri: string; timeMs: number },
  index: number,
): Promise<string> {
  // expo-file-system 55 hands back an ArrayBuffer directly. The older route
  // was to read base64 and widen it byte by byte, which allocated the image
  // three times over and, on a twelve-frame run, was measurably slow on an
  // older handset.
  const bytes = new Uint8Array(await new File(frame.uri).arrayBuffer());

  // Foldered by auth id because the storage policy checks exactly that: the
  // first path segment must be the caller's own uid.
  const path = `${authUserId}/${analysisKey}/${String(index).padStart(2, '0')}.jpg`;

  const { error } = await supabase.storage.from('run-frames').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(`Could not upload a frame: ${error.message}`);

  const { data } = supabase.storage.from('run-frames').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * The whole flow: frames out of the clip, frames into storage, storage into
 * the model, structured result back.
 */
export async function analyseRun(
  videoUri: string,
  durationMs: number | null,
  options: { careerRunId?: string | null; onProgress?: (p: Progress) => void } = {},
): Promise<AnalyseResult> {
  const { careerRunId = null, onProgress } = options;

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return { ok: false, message: 'Sign in again to analyse a run.' };

  onProgress?.({ step: 'extracting', done: 0, total: FRAME_COUNT });
  const frames = await extractFrames(videoUri, durationMs, (done, total) =>
    onProgress?.({ step: 'extracting', done, total }),
  );

  if (frames.length === 0) {
    return {
      ok: false,
      message:
        'No frames could be read out of that video. Try a clip recorded on this phone rather than one shared over a messaging app.',
    };
  }

  const analysisKey = `${Date.now()}`;
  const frameUrls: string[] = [];
  onProgress?.({ step: 'uploading', done: 0, total: frames.length });

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame) continue;
    try {
      frameUrls.push(await uploadFrame(session.user.id, analysisKey, frame, i));
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'The frames could not be uploaded. Check your signal and try again.',
      };
    }
    onProgress?.({ step: 'uploading', done: i + 1, total: frames.length });
  }

  onProgress?.({ step: 'analysing' });

  const endpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/analyse-run`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_code: appMeta.eventCodes[0],
        frame_urls: frameUrls,
        frame_times_ms: frames.map((f) => f.timeMs),
        video_duration_ms: durationMs,
        career_run_id: careerRunId,
      }),
    });
  } catch {
    return {
      ok: false,
      message: 'Could not reach the analyser. This part needs signal — try again with a bar.',
    };
  }

  let payload: { success?: boolean; error?: string; analysis?: RunAnalysis; analysis_id?: string };
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      message:
        response.status === 404
          ? 'The analyser is not deployed for this project yet.'
          : `The analyser returned an unexpected response (${response.status}).`,
    };
  }

  if (!response.ok || !payload.success || !payload.analysis) {
    return { ok: false, message: payload.error ?? 'The analysis did not complete.' };
  }

  return {
    ok: true,
    analysis: payload.analysis,
    analysisId: payload.analysis_id ?? '',
  };
}

/** Past analyses, newest first. RLS already scopes these to the caller. */
export async function listMyAnalyses(profileId: string): Promise<AnalysisRow[]> {
  const { data, error } = await supabase
    .from('run_video_analyses')
    .select('id, event_code, status, error_message, analysis, overall_score, fault_codes, created_at')
    .eq('contestant_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(`Could not load your analyses: ${error.message}`);
  return (data ?? []) as AnalysisRow[];
}

export async function deleteAnalysis(id: string): Promise<void> {
  const { error } = await supabase.from('run_video_analyses').delete().eq('id', id);
  if (error) throw new Error(`Could not delete that analysis: ${error.message}`);
}
