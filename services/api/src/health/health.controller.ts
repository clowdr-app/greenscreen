// import { PrismaClient } from "@greenscreen/prisma/.";
import { PrismaClient } from "@greenscreen/prisma";
import { Controller, Get, Logger } from "@nestjs/common";

@Controller({ path: "health" })
export class HealthController {
    private readonly logger = new Logger(HealthController.name);

    @Get()
    async getHello(): Promise<string> {
        const prisma = new PrismaClient();
        await prisma.user.create({
            data: {
                name: "Alice",
                email: "alice@prisma.io",
                posts: {
                    create: { title: "Hello World" },
                },
                profile: {
                    create: { bio: "I like turtles" },
                },
            },
        });

        return "ok";
    }
}
