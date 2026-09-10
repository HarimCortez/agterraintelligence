import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";

/**
 * Root controller — infra health check only. Domain resource controllers
 * (properties, search, reports, etc. per ARCHITECTURE.md API Changes) are
 * added by `be` under their own feature modules, not here.
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("health")
  getHealth(): { status: "ok"; service: string } {
    return this.appService.getHealth();
  }
}
