# syntax=docker/dockerfile:1

FROM rust:1.83-slim AS build
WORKDIR /workspace
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY . .
RUN cargo build -p rps-coordinator --release

FROM debian:bookworm-slim
ENV PORT=8082 RUST_LOG=info
EXPOSE 8082
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd -m appuser
USER appuser
COPY --from=build /workspace/target/release/rps-coordinator /rps-coordinator
ENTRYPOINT ["/rps-coordinator"]

# syntax=docker/dockerfile:1
FROM rust:1.78 as builder
WORKDIR /app
COPY Cargo.toml .
COPY services services
COPY shared shared
RUN cargo build -p rps-coordinator --release || true
RUN cargo build -p rps-coordinator --release

FROM gcr.io/distroless/cc-debian12
WORKDIR /app
COPY --from=builder /app/target/release/rps-coordinator /app/server
ENV PORT=8080
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/app/server"]
