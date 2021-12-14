FROM bitnami/minideb:bullseye AS base

ARG PNPM_VERSION=6.23.6
RUN rm -f /etc/apt/apt.conf.d/docker-clean
RUN --mount=type=cache,target=/var/cache/apt \
    install_packages curl ca-certificates
RUN curl -fsSL https://deb.nodesource.com/setup_17.x | bash -
RUN --mount=type=cache,target=/var/cache/apt \
    install_packages nodejs
RUN npm --no-update-notifier --no-fund --global install pnpm@${PNPM_VERSION}

RUN adduser --disabled-password --gecos "" app \
    && mkdir -p /opt/greenscreen \
    && chown -R app:app /opt/greenscreen \
    && mkdir -p /var/greenscreen \
    && chown -R app:app /var/greenscreen 
# && exit 1

WORKDIR /opt/greenscreen

FROM base AS chrome
ARG PACKAGE_PATH

RUN --mount=type=cache,target=/var/cache/apt \
    install_packages \
    chromium \
    chromium-sandbox \
    fonts-freefont-ttf \
    fonts-noto-color-emoji \
    fonts-wqy-zenhei \
    ffmpeg \
    xvfb \
    pulseaudio \
    mesa-utils \
    libx11-dev \
    libxext-dev

RUN mkdir -p /var/run/dbus \
    && dbus-uuidgen > /var/lib/dbus/machine-id

COPY ./pkg/${PACKAGE_PATH}/src/resources/local.conf /etc/fonts/local.conf

ENV CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/

FROM base AS dev
ARG PACKAGE_PATH
ENV CI=true
USER app
COPY --chown=app:app ./meta .
RUN --mount=type=cache,id=pnpm-store,target=/opt/greenscreen/.pnpm-store \
    # ↑ By caching the content-addressable store we stop downloading the same packages again and again
    pnpm install --filter "{${PACKAGE_PATH}}..." \
    --frozen-lockfile \
    --unsafe-perm \
    # ↑ Docker runs pnpm as root and then pnpm won't run package scripts unless we pass this arg
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"
# ↑ Unfortunately using Docker's 'cache' mount type causes Docker to place the pnpm content-addressable store
# on a different virtual drive, which prohibits pnpm from symlinking its content to its virtual store
# (in node_modules/.pnpm), and that causes pnpm to fall back on copying the files.
# And that's fine!, except pnpm emits many warnings of this, so here we filter those out.
COPY --chown=app:app ./deps .
RUN pnpm build --if-present --filter "{${PACKAGE_PATH}}^..."
# ↑ Build dependencies separately, because they often change less often than the package itself
COPY --chown=app:app ./pkg .
RUN pnpm test --if-present --filter "{${PACKAGE_PATH}}"
RUN NODE_ENV=production pnpm build --filter "{${PACKAGE_PATH}}"

FROM dev AS assets
RUN rm -rf node_modules && pnpm recursive exec -- rm -rf ./src ./node_modules

FROM chrome AS prod
ARG PACKAGE_PATH
ENV CI=true
USER app
COPY --chown=app:app ./meta .
RUN --mount=type=cache,id=pnpm-store,target=/opt/.pnpm-store \
    pnpm install --filter "{${PACKAGE_PATH}}..." \
    --frozen-lockfile \
    --unsafe-perm \
    --prod \
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"
COPY --chown=app:app --from=assets /opt/greenscreen .

WORKDIR /opt/greenscreen/${PACKAGE_PATH}
ENV NODE_ENV=production

FROM prod as final

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

# USER root
# RUN chmod -R 755 /opt/greenscreen

USER app
# ENTRYPOINT [ "/bin/b" ]
CMD [ "pnpm", "start" ]
# COPY --chown=app:app ./pkg/${PACKAGE_PATH}/src/resources/start.sh /root/start.sh
# ENTRYPOINT [ "/bin/sh" ]
# CMD ["/root/start.sh"]