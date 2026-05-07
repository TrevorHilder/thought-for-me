import { useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import ReviewPage from "@/pages/ReviewPage";
import NotFound from "@/pages/not-found";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen } from "lucide-react";

// Password stored as a constant — the Passage Reviewer is a private admin tool.
const ADMIN_PASSWORD = "oWi3XTkHSWgfFTOVcpSAbQ";

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      onLogin();
    } else {
      setError("Incorrect password.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 px-6">
        <div className="flex flex-col items-center gap-3">
          <BookOpen className="h-8 w-8 text-primary" />
          <h1 className="text-lg font-semibold text-foreground font-sans">Passage Reviewer</h1>
          <p className="text-sm text-muted-foreground font-sans text-center">Enter the admin password to continue.</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="font-sans"
            autoFocus
            data-testid="input-password"
          />
          {error && <p className="text-sm text-destructive font-sans">{error}</p>}
          <Button type="submit" className="w-full font-sans" disabled={!password}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      {!authed ? (
        <LoginScreen onLogin={() => setAuthed(true)} />
      ) : (
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/" component={ReviewPage} />
            <Route component={NotFound} />
          </Switch>
        </Router>
      )}
    </QueryClientProvider>
  );
}
