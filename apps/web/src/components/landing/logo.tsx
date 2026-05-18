import logo from "../../../public/findsports-logo.png";

export function Logo({ className = "size-10" }: { className?: string }) {
	return (
		<img
			src={logo}
			alt="FindSports"
			className={className}
			width={48}
			height={48}
		/>
	);
}
