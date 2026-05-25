import { Logo } from "./logo";

export function Footer() {
	return (
		<footer className="border-zinc-100 border-t px-6 py-14 md:px-8">
			<div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
				<div className="flex items-center gap-2.5">
					<Logo className="size-7" />
					<span className="font-bold font-heading">FindSports</span>
				</div>
				<p className="font-mono text-xs text-zinc-400 uppercase tracking-widest">
					© {new Date().getFullYear()} FindSports • Feito por torcedores, pra
					torcedores
				</p>
				<div className="flex gap-5 text-xs text-zinc-500">
					<a href="#" className="hover:text-black">
						Instagram
					</a>
					<a href="#" className="hover:text-black">
						Twitter
					</a>
					<a href="#" className="hover:text-black">
						Contato
					</a>
				</div>
			</div>
		</footer>
	);
}
