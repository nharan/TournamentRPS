# syntax=docker/dockerfile:1

FROM rust:1.79-slim AS build
WORKDIR /workspace
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY . .
RUN cargo build -p rps-match-engine --release

FROM debian:bookworm-slim
ENV PORT=8083 RUST_LOG=info
EXPOSE 8083
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd -m appuser
USER appuser
COPY --from=build /workspace/target/release/rps-match-engine /rps-match-engine
ENTRYPOINT ["/rps-match-engine"]

# syntax=docker/dockerfile:1
FROM rust:1.78 as builder
WORKDIR /app
COPY Cargo.toml .
COPY services services
COPY shared shared
RUN cargo build -p rps-match-engine --release || true
RUN cargo build -p rps-match-engine --release

FROM gcr.io/distroless/cc-debian12
WORKDIR /app
COPY --from=builder /app/target/release/rps-match-engine /app/server
ENV PORT=8080
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/app/server"]
