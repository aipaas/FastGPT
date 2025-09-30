import { addLog } from '../../../common/system/log';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { evaluationTaskQueue, evaluationItemQueue } from './mq';
import { MongoEvalItem } from './schema';
import { Types } from 'mongoose';

/**
 * Evaluation task status calculator
 * Calculates real-time status from job queues, not database status fields
 */
export async function getEvaluationTaskStatus(evalId: string): Promise<EvaluationStatusEnum> {
  try {
    // Get task-related jobs
    const taskJobs = await evaluationTaskQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedTaskJobs = taskJobs.filter((job) => job.data.evalId === evalId);

    // If no task jobs, check evaluation item jobs
    if (relatedTaskJobs.length === 0) {
      return await getEvaluationTaskStatusFromItems(evalId);
    }

    // Get job states and prioritize by importance
    const jobStates = await Promise.all(relatedTaskJobs.map(async (job) => await job.getState()));

    // Return status by priority: evaluating > error > queuing > completed
    if (jobStates.includes('active')) {
      return EvaluationStatusEnum.evaluating;
    }

    if (jobStates.includes('failed')) {
      return EvaluationStatusEnum.error;
    }

    if (jobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
      return EvaluationStatusEnum.queuing;
    }

    // If all task jobs completed, check evaluation item status
    return await getEvaluationTaskStatusFromItems(evalId);
  } catch (error) {
    return EvaluationStatusEnum.error;
  }
}

/**
 * Calculate evaluation task status from evaluation item jobs
 *
 * Logic:
 * 1. relatedItemJobs.length > 0:
 *    1.1. 存在job为运行中, 则当前任务状态为evaluating
 *    1.2. 所有job都为完成状态:
 *         1.2.1. 所有job都是complete, 当前任务状态为complete
 *         1.2.2. 有任何job是error, 当前任务状态为error
 * 2. relatedItemJobs.length === 0:
 *    2.1. 存在MongoEvalItem, 任务状态为queuing
 *    2.2. 不存在MongoEvalItem, 任务状态为error
 */
async function getEvaluationTaskStatusFromItems(evalId: string): Promise<EvaluationStatusEnum> {
  try {
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedItemJobs = itemJobs.filter((job) => job.data.evalId === evalId);

    // Case 1: relatedItemJobs.length > 0
    if (relatedItemJobs.length > 0) {
      // Get job states
      const itemJobStates = await Promise.all(
        relatedItemJobs.map(async (job) => await job.getState())
      );

      // 1.1. 存在job为运行中 (active, waiting, delayed), 则当前任务状态为evaluating
      if (
        itemJobStates.some((state) =>
          ['active', 'waiting', 'delayed', 'prioritized'].includes(state)
        )
      ) {
        return EvaluationStatusEnum.evaluating;
      }

      // 1.2. 所有job都为完成状态 (completed, failed)
      const allCompleted = itemJobStates.every((state) => ['completed', 'failed'].includes(state));
      if (allCompleted) {
        // 1.2.2. 有任何job是error, 当前任务状态为error
        if (itemJobStates.includes('failed')) {
          return EvaluationStatusEnum.error;
        }
        // 1.2.1. 所有job都是complete, 当前任务状态为complete
        if (itemJobStates.every((state) => state === 'completed')) {
          return EvaluationStatusEnum.completed;
        }
      }

      // Fallback for unexpected job states
      return EvaluationStatusEnum.evaluating;
    }

    // Case 2: relatedItemJobs.length === 0
    try {
      // Check if MongoEvalItem exists for this evaluation
      const evalItemCount = await MongoEvalItem.countDocuments({
        evalId: new Types.ObjectId(evalId)
      });

      if (evalItemCount > 0) {
        // 2.1. 存在MongoEvalItem, 任务状态为queuing (等待job创建)
        return EvaluationStatusEnum.queuing;
      } else {
        // 2.2. 不存在MongoEvalItem, 可能是任务还在初始化阶段, 返回queuing
        return EvaluationStatusEnum.queuing;
      }
    } catch (dbError) {
      // Database error, return queuing for backward compatibility
      return EvaluationStatusEnum.queuing;
    }
  } catch (error) {
    return EvaluationStatusEnum.error;
  }
}

/**
 * Calculate real-time status of evaluation item
 *
 * Logic:
 * 1. relatedJobs.length > 0:
 *    1.1. 存在job为运行中 (active), 则状态为evaluating
 *    1.2. 存在job为代处理 (waiting, delayed等)， 则状态为queuing
 *    1.2. 所有job都为完成状态:
 *         1.2.1. 有任何job是failed, 状态为error
 *         1.2.2. 所有job都是completed, 状态为completed
 * 2. relatedJobs.length === 0:
 *    2.1. 不存在MongoEvalItem, 状态为error (数据异常)
 *    2.2. 存在MongoEvalItem且有finishTime, 根据errorMessage判断completed/error
 *    2.3. 存在MongoEvalItem但无finishTime, 状态为queuing (等待job创建)
 */
