import './style.css';
export const metadata = { title: 'TenantKit', description: 'Multi-tenant RBAC starter' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
