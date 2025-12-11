# MongoDB 测试环境配置指南

## 背景

FastGPT 项目使用 Vitest 进行单元测试，测试依赖 `mongodb-memory-server` 创建内存 MongoDB 实例。该库会自动下载 MongoDB 二进制文件，但由于网络限制，自动下载经常失败。

为解决此问题，项目支持通过环境变量指定本地 MongoDB 二进制文件路径。

## 快速开始

### 1. 准备 MongoDB 二进制文件

下载 MongoDB 7.0.14 Windows 版本：
- **下载地址**：https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.14.zip
- **解压到**：`D:\mongodb-binaries\mongodb-win32-x86_64-7.0.14\` （或任意路径）
- **确认文件**：`D:\mongodb-binaries\mongodb-win32-x86_64-7.0.14\bin\mongod.exe` 存在

### 2. 设置环境变量并运行测试

#### Linux / macOS / Git Bash

```bash
export MONGOMS_SYSTEM_BINARY="D:/mongodb-binaries/mongodb-win32-x86_64-7.0.14/bin/mongod.exe"
export MONGOMS_VERSION="7.0.14"
export MONGOMS_SKIP_MD5="1"
pnpm test
```

#### Windows CMD

```cmd
set MONGOMS_SYSTEM_BINARY=D:/mongodb-binaries/mongodb-win32-x86_64-7.0.14/bin/mongod.exe
set MONGOMS_VERSION=7.0.14
set MONGOMS_SKIP_MD5=1
pnpm test
```

#### Windows PowerShell

```powershell
$env:MONGOMS_SYSTEM_BINARY="D:/mongodb-binaries/mongodb-win32-x86_64-7.0.14/bin/mongod.exe"
$env:MONGOMS_VERSION="7.0.14"
$env:MONGOMS_SKIP_MD5="1"
pnpm test
```

### 3. （可选）设置永久环境变量

#### Windows 系统环境变量

1. 打开"系统属性" → "高级" → "环境变量"
2. 在"用户变量"或"系统变量"中添加：
   - `MONGOMS_SYSTEM_BINARY` = `D:/mongodb-binaries/mongodb-win32-x86_64-7.0.14/bin/mongod.exe`
   - `MONGOMS_VERSION` = `7.0.14`
   - `MONGOMS_SKIP_MD5` = `1`
3. 重启终端后直接运行 `pnpm test`

#### Linux / macOS 持久化配置

在 `~/.bashrc` 或 `~/.zshrc` 中添加：

```bash
export MONGOMS_SYSTEM_BINARY="/path/to/mongodb/bin/mongod"
export MONGOMS_VERSION="7.0.14"
export MONGOMS_SKIP_MD5="1"
```

执行 `source ~/.bashrc` 后生效。

## 工作原理

### 环境变量说明

`mongodb-memory-server` 库支持通过以下环境变量配置本地 MongoDB：

| 环境变量 | 说明 | 示例值 |
|---------|------|--------|
| `MONGOMS_SYSTEM_BINARY` | MongoDB 可执行文件的完整路径 | `D:/mongodb-binaries/mongodb-win32-x86_64-7.0.14/bin/mongod.exe` |
| `MONGOMS_VERSION` | MongoDB 版本号 | `7.0.14` |
| `MONGOMS_SKIP_MD5` | 跳过 MD5 校验（使用本地文件时设置为 1） | `1` |

### 配置优先级

`mongodb-memory-server` 按以下优先级读取配置：

1. **环境变量**（最高优先级）：`MONGOMS_SYSTEM_BINARY` 等
2. **代码配置**：`MongoMemoryReplSet.create()` 参数
3. **配置文件**：`.mongodb-memory-server.json`
4. **自动下载**：从官方源自动下载（网络受限时失败）

项目使用环境变量方案，具有以下优势：
- 灵活简单，无需修改项目配置文件
- 每个开发者可使用不同路径
- 不污染代码仓库
- 符合 12-factor app 配置管理最佳实践

### 代码实现

`test/globalSetup.ts` 中的实现：

```typescript
export default async function setup(project: TestProject) {
  // mongodb-memory-server 会自动从环境变量读取配置
  const replset = await MongoMemoryReplSet.create({
    replSet: { count: 1 }
  });
  const uri = replset.getUri();
  project.provide('MONGODB_URI', uri);

  return async () => {
    await replset.stop();
  };
}
```

## 运行测试

配置完成后，可以正常运行测试：

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test test/cases/service/core/train/rerank-trainset.test.ts

# 生成覆盖率报告
pnpm test --coverage
```

**预期输出**：
```
✓ test/cases/service/core/train/rerank-trainset.test.ts (11) 3123ms
  ✓ Rerank Trainset Controller > createRerankTrainset > 应该成功创建应用训练集

Test Files  1 passed (1)
     Tests  11 passed (11)
```

## 故障排除

### 问题 1: 仍然尝试从网络下载 MongoDB

**症状**：
```
DownloadError: Download failed for url "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.14.zip"
```

**原因**：环境变量未设置或未生效

