import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Bot, LayoutDashboard, Plus, Settings, LogOut, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
const navigation = [{
  name: 'Dashboard',
  href: '/dashboard',
  icon: LayoutDashboard
}, {
  name: 'New App',
  href: '/apps/new',
  icon: Plus
}, {
  name: 'Settings',
  href: '/settings/security',
  icon: Settings
}];
export const Sidebar = () => {
  const location = useLocation();
  const {
    signOut,
    user
  } = useAuth();
  const handleSignOut = async () => {
    await signOut();
  };
  return <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r border-border bg-sidebar">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg text-sidebar-foreground">Vishnu.AI</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 text-primary">
          {navigation.map(item => {
          const isActive = location.pathname === item.href;
          return <Link key={item.name} to={item.href} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors', isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent/50')}>
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>;
        })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-medium text-primary">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleSignOut} className="flex-shrink-0">
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>;
};