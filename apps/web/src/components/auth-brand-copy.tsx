interface AuthBrandCopyProps {
	role: 'fan' | 'pub'
}

const COPY = {
	fan: {
		badge: '● Acesso antecipado',
		badgeColor: 'text-brand-blue',
		title: (
			<>
				NUNCA MAIS
				<br />
				<span className="text-brand-blue">PERCA UM GOL.</span>
			</>
		),
		description:
			'Cadastre-se e descubra qual bar está passando o seu jogo favorito, em tempo real.',
		benefits: [
			'Encontre bares com seu jogo ao vivo',
			'Saiba se o bar está cheio antes de sair de casa',
			'Notificações antes do apito',
		],
		checkColor: 'bg-brand-orange/20 text-brand-orange',
	},
	pub: {
		badge: '● Acesso antecipado',
		badgeColor: 'text-brand-blue',
		title: (
			<>
				LOTE O SEU BAR
				<br />
				<span className="text-brand-blue">EM TODO JOGO.</span>
			</>
		),
		description:
			'Cadastre seu bar e apareça para torcedores que procuram onde assistir ao jogo — em tempo real.',
		benefits: [
			'Apareça na busca de torcedores',
			'Atualize quais jogos você está exibindo',
			'Receba clientes nos horários certos',
		],
		checkColor: 'bg-brand-blue/20 text-brand-blue',
	},
} as const

export function AuthBrandCopy({ role }: AuthBrandCopyProps) {
	const c = COPY[role]

	return (
		<>
			<div
				className={`mb-3 font-mono text-[10px] uppercase tracking-[0.3em] ${c.badgeColor}`}
			>
				{c.badge}
			</div>
			<h2 className="mb-6 font-bold font-heading text-4xl text-white leading-[0.9] tracking-tight xl:text-5xl">
				{c.title}
			</h2>
			<p className="max-w-xs text-base text-zinc-400 leading-relaxed">
				{c.description}
			</p>
			<ul className="mt-10 flex flex-col gap-3">
				{c.benefits.map((item) => (
					<li key={item} className="flex items-center gap-3 text-sm text-zinc-400">
						<span
							className={`flex size-5 shrink-0 items-center justify-center rounded-full font-bold text-xs ${c.checkColor}`}
						>
							✓
						</span>
						{item}
					</li>
				))}
			</ul>
		</>
	)
}
