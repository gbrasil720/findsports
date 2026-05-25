import {
	Field,
	FieldError,
	FieldLabel,
} from "@findsports_oficial/ui/components/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@findsports_oficial/ui/components/input-group";
import { Input } from "@findsports_oficial/ui/components/input";
import type { FieldApi } from "@tanstack/react-form";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface AuthFormFieldProps {
	label: string;
	type?: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	field: FieldApi<any, any, any, any, any>;
}

export function AuthFormField({
	label,
	type = "text",
	field,
}: AuthFormFieldProps) {
	const hasErrors = field.state.meta.errors.length > 0;
	const [showPassword, setShowPassword] = useState(false);
	const isPassword = type === "password";

	return (
		<Field data-invalid={hasErrors || undefined}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			{isPassword ? (
				<InputGroup>
					<InputGroupInput
						id={field.name}
						name={field.name}
						type={showPassword ? "text" : "password"}
						value={field.state.value}
						onBlur={field.handleBlur}
						onChange={(e) => field.handleChange(e.target.value)}
						aria-invalid={hasErrors || undefined}
					/>
					<InputGroupAddon align="inline-end">
						<InputGroupButton
							size="icon-xs"
							onClick={() => setShowPassword((v) => !v)}
							aria-label={showPassword ? "Hide password" : "Show password"}
						>
							{showPassword ? (
								<EyeOff className="size-3.5 text-muted-foreground" />
							) : (
								<Eye className="size-3.5 text-muted-foreground" />
							)}
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
			) : (
				<Input
					id={field.name}
					name={field.name}
					type={type}
					value={field.state.value}
					onBlur={field.handleBlur}
					onChange={(e) => field.handleChange(e.target.value)}
					aria-invalid={hasErrors || undefined}
				/>
			)}
			<FieldError errors={field.state.meta.errors} />
		</Field>
	);
}
