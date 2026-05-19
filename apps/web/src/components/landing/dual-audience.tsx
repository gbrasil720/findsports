function Check({ color }: { color: string }) {
	return (
		<span
			className={`size-5 rounded-full ${color} flex shrink-0 items-center justify-center font-bold text-white text-xs`}
		>
			✓
		</span>
	);
}

export function DualAudience() {
	return (
		<section className="grid md:grid-cols-2">
			<div
				id="torcedores"
				className="flex flex-col justify-center border-black/5 border-b bg-brand-orange/5 p-10 md:border-r md:border-b-0 md:p-16 lg:p-20"
			>
				<span className="mb-4 font-bold text-brand-orange text-xs uppercase tracking-[0.25em]">
					Para torcedores
				</span>
				<h2 className="mb-6 font-bold font-heading text-4xl leading-tight md:text-5xl">
					Barulho de bar é melhor que silêncio de sofá.
				</h2>
				<ul className="mb-8 flex flex-col gap-4 text-base md:text-lg">
					<li className="flex items-center gap-3">
						<Check color="bg-brand-orange" /> Busca por partida específica, não
						só por esporte
					</li>
					<li className="flex items-center gap-3">
						<Check color="bg-brand-orange" /> Filtre por som no jogo, narração
						ao vivo ou clima família
					</li>
					<li className="flex items-center gap-3">
						<Check color="bg-brand-orange" /> Reserve mesa pra galera antes do
						apito
					</li>
					<li className="flex items-center gap-3">
						<Check color="bg-brand-orange" /> Mapa em tempo real com lotação
						atualizada
					</li>
				</ul>
				<a
					href="#waitlist"
					className="self-start rounded-full bg-brand-orange px-6 py-3 font-bold text-white transition-transform hover:scale-105"
				>
					Entrar na lista de torcedores
				</a>
			</div>

			<div
				id="bares"
				className="flex flex-col justify-center bg-brand-blue/5 p-10 md:p-16 lg:p-20"
			>
				<span className="mb-4 font-bold text-brand-blue text-xs uppercase tracking-[0.25em]">
					Para bares & pubs
				</span>
				<h2 className="mb-6 font-bold font-heading text-4xl leading-tight md:text-5xl">
					Lote suas mesas até nas terças de chuva.
				</h2>
				<ul className="mb-8 flex flex-col gap-4 text-base md:text-lg">
					<li className="flex items-center gap-3">
						<Check color="bg-brand-blue" /> Atraia torcedores do time certo, no
						jogo certo
					</li>
					<li className="flex items-center gap-3">
						<Check color="bg-brand-blue" /> Publique sua grade semanal de
						transmissões
					</li>
					<li className="flex items-center gap-3">
						<Check color="bg-brand-blue" /> Receba reservas direto pelo app
					</li>
					<li className="flex items-center gap-3">
						<Check color="bg-brand-blue" /> Painel com analytics de público e
						horários
					</li>
				</ul>
				<a
					href="#waitlist"
					className="self-start rounded-full bg-brand-blue px-6 py-3 font-bold text-white transition-transform hover:scale-105"
				>
					Cadastrar meu bar
				</a>
			</div>
		</section>
	);
}