export async function getEvaluationItemStatus(evalItemId: string): Promise<EvaluationStatusEnum> {
  try {
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedJobs = itemJobs.filter((job) => job.data.evalItemId === evalItemId);

    // Case 1: relatedJobs.length > 0
    if (relatedJobs.length > 0) {
      const jobStates = await Promise.all(relatedJobs.map(async (job) => await job.getState()));

      // 1.1. 存在job为运行中 (active), 则状态为evaluating
      if (jobStates.includes('active')) {
        return EvaluationStatusEnum.evaluating;
      }

      // 1.2. 存在job为代处理 (waiting, delayed等)， 则状态为queuing
      if (jobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
        return EvaluationStatusEnum.queuing;
      }

      // 1.3. 所有job都为完成状态 (completed, failed)
      const allFinished = jobStates.every((state) => ['completed', 'failed'].includes(state));
      if (allFinished) {
        // 1.3.1. 有任何job是failed, 状态为error
        if (jobStates.includes('failed')) {
          return EvaluationStatusEnum.error;
        }
        // 1.3.2. 所有job都是completed, 状态为completed
        if (jobStates.every((state) => state === 'completed')) {
          return EvaluationStatusEnum.completed;
        }
      }

      // Fallback for unexpected job states
      return EvaluationStatusEnum.queuing;
    }

    // Case 2: relatedJobs.length === 0
    try {
      const evalItem = await MongoEvalItem.findById(new Types.ObjectId(evalItemId), {
        finishTime: 1,
        errorMessage: 1
      });

      // 2.1. 不存在MongoEvalItem, 状态为error (数据异常)
      if (!evalItem) {
        return EvaluationStatusEnum.error;
      }

      // 2.2. 存在MongoEvalItem且有finishTime, 根据errorMessage判断completed/error
      if (evalItem.finishTime) {
        return evalItem.errorMessage ? EvaluationStatusEnum.error : EvaluationStatusEnum.completed;
      }

      // 2.3. 存在MongoEvalItem但无finishTime, 状态为queuing (等待job创建)
      return EvaluationStatusEnum.queuing;
    } catch (dbError) {
      // Database error, return error
      return EvaluationStatusEnum.error;
    }
  } catch (error) {
    return EvaluationStatusEnum.error;
  }
}

/**
 * Batch calculate evaluation item status for performance optimization
 *
 * Logic (consistent with getEvaluationItemStatus):
 * 1. relatedJobs.length > 0:
 *    1.1. 存在job为运行中 (active), 则状态为evaluating
 *    1.2. 存在job为代处理 (waiting, delayed等)， 则状态为queuing
 *    1.3. 所有job都为完成状态:
 *         1.3.1. 有任何job是failed, 状态为error
 *         1.3.2. 所有job都是completed, 状态为completed
 * 2. relatedJobs.length === 0:
 *    2.1. 不存在MongoEvalItem, 状态为error (数据异常)
 *    2.2. 存在MongoEvalItem且有finishTime, 根据errorMessage判断completed/error
 *    2.3. 存在MongoEvalItem但无finishTime, 状态为queuing (等待job创建)
 */
