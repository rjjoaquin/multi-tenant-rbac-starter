# Multi-Tenant RBAC Starter

Next.js 15 + NestJS 10 + PostgreSQL + Prisma 6. Organizations, invitations, owner/admin/member roles, permission checks, and isolated organization items.

## Local setup

Requires Node.js 22+, npm, and Docker.

1. Copy `.env.example` to `.env`. Set `JWT_SECRET` to a random value of at least 32 characters.
2. Run `docker compose up -d`.
3. Run `npm install && npm run db:generate && npm run db:migrate && npm run dev`.

Open http://localhost:3000 and register. No demo accounts or tenant data are seeded.

## Permissions

| Action | Owner | Admin | Member |
| --- | --- | --- | --- |
| View members and items | Yes | Yes | Yes |
| Add/remove items | Yes | Yes | Yes |
| Invite | Admins and members | Members | No |
| Change roles / remove users | Admins and members | Members | No |
| Delete organization | Yes | No | No |

Invitations expire after 7 days, can be used once, and require the recipient's registered email. Share invitation links manually.

## Deployment

Provision PostgreSQL, configure `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`, and `API_INTERNAL_URL`, then run `npm run db:deploy && npm run build`. Serve Next.js over HTTPS, proxy `/api/*` to NestJS, and keep the API private. Set `NODE_ENV=production`.

## Checks

`npm test` runs RBAC policy tests. Run `npm run build` and `npm audit` before deployment. See [SECURITY.md](SECURITY.md) for the audit.
