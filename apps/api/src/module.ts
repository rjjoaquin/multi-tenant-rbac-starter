import { Module, Injectable, Controller, Get, Post, Patch, Delete, Body, Param, Req, Res, HttpException, HttpStatus, ForbiddenException, UnauthorizedException, NotFoundException, ConflictException, BadRequestException, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { PrismaClient, Role } from '@prisma/client';
import { IsEmail, IsString, MinLength, MaxLength, IsIn } from 'class-validator';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { hash, compare } from 'bcryptjs';
import type { Request, Response } from 'express';
import { can, canAssign, canManage } from './policy';

const cookieName = 'rbac_session';
const envSecret = process.env.JWT_SECRET || '';
if (envSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';
const allowedOrigin = new URL(webOrigin).origin;

class Credentials {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
class NameInput {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
}
class ResourceInput {
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
}
class InviteInput {
  @IsEmail() @MaxLength(254) email!: string;
  @IsIn(['ADMIN','MEMBER']) role!: Role;
}
class RoleInput {
  @IsIn(['ADMIN','MEMBER']) role!: Role;
}
class AcceptInput {
  @IsString() @MinLength(20) @MaxLength(200) token!: string;
}

@Injectable()
class Db extends PrismaClient {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}

@Injectable()
class Auth {
  constructor(private jwt: JwtService, private db: Db) {}
  async user(req: Request) {
    const token = req.cookies?.[cookieName];
    if (!token) throw new UnauthorizedException();
    let payload: { sub: string; ver: number };
    try { payload = await this.jwt.verifyAsync(token); }
    catch { throw new UnauthorizedException(); }
    if (!payload?.sub || payload.ver !== 1) throw new UnauthorizedException();
    const user = await this.db.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true } });
    if (!user) throw new UnauthorizedException();
    return user;
  }
  async membership(req: Request, orgId: string) {
    const user = await this.user(req);
    const member = await this.db.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
    });
    if (!member) throw new NotFoundException('Organization not found');
    return { user, member };
  }
  setCookie(res: Response, userId: string) {
    const token = this.jwt.sign({ sub: userId, ver: 1 }, { expiresIn: '12h' });
    res.cookie(cookieName, token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      path: '/', maxAge: 12 * 60 * 60 * 1000,
    });
  }
  clearCookie(res: Response) {
    res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  }
  require(role: Role, action: Parameters<typeof can>[1]) {
    if (!can(role, action)) throw new ForbiddenException('Insufficient permission');
  }
}

@Injectable()
class OriginGuard {
  canActivate(context: import('@nestjs/common').ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return true;
    const origin = req.get('origin');
    if (origin !== allowedOrigin) throw new ForbiddenException('Invalid request origin');
    return true;
  }
}

@Controller('auth')
class AuthController {
  constructor(private auth: Auth, private db: Db) {}
  @Post('register') @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() body: Credentials, @Res({ passthrough: true }) res: Response) {
    const email = body.email.trim().toLowerCase();
    const passwordHash = await hash(body.password, 12);
    try {
      const user = await this.db.user.create({ data: { email, passwordHash }, select: { id: true, email: true } });
      this.auth.setCookie(res, user.id);
      return user;
    } catch (e: any) {
      if (e.code === 'P2002') throw new ConflictException('Email already registered');
      throw e;
    }
  }
  @Post('login') @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() body: Credentials, @Res({ passthrough: true }) res: Response) {
    const user = await this.db.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    if (!user || !await compare(body.password, user.passwordHash)) throw new UnauthorizedException('Invalid credentials');
    this.auth.setCookie(res, user.id);
    return { id: user.id, email: user.email };
  }
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) { this.auth.clearCookie(res); return { ok: true }; }
  @Get('me')
  async me(@Req() req: Request) { return this.auth.user(req); }
}

