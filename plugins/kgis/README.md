# KGIS - Knowledge Graph Information System

基于 FastAPI 和 LightRAG 构建的知识图谱信息服务系统

## 快速开始

### 本地开发

```bash
# 安装依赖
make install

# 启动开发服务器
make dev

# 运行测试
make test
```

### Docker 部署

```bash
# 构建镜像
make docker-build

# 运行容器
make docker-run

# 检查健康状态
make docker-health
```

## 核心功能

- **知识图谱**: 目前基于 LightRAG 的知识存储与检索
- **API 服务**: 提供 RESTful API 接口
- **数据处理**: 支持多种格式的数据导入和清洗
- **缓存机制**: 提供高效的查询缓存和性能优化

## Docker

详细部署文档请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)

## 代码质量

```bash
# 代码格式化
make format

# 代码检查
make lint

# 类型检查
make type

# 运行 CI 检查
make check
```

## API 文档

启动服务后访问: http://localhost:8000/docs

## 项目集成

本项目作为 FastGPT 插件提供服务集成能力。
