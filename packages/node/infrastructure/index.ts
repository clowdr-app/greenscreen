import * as aws from "@pulumi/aws";
import * as aws_native from "@pulumi/aws-native";

const defaultVpc = aws.ec2.getVpcOutput({ default: true });
const defaultVpcSubnets = aws.ec2.getSubnetIdsOutput({ vpcId: defaultVpc.id });

const role = new aws.iam.Role("task-exec-role", {
    assumeRolePolicy: {
        Version: "2008-10-17",
        Statement: [
            {
                Sid: "",
                Effect: "Allow",
                Principal: {
                    Service: "ecs-tasks.amazonaws.com",
                },
                Action: "sts:AssumeRole",
            },
        ],
    },
});

const launchTemplate = new aws.ec2.LaunchTemplate("compositor-launch-template", {
    blockDeviceMappings: [
        {
            deviceName: "/dev/sda1",
            ebs: {
                volumeSize: 20,
            },
        },
    ],
    imageId: "ami-04dd4500af104442f",
    instanceType: "t3.large",
});

const autoScalingGroup = new aws.autoscaling.Group("compositor-asg", {
    tags: [
        {
            key: "AmazonECSManaged",
            value: "true",
            propagateAtLaunch: true,
        },
    ],
    launchTemplate: {
        id: launchTemplate.id,
    },
    vpcZoneIdentifiers: defaultVpcSubnets.ids,
    protectFromScaleIn: true,
    maxSize: 1,
    minSize: 0,
});

const capacityProvider = new aws.ecs.CapacityProvider("compositor-capacity-provider", {
    autoScalingGroupProvider: {
        autoScalingGroupArn: autoScalingGroup.arn,
        managedTerminationProtection: "ENABLED",
        managedScaling: {
            maximumScalingStepSize: 1,
            minimumScalingStepSize: 1,
            status: "ENABLED",
            targetCapacity: 10,
        },
    },
});

new aws_native.ecs.Cluster("cluster", {
    clusterName: "compositor-cluster",
    capacityProviders: [capacityProvider.name],
    defaultCapacityProviderStrategy: [
        {
            capacityProvider: capacityProvider.name,
        },
    ],
});

new aws_native.ecs.TaskDefinition("compositor-task", {
    family: "compositor-task",
    requiresCompatibilities: ["EC2"],
    executionRoleArn: role.arn,
    containerDefinitions: [
        {
            name: "compositor",
            image: "258005414503.dkr.ecr.eu-west-1.amazonaws.com/midspace/compositor:latest",
            portMappings: [
                {
                    containerPort: 80,
                    hostPort: 80,
                    protocol: "tcp",
                },
            ],
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-create-group": "true",
                    "awslogs-group": "/ecs/CompositorTask",
                    "awslogs-region": "eu-west-1",
                    "awslogs-stream-prefix": "ecs",
                },
            },
            linuxParameters: {
                capabilities: {
                    add: ["SYS_ADMIN"],
                },
            },
            memory: 6000,
        },
    ],
});
