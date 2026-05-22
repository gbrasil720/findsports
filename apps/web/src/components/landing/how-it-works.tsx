const STEPS = [
	{
		n: "01",
		color: "text-brand-orange",
		title: "Escolha seu jogo",
		body: "Selecione esporte, time ou campeonato — da Champions ao clássico estadual.",
	},
	{
		n: "02",
		color: "text-brand-blue",
		title: "Ache o bar certo",
		body: "Veja bares verificados perto de você que estão transmitindo a sua partida.",
	},
	{
		n: "03",
		color: "text-white",
		title: "Sinta o clima",
		body: "Confira lotação, torcida predominante, telões disponíveis e promos da casa.",
	},
];

export function HowItWorks() {
	return (
		<section
			className="bg-black py-24 text-white md:py-32"
			aria-labelledby="how-it-works-title"
		>
			<div className="mx-auto max-w-7xl px-6 md:px-8">
				<div className="mb-16 text-center md:mb-20">
					<span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.3em]">
						Como funciona
					</span>
					<h2
						id="how-it-works-title"
						className="mt-3 font-bold font-heading text-4xl md:text-5xl lg:text-6xl"
					>
						Três <span className="text-brand-orange">etapas</span>. Zero
						estresse.
					</h2>
				</div>
				<div className="grid gap-10 md:grid-cols-3 md:gap-12">
					{STEPS.map((s) => (
						<div
							key={s.n}
							className="flex flex-col gap-4 border-white/10 border-t pt-8"
						>
							<span className={`font-bold font-heading text-6xl ${s.color}`}>
								{s.n}
							</span>
							<h3 className="font-bold text-2xl">{s.title}</h3>
							<p className="text-zinc-400 leading-relaxed">{s.body}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
