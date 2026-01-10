import { MFASettings } from '@/components/auth/MFASettings';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { User, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const SecuritySettings = () => {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Security Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account security and authentication methods
          </p>
        </div>

        <Separator />

        {/* Account Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <User className="h-6 w-6 text-muted-foreground" />
              <div>
                <CardTitle>Account</CardTitle>
                <CardDescription>Your account information</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{user?.email}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2FA Settings */}
        <MFASettings />
      </div>
    </DashboardLayout>
  );
};

export default SecuritySettings;
