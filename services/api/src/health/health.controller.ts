import { Controller, Get, Logger } from "@nestjs/common";

@Controller({ path: "health" })
export class HealthController {
    private readonly logger = new Logger(HealthController.name);
    constructor() {}

    @Get()
    getHello(): string {
        return "ok";
    }
}
