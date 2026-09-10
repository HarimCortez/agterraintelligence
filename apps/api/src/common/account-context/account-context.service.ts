import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AccountContext } from "./account-context";

/**
 * Resolves an `AccountContext` from a bare user id — for callers that don't
 * have an authenticated HTTP request to pull `req.user` off of (background
 * jobs, BullMQ workers, CLI scripts). Request-scoped code should prefer the
 * `@CurrentAccountContext()` param decorator, which builds the context from
 * the already-loaded `req.user` instead of issuing a second query.
 */
@Injectable()
export class AccountContextService {
  constructor(private readonly prisma: PrismaService) {}

  async forUserId(userId: string): Promise<AccountContext> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, orgId: true },
    });
    return AccountContext.forUser(user);
  }
}
