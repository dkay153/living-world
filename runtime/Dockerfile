# Build only from the trusted checkout, never from a candidate Dockerfile.
FROM node:22-bookworm-slim
ARG LW_DEPENDENCIES_HASH
LABEL io.living-world.dependencies-hash=$LW_DEPENDENCIES_HASH
WORKDIR /opt/lw-deps
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/lw-browsers
COPY package.json package-lock.json ./
# Reproducible signed package metadata, older than this runtime's build date.
# Keep apt's signature, valid-until and future-date checks enabled.
RUN sed -i 's|http://deb.debian.org/debian-security|http://snapshot.debian.org/archive/debian-security/20261015T000000Z/|g; s|http://deb.debian.org/debian|http://snapshot.debian.org/archive/debian/20261015T000000Z/|g' /etc/apt/sources.list.d/debian.sources
RUN npm ci --ignore-scripts && node node_modules/playwright-core/cli.js install --with-deps chromium \
    && chmod -R a-w /opt/lw-deps /opt/lw-browsers
ARG LW_TOOLS_HASH
LABEL io.living-world.tools-hash=$LW_TOOLS_HASH
COPY runtime /opt/lw-tools
RUN groupadd -g 10001 game && useradd -u 10001 -g game -M game && groupadd -g 10002 observer && useradd -u 10002 -g observer -M observer \
    && chmod -R a-w /opt/lw-tools
# The root controller never imports candidate modules. Child execution drops UID.
ENTRYPOINT []
