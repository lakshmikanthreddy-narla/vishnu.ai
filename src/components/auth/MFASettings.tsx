import { useState, useEffect } from 'react';
import { useMFA, MFAFactor } from '@/hooks/useMFA';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { MFAEnrollment } from './MFAEnrollment';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export const MFASettings = () => {
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [isLoadingFactors, setIsLoadingFactors] = useState(true);
  const { getMFAFactors, unenrollMFA, isLoading } = useMFA();
  const { toast } = useToast();

  const loadFactors = async () => {
    setIsLoadingFactors(true);
    const data = await getMFAFactors();
    setFactors(data);
    setIsLoadingFactors(false);
  };

  useEffect(() => {
    loadFactors();
  }, []);

  const handleUnenroll = async (factorId: string) => {
    const success = await unenrollMFA(factorId);
    if (success) {
      toast({
        title: '2FA Disabled',
        description: 'Two-factor authentication has been removed from your account.',
      });
      loadFactors();
    }
  };

  const handleEnrollmentSuccess = () => {
    setShowEnrollment(false);
    loadFactors();
  };

  const verifiedFactors = factors.filter(f => f.status === 'verified');
  const hasActiveMFA = verifiedFactors.length > 0;

  if (showEnrollment) {
    return (
      <MFAEnrollment
        onSuccess={handleEnrollmentSuccess}
        onCancel={() => setShowEnrollment(false)}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          {hasActiveMFA ? (
            <ShieldCheck className="h-6 w-6 text-green-500" />
          ) : (
            <Shield className="h-6 w-6 text-muted-foreground" />
          )}
          <div>
            <CardTitle>Two-Factor Authentication</CardTitle>
            <CardDescription>
              {hasActiveMFA
                ? 'Your account is protected with 2FA'
                : 'Add an extra layer of security to your account'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingFactors ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasActiveMFA ? (
          <div className="space-y-3">
            {verifiedFactors.map((factor) => (
              <div
                key={factor.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium">Authenticator App</p>
                    <p className="text-sm text-muted-foreground">
                      Added {new Date(factor.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disable 2FA?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove two-factor authentication from your account.
                        Your account will be less secure.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleUnenroll(factor.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Disable 2FA
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <ShieldOff className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">
              2FA is not enabled. Enable it to secure your account.
            </p>
            <Button onClick={() => setShowEnrollment(true)}>
              <Shield className="mr-2 h-4 w-4" />
              Enable 2FA
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
