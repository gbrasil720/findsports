import type { AppRouter } from "@findsports_oficial/api/routers/index";
import { Toaster } from "@findsports_oficial/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

import appCss from "../index.css?url";
export interface RouterAppContext {
	trpc: TRPCOptionsProxy<AppRouter>;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "FindSports — Ache o bar que está passando seu jogo" },
			{
				name: "description",
				content:
					"FindSports conecta torcedores brasileiros aos bares e pubs que estão transmitindo o jogo que você quer assistir. Encontre o lugar certo para torcer.",
			},
			{ name: "author", content: "FindSports" },
			{ name: "theme-color", content: "#FF5A1F" },
			// Open Graph fallbacks (overridden per route)
			{ property: "og:site_name", content: "FindSports" },
			{ property: "og:type", content: "website" },
			{
				property: "og:title",
				content: "FindSports — Ache o bar que está passando seu jogo",
			},
			{
				property: "og:description",
				content:
					"Conecte torcedores brasileiros aos bares que estão transmitindo o jogo certo. Encontre o lugar ideal para assistir futebol.",
			},
			{
				property: "og:image",
				content: "https://findsports.com.br/og-image.png",
			},
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ property: "og:url", content: "https://findsports.com.br/" },
			// Twitter Card fallbacks (overridden per route)
			{ name: "twitter:card", content: "summary_large_image" },
			{
				name: "twitter:title",
				content: "FindSports — Ache o bar que está passando seu jogo",
			},
			{
				name: "twitter:description",
				content:
					"Conecte torcedores brasileiros aos bares que estão transmitindo o jogo certo. Encontre o lugar ideal para assistir futebol.",
			},
			{
				name: "twitter:image",
				content: "https://findsports.com.br/og-image.png",
			},
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.ico", sizes: "any" },
			{ rel: "icon", type: "image/png", href: "/findsports-logo.png" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap",
			},
		],
	}),
  shellComponent: RootShell,
  component: RootDocument,
});

function RootDocument() {
	return (
		<html lang="pt-BR">
			<head>
				<HeadContent />
			</head>
			<body>
				<div className="grid min-h-svh grid-rows-[auto_1fr]">
					<Outlet />
				</div>
				<Toaster richColors />
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
				<Scripts />
			</body>
		</html>
	);
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
