import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

export function WaitlistForm() {
	// const submit = useServerFn(submitWaitlist);
	// const navigate = useNavigate();
	const [role, setRole] = useState<"fan" | "pub">("fan");
	// const [loading, setLoading] = useState(false);
	// const [errors, setErrors] = useState<Record<string, string>>({});

	// async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
	// 	e.preventDefault();
	// 	setErrors({});
	// 	const fd = new FormData(e.currentTarget);
	// 	const parsed = waitlistSchema.safeParse({
	// 		name: fd.get("name"),
	// 		email: fd.get("email"),
	// 		role,
	// 	});
	// 	if (!parsed.success) {
	// 		const errs: Record<string, string> = {};
	// 		for (const issue of parsed.error.issues) {
	// 			errs[issue.path.join(".")] = issue.message;
	// 		}
	// 		setErrors(errs);
	// 		return;
	// 	}
	// 	setLoading(true);
	// 	try {
	// 		const result = await submit({ data: parsed.data });
	// 		if (result.ok) {
	// 			navigate({ to: "/thanks", search: { role } });
	// 			return;
	// 		}
	// 		if (result.error === "duplicate") {
	// 			toast.error(
	// 				"Esse e-mail já está na lista — você já garantiu seu lugar!",
	// 			);
	// 		} else {
	// 			toast.error("Algo deu errado. Tente novamente em instantes.");
	// 		}
	// 	} catch (err) {
	// 		console.error(err);
	// 		toast.error("Falha de conexão. Tente novamente.");
	// 	} finally {
	// 		setLoading(false);
	// 	}
	// }

	return (
		<section
			id="waitlist"
			className="bg-gradient-to-b from-white to-zinc-50 px-6 py-24 md:px-8 md:py-32"
		>
			<div className="mx-auto max-w-2xl">
				<div className="mb-10 text-center md:mb-12">
					<span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.3em]">
						Lista de espera
					</span>
					<h2 className="mt-3 mb-4 font-bold font-heading text-4xl md:text-5xl">
						ENTRE NO TIME TITULAR.
					</h2>
					<p className="text-zinc-600 md:text-lg">
						Seja avisado em primeira mão quando o FindSports chegar na sua
						cidade.
					</p>
				</div>

				<form className="space-y-5" noValidate>
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<input
								type="text"
								name="name"
								placeholder="Seu nome completo"
								autoComplete="name"
								maxLength={100}
								className="w-full rounded-xl border-2 border-zinc-200 bg-white px-6 py-4 outline-none transition-colors focus:border-brand-orange focus:ring-0"
								// aria-invalid={!!errors.name}
							/>
							{/* {errors.name && (
								<p className="mt-1.5 text-destructive text-xs">{errors.name}</p>
							)} */}
						</div>
						<div>
							<input
								type="email"
								name="email"
								placeholder="seu@email.com"
								autoComplete="email"
								maxLength={255}
								className="w-full rounded-xl border-2 border-zinc-200 bg-white px-6 py-4 outline-none transition-colors focus:border-brand-orange focus:ring-0"
								// aria-invalid={!!errors.email}
							/>
							{/* {errors.email && (
								<p className="mt-1.5 text-destructive text-xs">
									{errors.email}
								</p>
							)} */}
						</div>
					</div>

					<div className="relative grid grid-cols-2 rounded-xl bg-zinc-100 p-1">
						<button
							type="button"
							onClick={() => setRole("fan")}
							className={`relative rounded-lg px-4 py-3 font-bold text-sm uppercase tracking-wider transition-all ${
								role === "fan"
									? "bg-white text-brand-orange shadow-sm"
									: "text-zinc-500 hover:text-zinc-700"
							}`}
						>
							Sou Torcedor
						</button>
						<button
							type="button"
							onClick={() => setRole("pub")}
							className={`relative rounded-lg px-4 py-3 font-bold text-sm uppercase tracking-wider transition-all ${
								role === "pub"
									? "bg-white text-brand-blue shadow-sm"
									: "text-zinc-500 hover:text-zinc-700"
							}`}
						>
							Tenho um Bar
						</button>
					</div>

					<button
						type="submit"
						// disabled={loading}
						className="w-full rounded-xl bg-black py-5 font-bold text-sm text-white uppercase tracking-[0.2em] transition-colors hover:bg-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
					>
						{/* {loading ? "Garantindo seu lugar..." : "Garantir acesso antecipado"} */}
						Garantir acesso antecipado
					</button>

					<p className="text-center text-xs text-zinc-500">
						Sem spam. Só te avisamos quando rolar.
					</p>
				</form>
			</div>
		</section>
	);
}
