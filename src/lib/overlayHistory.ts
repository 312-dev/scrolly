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

	return {
		/**
		 * Pass to `beforeNavigate()` at component init level.
		 * Prevents the cleanup from calling `history.back()` during real
		 * navigations (link clicks, route changes) and page reloads.
		 */
		onBeforeNavigate() {
			closedViaBack = true;
		},

		/**
		 * Call inside `$effect()`. Pushes a merged history state and listens
		 * for `popstate`. Returns a cleanup function for the effect.
		 *
		 * @param ondismiss - Called when the overlay should close (back button pressed)
		 */
		attach(ondismiss: () => void) {
			// Merge with current page state so parent overlay markers survive.
			// e.g. { meReel: true } + { sheet: 'comments' } = { meReel: true, sheet: 'comments' }
			pushState('', { ...page.state, [stateKey]: stateValue });

			const handlePopState = () => {
				// Defer so SvelteKit's own popstate handler updates page.state first.
				setTimeout(() => {
					if (page.state?.[stateKey] === stateValue) return;
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
				window.removeEventListener('popstate', handlePopState);
				window.removeEventListener('beforeunload', handleBeforeUnload);
				if (!closedViaBack) history.back();
			};
		}
	};
}
