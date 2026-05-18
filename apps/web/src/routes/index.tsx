import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { DualAudience } from "@/components/landing/dual-audience";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Nav } from "@/components/landing/navbar";
import { Ticker } from "@/components/landing/ticker";
import { WaitlistForm } from "@/components/landing/waitlist-form";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "FindSports — Ache o bar que está passando seu jogo" },
			{
				name: "description",
				content:
					"FindSports conecta torcedores aos bares e pubs que estão transmitindo o jogo que você quer assistir. Entre na lista de espera.",
			},
			{
				property: "og:title",
				content: "FindSports — Ache o bar que está passando seu jogo",
			},
			{
				property: "og:description",
				content:
					"Conecte-se com bares que estão passando o jogo certo. Lista de espera aberta.",
			},
			{ property: "og:type", content: "website" },
			{ name: "twitter:card", content: "summary_large_image" },
		],
	}),
	component: Landing,
});

function Landing() {
	return (
		<div className="min-h-screen bg-white font-body text-foreground">
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
