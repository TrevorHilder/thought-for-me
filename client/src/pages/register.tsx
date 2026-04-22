import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useAppStore } from "@/lib/appStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { useState } from "react";
import { useHashLocation } from "wouter/use-hash-location";

const registerSchema = z
  .object({
    email: z.string().email("Please enter a valid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterData = z.infer<typeof registerSchema>;

function StarMark() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="mx-auto mb-4 text-primary"
    >
      <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <path
        d="M14 4 L15.5 10.5 L22 8 L17.5 13 L24 14 L17.5 15 L22 20 L15.5 17.5 L14 24 L12.5 17.5 L6 20 L10.5 15 L4 14 L10.5 13 L6 8 L12.5 10.5 Z"
        fill="currentColor"
        opacity="0.85"
      />
      <circle cx="14" cy="14" r="2" fill="hsl(var(--background))" />
    </svg>
  );
}

export default function Register() {
  const { setUser } = useAuth();
  const { register: storeRegister } = useAppStore();
  const [, navigate] = useHashLocation();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const form = useForm<RegisterData>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterData) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const user = await storeRegister(data.email, data.password);
      // If Supabase returns a session immediately (email confirmation disabled),
      // set the user and navigate. Otherwise the onAuthStateChange listener in
      // auth.tsx will handle it when the user confirms their email.
      if (user.id) {
        setUser({ id: user.id, email: user.email });
        // Don't call navigate() — AppRouter re-renders automatically
        // when user state is set, switching to the Thread without a page reload.
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Registration failed — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <StarMark />
        <h1
          className="text-center mb-1"
          style={{ fontFamily: "Lora, Georgia, serif", fontSize: "1.5rem", fontWeight: 500 }}
        >
          A Thought for Me
        </h1>
        <p className="text-center text-muted-foreground text-sm mb-8">
          Begin your daily practice
        </p>

        <Card className="border-card-border shadow-md">
          <CardHeader className="pb-4">
            <h2 className="text-base font-semibold">Create your account</h2>
          </CardHeader>
          <CardContent>
            {errorMsg && (
              <div
                data-testid="error-banner"
                className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive"
              >
                {errorMsg}
              </div>
            )}

            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
              data-testid="form-register"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  data-testid="input-email"
                  placeholder="you@example.com"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  data-testid="input-password"
                  {...form.register("password")}
                />
                {form.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  data-testid="input-confirm-password"
                  {...form.register("confirmPassword")}
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                data-testid="button-submit-register"
                className="w-full mt-1"
              >
                {loading ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="pt-0">
            <p className="text-sm text-muted-foreground text-center w-full">
              Already have an account?{" "}
              <Link href="/" data-testid="link-login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>

      <footer className="mt-12 text-center">
        <a
          href="https://www.perplexity.ai/computer"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Created with Perplexity Computer
        </a>
      </footer>
    </div>
  );
}
