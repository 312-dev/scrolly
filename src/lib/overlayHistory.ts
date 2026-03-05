/**
 * Shared history management for overlays (modals, sheets, fullscreen views).
 *
 * The core pattern: each overlay pushes a history entry so the browser back
 * button dismisses it. When overlays nest (e.g. MeReelView → CommentsSheet),
 * we MERGE state so parent markers survive in every child entry.
 *
 * Usage in a component:
 *
 *   const overlay = createOverlayHistory('sheet', 'comments');
 *   beforeNavigate(overlay.onBeforeNavigate);
 *
 *   $effect(() => {
 *     const cleanup = overlay.attach(ondismiss);
 *     // ... other setup ...
 *     return () => {
 *       cleanup();
 *       // ... other teardown ...
 *     };
 *   });
 */
import { untrack } from 'svelte';
import { pushState } from '$app/navigation';
import { page } from '$app/state';

type PageStateKey = keyof App.PageState;

/**
 * Creates a history-backed overlay controller.
 *
 * @param stateKey - The `App.PageState` key this overlay owns (e.g. `'sheet'`, `'clipOverlay'`, `'meReel'`)
 * @param stateValue - The value to store (e.g. `'comments'`, a clip ID, or `true`)
 */
export function createOverlayHistory<K extends PageStateKey>(
	stateKey: K,
	stateValue: NonNullable<App.PageState[K]>
) {
	let closedViaBack = false;
	// Deferred back timer — allows a re-attach (effect re-run) to cancel it
	// before it fires, preventing the double-back that navigates past the app.
	let pendingBack: ReturnType<typeof setTimeout> | null = null;

	return {
		/**
		 * Pass to `beforeNavigate()` at component init level.
		 * Prevents the cleanup from calling `history.back()` during real
		 * navigations (link clicks, route changes) and page reloads.
		 */
		onBeforeNavigate() {
			closedViaBack = true;
			if (pendingBack !== null) {
				clearTimeout(pendingBack);
				pendingBack = null;
			}
		},

		/**
		 * Call inside `$effect()`. Pushes a merged history state and listens
		 * for `popstate`. Returns a cleanup function for the effect.
		 *
		 * @param ondismiss - Called when the overlay should close (back button pressed)
		 */
		attach(ondismiss: () => void) {
			// If a previous cleanup deferred a history.back(), cancel it — we're
			// re-attaching (effect re-run), so the history entry is still ours.
			if (pendingBack !== null) {
				console.log('[overlayHistory] cancelling pending back (effect re-run):', stateKey);
				clearTimeout(pendingBack);
				pendingBack = null;
			}

			// Merge with current page state so parent overlay markers survive.
			// e.g. { meReel: true } + { sheet: 'comments' } = { meReel: true, sheet: 'comments' }
			// Use untrack() to read page.state without subscribing — otherwise the
			// $effect that calls attach() would re-run when pushState updates it.
			const currentState = untrack(() => page.state);

			// Only push a new history entry if our state isn't already present.
			// On effect re-runs, the state from the previous attach is still there.
			const alreadyPresent = currentState?.[stateKey] === stateValue;
			if (!alreadyPresent) {
				console.log(
					'[overlayHistory] attach:',
					stateKey,
					'=',
					stateValue,
					'merging with:',
					JSON.stringify(currentState)
				);
				pushState('', { ...currentState, [stateKey]: stateValue });
			} else {
				console.log(
					'[overlayHistory] attach (re-run, state already present):',
					stateKey,
					'=',
					stateValue
				);
			}

			const handlePopState = () => {
				// Defer so SvelteKit's own popstate handler updates page.state first.
				setTimeout(() => {
					console.log(
						'[overlayHistory] popstate:',
						stateKey,
						'current value:',
						page.state?.[stateKey],
						'expected:',
						stateValue
					);
					if (page.state?.[stateKey] === stateValue) return;
					console.log('[overlayHistory] popstate dismissing:', stateKey);
					closedViaBack = true;
					ondismiss();
				}, 0);
			};

			const handleBeforeUnload = () => {
				closedViaBack = true;
			};

			window.addEventListener('popstate', handlePopState);
			window.addEventListener('beforeunload', handleBeforeUnload);

			return () => {
				console.log(
					'[overlayHistory] cleanup:',
					stateKey,
					'=',
					stateValue,
					'closedViaBack:',
					closedViaBack
				);
				window.removeEventListener('popstate', handlePopState);
				window.removeEventListener('beforeunload', handleBeforeUnload);
				if (!closedViaBack) {
					// Only go back if our state entry is still current. A stale popstate
					// from a previous overlay's cleanup may have already popped it — calling
					// history.back() again would navigate past the app entirely.
					const stillCurrent = untrack(() => page.state?.[stateKey]) === stateValue;
					if (stillCurrent) {
						// Defer the back so an immediate re-attach (Svelte effect re-run)
						// can cancel it. Without this, effect re-runs cause a cleanup back()
						// followed by a re-attach push(), doubling the back() calls and
						// navigating past the app entirely.
						pendingBack = setTimeout(() => {
							pendingBack = null;
							console.log('[overlayHistory] deferred back firing:', stateKey);
							history.back();
						}, 0);
					}
				}
			};
		}
	};
}
