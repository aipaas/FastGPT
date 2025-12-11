import { AicpTaskStatus } from './types';
import type {
  CreateAicpOptimizationTaskRequest,
  CreateAicpOptimizationTaskResponse,
  QueryAicpTaskStatusRequest,
  QueryAicpTaskStatusResponse
} from './types';
import { addLog } from '../../../../../common/system/log';

/** Mock 任务存储 */
type MockTaskInfo = {
  taskId: string;
  createdAt: number; // 创建时间戳
  taskType: 'rerank' | 'embed';
  status: AicpTaskStatus;
};

const mockTasks = new Map<string, MockTaskInfo>();

/**
 * Mock: 创建 AICP 优化任务
 * 真实实现需要调用 AICP 平台的 create_optimization_task 接口
 */
export async function mockCreateAicpOptimizationTask(
  request: CreateAicpOptimizationTaskRequest
): Promise<CreateAicpOptimizationTaskResponse> {
  addLog.info('[MOCK] AICP create optimization task', {
    taskType: request.taskType,
    parameters: request.parameters
  });

  // 模拟处理延迟
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

  // 生成 Mock task_id
  const taskId = `aicp_task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // 存储任务信息
  mockTasks.set(taskId, {
    taskId,
    createdAt: Date.now(),
    taskType: request.taskType,
    status: AicpTaskStatus.created
  });

  return {
    task_id: taskId,
    status: 'created',
    message: 'Optimization task created successfully'
  };
}

/**
 * Mock: 查询 AICP 任务状态
 * 真实实现需要调用 AICP 平台的 query_task_status 接口
 *
 * 状态转换时间线（从创建时间开始）：
 * - 0-3s: created
 * - 3-9s: running
 * - 9-12s: deploying
 * - 12s+: completed
 */
export async function mockQueryAicpTaskStatus(
  request: QueryAicpTaskStatusRequest
): Promise<QueryAicpTaskStatusResponse> {
  const task = mockTasks.get(request.taskId);

  if (!task) {
    return {
      task_id: request.taskId,
      status: AicpTaskStatus.failed,
      message: 'Task not found',
      error: 'The specified task ID does not exist'
    };
  }

  // 计算任务经过的时间（秒）
  const elapsedSeconds = (Date.now() - task.createdAt) / 1000;

  // 根据时间确定当前状态
  let currentStatus: AicpTaskStatus;
  let progress: number | undefined;
  let message: string;

  if (elapsedSeconds < 3) {
    currentStatus = AicpTaskStatus.created;
    progress = 0;
    message = 'Task created, waiting to start';
  } else if (elapsedSeconds < 9) {
    currentStatus = AicpTaskStatus.running;
    // 3-9秒之间，进度从 0 到 80
    progress = Math.min(80, Math.floor(((elapsedSeconds - 3) / 6) * 80));
    message = 'Training in progress';
  } else if (elapsedSeconds < 12) {
    currentStatus = AicpTaskStatus.deploying;
    // 9-12秒之间，进度从 80 到 95
    progress = Math.min(95, 80 + Math.floor(((elapsedSeconds - 9) / 3) * 15));
    message = 'Training completed, deploying model';
  } else {
    currentStatus = AicpTaskStatus.completed;
    progress = 100;
    message = 'Model deployed successfully';
  }

  // 更新任务状态
  task.status = currentStatus;

  // 构建响应
  const response: QueryAicpTaskStatusResponse = {
    task_id: request.taskId,
    status: currentStatus,
    progress,
    message
  };

  // completed 状态时返回 endpoint 信息
  if (currentStatus === AicpTaskStatus.completed) {
    response.endpoint = {
      ip: '192.168.1.100',
      port: '8080',
      model: `tuned-${task.taskType}-model-${task.taskId.slice(-6)}`,
      api_key: `mock_api_key_${Math.random().toString(36).slice(2, 15)}`
    };
  }

  addLog.info('[MOCK] AICP query task status', {
    taskId: request.taskId,
    status: currentStatus,
    progress,
    elapsedSeconds: elapsedSeconds.toFixed(1)
  });

  return response;
}
