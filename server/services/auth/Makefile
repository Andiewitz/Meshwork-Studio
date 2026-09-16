.PHONY: run build test lint tidy

run:
	@set -a && [ -f ../../../.env ] && . ../../../.env; set +a; go run ./cmd/server

build:
	CGO_ENABLED=0 go build -o bin/identity ./cmd/server

test:
	go test ./... -race -count=1

lint:
	golangci-lint run

tidy:
	go mod tidy
