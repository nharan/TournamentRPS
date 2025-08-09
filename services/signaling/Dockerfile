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
