# Greenscreen

## Pre-requisites

- Docker
- Node 17.2 or later

## Setup

1. Run `corepack enable`. This enables corepack in Node to make the `pnpm` package manager available.
1. Run `pnpm i` to install dependencies for the whole repository.

### Compositor

1. Go to the `packages/node/compositor` directory.
1. Run `pnpm build:image` to build the Docker image.
1. Run `pnpm start:image` to start the Docker image. At the moment, this will automatically record a 60-second video clip.

### API

TODO
