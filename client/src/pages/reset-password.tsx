import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useHashLocation } from "wouter/use-hash-location";

export default function ResetPassword() {
  const { setUser } = useAuth();
  const [, navigate] = useHashLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase sends the user to this page with a session already established
  // via the URL fragment — onAuthStateChange picks it up automatically.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        // Session is ready — user can now set a new password
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email ?? "" });
      }
      setDone(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not update password — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <Card className="border-card-border shadow-md">
          <CardHeader className="pb-4">
            <h2 className="text-base font-semibold text-foreground">Set a new password</h2>
          </CardHeader>
          <CardContent>
            {done ? (
              <p className="text-sm text-muted-foreground">
                Password updated — signing you in…
              </p>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                {errorMsg && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    {errorMsg}
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    data-testid="input-new-password"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button type="submit" disabled={loading || !password || !confirm} className="w-full">
                  {loading ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
