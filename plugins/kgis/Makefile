##@ General

.PHONY: help
help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

.PHONY: install
install: ## 安装项目依赖库
	uv sync

.PHONY: dev
dev: ## 启动开发服务器
	uv run uvicorn kgis.main:app --host 0.0.0.0 --port 8000 --reload

.PHONY: format
format: ## 项目代码风格格式化
	uv run ruff format

.PHONY: lint
lint: ## 执行项目checklist
	uv run ruff check

.PHONY: type
type: ## 项目类型检查
	uv run mypy src

.PHONY: ci
ci: install format lint type ## CI项

.PHONY: check
check:  ci ## 代码提交前检查项目一致性

##@ Docker & Deployment

# Variables
IMAGE_NAME ?= kgis
REGISTRY ?= your-registry.com
AIPROXY_API_ENDPOINT ?= http://aiproxy:3000
AIPROXY_API_TOKEN ?= aiproxy

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "latest")
TIMESTAMP := $(shell date +%Y%m%d%H%M%S)
FULL_TAG := $(IMAGE_NAME):$(VERSION)-$(TIMESTAMP)

.PHONY: docker-build
docker-build: ## 构建 Docker 镜像
	@echo "Building Docker image: $(FULL_TAG)"
	docker build -t $(FULL_TAG) -t $(IMAGE_NAME):latest .
	@echo "Image built successfully: $(FULL_TAG)"

.PHONY: docker-run
docker-run: ## 运行 Docker 容器
	@echo "Running $(IMAGE_NAME):latest..."
	docker run -d \
		--name $(IMAGE_NAME) \
		-p 8000:8000 \
		-e LOG_LEVEL=INFO \
		-e ENVIRONMENT=json \
		-e RELOAD=false \
		-e AIPROXY_API_ENDPOINT=$(AIPROXY_API_ENDPOINT) \
		-e AIPROXY_API_TOKEN=$(AIPROXY_API_TOKEN) \
		-v /tmp/kgis:/tmp/kgis \
		--restart unless-stopped \
		$(IMAGE_NAME):latest

.PHONY: docker-stop
docker-stop: ## 停止 Docker 容器
	docker stop $(IMAGE_NAME) || true
	docker rm $(IMAGE_NAME) || true

.PHONY: docker-restart
docker-restart: docker-stop docker-run ## 重启 Docker 容器

.PHONY: docker-logs
docker-logs: ## 查看 Docker 容器日志
	docker logs -f $(IMAGE_NAME)

.PHONY: docker-shell
docker-shell: ## 进入 Docker 容器 shell
	docker exec -it $(IMAGE_NAME) /bin/bash

.PHONY: docker-push
docker-push: ## 推送 Docker 镜像到仓库
	@if [ "$(REGISTRY)" = "your-registry.com" ]; then \
		echo "Please set REGISTRY environment variable"; \
		exit 1; \
	fi
	docker tag $(IMAGE_NAME):latest $(REGISTRY)/$(FULL_TAG)
	docker tag $(IMAGE_NAME):latest $(REGISTRY)/$(IMAGE_NAME):latest
	docker push $(REGISTRY)/$(FULL_TAG)
	docker push $(REGISTRY)/$(IMAGE_NAME):latest
	@echo "Images pushed successfully to $(REGISTRY)"

.PHONY: docker-pull
docker-pull: ## 从仓库拉取 Docker 镜像
	@if [ "$(REGISTRY)" = "your-registry.com" ]; then \
		echo "Please set REGISTRY environment variable"; \
		exit 1; \
	fi
	docker pull $(REGISTRY)/$(IMAGE_NAME):latest
	docker tag $(REGISTRY)/$(IMAGE_NAME):latest $(IMAGE_NAME):latest

.PHONY: docker-clean
docker-clean: ## 清理 Docker 相关资源
	@echo "Stopping and removing containers..."
	docker stop $(IMAGE_NAME) || true
	docker rm $(IMAGE_NAME) || true
	@echo "Removing images..."
	docker rmi $(FULL_TAG) || true
	docker rmi $(IMAGE_NAME):latest || true

.PHONY: docker-inspect
docker-inspect: ## 检查 Docker 镜像信息
	docker inspect $(IMAGE_NAME):latest

.PHONY: docker-health
docker-health: ## 检查容器健康状态
	@echo "Container health status:"
	docker ps --filter name=$(IMAGE_NAME) --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

##@ Release & Version

.PHONY: version
version: ## 显示当前版本信息
	@echo "Image Name: $(IMAGE_NAME)"
	@echo "Version: $(VERSION)"
	@echo "Timestamp: $(TIMESTAMP)"
	@echo "Full Tag: $(FULL_TAG)"

.PHONY: release
release: check docker-build ## 完整发布流程 (检查代码 + 构建镜像)
	@echo "Release completed: $(FULL_TAG)"

.PHONY: tag
tag: ## 创建 Git tag
	@if [ -z "$(TAG)" ]; then \
		echo "Usage: make tag TAG=v1.0.0"; \
		exit 1; \
	fi
	git tag -a $(TAG) -m "Release $(TAG)"
	git push origin $(TAG)
	@echo "Git tag $(TAG) created and pushed"

##@ Testing in Docker

# .PHONY: docker-test
# docker-test: ## 在 Docker 容器中运行测试
# 	docker build -t $(IMAGE_NAME):test .
# 	docker run --rm \
# 		-v $(PWD):/app \
# 		-w /app \
# 		$(IMAGE_NAME):test \
# 		uv run pytest tests/ -v

.PHONY: docker-dev
docker-dev: ## 在 Docker 容器中启动开发环境
	docker build -t $(IMAGE_NAME):dev .
	docker run -it --rm \
		-v $(PWD):/app \
		-v /tmp/kgis:/tmp/kgis \
		-p 8000:8000 \
		-w /app \
		$(IMAGE_NAME):dev \
		/bin/bash