export async function getBatchEvaluationItemStatus(
  evalItemIds: string[]
): Promise<Map<string, EvaluationStatusEnum>> {
  const statusMap = new Map<string, EvaluationStatusEnum>();

  try {
    // Get all related jobs in single query to reduce queries
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    // Query database status first to distinguish queuing vs completed
    const evalItems = await MongoEvalItem.find(
      { _id: { $in: evalItemIds.map((id) => new Types.ObjectId(id)) } },
      { finishTime: 1, errorMessage: 1 }
    );

    const itemStatusByDb = new Map<string, EvaluationStatusEnum>();
    evalItems.forEach((item) => {
      const itemId = item._id.toString();
      if (item.finishTime) {
        itemStatusByDb.set(
          itemId,
          item.errorMessage ? EvaluationStatusEnum.error : EvaluationStatusEnum.completed
        );
      } else {
        itemStatusByDb.set(itemId, EvaluationStatusEnum.queuing);
      }
    });

    // Initialize default status for each evalItemId based on database status
    evalItemIds.forEach((id) => {
      const dbStatus = itemStatusByDb.get(id);
      if (dbStatus === undefined) {
        // 2.1. 不存在MongoEvalItem, 状态为error (数据异常)
        statusMap.set(id, EvaluationStatusEnum.error);
      } else {
        // 2.2/2.3. 存在MongoEvalItem, 使用数据库状态
        statusMap.set(id, dbStatus);
      }
    });

    // Group jobs by evalItemId and batch get states
    const jobsByItemId = new Map<string, any[]>();
    itemJobs.forEach((job) => {
      if (evalItemIds.includes(job.data.evalItemId)) {
        const itemId = job.data.evalItemId;
        if (!jobsByItemId.has(itemId)) {
          jobsByItemId.set(itemId, []);
        }
        jobsByItemId.get(itemId)!.push(job);
      }
    });

    // Optimize: batch get all job states to reduce async calls
    const allJobsToCheck = Array.from(jobsByItemId.values()).flat();
    const allJobStates = await Promise.all(
      allJobsToCheck.map(async (job) => ({
        job,
        state: await job.getState()
      }))
    );

    // Create job to state mapping
    const jobStateMap = new Map<any, string>();
    allJobStates.forEach(({ job, state }) => {
      jobStateMap.set(job, state);
    });

    // Calculate status for each evaluation item (prioritize job status if exists)
    for (const [itemId, jobs] of jobsByItemId.entries()) {
      const jobStates = jobs.map((job) => jobStateMap.get(job)!);

      // Case 1: relatedJobs.length > 0, apply correct priority logic
      let status = EvaluationStatusEnum.queuing;

      // 1.1. 存在job为运行中 (active), 则状态为evaluating
      if (jobStates.includes('active')) {
        status = EvaluationStatusEnum.evaluating;
      }
      // 1.2. 存在job为代处理 (waiting, delayed等)， 则状态为queuing
      else if (jobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
        status = EvaluationStatusEnum.queuing;
      }
      // 1.3. 所有job都为完成状态 (completed, failed)
      else if (jobStates.every((state) => ['completed', 'failed'].includes(state))) {
        // 1.3.1. 有任何job是failed, 状态为error
        if (jobStates.includes('failed')) {
          status = EvaluationStatusEnum.error;
        }
        // 1.3.2. 所有job都是completed, 状态为completed
        else if (jobStates.every((state) => state === 'completed')) {
          status = EvaluationStatusEnum.completed;
        }
      }

      statusMap.set(itemId, status);
    }
  } catch (error) {
    addLog.error('Error getting batch evaluation item status:', { evalItemIds, error });
    // If error occurs, set all items to error status
    evalItemIds.forEach((id) => {
      statusMap.set(id, EvaluationStatusEnum.error);
    });
  }

  return statusMap;
}

/**
 * Get evaluation task statistics by reusing batch status calculation for consistency
 */
export async function getEvaluationTaskStats(evalId: string): Promise<{
  total: number;
  completed: number;
  evaluating: number;
  queuing: number;
  error: number;
}> {
  try {
    // Get all evaluation item IDs
    const allEvalItems = await MongoEvalItem.find(
      { evalId: new Types.ObjectId(evalId) },
      { _id: 1 }
    ).lean();

    const evalItemIds = allEvalItems.map((item) => item._id.toString());
    const totalItems = evalItemIds.length;

    if (totalItems === 0) {
      return {
        total: 0,
        completed: 0,
        evaluating: 0,
        queuing: 0,
        error: 0
      };
    }

    // Reuse batch status calculation logic to ensure consistency
    const statusMap = await getBatchEvaluationItemStatus(evalItemIds);

    // Count status distribution
    const stats = {
      total: totalItems,
      completed: 0,
      evaluating: 0,
      queuing: 0,
      error: 0
    };

    // Count each status
    statusMap.forEach((status) => {
      switch (status) {
        case EvaluationStatusEnum.completed:
          stats.completed++;
          break;
        case EvaluationStatusEnum.evaluating:
          stats.evaluating++;
          break;
        case EvaluationStatusEnum.queuing:
          stats.queuing++;
          break;
        case EvaluationStatusEnum.error:
          stats.error++;
          break;
        default:
          // Unknown status, count as queuing for safety
          stats.queuing++;
          break;
      }
    });

    return stats;
  } catch (error) {
    addLog.error('Error getting evaluation task stats:', { evalId, error });
    return {
      total: 0,
      completed: 0,
      evaluating: 0,
      queuing: 0,
      error: 0
    };
  }
}

/**
 * Check if evaluation task or item jobs are active
 */
export async function checkEvaluationTaskJobActive(evalId: string): Promise<boolean> {
  try {
    const taskJobs = await evaluationTaskQueue.getJobs(['waiting', 'delayed', 'active']);
    const itemJobs = await evaluationItemQueue.getJobs(['waiting', 'delayed', 'active']);

    const hasActiveTaskJob = taskJobs.some((job) => job.data.evalId === evalId);
    const hasActiveItemJob = itemJobs.some((job) => job.data.evalId === evalId);

    return hasActiveTaskJob || hasActiveItemJob;
  } catch (error) {
    return false;
  }
}

/**
 * Check if evaluation item job is active
 */
export async function checkEvaluationItemJobActive(evalItemId: string): Promise<boolean> {
  try {
    const itemJobs = await evaluationItemQueue.getJobs(['waiting', 'delayed', 'active']);
    return itemJobs.some((job) => job.data.evalItemId === evalItemId);
  } catch (error) {
    return false;
  }
}
