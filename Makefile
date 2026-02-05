.PHONY: help qa build test test-ui test-headed clean install lint deploy deploy-full

# Default target
.DEFAULT_GOAL := help

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)Featrix Sphere Viewer - Available Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'
	@echo ""

qa: clean-port build test ## Run QA workflow: build + test
	@echo "$(GREEN)✅ QA checks complete!$(NC)"

qa-full: clean-port build test test-functional ## Run full QA: build + basic tests + functional tests
	@echo "$(GREEN)✅ Full QA checks complete!$(NC)"

clean-port: ## Kill any process using port 8080
	@echo "$(BLUE)🧹 Cleaning port 8080...$(NC)"
	@lsof -ti:8080 | xargs kill -9 2>/dev/null || true
	@sleep 2
	@lsof -ti:8080 | xargs kill -9 2>/dev/null || true
	@sleep 1

build: ## Build the embeddable component
	@echo "$(BLUE)🔨 Building embeddable component...$(NC)"
	npm run build:embed

test: clean-port ## Run automated tests (headless)
	@echo "$(BLUE)🧪 Running automated tests...$(NC)"
	@npm test || (echo "$(YELLOW)⚠️  Some tests failed - check report with 'make test-report'$(NC)" && exit 1)

test-functional: clean-port ## Run functional tests that verify actual rendering
	@echo "$(BLUE)🧪 Running functional tests...$(NC)"
	@npx playwright test tests/functional.spec.ts

test-ui: clean-port ## Run tests with interactive UI
	@echo "$(BLUE)🧪 Running tests with UI...$(NC)"
	npm run test:ui

test-headed: clean-port ## Run tests in headed mode (see browser)
	@echo "$(BLUE)🧪 Running tests in headed mode...$(NC)"
	npm run test:headed

test-report: ## Show test report from last run
	@echo "$(BLUE)📊 Opening test report...$(NC)"
	npx playwright show-report

install: ## Install dependencies
	@echo "$(BLUE)📦 Installing dependencies...$(NC)"
	npm install
	@echo "$(BLUE)🌐 Installing Playwright browsers...$(NC)"
	npx playwright install chromium

lint: ## Run linter
	@echo "$(BLUE)🔍 Running linter...$(NC)"
	npm run lint

clean: ## Clean build artifacts and test results
	@echo "$(BLUE)🧹 Cleaning build artifacts...$(NC)"
	rm -rf dist/
	rm -f sphere-viewer.js
	rm -rf playwright-report/
	rm -rf test-results/
	@echo "$(GREEN)✅ Clean complete$(NC)"

deploy: ## Deploy to bits host
	@echo "$(BLUE)🚀 Deploying to bits...$(NC)"
	npm run deploy

deploy-full: ## Build and deploy to bits host
	@echo "$(BLUE)🚀 Building and deploying to bits...$(NC)"
	npm run deploy:full

dev: ## Start development server
	@echo "$(BLUE)🚀 Starting development server on port 8080...$(NC)"
	python3 no-cache-server.py 8080

server: dev ## Alias for dev target

check: build test ## Alias for qa target

ci: install build test ## CI workflow: install + build + test

