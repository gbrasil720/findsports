const ITEMS = [
	{
		q: "O FindSports é gratuito pra torcedor?",
		a: "Sim, 100% gratuito. Você só precisa do app pra achar o bar e o jogo certos.",
	},
	{
		q: "Quando vocês lançam?",
		a: "Estamos em pré-lançamento. Quem entra na lista de espera recebe acesso antecipado nas primeiras cidades.",
	},
	{
		q: "Como vocês garantem que o jogo está mesmo passando no bar?",
		a: "Os bares cadastram e atualizam sua própria grade em tempo real. A comunidade também ajuda a confirmar transmissões e manter o catálogo preciso.",
	},
	{
		q: "Sou dono de bar. Quanto custa?",
		a: "Durante a fase inicial é grátis pros bares parceiros. Quem entra agora trava condições especiais no lançamento.",
	},
	{
		q: "Em quais cidades vocês começam?",
		o: "Começamos pelas capitais com maior demanda da lista de espera. Quanto mais gente da sua cidade se inscrever, mais cedo chegamos aí.",
	},
];

export function Faq() {
	return (
		<section className="bg-zinc-50 py-24 md:py-32">
			<div className="mx-auto max-w-3xl px-6 md:px-8">
				<div className="mb-12 text-center">
					<span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.3em]">
						Dúvidas frequentes
					</span>
					<h2 className="mt-3 font-bold font-heading text-4xl md:text-5xl">
						PERGUNTAS?
					</h2>
				</div>
				<div className="space-y-3">
					{ITEMS.map((item, i) => (
						<details
							key={item.q}
							className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white"
						>
							<summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 font-bold">
								<span>{item.q}</span>
								<span className="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-100 font-bold text-brand-orange text-lg transition-transform group-open:rotate-45">
									+
								</span>
							</summary>
							<p className="px-6 pb-6 text-zinc-600 leading-relaxed">
								{item.a ?? item.o}
							</p>
						</details>
					))}
				</div>
			</div>
		</section>
	);
}
