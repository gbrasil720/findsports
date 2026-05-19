import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useSmoothScroll } from "@/hooks/use-smooth-scroll";
import { DualAudience } from "@/components/landing/dual-audience";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Nav } from "@/components/landing/navbar";
import { Ticker } from "@/components/landing/ticker";
import { WaitlistForm } from "@/components/landing/waitlist-form";

const HOMEPAGE_SCHEMA = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "FindSports",
	applicationCategory: "LifestyleApplication",
	operatingSystem: "Web",
	description:
		"FindSports conecta torcedores brasileiros aos bares e pubs que estão transmitindo o jogo que você quer assistir.",
	url: "https://findsports.com.br",
	inLanguage: "pt-BR",
	offers: {
		"@type": "Offer",
		price: "0",
		priceCurrency: "BRL",
	},
	audience: {
		"@type": "Audience",
		audienceType: "Torcedores e bares esportivos no Brasil",
	},
};

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "FindSports — Ache o bar que está passando seu jogo" },
			{
				name: "description",
				content:
					"FindSports conecta torcedores brasileiros aos bares e pubs que estão transmitindo o jogo que você quer assistir. Encontre o bar certo para torcer ao vivo. Entre na lista de espera.",
			},
			{ name: "robots", content: "index, follow" },
			// Open Graph
			{
				property: "og:title",
				content: "FindSports — Ache o bar que está passando seu jogo",
			},
			{
				property: "og:description",
				content:
					"Conecte torcedores brasileiros aos bares e pubs que estão transmitindo o jogo certo. Encontre o lugar ideal para assistir futebol ao vivo. Lista de espera aberta.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: "https://findsports.com.br/" },
			{
				property: "og:image",
				content: "https://findsports.com.br/og-image.png",
			},
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ property: "og:site_name", content: "FindSports" },
			{ property: "og:locale", content: "pt_BR" },
			// Twitter Card
			{ name: "twitter:card", content: "summary_large_image" },
			{
				name: "twitter:title",
				content: "FindSports — Ache o bar que está passando seu jogo",
			},
			{
				name: "twitter:description",
				content:
					"Conecte torcedores brasileiros aos bares e pubs que estão transmitindo o jogo certo. Lista de espera aberta.",
			},
			{
				name: "twitter:image",
				content: "https://findsports.com.br/og-image.png",
			},
		],
		links: [
			{ rel: "canonical", href: "https://findsports.com.br/" },
		],
	}),
	component: Landing,
});

function StructuredData({ schema }: { schema: object }) {
	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: structured data is static and safe
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
}

function Landing() {
	useSmoothScroll(900);
	return (
		<div className="min-h-screen overflow-x-hidden bg-white font-body text-foreground">
			<StructuredData schema={HOMEPAGE_SCHEMA} />
			<Nav />
			<Ticker />
			<main>
				<Hero />
				<HowItWorks />
				<DualAudience />
				<WaitlistForm />
				<Faq />
			</main>
			<Footer />
			<Toaster position="top-center" richColors />
		</div>
	);
}
