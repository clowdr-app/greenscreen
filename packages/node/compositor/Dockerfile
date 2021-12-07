FROM node:17.2-alpine3.14 AS base

ARG BUILD_DATE
ARG VCS_REF

LABEL org.label-schema.build-date=$BUILD_DATE \
    org.label-schema.description="The Midspace compositor engine." \
    org.label-schema.name="midspace/compositor" \
    org.label-schema.schema-version="1.0.0-rc1" \
    org.label-schema.usage="https://github.com/clowdr/greenscreen/blob/main/README.md" \
    org.label-schema.vcs-url="https://github.com/clowdr/greenscreen" \
    org.label-schema.vcs-ref=$VCS_REF \
    org.label-schema.vendor="Midspace"

# WORKDIR /app/compositor
# COPY package.json tsconfig.cjs.json ./
# RUN --mount=type=bind,source=./src,destination=./src \
#     corepack enable \
#     && pnpm i \
#     && pnpm build:typescript
ARG PNPM_VERSION=6.23.5
RUN npm --no-update-notifier --no-fund --global install pnpm@${PNPM_VERSION}
WORKDIR /root/monorepo

FROM base AS dev
ARG PACKAGE_PATH
ENV CI=true
COPY ./meta .
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store\
    # ↑ By caching the content-addressable store we stop downloading the same packages again and again
    pnpm install --filter "{${PACKAGE_PATH}}..."\
    --frozen-lockfile\
    --unsafe-perm\
    # ↑ Docker runs pnpm as root and then pnpm won't run package scripts unless we pass this arg
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"
# ↑ Unfortunately using Docker's 'cache' mount type causes Docker to place the pnpm content-addressable store
# on a different virtual drive, which prohibits pnpm from symlinking its content to its virtual store
# (in node_modules/.pnpm), and that causes pnpm to fall back on copying the files.
# And that's fine!, except pnpm emits many warnings of this, so here we filter those out.
COPY ./deps .
RUN pnpm build --if-present --filter "{${PACKAGE_PATH}}^..."
# ↑ Build dependencies separately, because they often change less often than the package itself
COPY ./pkg .
RUN pnpm test --if-present --filter "{${PACKAGE_PATH}}"
RUN NODE_ENV=production pnpm build --filter "{${PACKAGE_PATH}}"

FROM dev AS assets
RUN rm -rf node_modules && pnpm recursive exec -- rm -rf ./src ./node_modules

FROM base AS prod
ARG PACKAGE_PATH
ENV CI=true
COPY ./meta .
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store\
    pnpm install --filter "{${PACKAGE_PATH}}..."\
    --frozen-lockfile\
    --unsafe-perm\
    --prod\
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"
COPY --from=assets /root/monorepo .

WORKDIR /root/monorepo/${PACKAGE_PATH}
ENV NODE_ENV=production
ENTRYPOINT ["pnpm", "start"]

# CMD [ "node", "--enable-source-maps", "/app/compositor/build/index.js" ]