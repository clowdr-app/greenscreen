import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { HealthController } from "./health/health.controller";

@Module({
    imports: [LoggerModule.forRoot()],
    controllers: [HealthController],
})
export class AppModule implements NestModule {
    public configure(_consumer: MiddlewareConsumer): void {
        //
    }
}
