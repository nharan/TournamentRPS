.PHONY: build-web build-services fmt

build-web:
	cd apps/web && npm ci && npm run build

build-services:
	cargo build --workspace --release

fmt:
	cargo fmt --all || true
