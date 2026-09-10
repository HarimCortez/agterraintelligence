import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  // `rawBody: true` makes Nest's built-in body-parser middleware preserve
  // the original request bytes on `req.rawBody` for every route, in
  // addition to (not instead of) normal JSON parsing into `req.body`.
  // Needed only by POST /v1/webhooks/stripe, whose signature verification
  // requires the exact bytes Stripe signed — every other route is
  // unaffected (still gets normal parsed `req.body`).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("v1");

  // Security baseline (ARCHITECTURE.md "Security Considerations"): every
  // endpoint validates its input via class-validator DTOs. `whitelist`
  // strips any property not declared on the DTO instead of silently
  // accepting it; `forbidNonWhitelisted` turns an unexpected property into
  // a 400 instead of a silent drop, so a client relying on an extra field
  // finds out immediately rather than being quietly ignored.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3001;
  // Explicit 0.0.0.0: Node's default listen() host isn't guaranteed to
  // accept connections from outside the container's loopback interface,
  // which is what left the Railway edge proxy unable to reach an
  // otherwise-healthy, fully-started instance (confirmed via runtime logs
  // showing a clean startup with zero incoming requests ever logged).
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
