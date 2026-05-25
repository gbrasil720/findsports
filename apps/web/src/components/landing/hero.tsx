import { Badge } from "@findsports_oficial/ui/components/badge";
import { Separator } from "@findsports_oficial/ui/components/separator";

import heroBar from "../../../public/hero-bar.jpg";

export function Hero() {
	return (
		<header
			id="top"
			className="mx-auto grid max-w-7xl items-center gap-12 px-6 pt-16 pb-20 md:px-8 md:pt-20 md:pb-28 lg:grid-cols-[1.05fr_1fr] lg:gap-16"
		>
			<div>
				<Badge className="mb-6 h-auto rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em]">
					<span className="size-1.5 animate-pulse rounded-full bg-brand-orange" />
					Lista de espera aberta
				</Badge>
				<h1 className="mb-6 font-bold font-heading text-5xl leading-[0.92] tracking-tight sm:text-6xl lg:text-7xl xl:text-[5.5rem]">
					NUNCA MAIS PERCA O{" "}
					<span className="text-brand-orange">APITO INICIAL</span>.
				</h1>
				<p className="mb-10 max-w-xl text-lg text-zinc-600 leading-relaxed md:text-xl">
					O mapa definitivo do torcedor. Descubra em tempo real qual bar está
					passando o seu jogo — e encontre a galera certa pra gritar gol junto.
				</p>
				<div className="flex flex-wrap gap-3">
					<a
						href="#waitlist"
						className="group rounded-full bg-brand-orange px-7 py-4 font-bold text-base text-white shadow-[0_10px_30px_-10px_rgba(255,90,31,0.5)] transition-transform hover:scale-[1.03] md:text-lg"
					>
						Garantir acesso antecipado
						<span className="ml-2 inline-block transition-transform group-hover:translate-x-1">
							→
						</span>
					</a>
					<a
						href="#waitlist"
						className="group rounded-full bg-brand-blue px-7 py-4 font-bold text-base text-white shadow-[0_10px_30px_-10px_rgba(22,104,255,0.5)] transition-transform hover:scale-[1.03] md:text-lg"
					>
						Tenho um bar
						<span className="ml-2 inline-block transition-transform group-hover:translate-x-1">
							→
						</span>
					</a>
				</div>
				<div className="mt-10 flex items-center gap-6 text-xs text-zinc-500">
					<div>
						<div className="font-bold font-heading text-2xl text-black">
							1.800+
						</div>
						<div className="uppercase tracking-widest">torcedores na fila</div>
					</div>
					<Separator orientation="vertical" className="h-10" />
					<div>
						<div className="font-bold font-heading text-2xl text-black">
							100+
						</div>
						<div className="uppercase tracking-widest">bares parceiros</div>
					</div>
				</div>
			</div>

			<div className="relative">
				<div className="absolute inset-x-0 -inset-y-6 rounded-[3rem] bg-gradient-to-br from-brand-orange/20 via-transparent to-brand-blue/20 blur-2xl" />
				<div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-2xl ring-1 ring-black/5">
					<img
						src={heroBar}
						alt="Bar lotado de torcedores assistindo ao jogo em telões"
						width={1280}
						height={1024}
						className="size-full object-cover"
					/>
					<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
					<div className="absolute right-5 bottom-5 left-5 flex items-end justify-between">
						<div className="text-white">
							<div className="mb-1 font-mono text-[10px] text-brand-orange uppercase tracking-[0.25em]">
								● AO VIVO AGORA
							</div>
							<div className="font-bold font-heading text-lg leading-tight">
								Flamengo 2 × 2 Palmeiras
							</div>
							<div className="text-white/70 text-xs">Bar do Zé • 1,2 km</div>
						</div>
						<div className="rounded-full bg-white px-3 py-1.5 font-bold text-[10px] text-black uppercase tracking-widest">
							80% cheio
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}
