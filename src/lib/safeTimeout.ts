/**
 * Creates a managed timeout utility that tracks all pending timeouts
 * and can clear them on component teardown (via onDestroy).
 *
 * Usage:
 *   const { safeTimeout, clearAll } = createSafeTimeout();
 *   safeTimeout(() => doSomething(), 300);
 *   onDestroy(clearAll);
 */
export function createSafeTimeout(): {
	safeTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clearAll: () => void;
} {
	const timers: ReturnType<typeof setTimeout>[] = [];

	function safeTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
		const id = setTimeout(fn, ms);
		timers.push(id);
		return id;
	}

	function clearAll(): void {
		timers.forEach(clearTimeout);
	}

	return { safeTimeout, clearAll };
}
