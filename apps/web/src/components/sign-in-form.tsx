import { Button } from "@findsports_oficial/ui/components/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@findsports_oficial/ui/components/card";
import { FieldGroup } from "@findsports_oficial/ui/components/field";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import { AuthFormField } from "./auth-form-field";
import Loader from "./loader";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/dashboard",
            });
            toast.success("Sign in successful");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <Card className="mx-auto mt-10 w-full max-w-md rounded-xl">
      <CardHeader>
        <CardTitle className="text-center text-3xl font-bold">Welcome Back</CardTitle>
      </CardHeader>

      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <form.Field name="email">
              {(field) => <AuthFormField label="Email" type="email" field={field} />}
            </form.Field>

            <form.Field name="password">
              {(field) => <AuthFormField label="Password" type="password" field={field} />}
            </form.Field>
          </FieldGroup>

          <form.Subscribe
            selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? "Submitting..." : "Sign In"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <Button variant="link" onClick={onSwitchToSignUp}>
          Need an account? Sign Up
        </Button>
      </CardFooter>
    </Card>
  );
}
