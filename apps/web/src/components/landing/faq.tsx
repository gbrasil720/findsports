import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@findsports_oficial/ui/components/accordion";

const ITEMS = [
	{
		q: "O FindSports é gratuito para torcedores?",
		a: "Sim, totalmente gratuito. Para encontrar o bar certo, confirmar as transmissões e curtir o jogo com quem também entende de futebol, você não paga nada.",
	},
	{
		q: "Quando o FindSports será lançado?",
		a: "O FindSports está em desenvolvimento ativo. Os inscritos na lista de espera recebem acesso prioritário e serão os primeiros notificados quando o lançamento se aproximar.",
	},
	{
		q: "Como garantir que o jogo realmente está passando no bar?",
		a: "Os bares cadastrados mantêm sua grade de transmissões atualizada em tempo real. A própria comunidade de torcedores também confirma as exibições — criando um catálogo preciso, coletivo e confiável.",
	},
	{
		q: "Sou dono de bar. Qual é o custo?",
		a: "O cadastro para bares parceiros é gratuito. Os detalhes do modelo comercial serão divulgados antes do lançamento — quem está na lista de espera é o primeiro a ser informado.",
	},
	{
		q: "Em quais cidades vocês começam?",
		a: "Nas capitais com maior demanda registrada na lista de espera. Cada inscrição da sua cidade conta: quanto mais torcedores e bares se cadastrarem, mais rápido o FindSports chega até você.",
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
