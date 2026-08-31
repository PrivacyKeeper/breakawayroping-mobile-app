// src/lib/push.ts
//
// Registering a handset so the draw can reach it.
//
// `notify_draw_posted()` has been writing push-channel rows since the outbox
// was built, and until now nothing recorded a device to send them to. This is
// that half.
//
// THE PERMISSION IS ASKED FOR LATE, ON PURPOSE. iOS gives an app exactly one
// chance at the notification prompt: deny it and the app cannot ask again, the
// user has to go to Settings. So this is not called at launch. It runs after
// somebody signs in, when "tell me when the draw is up" is a thing they
// obviously want rather than a modal in front of a login screen.

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Foreground behaviour.
 *
 * A draw notification arriving while somebody is staring at the app should
 * still be visible — they may be on a different screen, and the whole point is
 * that they do not miss it.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'simulator' | 'denied' | 'no-project-id' | 'error'; message: string };

/**
 * Ask for permission, get the Expo token, and record it against the account.
 *
 * Every failure is a named reason rather than a thrown error, because none of
 * them should stop somebody using the app: no notifications is a worse app,
 * not a broken one.
 */
export async function registerForPush(): Promise<PushRegistration> {
  // A simulator has no push service. Distinguishing this from a denial matters
  // during development, where "denied" would send somebody to a Settings
  // screen that cannot fix it.
  if (!Device.isDevice) {
    return {
      ok: false,
      reason: 'simulator',
      message: 'Push notifications need a real device.',
    };
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    // iOS allows this prompt once. If it has already been denied, asking again
    // silently returns denied rather than showing anything.
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Notifications are off. You can turn them on in Settings if you want the draw.',
    };
  }

  // Android needs a channel or notifications arrive silently with no heads-up.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Rodeo updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    // Expo cannot mint a token without knowing which project it is for. This
    // is the state of a repo that has not run `eas init` yet, and it is worth
    // naming rather than surfacing as a generic failure.
    return {
      ok: false,
      reason: 'no-project-id',
      message: 'This build has no EAS project id, so a push token cannot be issued.',
    };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
      p_app_slug: Constants.expoConfig?.slug ?? 'unknown',
    });
    if (error) {
      return { ok: false, reason: 'error', message: error.message };
    }

    return { ok: true, token };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : 'Could not register for notifications.',
    };
  }
}

/**
 * Drop this device's token.
 *
 * Called on sign-out. Without it, the next person to sign in on a shared phone
 * keeps receiving the previous contestant's draw until they happen to register
 * — and at an entry desk that is a real handset with real people using it.
 */
export async function unregisterPush(): Promise<void> {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // Best effort. A token left behind is reassigned the moment somebody else
    // registers it, because `register_push_token` upserts on the token.
  }
}
