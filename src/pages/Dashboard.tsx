import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Bot, MessageSquare, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
interface AIApp {
  id: string;
  name: string;
  description: string | null;
  model: string;
  created_at: string;
}
interface UsageStats {
  totalApps: number;
  totalConversations: number;
  totalTokens: number;
}
const Dashboard = () => {
  const {
    user
  } = useAuth();
  const {
    toast
  } = useToast();
  const [apps, setApps] = useState<AIApp[]>([]);
  const [stats, setStats] = useState<UsageStats>({
    totalApps: 0,
    totalConversations: 0,
    totalTokens: 0
  });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        // Fetch apps
        const {
          data: appsData,
          error: appsError
        } = await supabase.from('ai_apps').select('*').order('created_at', {
          ascending: false
        }).limit(6);
        if (appsError) throw appsError;
        setApps(appsData || []);

        // Fetch stats
        const {
          count: appCount
        } = await supabase.from('ai_apps').select('*', {
          count: 'exact',
          head: true
        });
        const {
          count: convCount
        } = await supabase.from('conversations').select('*', {
          count: 'exact',
          head: true
        });
        const {
          data: usageData
        } = await supabase.from('usage_logs').select('total_tokens');
        const totalTokens = usageData?.reduce((acc, log) => acc + (log.total_tokens || 0), 0) || 0;
        setStats({
          totalApps: appCount || 0,
          totalConversations: convCount || 0,
          totalTokens
        });
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error loading data',
          description: error.message
        });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, toast]);
  return <DashboardLayout>
      <div className="p-6 lg:p-8 bg-warning-foreground">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Manage your AI applications here.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Apps
              </CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalApps}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Conversations
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalConversations}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tokens Used
              </CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalTokens.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Apps Section */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Your Apps</h2>
          <Button asChild>
            <Link to="/apps/new">
              <Plus className="h-4 w-4 mr-2" />
              New App
            </Link>
          </Button>
        </div>

        {loading ? <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div> : apps.length === 0 ? <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">No apps yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first AI application to get started.
              </p>
              <Button asChild>
                <Link to="/apps/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create App
                </Link>
              </Button>
            </CardContent>
          </Card> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map(app => <Card key={app.id} className="group hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <span className="truncate">{app.name}</span>
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {app.description || 'No description'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                      {app.model}
                    </span>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/apps/${app.id}/playground`}>
                        Open <ArrowRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>)}
          </div>}
      </div>
    </DashboardLayout>;
};
export default Dashboard;