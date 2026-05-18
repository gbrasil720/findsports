import { Logo } from "./logo";

export function Nav() {
	return (
		<nav className="sticky top-0 z-40 border-black/5 border-b bg-white/80 backdrop-blur-md">
			<div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-8">
				<a href="#top" className="flex items-center gap-2.5">
					<Logo className="size-9" />
					<span className="font-bold font-heading text-xl tracking-tight">
						FindSports
					</span>
				</a>
				<div className="hidden items-center gap-8 font-semibold text-sm uppercase tracking-wider md:flex">
					<a
						href="#torcedores"
						className="transition-colors hover:text-brand-orange"
					>
						Para Torcedores
					</a>
					<a href="#bares" className="transition-colors hover:text-brand-blue">
						Para Bares
					</a>
					<a
						href="#waitlist"
						className="rounded-full bg-black px-5 py-2.5 text-white normal-case tracking-normal transition-colors hover:bg-brand-orange"
					>
						Entrar na lista
					</a>
				</div>
				<a
					href="#waitlist"
					className="rounded-full bg-black px-4 py-2 font-bold text-white text-xs md:hidden"
				>
					Entrar
				</a>
			</div>
		</nav>
	);
}