@Controller('organizations')
class OrganizationController {
  constructor(private db: Db, private auth: Auth) {}
  @Get()
  async list(@Req() req: Request) {
    const user = await this.auth.user(req);
    return this.db.membership.findMany({ where: { userId: user.id },
      select: { role: true, organization: { select: { id: true, name: true } } },
      orderBy: { organization: { name: 'asc' } } });
  }
  @Post()
  async create(@Req() req: Request, @Body() body: NameInput) {
    const user = await this.auth.user(req);
    return this.db.organization.create({
      data: { name: body.name.trim(), memberships: { create: { userId: user.id, role: 'OWNER' } } },
      select: { id: true, name: true },
    });
  }
  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const { member } = await this.auth.membership(req, id);
    const org = await this.db.organization.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } });
    return { ...org, role: member.role };
  }
  @Get(':id/members')
  async members(@Req() req: Request, @Param('id') id: string) {
    await this.auth.membership(req, id);
    return this.db.membership.findMany({ where: { organizationId: id },
      select: { userId: true, role: true, user: { select: { email: true } } },
      orderBy: { user: { email: 'asc' } } });
  }
  @Patch(':id/members/:userId')
  async changeRole(@Req() req: Request, @Param('id') id: string, @Param('userId') targetId: string, @Body() body: RoleInput) {
    const { member } = await this.auth.membership(req, id);
    const target = await this.db.membership.findUnique({ where: { userId_organizationId: { userId: targetId, organizationId: id } } });
    if (!target) throw new NotFoundException('Member not found');
    if (!canManage(member.role, target.role) || !canAssign(member.role, body.role)) throw new ForbiddenException();
    return this.db.membership.update({ where: { userId_organizationId: { userId: targetId, organizationId: id } },
      data: { role: body.role }, select: { userId: true, role: true } });
  }
  @Delete(':id/members/:userId')
  async remove(@Req() req: Request, @Param('id') id: string, @Param('userId') targetId: string) {
    const { user, member } = await this.auth.membership(req, id);
    const target = await this.db.membership.findUnique({ where: { userId_organizationId: { userId: targetId, organizationId: id } } });
    if (!target) throw new NotFoundException('Member not found');
    if (user.id !== targetId && !canManage(member.role, target.role)) throw new ForbiddenException();
    if (target.role === 'OWNER') throw new ForbiddenException('Owner cannot leave; delete organization instead');
    await this.db.membership.delete({ where: { userId_organizationId: { userId: targetId, organizationId: id } } });
    return { ok: true };
  }
  @Delete(':id')
  async delete(@Req() req: Request, @Param('id') id: string) {
    const { member } = await this.auth.membership(req, id);
    this.auth.require(member.role, 'deleteOrganization');
    await this.db.organization.delete({ where: { id } });
    return { ok: true };
  }
  @Get(':id/resources')
  async resources(@Req() req: Request, @Param('id') id: string) {
    await this.auth.membership(req, id);
    return this.db.resource.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' } });
  }
  @Post(':id/resources')
  async newResource(@Req() req: Request, @Param('id') id: string, @Body() body: ResourceInput) {
    const { member } = await this.auth.membership(req, id);
    this.auth.require(member.role, 'create');
    return this.db.resource.create({ data: { organizationId: id, title: body.title.trim() } });
  }
  @Delete(':id/resources/:resourceId')
  async deleteResource(@Req() req: Request, @Param('id') id: string, @Param('resourceId') resourceId: string) {
    const { member } = await this.auth.membership(req, id);
    this.auth.require(member.role, 'create');
    const result = await this.db.resource.deleteMany({ where: { id: resourceId, organizationId: id } });
    if (!result.count) throw new NotFoundException('Resource not found');
    return { ok: true };
  }
  @Get(':id/invitations')
  async invitations(@Req() req: Request, @Param('id') id: string) {
    const { member } = await this.auth.membership(req, id);
    this.auth.require(member.role, 'invite');
    return this.db.invitation.findMany({ where: { organizationId: id, acceptedAt: null, revokedAt: null },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
  }
  @Post(':id/invitations') @Throttle({ default: { limit: 10, ttl: 60000 } })
  async invite(@Req() req: Request, @Param('id') id: string, @Body() body: InviteInput) {
    const { user, member } = await this.auth.membership(req, id);
    if (!canAssign(member.role, body.role)) throw new ForbiddenException();
    const email = body.email.trim().toLowerCase();
    const existing = await this.db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing && await this.db.membership.findUnique({ where: { userId_organizationId: { userId: existing.id, organizationId: id } } })) throw new ConflictException('Already a member');
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invite = await this.db.invitation.create({ data: {
      organizationId: id, email, role: body.role, tokenHash, createdById: user.id,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    }, select: { id: true, email: true, role: true, expiresAt: true } });
    return { ...invite, link: webOrigin + '/invite?token=' + token };
  }
  @Delete(':id/invitations/:inviteId')
  async revoke(@Req() req: Request, @Param('id') id: string, @Param('inviteId') inviteId: string) {
    const { member } = await this.auth.membership(req, id);
    this.auth.require(member.role, 'invite');
    const result = await this.db.invitation.updateMany({
      where: { id: inviteId, organizationId: id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) throw new NotFoundException('Invitation not found');
    return { ok: true };
  }
}

@Controller('invitations')
class InvitationController {
  constructor(private db: Db, private auth: Auth) {}
  @Post('accept')
  async accept(@Req() req: Request, @Body() body: AcceptInput) {
    const user = await this.auth.user(req);
    const tokenHash = createHash('sha256').update(body.token).digest('hex');
    return this.db.$transaction(async (tx) => {
      const invite = await tx.invitation.findUnique({ where: { tokenHash } });
      if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date() || invite.email !== user.email)
        throw new BadRequestException('Invitation invalid, expired, or for a different account');
      // Conditional update consumes the invitation only once, even across concurrent requests.
      const consumed = await tx.invitation.updateMany({ where: {
        id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() },
      }, data: { acceptedAt: new Date() } });
      if (!consumed.count) throw new ConflictException('Invitation already used');
      await tx.membership.create({ data: { organizationId: invite.organizationId, userId: user.id, role: invite.role } });
      return { organizationId: invite.organizationId };
    });
  }
}

@Module({
  imports: [
    JwtModule.register({ secret: envSecret, signOptions: { issuer: 'rbac-starter', audience: 'rbac-starter' },
      verifyOptions: { issuer: 'rbac-starter', audience: 'rbac-starter', algorithms: ['HS256'] } }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
  ],
  controllers: [AuthController, OrganizationController, InvitationController],
  providers: [Db, Auth, { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: OriginGuard }],
})
export class AppModule {}