**解决方案**：
1. 确认已设置环境变量（运行 `echo $MONGOMS_SYSTEM_BINARY` 或 `echo %MONGOMS_SYSTEM_BINARY%`）
2. 检查路径使用正斜杠 `/` 而非反斜杠 `\`
3. 如果使用永久环境变量，确保重启了终端
4. 尝试在命令行临时设置环境变量后再运行测试

### 问题 2: mongod.exe 未找到

**错误信息**：
```
Error: ENOENT: no such file or directory, spawn D:/mongodb-binaries/mongodb-win32-x86_64-7.0.14/bin/mongod.exe
```

**解决方案**：
1. 检查 `MONGOMS_SYSTEM_BINARY` 路径是否正确
2. 确认文件存在：`ls -la "D:/mongodb-binaries/mongodb-win32-x86_64-7.0.14/bin/mongod.exe"`
3. 检查路径格式（Windows 下使用正斜杠 `/` 或双反斜杠 `\\`）

### 问题 3: 版本不匹配

**错误信息**：
```
Error: version mismatch: expected 7.0.14 but got ...
```

**解决方案**：
1. 确保 `MONGOMS_VERSION` 与实际下载的 MongoDB 版本一致
2. 检查解压目录名称是否包含正确版本号

### 问题 4: 权限问题（Linux/macOS）

**错误信息**：
```
Error: EACCES: permission denied
```

**解决方案**：
```bash
chmod +x /path/to/mongodb/bin/mongod
```

## 不同平台配置示例

### Windows 配置

```cmd
# 下载地址
https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.14.zip

# 解压到
D:\mongodb-binaries\mongodb-win32-x86_64-7.0.14\

# 环境变量（使用正斜杠）
MONGOMS_SYSTEM_BINARY=D:/mongodb-binaries/mongodb-win32-x86_64-7.0.14/bin/mongod.exe
MONGOMS_VERSION=7.0.14
MONGOMS_SKIP_MD5=1
```

### macOS (Intel) 配置

```bash
# 下载地址
https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-7.0.14.tgz

# 解压到
~/mongodb-binaries/mongodb-macos-x86_64-7.0.14/

# 环境变量
export MONGOMS_SYSTEM_BINARY="$HOME/mongodb-binaries/mongodb-macos-x86_64-7.0.14/bin/mongod"
export MONGOMS_VERSION="7.0.14"
export MONGOMS_SKIP_MD5="1"
```

### macOS (Apple Silicon) 配置

```bash
# 下载地址
https://fastdl.mongodb.org/osx/mongodb-macos-arm64-7.0.14.tgz

# 解压到
~/mongodb-binaries/mongodb-macos-arm64-7.0.14/

# 环境变量
export MONGOMS_SYSTEM_BINARY="$HOME/mongodb-binaries/mongodb-macos-arm64-7.0.14/bin/mongod"
export MONGOMS_VERSION="7.0.14"
export MONGOMS_SKIP_MD5="1"
```

### Linux (Ubuntu/Debian) 配置

```bash
# 下载地址
https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-7.0.14.tgz

# 解压到
~/mongodb-binaries/mongodb-linux-x86_64-ubuntu2204-7.0.14/

# 环境变量
export MONGOMS_SYSTEM_BINARY="$HOME/mongodb-binaries/mongodb-linux-x86_64-ubuntu2204-7.0.14/bin/mongod"
export MONGOMS_VERSION="7.0.14"
export MONGOMS_SKIP_MD5="1"
```

## CI/CD 环境配置

### GitHub Actions

在 `.github/workflows/test.yml` 中：

```yaml
- name: Setup MongoDB binaries
  run: |
    wget https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-7.0.14.tgz
    tar -xzf mongodb-linux-x86_64-ubuntu2204-7.0.14.tgz
    echo "MONGOMS_SYSTEM_BINARY=$(pwd)/mongodb-linux-x86_64-ubuntu2204-7.0.14/bin/mongod" >> $GITHUB_ENV
    echo "MONGOMS_VERSION=7.0.14" >> $GITHUB_ENV
    echo "MONGOMS_SKIP_MD5=1" >> $GITHUB_ENV

- name: Run tests
  run: pnpm test
```

### GitLab CI

在 `.gitlab-ci.yml` 中：

```yaml
test:
  before_script:
    - wget https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-7.0.14.tgz
    - tar -xzf mongodb-linux-x86_64-ubuntu2204-7.0.14.tgz
    - export MONGOMS_SYSTEM_BINARY="$(pwd)/mongodb-linux-x86_64-ubuntu2204-7.0.14/bin/mongod"
    - export MONGOMS_VERSION="7.0.14"
    - export MONGOMS_SKIP_MD5="1"
  script:
    - pnpm test
```

## 文件说明

### 项目文件（版本控制）

- `test/globalSetup.ts` - Vitest 全局测试设置，包含 MongoDB 初始化逻辑
- `vitest.config.mts` - Vitest 配置文件
- `.gitignore` - 配置忽略 `mongodb-binaries/` 目录

### 本地文件（不提交）

- `mongodb-binaries/` - MongoDB 二进制文件目录（已在 `.gitignore` 中配置忽略）

## 开发者注意事项

1. **首次克隆仓库**：新开发者需要下载 MongoDB 并设置环境变量
2. **跨平台**：不同操作系统需要下载对应平台的 MongoDB 版本
3. **版本升级**：升级 MongoDB 版本时，更新下载链接和 `MONGOMS_VERSION` 环境变量
4. **团队协作**：建议团队统一使用相同的 MongoDB 版本以避免兼容性问题

## 相关文档

- [mongodb-memory-server 官方文档](https://github.com/nodkz/mongodb-memory-server)
- [mongodb-memory-server 环境变量配置](https://github.com/nodkz/mongodb-memory-server#configuration)
- [Vitest 配置文档](https://vitest.dev/config/)
- [MongoDB 官方下载](https://www.mongodb.com/try/download/community)
