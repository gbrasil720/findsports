import { useEffect } from "react";

const NAV_OFFSET = 80;

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function animateScroll(targetY: number, duration: number) {
	const startY = window.scrollY;
	const distance = targetY - startY;
	let startTime: number | null = null;

	function step(timestamp: number) {
		if (!startTime) startTime = timestamp;
		const elapsed = timestamp - startTime;
		const progress = Math.min(elapsed / duration, 1);
		window.scrollTo(0, startY + distance * easeInOutCubic(progress));
		if (elapsed < duration) requestAnimationFrame(step);
	}

	requestAnimationFrame(step);
}

export function useSmoothScroll(duration = 900) {
	useEffect(() => {
		function handleClick(e: MouseEvent) {
			const anchor = (e.target as Element).closest("a[href^='#']");
			if (!anchor) return;
			const href = anchor.getAttribute("href");
			if (!href) return;
			const id = href.slice(1);
			const target = id
				? document.getElementById(id)
				: document.documentElement;
			if (!target) return;
			e.preventDefault();
			const top = id
				? target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET
				: 0;
			animateScroll(top, duration);
		}

		document.addEventListener("click", handleClick);
		return () => document.removeEventListener("click", handleClick);
	}, [duration]);
}
