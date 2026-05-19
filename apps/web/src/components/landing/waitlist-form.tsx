import { Button } from "@findsports_oficial/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@findsports_oficial/ui/components/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@findsports_oficial/ui/components/field";
import { Input } from "@findsports_oficial/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@findsports_oficial/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { formatPhone } from "../../utils/format-phone";
import { useTRPCClient } from "../../utils/trpc";

const COUNTRIES = [
	{ code: "BR", name: "Brasil", dial: "+55", flag: "🇧🇷" },
	{ code: "US", name: "Estados Unidos", dial: "+1", flag: "🇺🇸" },
	{ code: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹" },
	{ code: "AR", name: "Argentina", dial: "+54", flag: "🇦🇷" },
	{ code: "CL", name: "Chile", dial: "+56", flag: "🇨🇱" },
	{ code: "CO", name: "Colômbia", dial: "+57", flag: "🇨🇴" },
	{ code: "MX", name: "México", dial: "+52", flag: "🇲🇽" },
	{ code: "UY", name: "Uruguai", dial: "+598", flag: "🇺🇾" },
	{ code: "PE", name: "Peru", dial: "+51", flag: "🇵🇪" },
	{ code: "ES", name: "Espanha", dial: "+34", flag: "🇪🇸" },
	{ code: "DE", name: "Alemanha", dial: "+49", flag: "🇩🇪" },
	{ code: "FR", name: "França", dial: "+33", flag: "🇫🇷" },
	{ code: "IT", name: "Itália", dial: "+39", flag: "🇮🇹" },
	{ code: "GB", name: "Reino Unido", dial: "+44", flag: "🇬🇧" },
	{ code: "CA", name: "Canadá", dial: "+1", flag: "🇨🇦" },
	{ code: "AU", name: "Austrália", dial: "+61", flag: "🇦🇺" },
	{ code: "JP", name: "Japão", dial: "+81", flag: "🇯🇵" },
	{ code: "IN", name: "Índia", dial: "+91", flag: "🇮🇳" },
	{ code: "ZA", name: "África do Sul", dial: "+27", flag: "🇿🇦" },
] as const;

export function WaitlistForm() {
	const [role, setRole] = useState<"fan" | "pub">("fan");
	const [success, setSuccess] = useState(false);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
	const [phoneDigits, setPhoneDigits] = useState("");

	const client = useTRPCClient();

	const { mutate, isPending } = useMutation({
		mutationFn: (data: { name: string; email: string; role: "fan" | "pub"; phone?: string }) =>
			client.waitlist.join.mutate(data),
		onSuccess: () => {
			setSuccess(true);
			setErrorMsg(null);
		},
		onError: (err: Error) => {
			setErrorMsg(err.message);
		},
	});

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setErrorMsg(null);

		const form = e.currentTarget;
		const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
		const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();

		if (!name || !email) return;

		const phone = phoneDigits ? `${selectedCountry.dial}${phoneDigits}` : undefined;

		mutate({ name, email, role, phone });
	}

	return (
		<section
			id="waitlist"
			className="bg-gradient-to-b from-white to-zinc-50 px-6 py-24 md:px-8 md:py-32"
			aria-labelledby="waitlist-title"
		>
			<div className="mx-auto max-w-2xl">
				<div className="mb-10 text-center md:mb-12">
					<span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.3em]">
						Lista de espera
					</span>
					<h2 id="waitlist-title" className="mt-3 mb-4 font-bold font-heading text-4xl md:text-5xl">
						ENTRE NO TIME TITULAR.
					</h2>
					<p className="text-zinc-600 md:text-lg">
						Mais de 1.800 torcedores já reservaram sua vaga. Acesso antecipado
						e condições exclusivas para quem entrar agora.
					</p>
				</div>

				{success ? (
					<div className="rounded-xl bg-zinc-100 py-8 px-6 text-center">
						<p className="font-bold text-zinc-800 text-lg mb-2">Você está no time!</p>
						<p className="text-sm text-zinc-500">
							Compartilhe com torcedores da sua cidade — quanto mais pessoas se
							inscreverem, mais rápido chegamos até você.
						</p>
					</div>
				) : (
					<form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
						<FieldGroup>
							<div className="grid gap-4 md:grid-cols-2">
								<Field>
									<FieldLabel className="sr-only">Nome completo</FieldLabel>
									<Input
										type="text"
										name="name"
										placeholder="Seu nome completo"
										autoComplete="name"
										maxLength={100}
										required
										className="h-auto w-full rounded-xl border-2 border-zinc-200 bg-white px-6 py-4 text-sm md:text-sm outline-none transition-colors focus:border-brand-orange focus:ring-0"
									/>
								</Field>
								<Field>
									<FieldLabel className="sr-only">E-mail</FieldLabel>
									<Input
										type="email"
										name="email"
										placeholder="seu@email.com"
										autoComplete="email"
										maxLength={255}
										required
										className="h-auto w-full rounded-xl border-2 border-zinc-200 bg-white px-6 py-4 text-sm md:text-sm outline-none transition-colors focus:border-brand-orange focus:ring-0"
									/>
								</Field>
							</div>
						</FieldGroup>

						<Field>
							<FieldLabel className="sr-only">Telefone (opcional)</FieldLabel>
							<div className="flex overflow-hidden rounded-xl border-2 border-zinc-200 bg-white transition-colors focus-within:border-brand-orange">
								<DropdownMenu>
									<DropdownMenuTrigger className="flex shrink-0 cursor-pointer items-center gap-1.5 border-r-2 border-zinc-200 bg-zinc-50 px-4 py-4 text-sm font-medium transition-colors hover:bg-zinc-100 focus:outline-none">
										<span>{selectedCountry.flag}</span>
										<span className="text-zinc-600">{selectedCountry.dial}</span>
										<ChevronDownIcon className="size-3 text-zinc-400" />
									</DropdownMenuTrigger>
									<DropdownMenuContent className="w-72 max-h-60">
										{COUNTRIES.map((country) => (
											<DropdownMenuItem
												key={country.code}
												onClick={() => setSelectedCountry(country)}
											>
												<span>{country.flag}</span>
												<span className="flex-1">{country.name}</span>
												<span className="text-zinc-400">{country.dial}</span>
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
								<input
									type="tel"
									name="phone"
									placeholder="(11) 9 1234-5678"
									autoComplete="tel-national"
									value={formatPhone(phoneDigits, selectedCountry.code)}
									onChange={(e) => {
										const max = selectedCountry.code === "BR" ? 11 : 15;
										setPhoneDigits(e.target.value.replace(/\D/g, "").slice(0, max));
									}}
									className="min-w-0 flex-1 bg-transparent px-4 py-4 text-sm outline-none placeholder:text-zinc-400"
								/>
							</div>
						</Field>

						<ToggleGroup
							value={[role]}
							onValueChange={(values) => {
								if (values.length > 0) setRole(values[values.length - 1] as "fan" | "pub");
							}}
							className="relative grid w-full grid-cols-2 rounded-xl bg-zinc-100 p-1"
						>
							<ToggleGroupItem
								value="fan"
								className="relative rounded-lg px-4 py-3 font-bold text-sm uppercase tracking-wider text-zinc-500 transition-all hover:text-zinc-700 aria-pressed:bg-white aria-pressed:text-brand-orange aria-pressed:shadow-sm"
							>
								Sou Torcedor
							</ToggleGroupItem>
							<ToggleGroupItem
								value="pub"
								className="relative rounded-lg px-4 py-3 font-bold text-sm uppercase tracking-wider text-zinc-500 transition-all hover:text-zinc-700 aria-pressed:bg-white aria-pressed:text-brand-blue aria-pressed:shadow-sm"
							>
								Tenho um Bar
							</ToggleGroupItem>
						</ToggleGroup>

						{errorMsg && (
							<p className="text-center text-sm text-red-500">{errorMsg}</p>
						)}

						<Button
							type="submit"
							disabled={isPending}
							className="w-full rounded-xl bg-black py-5 font-bold text-sm text-white uppercase tracking-[0.2em] transition-colors hover:bg-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
						>
							{isPending ? "Aguarde..." : "Garantir acesso antecipado"}
						</Button>

						<p className="text-center text-xs text-zinc-500">
							Mais de 1.800 torcedores já na fila · Sem spam · Um e-mail no lançamento
						</p>
					</form>
				)}
			</div>
		</section>
	);
}
