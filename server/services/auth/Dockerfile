# syntax=docker/dockerfile:1
FROM golang:1.26.9-alpine AS build
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/identity ./cmd/server \
 && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/cleanupctl ./cmd/cleanupctl

FROM gcr.io/distroless/static-debian13:nonroot
WORKDIR /app
COPY --from=build /out/identity /app/identity
COPY --from=build /out/cleanupctl /app/cleanupctl
EXPOSE 8081
USER nonroot:nonroot
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD ["/app/identity", "-healthcheck"]
ENTRYPOINT ["/app/identity"]
