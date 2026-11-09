import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { SubscriptionDialogProvider } from '@/components/subscription-dialog';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';
import { OverviewPage } from '@/pages/overview';
import { SubscriptionsPage } from '@/pages/subscriptions';
import { SubscriptionDetailPage } from '@/pages/subscription-detail';
import { StatsPage } from '@/pages/stats';
import { CatalogPage } from '@/pages/catalog';
import { SettingsPage } from '@/pages/settings';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function ToastLayer() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            'font-sans !rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-[0_12px_32px_-12px_rgba(20,18,12,0.25)]',
          title: '!text-[13px] !font-medium',
          description: '!text-[12px] !text-muted-foreground',
        },
      }}
    />
  );
}

function NotFound() {
  return (
    <EmptyState
      kicker="404"
      title="页面不存在"
      description="这个地址没有对应的内容。"
      action={
        <Button asChild variant="outline">
          <Link to="/">返回总览</Link>
        </Button>
      }
      className="mt-16"
    />
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <SubscriptionDialogProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="subscriptions" element={<SubscriptionsPage />} />
            <Route path="subscriptions/:id" element={<SubscriptionDetailPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </SubscriptionDialogProvider>
      <ToastLayer />
    </>
  );
}
