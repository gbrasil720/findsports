import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@findsports_oficial/ui/components/accordion";

const ITEMS = [
	{
		q: "O FindSports é gratuito pra torcedor?",
		a: "Sim, 100% gratuito. Você só precisa do app pra achar o bar e o jogo certos.",
	},
	{
		q: "Quando vocês lançam?",
		a: "Estamos em fase de pré-lançamento com chegada prevista em breve nas principais capitais. Quem se inscrever agora recebe acesso prioritário e garante as condições exclusivas da fase inicial.",
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
		a: "Começamos pelas capitais com maior demanda da lista de espera. Quanto mais gente da sua cidade se inscrever, mais cedo chegamos aí.",
	},
];

export function Faq() {
	return (
		<section className="bg-zinc-50 py-24 md:py-32" aria-labelledby="faq-title">
			<div className="mx-auto max-w-3xl px-6 md:px-8">
				<div className="mb-12 text-center">
					<span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.3em]">
						Dúvidas frequentes
					</span>
					<h2 id="faq-title" className="mt-3 font-bold font-heading text-4xl md:text-5xl">
						PERGUNTAS?
					</h2>
				</div>
				<Accordion className="flex flex-col gap-3">
					{ITEMS.map((item) => (
						<AccordionItem
							key={item.q}
							value={item.q}
							className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
						>
							<AccordionTrigger className="p-6 text-sm font-bold hover:no-underline">
								{item.q}
							</AccordionTrigger>
							<AccordionContent className="px-6 pb-6 text-zinc-600 leading-relaxed">
								{item.a}
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			</div>
		</section>
	);
}
