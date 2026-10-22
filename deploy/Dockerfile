# syntax=docker/dockerfile:1.7
# Build context is the repository root: docker build -f deploy/Dockerfile -t triomio-crm:local .
# The image architecture follows the build host; CI builds with --platform linux/arm64 for EC2 t4g.

FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src ./src
COPY data ./data
RUN npm run build

FROM eclipse-temurin:25-jdk AS build
WORKDIR /build
COPY backend/mvnw backend/pom.xml ./
COPY backend/.mvn ./.mvn
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q dependency:go-offline
COPY backend/src/main ./src/main
COPY --from=web /web/dist ./src/main/resources/static
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q package -DskipTests -Dspotless.check.skip=true \
    && cp target/crm-*.jar application.jar \
    && java -Djarmode=tools -jar application.jar extract --layers --destination extracted

FROM eclipse-temurin:25-jre
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /data/feeds \
    && chown app /data/feeds
WORKDIR /app
COPY --from=build /build/extracted/dependencies/ ./
COPY --from=build /build/extracted/spring-boot-loader/ ./
COPY --from=build /build/extracted/snapshot-dependencies/ ./
COPY --from=build /build/extracted/application/ ./
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "application.jar"]
