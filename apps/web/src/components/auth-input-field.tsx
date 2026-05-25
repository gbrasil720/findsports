import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from '@findsports_oficial/ui/components/input-group'
import { HugeiconsIcon } from '@hugeicons/react'
import type { AnyFieldApi } from '@tanstack/form-core'

import { AUTH_INPUT_CLASS, AUTH_INPUT_GROUP_CLASS } from '@/lib/auth-styles'

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]['icon']

interface AuthInputFieldProps {
	label: string
	icon: HugeIcon
	field: AnyFieldApi
	id?: string
	type?: string
	placeholder?: string
	autoComplete?: string
	maxLength?: number
	required?: boolean
}

export function AuthInputField({
	label,
	icon,
	field,
	id,
	type,
	placeholder,
	autoComplete,
	maxLength,
	required,
}: AuthInputFieldProps) {
	const resolvedId = id ?? field.name
	const hasErrors = field.state.meta.errors.length > 0

	return (
		<div className="flex flex-col gap-1.5">
			<label
				htmlFor={resolvedId}
				className="font-semibold text-xs text-zinc-700 uppercase tracking-wider"
			>
				{label}
			</label>
			<InputGroup className={AUTH_INPUT_GROUP_CLASS}>
				<InputGroupAddon className="pl-4">
					<HugeiconsIcon
						icon={icon}
						size={16}
						color="currentColor"
						strokeWidth={1.5}
						className="text-zinc-400"
					/>
				</InputGroupAddon>
				<InputGroupInput
					id={resolvedId}
					name={field.name}
					type={type}
					placeholder={placeholder}
					autoComplete={autoComplete}
					maxLength={maxLength}
					required={required}
					value={field.state.value}
					onBlur={field.handleBlur}
					onChange={(e) => field.handleChange(e.target.value)}
					className={AUTH_INPUT_CLASS}
				/>
			</InputGroup>
			{hasErrors && (
				<p className="text-red-500 text-xs">{field.state.meta.errors[0]}</p>
			)}
		</div>
	)
}
