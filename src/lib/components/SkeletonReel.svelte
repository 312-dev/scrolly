<div class="skeleton">
	<!-- Action sidebar bones -->
	<div class="sidebar-bones">
		<div class="bone-circle"></div>
		<div class="bone-circle"></div>
		<div class="bone-circle"></div>
		<div class="bone-circle"></div>
	</div>

	<!-- Bottom overlay bones -->
	<div class="overlay-bones">
		<div class="bone-row">
			<div class="bone-avatar"></div>
			<div class="bone-text" style="width: 90px"></div>
		</div>
		<div class="bone-text" style="width: 200px"></div>
		<div class="bone-text short" style="width: 140px"></div>
	</div>
</div>

<style>
	.skeleton {
		position: relative;
		height: 100dvh;
		width: 100%;
		background: var(--bg-primary);
		overflow: hidden;
	}

	.skeleton::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.03) 50%,
			transparent 100%
		);
		transform: translateX(-100%);
		animation: shimmer 1.5s linear infinite;
	}

	@keyframes shimmer {
		to {
			transform: translateX(100%);
		}
	}

	.sidebar-bones {
		position: absolute;
		right: var(--space-md);
		bottom: calc(var(--bottom-nav-height, 64px) + 10px);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		align-items: center;
	}

	.bone-circle {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.06);
	}

	.overlay-bones {
		position: absolute;
		bottom: var(--bottom-nav-height, 64px);
		left: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.bone-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.bone-avatar {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.06);
	}

	.bone-text {
		height: 12px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.06);
	}

	.bone-text.short {
		height: 10px;
	}
</style>
