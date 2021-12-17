import type { StackProps } from "aws-cdk-lib";
import { Stack } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import type { Construct } from "constructs";

export class CompositorStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, "Vpc", {});

        const cluster = new ecs.Cluster(this, "EcsCluster", { vpc, containerInsights: true });

        cluster.addCapacity("DefaultAutoScalingGroup", {
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.LARGE),
            minCapacity: 1,
            maxCapacity: 1,
        });

        const logging = new ecs.AwsLogDriver({ streamPrefix: "compositor" });

        const taskDefinition = new ecs.Ec2TaskDefinition(this, "CompositorTaskDefinition", {
            // placementConstraints: [ecs.PlacementConstraint.distinctInstances()],
        });

        const repository = ecr.Repository.fromRepositoryName(this, "CompositorImageRepository", "midspace/compositor");

        const compositorTaskDefinition = taskDefinition.addContainer("compositor", {
            image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
            memoryLimitMiB: 4096,
            cpu: 512,
            logging,
            linuxParameters: new ecs.LinuxParameters(this, "LinuxParameters"),
        });

        compositorTaskDefinition.linuxParameters?.addCapabilities(ecs.Capability.SYS_ADMIN);

        // container.addPortMappings({
        //     containerPort: 80,
        //     hostPort: 80,
        //     protocol: ecs.Protocol.TCP,
        // })
    }
}
