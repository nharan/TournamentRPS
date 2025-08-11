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

