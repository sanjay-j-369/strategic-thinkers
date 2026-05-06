.DEFAULT_GOAL := help

COMPOSE ?= docker compose
SIM_INGESTION_MODE ?= simulate
REAL_INGESTION_MODE ?= real
SIM_ALLOW_MANUAL_INGESTION ?= true
REAL_ALLOW_MANUAL_INGESTION ?= false
SIM_DEMO_MODE ?= false
REAL_DEMO_MODE ?= false
DEMO_INGESTION_MODE ?= simulate
DEMO_ALLOW_MANUAL_INGESTION ?= true
DEMO_MODE_ENABLED ?= true
PROD_INGESTION_MODE ?= real
PROD_ALLOW_MANUAL_INGESTION ?= false
PROD_DEMO_MODE ?= false
DEPLOY_FLAGS ?= -d --build --remove-orphans
DOCKER_PULL_RETRIES ?= 4
DOCKER_PULL_DELAY ?= 3
FRONTEND_BASE_IMAGE ?= node:20-alpine
BACKEND_BASE_IMAGE ?= pytorch/pytorch:2.2.1-cuda12.1-cudnn8-runtime

.PHONY: help infra-up infra-down pull-base-images dev-sim dev-sim-bg dev-real dev-real-bg dev-demo dev-demo-bg deploy-dev deploy-demo deploy-prod down logs logs-app logs-workers ps restart rebuild clean

help:
	@printf "\nTargets:\n"
	@printf "  make infra-up      # start postgres + redis only\n"
	@printf "  make dev-sim       # start full stack in simulator mode with fake ingestion\n"
	@printf "  make dev-sim-bg    # same as dev-sim, but detached\n"
	@printf "  make dev-real      # start full stack in real Gmail/Slack mode\n"
	@printf "  make dev-real-bg   # same as dev-real, but detached\n"
	@printf "  make dev-demo      # start full stack in demo mode with presenter controls\n"
	@printf "  make dev-demo-bg   # same as dev-demo, but detached\n"
	@printf "  make pull-base-images # pre-pull Docker base images with retries\n"
	@printf "  make deploy-dev    # deploy app in dev mode (detached)\n"
	@printf "  make deploy-demo   # deploy app in demo mode (detached)\n"
	@printf "  make deploy-prod   # deploy app in prod mode (detached)\n"
	@printf "  make logs          # follow all service logs\n"
	@printf "  make logs-app      # follow frontend + backend logs\n"
	@printf "  make logs-workers  # follow celery worker + beat logs\n"
	@printf "  make ps            # show compose service status\n"
	@printf "  make down          # stop the stack\n"
	@printf "  make clean         # stop the stack and remove volumes\n"
	@printf "\nMode details:\n"
	@printf "  dev-sim  -> INGESTION_MODE=%s, ALLOW_MANUAL_INGESTION=%s, DEMO_MODE=%s\n" "$(SIM_INGESTION_MODE)" "$(SIM_ALLOW_MANUAL_INGESTION)" "$(SIM_DEMO_MODE)"
	@printf "  dev-real -> INGESTION_MODE=%s, ALLOW_MANUAL_INGESTION=%s, DEMO_MODE=%s\n" "$(REAL_INGESTION_MODE)" "$(REAL_ALLOW_MANUAL_INGESTION)" "$(REAL_DEMO_MODE)"
	@printf "  dev-demo -> INGESTION_MODE=%s, ALLOW_MANUAL_INGESTION=%s, DEMO_MODE=%s\n" "$(DEMO_INGESTION_MODE)" "$(DEMO_ALLOW_MANUAL_INGESTION)" "$(DEMO_MODE_ENABLED)"
	@printf "  deploy-dev  -> INGESTION_MODE=%s, ALLOW_MANUAL_INGESTION=%s, DEMO_MODE=%s\n" "$(SIM_INGESTION_MODE)" "$(SIM_ALLOW_MANUAL_INGESTION)" "$(SIM_DEMO_MODE)"
	@printf "  deploy-demo -> INGESTION_MODE=%s, ALLOW_MANUAL_INGESTION=%s, DEMO_MODE=%s\n" "$(DEMO_INGESTION_MODE)" "$(DEMO_ALLOW_MANUAL_INGESTION)" "$(DEMO_MODE_ENABLED)"
	@printf "  deploy-prod -> INGESTION_MODE=%s, ALLOW_MANUAL_INGESTION=%s, DEMO_MODE=%s\n" "$(PROD_INGESTION_MODE)" "$(PROD_ALLOW_MANUAL_INGESTION)" "$(PROD_DEMO_MODE)"
	@printf "\nOverride example:\n"
	@printf "  make dev-real REAL_ALLOW_MANUAL_INGESTION=true\n\n"

