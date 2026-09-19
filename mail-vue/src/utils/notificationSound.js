/**
 * New-mail notification sounds.
 *
 * The wav files live in `public/sounds/`, so they are served from the app base
 * URL (which may be a separate static origin via `VITE_STATIC_URL`).
 *
 * A single `<audio>` element is reused on purpose: browsers limit how many
 * media elements may exist/play at once, and one element makes
 * `stopNotificationSound()` and "restart instead of overlap" trivial.
 *
 * Playback is best-effort. A browser that has not seen a user gesture yet will
 * reject `play()` — that is swallowed with a warning and retried once after the
 * next gesture, which is what makes the Chrome Android PWA behave.
 */

/** All bundled sounds, in the order the settings page lists them. */
export const NOTIFICATION_SOUNDS = [
	{ type: 'flute', label: 'flute' },
	{ type: 'interface', label: 'interface' },
	{ type: 'postive', label: 'postive' },
];

export const DEFAULT_NOTIFICATION_SOUND = 'interface';

/**
 * Ignore triggers closer together than this. The Inbox poll and the reader's
 * conversation poll can both see the same message within a couple of seconds.
 */
const MIN_PLAY_INTERVAL = 1200;

let audio = null;
let loadedType = '';
let currentType = DEFAULT_NOTIFICATION_SOUND;
let lastPlayedAt = 0;
let unlockArmed = false;
let gestureUnlockArmed = false;

function hasType(type) {
	return NOTIFICATION_SOUNDS.some(item => item.type === type);
}

/** Unknown/absent types fall back to the default instead of failing. */
export function normalizeSoundType(type) {
	return hasType(type) ? type : DEFAULT_NOTIFICATION_SOUND;
}

/** Absolute-ish URL of a bundled sound, honouring the deploy base path. */
export function notificationSoundUrl(type) {
	const base = import.meta.env.BASE_URL || '/';
	return `${base}sounds/${normalizeSoundType(type)}.wav`;
}

import { reactive } from 'vue'

/**
 * Last playback outcome, for the settings page.
 *
 * A browser that refuses to play leaves the reader with a silent app and no
 * explanation — and the console is not available on a phone. Surfacing the
 * reason next to the sound selector turns "there is no sound" into something the
 * reader can act on (and report).
 */
export const notificationSoundStatus = reactive({
	lastError: '',
	lastPlayedAt: 0,
})

/** Human-readable reason a media element refused to play. */
function describeMediaError(media) {
	const error = media && media.error;
	if (!error) return 'playback rejected (usually blocked autoplay)';

	switch (error.code) {
		case 1: return 'MEDIA_ERR_ABORTED';
		case 2: return 'MEDIA_ERR_NETWORK';
		case 3: return 'MEDIA_ERR_DECODE';
		case 4: return 'MEDIA_ERR_SRC_NOT_SUPPORTED — the URL did not return playable audio';
		default: return `media error ${error.code}`;
	}
}

function getAudio() {
	if (audio) return audio;
	if (typeof Audio === 'undefined') return null;

	audio = new Audio();
	audio.preload = 'auto';

	// A deploy that returns the SPA shell (or a 404) for /sounds/*.wav makes the
	// element fail here. Without this the app is simply silent with no clue why.
	audio.addEventListener('error', () => {
		const reason = describeMediaError(audio);
		notificationSoundStatus.lastError = reason;
		console.warn(
			`Nova Mail: notification sound ${audio.currentSrc || audio.src} could not be loaded ` +
			`(${reason}) — make sure the deployment serves /sounds/*.wav as audio.`
		);
	});

	return audio;
}

/**
 * Wait until the element holds data, so a retry can play without being
 * interrupted by the load the `src` assignment started. The timeout keeps a slow
 * network from delaying the alert forever.
 */
function waitForData(player, timeout = 1500) {
	if (player.readyState >= 2) return Promise.resolve();

	return new Promise(resolve => {
		const done = () => {
			player.removeEventListener('loadeddata', done);
			player.removeEventListener('error', done);
			clearTimeout(timer);
			resolve();
		};

		const timer = setTimeout(done, timeout);
		player.addEventListener('loadeddata', done);
		player.addEventListener('error', done);
	});
}

/** True for the playback failures that a retry after loading can actually fix. */
function isRecoverable(error) {
	return error && (error.name === 'AbortError' || error.name === 'NotSupportedError');
}

/** Restart the shared element from the beginning and play it. */
function restart(player) {
	// Restart from the beginning instead of queueing behind a previous play.
	player.pause();
	player.currentTime = 0;
	player.muted = false;
	player.volume = 1;
	return player.play();
}

/** Remember the sound used when `playNotificationSound()` gets no argument. */
export function setNotificationSoundType(type) {
	currentType = normalizeSoundType(type);
	return currentType;
}

export function getNotificationSoundType() {
	return currentType;
}

/**
 * Fetch a sound ahead of time so the first notification is not delayed.
 * Called by the settings page while the user auditions options.
 */
