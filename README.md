# Greenscreen

## Pre-requisites

- Docker
- Node 17.2 or later

## Setup

1. Run `corepack enable`. This enables corepack in Node to make the `pnpm` package manager available.
1. Run `pnpm i` to install dependencies for the whole repository.
1. Copy `.env.example` to e.g. `.env.local` and symlink to `.env.current`
   1. Windows: `mklink .env.local .env.current`
   1. Linux: `ln -s .env.current .env.local`

### AWS deployment

1. Configure your current envfile appropriately (AWS account ID etc.)
1. Go to the `packages/node/aws` directory.
1. Run `pnpm cdk -- deploy --all`

### Compositor

1. Go to the `packages/node/compositor` directory.
1. Run `pnpm build:image` to build the Docker image.
1. Run `pnpm start:image` to start the Docker image. At the moment, this will automatically record a 60-second video clip.

#### Push image to repository

1. `aws ecr get-login-password --profile sandbox --region eu-west-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-west-1.amazonaws.com`
1. `docker tag midspace/compositor:latest <account-id>.dkr.ecr.eu-west-1.amazonaws.com/midspace/compositor:latest`
1. `docker push <account-id>.dkr.ecr.eu-west-1.amazonaws.com/midspace/compositor:latest`

### API

TODO

### Common activities

#### Check for package updates

1. `pnpm dlx npm-check-updates`
