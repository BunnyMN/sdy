# Production Multi-stage Dockerfile for the Gerege Nexus backend
# Build context is the repository root: docker build -f deploy/Dockerfile .
#
# The Go toolchain version must satisfy backend/go.mod. Official golang images
# pin GOTOOLCHAIN=local, so an image older than the go directive fails the
# build outright.
FROM golang:1.26-alpine AS builder

# The upstream AI client currently requires Go 1.26. Keep auto enabled so
# patch-level toolchain requirements do not make an otherwise valid build fail.
ENV GOTOOLCHAIN=auto

WORKDIR /app/backend

# Copy dependency manifests first so `go mod download` stays cached.
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy the module source
COPY backend/ ./

# Which platform this build claims to be. Manifests declare the platform they
# need ("platform": ">=1.1.0"), and once the catalogue comes from a registry
# outside this repository, that constraint is checked against whatever is
# stamped here — an unstamped build would tell every store it is 1.0.0 for ever.
# The default is the version the constant carries, so nothing changes for a
# build that does not pass it. It must be valid semver: manifest validation
# parses it.
ARG VERSION=1.0.0

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
    -ldflags="-w -s -X github.com/gerege-systems/open-gerege-nexus/backend/internal/kernel/config.PlatformVersion=${VERSION}" \
    -o /bin/api ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o /bin/migrate ./cmd/migrate

# The operational tools, in the image because that is where an operator is.
#
# The runbooks tell whoever is running a cutover to invoke these, and they said
# `go run` — which assumes a Go toolchain on a production host that deliberately
# has nothing on it but this image. A procedure that cannot be followed with
# what is installed is a procedure nobody follows.
#
# appstore-import used to be here too. It writes the App Store's own tables and
# left with that product; the image stopped being able to build it the moment it
# did, which is what turned CI red.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" \
        -o /bin/catalog-diff ./cmd/catalog-diff
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" \
        -o /bin/publish-catalog ./cmd/publish-catalog
# The control plane has no sign-up screen, so the first operator account is
# made with this — on the host, by somebody who already holds the database
# credentials. It has to be in the image for the same reason as the tools
# above: the production host has a Docker daemon and nothing else.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" \
        -o /bin/operator-bootstrap ./cmd/operator-bootstrap
# And the tenant plane's equivalent: a fresh deployment has no organisation and
# no sign-up screen, so without this nobody can sign in to it at all. Same
# reasoning as above — the host has a Docker daemon and nothing else.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" \
        -o /bin/tenant-bootstrap ./cmd/tenant-bootstrap
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" \
        -o /bin/sdy-provision ./cmd/sdy-provision


# Production Alpine image
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata
ENV TZ=Asia/Ulaanbaatar

# Run as an unprivileged user.
RUN addgroup -S app && adduser -S -G app app

# Where a catalogue pulled from the registry is cached between restarts.
#
# Created here, owned by the runtime user, so that a named volume mounted over
# it inherits that ownership — Docker copies the image directory's owner into an
# empty volume, and a root-owned one would leave the cache unwritable. The cache
# failing is not fatal (the platform logs it and rebuilds next sync), which is
# exactly why it would otherwise go unnoticed.
RUN mkdir -p /var/lib/nexus && chown app:app /var/lib/nexus

WORKDIR /app

COPY --from=builder /bin/api /app/api
COPY --from=builder /bin/migrate /app/migrate
COPY --from=builder /bin/catalog-diff /app/catalog-diff
COPY --from=builder /bin/publish-catalog /app/publish-catalog
COPY --from=builder /bin/operator-bootstrap /app/operator-bootstrap
COPY --from=builder /bin/tenant-bootstrap /app/tenant-bootstrap
COPY --from=builder /bin/sdy-provision /app/sdy-provision
# App-store catalog + goose migrations are read from disk at runtime.
COPY catalog/ /app/catalog/
COPY backend/db/migrations/ /app/db/migrations/

USER app

EXPOSE 8080

CMD ["/app/api"]
