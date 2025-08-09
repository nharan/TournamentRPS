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
