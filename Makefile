.DEFAULT_GOAL := help

COMPOSE ?= docker compose
SIM_INGESTION_MODE ?= simulate
REAL_INGESTION_MODE ?= real
SIM_ALLOW_MANUAL_INGESTION ?= true
REAL_ALLOW_MANUAL_INGESTION ?= false

.PHONY: help infra-up infra-down dev-sim dev-sim-bg dev-real dev-real-bg down logs logs-app logs-workers ps restart rebuild clean

help:
	@printf "\nTargets:\n"
	@printf "  make infra-up      # start postgres + redis only\n"
	@printf "  make dev-sim       # start full stack in simulator mode with fake ingestion\n"
	@printf "  make dev-sim-bg    # same as dev-sim, but detached\n"
	@printf "  make dev-real      # start full stack in real Gmail/Slack mode\n"
	@printf "  make dev-real-bg   # same as dev-real, but detached\n"
	@printf "  make logs          # follow all service logs\n"
	@printf "  make logs-app      # follow frontend + backend logs\n"
	@printf "  make logs-workers  # follow celery worker + beat logs\n"
	@printf "  make ps            # show compose service status\n"
	@printf "  make down          # stop the stack\n"
	@printf "  make clean         # stop the stack and remove volumes\n"
	@printf "\nMode details:\n"
	@printf "  dev-sim  -> INGESTION_MODE=%s, ALLOW_MANUAL_INGESTION=%s\n" "$(SIM_INGESTION_MODE)" "$(SIM_ALLOW_MANUAL_INGESTION)"
	@printf "  dev-real -> INGESTION_MODE=%s, ALLOW_MANUAL_INGESTION=%s\n" "$(REAL_INGESTION_MODE)" "$(REAL_ALLOW_MANUAL_INGESTION)"
	@printf "\nOverride example:\n"
	@printf "  make dev-real REAL_ALLOW_MANUAL_INGESTION=true\n\n"

infra-up:
	$(COMPOSE) up -d postgres redis

infra-down:
	$(COMPOSE) stop postgres redis

dev-sim:
	INGESTION_MODE=$(SIM_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(SIM_ALLOW_MANUAL_INGESTION) $(COMPOSE) up --build

dev-sim-bg:
	INGESTION_MODE=$(SIM_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(SIM_ALLOW_MANUAL_INGESTION) $(COMPOSE) up -d --build

dev-real:
	@printf "Starting full stack in real ingestion mode. Ensure Google/Slack OAuth credentials are set in .env or your shell.\n"
	INGESTION_MODE=$(REAL_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(REAL_ALLOW_MANUAL_INGESTION) $(COMPOSE) up --build

dev-real-bg:
	@printf "Starting full stack in real ingestion mode. Ensure Google/Slack OAuth credentials are set in .env or your shell.\n"
	INGESTION_MODE=$(REAL_INGESTION_MODE) ALLOW_MANUAL_INGESTION=$(REAL_ALLOW_MANUAL_INGESTION) $(COMPOSE) up -d --build

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
	$(COMPOSE) build --no-cache

clean:
	$(COMPOSE) down -v --remove-orphans
