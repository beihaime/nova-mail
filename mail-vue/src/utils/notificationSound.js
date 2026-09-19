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

function getAudio() {
	if (audio) return audio;
	if (typeof Audio === 'undefined') return null;

	audio = new Audio();
	audio.preload = 'auto';
	return audio;
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

		// Restart from the beginning instead of queueing behind a previous play.
		player.pause();
		player.currentTime = 0;
		player.volume = 1;

		await player.play();
		return true;
	} catch (error) {
		// Blocked autoplay, unsupported codec, muted device… stay silent.
		console.warn('Nova Mail: notification sound could not play', error);
		armUnlockRetry(resolved);
		return false;
	}
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
