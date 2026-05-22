import {
	Field,
	FieldError,
	FieldLabel,
} from "@findsports_oficial/ui/components/field";
import { Input } from "@findsports_oficial/ui/components/input";
import type { FieldApi } from "@tanstack/react-form";

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

	return (
		<Field data-invalid={hasErrors || undefined}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			<Input
				id={field.name}
				name={field.name}
				type={type}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={(e) => field.handleChange(e.target.value)}
				aria-invalid={hasErrors || undefined}
			/>
			<FieldError errors={field.state.meta.errors} />
		</Field>
	);
}
