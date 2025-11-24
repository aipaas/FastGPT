# KGIS Docker 部署指南

本文档介绍如何使用 Docker 部署 KGIS (Knowledge Graph Information System) 服务。

## 快速开始

### 1. 构建和运行

```bash
# 一键构建镜像
make docker-build

# 运行容器
make docker-run

# 查看服务状态
make docker-health
```

### 2. 验证部署

```bash
# 检查健康状态
curl http://localhost:8000/health

# 查看服务日志
make docker-logs
```

## 详细操作

### 开发环境

```bash
# 启动本地开发服务器
make dev

# 在 Docker 容器中开发
make docker-dev
```

### 生产环境

```bash
# 完整发布流程 (代码检查 + 构建)
make release

# 查看版本信息
make version

# 创建 Git 标签
make tag TAG=v1.0.0
```

### 镜像仓库操作

```bash
# 推送到镜像仓库
REGISTRY=your-registry.com make docker-push

# 从镜像仓库拉取
REGISTRY=your-registry.com make docker-pull
```

### 容器管理

```bash
# 停止容器
make docker-stop

# 重启容器
make docker-restart

# 进入容器 shell
make docker-shell

# 检查镜像信息
make docker-inspect

# 清理 Docker 资源
make docker-clean
```

## 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `LOG_LEVEL` | `INFO` | 日志级别 (DEBUG, INFO, WARNING, ERROR) |
| `LOG_FORMAT` | `json` | 运行环境 (json, console, dev, plain) |
| `HOST` | `0.0.0.0` | 服务绑定地址 |
| `PORT` | `8000` | 服务端口 |
| `RELOAD` | `false` | 是否启用热重载 (仅开发环境) |
| `HOME` | `/tmp/kgis` | 工作目录 |

### AI 服务配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `AIPROXY_API_ENDPOINT` | `http://aiproxy:3000` | AI 代理服务地址 |
| `AIPROXY_API_TOKEN` | `aiproxy` | AI 代理服务令牌 |

### 数据库配置

KGIS 需要以下外部数据库服务：

- **MongoDB**: 文档状态存储
- **PostgreSQL**: 向量存储 (需要 pgvector 扩展)
- **Neo4j**: 图谱存储

## 数据持久化

默认工作目录挂载：
```bash
-v /tmp/kgis:/tmp/kgis
```

数据存储结构：
```
/tmp/kgis/
├── {workspace_id}/          # 工作区隔离目录
│   ├── instance_status.json # 实例状态文件
│   └── lightrag_storage/    # LightRAG 数据存储
```

## API 接口

详细 API 文档请参考：http://localhost:8000/docs