infra-up:
	$(COMPOSE) up -d postgres redis

infra-down:
	$(COMPOSE) stop postgres redis

pull-base-images:
	@set -e; \
	for image in "$(FRONTEND_BASE_IMAGE)" "$(BACKEND_BASE_IMAGE)"; do \
		printf "Pulling %s\n" "$$image"; \
		attempt=1; \
		until docker pull "$$image"; do \
			if [ $$attempt -ge "$(DOCKER_PULL_RETRIES)" ]; then \
				printf "Failed to pull %s after %s attempts.\n" "$$image" "$(DOCKER_PULL_RETRIES)"; \
				exit 1; \
			fi; \
			printf "Retrying %s (%s/%s) in %ss...\n" "$$image" "$$attempt" "$(DOCKER_PULL_RETRIES)" "$(DOCKER_PULL_DELAY)"; \
			attempt=$$((attempt + 1)); \
			sleep "$(DOCKER_PULL_DELAY)"; \
		done; \
	done

dev-sim:
	@$(MAKE) pull-base-images
	INGESTION_MODE=$(SIM_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(SIM_ALLOW_MANUAL_INGESTION) DEMO_MODE=$(SIM_DEMO_MODE) $(COMPOSE) up --build

dev-sim-bg:
	@$(MAKE) pull-base-images
	INGESTION_MODE=$(SIM_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(SIM_ALLOW_MANUAL_INGESTION) DEMO_MODE=$(SIM_DEMO_MODE) $(COMPOSE) up -d --build

dev-real:
	@printf "Starting full stack in real ingestion mode. Ensure Google/Slack OAuth credentials are set in .env or your shell.\n"
	@$(MAKE) pull-base-images
	INGESTION_MODE=$(REAL_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(REAL_ALLOW_MANUAL_INGESTION) DEMO_MODE=$(REAL_DEMO_MODE) $(COMPOSE) up --build

dev-real-bg:
	@printf "Starting full stack in real ingestion mode. Ensure Google/Slack OAuth credentials are set in .env or your shell.\n"
	@$(MAKE) pull-base-images
	INGESTION_MODE=$(REAL_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(REAL_ALLOW_MANUAL_INGESTION) DEMO_MODE=$(REAL_DEMO_MODE) $(COMPOSE) up -d --build

dev-demo:
	@printf "Starting full stack in demo mode. Presenter controls are available with Shift + D.\n"
	@$(MAKE) pull-base-images
	INGESTION_MODE=$(DEMO_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(DEMO_ALLOW_MANUAL_INGESTION) DEMO_MODE=$(DEMO_MODE_ENABLED) $(COMPOSE) up --build

dev-demo-bg:
	@printf "Starting full stack in demo mode. Presenter controls are available with Shift + D.\n"
	@$(MAKE) pull-base-images
	INGESTION_MODE=$(DEMO_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(DEMO_ALLOW_MANUAL_INGESTION) DEMO_MODE=$(DEMO_MODE_ENABLED) $(COMPOSE) up -d --build

deploy-dev:
	@printf "Deploying app in DEV mode...\n"
	@$(MAKE) pull-base-images
	INGESTION_MODE=$(SIM_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(SIM_ALLOW_MANUAL_INGESTION) DEMO_MODE=$(SIM_DEMO_MODE) $(COMPOSE) up $(DEPLOY_FLAGS)

deploy-demo:
	@printf "Deploying app in DEMO mode (presenter controls enabled)...\n"
	@$(MAKE) pull-base-images
	INGESTION_MODE=$(DEMO_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(DEMO_ALLOW_MANUAL_INGESTION) DEMO_MODE=$(DEMO_MODE_ENABLED) $(COMPOSE) up $(DEPLOY_FLAGS)

deploy-prod:
	@printf "Deploying app in PROD mode. Ensure production secrets are set.\n"
	@$(MAKE) pull-base-images
	INGESTION_MODE=$(PROD_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(PROD_ALLOW_MANUAL_INGESTION) DEMO_MODE=$(PROD_DEMO_MODE) $(COMPOSE) up $(DEPLOY_FLAGS)

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

logs-app:
	$(COMPOSE) logs -f frontend backend

logs-workers:
	$(COMPOSE) logs -f celery-worker celery-beat

ps:
	$(COMPOSE) ps

restart:
	$(COMPOSE) restart

rebuild:
	@$(MAKE) pull-base-images
	$(COMPOSE) build --no-cache

clean:
	$(COMPOSE) down -v --remove-orphans
