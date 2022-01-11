import type { StackProps } from "aws-cdk-lib";
import { CfnOutput, Stack } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

export class CompositorStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const s3Bucket = new s3.Bucket(this, "OutputBucket", {});

        const vpc = new ec2.Vpc(this, "Vpc", {});

        const cluster = new ecs.Cluster(this, "EcsCluster", { vpc, containerInsights: true });

        cluster.addCapacity("DefaultAutoScalingGroup", {
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.C6I, ec2.InstanceSize.LARGE),
            minCapacity: 0,
            maxCapacity: 1,
            desiredCapacity: 0,
        });

        const logging = new ecs.AwsLogDriver({ streamPrefix: "compositor" });

        const taskDefinition = new ecs.Ec2TaskDefinition(this, "CompositorTaskDefinition", {});

        s3Bucket.grantReadWrite(taskDefinition.taskRole);

        const repository = new ecr.Repository(this, "CompositorImageRepository", {
            repositoryName: "midspace/compositor",
        });

        const compositorTaskDefinition = taskDefinition.addContainer("compositor", {
            image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
            memoryLimitMiB: 3584,
            cpu: 512,
            logging,
            linuxParameters: new ecs.LinuxParameters(this, "LinuxParameters"),
        });

        compositorTaskDefinition.linuxParameters?.addCapabilities(ecs.Capability.SYS_ADMIN);
        compositorTaskDefinition.addEnvironment("S3_BUCKET_NAME", s3Bucket.bucketName);

        new CfnOutput(this, "ContainerRepositoryUrl", {
            value: repository.repositoryUri,
        });

        new CfnOutput(this, "TaskDefinitionArn", {
            value: taskDefinition.taskDefinitionArn,
        });

        new CfnOutput(this, "ClusterArn", {
            value: cluster.clusterArn,
        });

        // container.addPortMappings({
        //     containerPort: 80,
        //     hostPort: 80,
        //     protocol: ecs.Protocol.TCP,
        // })
    }
}
