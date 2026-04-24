import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useAppStore } from "@/lib/appStore";
import Layout from "@/components/Layout";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const TIMEZONES = [
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Johannesburg",
];

interface PrefForm {
  preferredTime: string;
  timezone: string;
  emailNotifications: boolean;
}

export default function Settings() {
  const { user } = useAuth();
  const { getPrefs, savePrefs, getStats } = useAppStore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const prefs = getPrefs(user.id);
  const stats = getStats(user.id);

  const form = useForm<PrefForm>({
    defaultValues: {
      preferredTime: prefs.preferredTime,
      timezone: prefs.timezone,
      emailNotifications: prefs.emailNotifications,
    },
  });

  // Reset form whenever prefs load from Supabase (not just on user.id change,
  // which can fire before hydrateUser has finished fetching real values)
  useEffect(() => {
    form.reset({
      preferredTime: prefs.preferredTime,
      timezone: prefs.timezone,
      emailNotifications: prefs.emailNotifications,
    });
  }, [prefs.preferredTime, prefs.timezone, prefs.emailNotifications]);

  const onSubmit = (data: PrefForm) => {
    setSaving(true);
    try {
      savePrefs(user.id, data);
      toast({ title: "Settings saved" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="mb-8">
        <h1
          className="text-foreground mb-1"
          style={{ fontFamily: "Lora, Georgia, serif", fontSize: "1.5rem", fontWeight: 500 }}
          data-testid="text-page-title-settings"
        >
          Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Customise your daily delivery preferences
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {/* Account info */}
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <h2 className="text-sm font-semibold">Account</h2>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p
              className="text-sm font-medium text-foreground"
              data-testid="text-user-email"
            >
              {user.email}
            </p>
          </CardContent>
        </Card>

        {/* Delivery preferences */}
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <h2 className="text-sm font-semibold">Delivery Preferences</h2>
          </CardHeader>
          <CardContent className="pt-0">
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-5"
              data-testid="form-settings"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="preferredTime">Preferred delivery time</Label>
                <Input
                  id="preferredTime"
                  type="time"
                  data-testid="input-preferred-time"
                  {...form.register("preferredTime")}
                />
                <p className="text-xs text-muted-foreground">
                  Your thought will be delivered at this time each day
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={form.watch("timezone")}
                  onValueChange={(v) => form.setValue("timezone", v)}
                >
                  <SelectTrigger id="timezone" data-testid="select-timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="emailNotif" className="cursor-pointer">
                    Email notifications
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Receive your daily thought by email (requires Resend integration)
                  </p>
                </div>
                <Switch
                  id="emailNotif"
                  data-testid="switch-email-notifications"
                  checked={form.watch("emailNotifications")}
                  onCheckedChange={(v) => form.setValue("emailNotifications", v)}
                />
              </div>

              <Button
                type="submit"
                disabled={saving}
                data-testid="button-save-settings"
                className="w-full sm:w-auto"
              >
                {saving ? "Saving…" : "Save preferences"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Pool statistics */}
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <h2 className="text-sm font-semibold">Your Progress</h2>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total passages", value: stats.total },
                { label: "Received", value: stats.delivered },
                { label: "Remaining", value: stats.remaining },
                { label: "Favourites", value: stats.favourites },
              ].map((item) => (
                <div key={item.label} className="flex flex-col gap-0.5">
                  <p
                    className="text-xl font-semibold text-foreground"
                    data-testid={`stat-${item.label.toLowerCase().replace(/ /g, "-")}`}
                  >
                    {item.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