export function preloadNotificationSound(type = currentType) {
	const player = getAudio();
	if (!player) return;

	const resolved = normalizeSoundType(type);
	if (loadedType === resolved) return;

	try {
		loadedType = resolved;
		player.src = notificationSoundUrl(resolved);
		player.load();
	} catch (error) {
		console.warn('Nova Mail: could not preload the notification sound', error);
	}
}

/**
 * Autoplay was blocked: try once more on the next user gesture. The failed
 * attempt produced no sound, so this cannot double-play.
 */
function armUnlockRetry(type) {
	if (unlockArmed || typeof window === 'undefined') return;
	unlockArmed = true;

	const retry = () => {
		window.removeEventListener('pointerdown', retry);
		window.removeEventListener('keydown', retry);
		unlockArmed = false;
		playNotificationSound(type, { force: true });
	};

	window.addEventListener('pointerdown', retry, { once: true });
	window.addEventListener('keydown', retry, { once: true });
}

/**
 * Play a notification sound.
 *
 * @param {string} [type] bundled sound key (defaults to the selected one)
 * @param {{force?: boolean}} [options] `force` skips the anti-double-play
 *        window — used by the explicit preview button in the settings page.
 * @returns {Promise<boolean>} whether the sound started
 */
export async function playNotificationSound(type = currentType, { force = false } = {}) {
	const resolved = normalizeSoundType(type);
	currentType = resolved;

	const now = Date.now();
	if (!force && now - lastPlayedAt < MIN_PLAY_INTERVAL) return false;
	lastPlayedAt = now;

	const player = getAudio();
	if (!player) return false;

	try {
		// Switching source lazily keeps three files from loading on every page.
		if (loadedType !== resolved) {
			loadedType = resolved;
			player.src = notificationSoundUrl(resolved);
		}

		if (player.error) throw new Error(describeMediaError(player));

		try {
			await restart(player);
		} catch (firstError) {
			// A `src` that has only just been assigned is still loading, and
			// desktop browsers reject that first request with `AbortError`
			// ("interrupted by a new load request") instead of ringing. Wait for
			// the data and ring once it is there. `play()` is attempted *before*
			// the wait on purpose: Safari only honours the call while the user
			// gesture is still being handled.
			if (!isRecoverable(firstError)) throw firstError;

			await waitForData(player);
			await restart(player);
		}

		notificationSoundStatus.lastError = '';
		notificationSoundStatus.lastPlayedAt = Date.now();
		return true;
	} catch (error) {
		// Blocked autoplay, unsupported codec, muted device… stay silent.
		const reason =
			`${describeMediaError(player)}` +
			`${error && error.name ? `; ${error.name}` : ''}` +
			`${error && error.message ? `: ${error.message}` : ''}`;

		notificationSoundStatus.lastError = reason;

		console.warn(
			`Nova Mail: notification sound ${player.currentSrc || player.src} could not play (${reason})`
		);
		armUnlockRetry(resolved);
		return false;
	}
}

/**
 * Desktop browsers refuse `play()` until the page has had a real user gesture,
 * while an installed PWA (the phone) is exempt — which is exactly why the sound
 * rings on the phone but stays silent on the desktop. Prime the shared element
 * on the first gesture so later automatic alerts are allowed; muted playback
 * needs no gesture, so the prime itself cannot make noise.
 */
function armGestureUnlock() {
	if (gestureUnlockArmed || typeof window === 'undefined') return;
	gestureUnlockArmed = true;

	const unlock = () => {
		window.removeEventListener('pointerdown', unlock, true);
		window.removeEventListener('keydown', unlock, true);
		window.removeEventListener('touchstart', unlock, true);

		const player = getAudio();
		if (!player) return;

		try {
			// Keep `loadedType` in step with the element: without this the next
			// real alert re-assigns `src` to the same URL, which restarts the
			// load and can make `play()` reject right when the sound is due.
			if (!player.getAttribute('src')) {
				loadedType = normalizeSoundType(currentType);
				player.src = notificationSoundUrl(loadedType);
			}
			player.muted = true;

			const settle = () => {
				// Only undo the prime if a real playback has not taken over yet;
				// otherwise this would pause (and re-mute) a live notification.
				if (!player.muted) return;

				try {
					player.pause();
					player.currentTime = 0;
				} catch {
					// The element may not have metadata yet; nothing to reset.
				}
				player.muted = false;
			};

			const started = player.play();
			if (started && typeof started.then === 'function') started.then(settle, settle);
			else settle();
		} catch {
			player.muted = false;
		}
	};

	window.addEventListener('pointerdown', unlock, true);
	window.addEventListener('keydown', unlock, true);
	window.addEventListener('touchstart', unlock, true);
}

/** Stop a sound that is still playing (leaving the page, disabling the sound). */
export function stopNotificationSound() {
	if (!audio) return;

	try {
		audio.pause();
		audio.currentTime = 0;
	} catch (error) {
		console.warn('Nova Mail: could not stop the notification sound', error);
	}
}

// Arm the one-time autoplay prime as soon as the module is loaded, so the very
// first click anywhere in the app unlocks notification sounds.
armGestureUnlock();
