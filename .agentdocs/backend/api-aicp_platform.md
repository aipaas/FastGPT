# AICP 客户端服务 API 接口
> AICP 客户端服务提供给 FastGPT 接口，用于创建优化任务并查询任务状态（训练→部署→完成）。
>

## 1. 创建优化任务
**接口描述**：FastGPT 上传数据集文件，发起优化任务。客户端服务自动创建优化自定义服务并触发训练、训练结束之后部署。

**请求**

+ 方法：`POST`
+ 路径：`/api/v1/optimization/tasks`
+ Content-Type：`multipart/form-data`
+ 请求体（表单数据）：
    - `dataset`：数据集文件流（必填，jsonl）
    - `task_type`：任务类型（必填，枚举：`rerank` | `embed`）
    - `parameters`：训练超参（可选，JSON 字符串）(不用填)
        * `learning_rate`：number，可选
        * `epochs`：integer，可选
        * `batch_size`：integer，可选

**请求示例**

```bash
# rerank
curl -X POST http://aicp-client/api/v1/optimization/tasks \
  -F "dataset=@/path/to/dataset.jsonl" \
  -F "task_type=rerank" \
  -F 'parameters={"learning_rate": 0.0001, "epochs": 3}'

# embed
curl -X POST http://aicp-client/api/v1/optimization/tasks \
  -F "dataset=@/path/to/dataset.jsonl" \
  -F "task_type=embed" \
  -F 'parameters={"learning_rate": 0.0001, "epochs": 3}'
```

**响应**

+ 状态码：`201 Created`
+ 响应体：

```json
{
  "task_id": "微调任务ID",
  "status": "created",
  "message": "微调任务已创建"
}
```

+ 响应字段：
    - `task_id`：string
    - `status`：string，枚举：`created`
    - `message`：string

## 2. 查询优化任务状态
**接口描述**：通过任务ID查询优化任务状态，轮询训练/部署/完成进度；训练完成后，客户端服务自动部署推理能力并返回服务入口（IP、端口）。

**请求**

+ 方法：`GET`
+ 路径：`/api/v1/optimization/tasks/{task_id}`
+ 路径参数：
    - `task_id`：string

**响应**

+ 状态码：`200 OK`
+ 响应体示例：
    - 进行中（running）

```json
{
  "task_id": "微调任务ID",
  "status": "running",
  "progress": 50,
  "message": "微调任务进行中"
}
```

    - 部署中（deploying）

```json
{
  "task_id": "微调任务ID",
  "status": "deploying",
  "progress": 100,
  "message": "训练完成，部署中"
}
```

    - 完成（completed）

```json
{
  "task_id": "微调任务ID",
  "status": "completed",
  "progress": 100,
  "message": "训练完成，已提供推理服务",
  "endpoint": {
    "ip": "服务IP地址",
    "port": "服务端口",
    "model": "模型名称"，
    "api_key": "认证信息"
  }
}
```

    - 失败（failed）

```json
{
  "task_id": "微调任务ID",
  "status": "failed",
  "message": "微调任务失败",
  "error": "错误信息"
}
```

+ 响应字段（按状态）：
    - 通用：`task_id` (string)，`status` (string)，`message` (string)
    - running：`progress` (integer, 0-100)
    - deploying：`progress` (integer, 100)
    - completed：`progress` (integer, 100)
        * `endpoint.ip`：string
        * `endpoint.port`：string
    - failed：`error` (string)

## 状态码说明
+ `201 Created`：创建任务成功
+ `200 OK`：查询成功
+ `400 Bad Request`：请求参数错误
+ `404 Not Found`：资源不存在
+ `500 Internal Server Error`：服务器内部错误

## 状态枚举（接口返回可能值）
+ `created`：任务已创建
+ `running`：训练中
+ `deploying`：训练完成，部署中
+ `completed`：部署完成，已对外服务
+ `failed`：任务失败

