.PHONY: dev-backend dev-frontend up down migrate seed test build build-mac run-mac

DATABASE_URL ?= postgres://postgres:postgrespassword@localhost:5432/platform_db?sslmode=disable
DEV_TENANT_HOST ?= nexus.localhost
DEV_TENANT_ORIGIN ?= http://$(DEV_TENANT_HOST):3000
DEV_CONTROL_PLANE_HOST ?= admin.localhost

# Монголын Залуучуудын Холбооны (МЗХ) дотоод системийн брэнд. docker-compose.yml
# дахь default-уудтай ижил; гараар ажиллуулахад ч нэг нэр, нэг лого харагдана.
# Дэлгэрэнгүй: docs/MZH.md, brand/copy.json.
BRAND_NAME ?= Монголын Залуучуудын Холбоо
BRAND_SHORT_NAME ?= МЗХ
BRAND_DESCRIPTION ?= Монголын Залуучуудын Холбооны гишүүд, салбар зөвлөл, ажлын албаны нэгдсэн дотоод систем.
BRAND_LOGO_URL ?= /mzh/logo.svg
BRAND_THEME_COLOR ?= \#0b2a6f
BRAND_ICON_URL ?= /mzh/icon-512.png
BRAND_COPY_FILE ?= $(CURDIR)/brand/copy.json
LANDING_SECTIONS ?= hero capabilities trust services

dev-backend:
	cd backend && PUBLIC_ORIGIN="$(DEV_TENANT_ORIGIN)" \
		ALLOWED_ORIGINS="$(DEV_TENANT_ORIGIN),http://$(DEV_CONTROL_PLANE_HOST):3000" \
		CONTROL_PLANE_HOST="$(DEV_CONTROL_PLANE_HOST)" \
		BRAND_NAME="$(BRAND_NAME)" go run ./cmd/api

dev-frontend:
	cd frontend && CONTROL_PLANE_HOST="$(DEV_CONTROL_PLANE_HOST)" \
		NEXT_PUBLIC_API_URL=http://$(DEV_TENANT_HOST):8080/api/v1 \
		NEXT_PUBLIC_CONTROL_PLANE_API_URL=http://$(DEV_CONTROL_PLANE_HOST):8080/api/platform/v1 \
		BRAND_NAME="$(BRAND_NAME)" BRAND_SHORT_NAME="$(BRAND_SHORT_NAME)" \
		BRAND_DESCRIPTION="$(BRAND_DESCRIPTION)" BRAND_LOGO_URL="$(BRAND_LOGO_URL)" \
		BRAND_THEME_COLOR="$(BRAND_THEME_COLOR)" BRAND_ICON_URL="$(BRAND_ICON_URL)" \
		BRAND_COPY_FILE="$(BRAND_COPY_FILE)" LANDING_SECTIONS="$(LANDING_SECTIONS)" \
		npm run dev

up:
	docker-compose up -d

down:
	docker-compose down -v

migrate:
	cd backend && DATABASE_URL="$(DATABASE_URL)" go run ./cmd/migrate up

seed:
	cd backend && DATABASE_URL="$(DATABASE_URL)" go run ./cmd/api

test:
	cd backend && go test ./...

build:
	cd backend && go build ./...
	cd frontend && npm run build
	cd native-apps/desktop/macos && ./build.sh

build-mac:
	cd native-apps/desktop/macos && ./build.sh

run-mac: build-mac
	open ~/Library/Developer/Xcode/DerivedData/NexusGeregeDesktop-*/Build/Products/Debug/NexusGeregeDesktop.app
