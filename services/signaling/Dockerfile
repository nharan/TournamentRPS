# syntax=docker/dockerfile:1

FROM rust:1.83-slim AS build
WORKDIR /workspace
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Build with the whole workspace as context so cross-crate deps resolve
COPY . .
RUN cargo build -p rps-signaling --release

FROM debian:bookworm-slim
ENV PORT=8081 RUST_LOG=info
EXPOSE 8081
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd -m appuser
USER appuser
COPY --from=build /workspace/target/release/rps-signaling /rps-signaling
ENTRYPOINT ["/rps-signaling"]

# syntax=docker/dockerfile:1
FROM rust:1.78 as builder
WORKDIR /app
COPY Cargo.toml .
COPY services services
COPY shared shared
RUN cargo build -p rps-signaling --release || true
RUN cargo build -p rps-signaling --release

FROM gcr.io/distroless/cc-debian12
WORKDIR /app
COPY --from=builder /app/target/release/rps-signaling /app/server
ENV PORT=8080
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/app/server"]
