debug错误如下：
```
[Error] 2025-12-14 23:39:06 [DatasetTrainset] Generation task failed
{
  message: {
    jobId: '30',
    trainsetId: '693eccb42c4727c3271955e4',
    error: 'No data available in dataset'
  },
  stack: undefined
}
[Info] 2025-12-14 23:39:16 [DatasetTrainset] Generation task started {"jobId":"29","trainsetId":"693eccb32c4727c3271955dd","datasetId":"693e3ebe27c38570d7d8e057"}
[Info] 2025-12-14 23:39:16 Start dataset trainset generation {"trainsetId":"693eccb32c4727c3271955dd","datasetId":"693e3ebe27c38570d7d8e057"}
[Info] 2025-12-14 23:39:16 [DatasetTrainset] Generation task started {"jobId":"30","trainsetId":"693eccb42c4727c3271955e4","datasetId":"693e3eaa27c38570d7d8dffc"}
[Info] 2025-12-14 23:39:16 Start dataset trainset generation {"trainsetId":"693eccb42c4727c3271955e4","datasetId":"693e3eaa27c38570d7d8dffc"}
[Info] 2025-12-14 23:39:16 Dataset data statistics {"datasetId":"693e3eaa27c38570d7d8dffc","totalChunks":82,"withContentChunks":82,"emptyChunks":0,"sampleSize":1000,"sampleData":[{"id":"693e438e5500d575cfa63e3e","qLength":971,"qPreview":
"# Workflow: 知识库训练集（层级1）\n\n**任务ID**: 250112-train-mo","aLength":0,"aPreview":"NO_A"},{"id":"693e438e5500d575cfa63e42","qLength":559,"qPreview":"# Workflow: 知识库训练集（层级1）\n## 实施方案\n### 2. Schema 定义\n#","aLength"
:0,"aPreview":"NO_A"},{"id":"693e438e5500d575cfa63e45","qLength":1121,"qPreview":"# Workflow: 知识库训练集（层级1）\n## 实施方案\n### 2. Schema 定义\n#","aLength":0,"aPreview":"NO_A"},{"id":"693e438e5500d575cfa63e49","qLength":3691,"qPre
view":"# Workflow: 知识库训练集（层级1）\n## 实施方案\n### 3. 内部控制器\n\n```t","aLength":0,"aPreview":"NO_A"},{"id":"693e438e5500d575cfa63e56","qLength":1271,"qPreview":"# Workflow: 知识库训练集（层级1）\n## 实施方案\n### 2. Schema 定
义\n#","aLength":0,"aPreview":"NO_A"}]}
[Info] 2025-12-14 23:39:16 Dataset data statistics {"datasetId":"693e3ebe27c38570d7d8e057","totalChunks":66,"withContentChunks":66,"emptyChunks":0,"sampleSize":1000,"sampleData":[{"id":"693e3f3527c38570d7d8e257","qLength":1229,"qPreview"
:"# FastGPT API 路由开发规范\n## 2. 基础模板\n### 2.2 创建操作 API\n\n","aLength":0,"aPreview":"NO_A"},{"id":"693e3f3527c38570d7d8e25a","qLength":1309,"qPreview":"# FastGPT API 路由开发规范\n## 3. 认证机制\n### 3.4 权限检查模式\n\n``","a
Length":0,"aPreview":"NO_A"},{"id":"693e3f3527c38570d7d8e25e","qLength":1161,"qPreview":"# FastGPT API 路由开发规范\n## 3. 认证机制\n### 3.2 认证函数\n\n```t","aLength":0,"aPreview":"NO_A"},{"id":"693e3f3527c38570d7d8e262","qLength":1379
,"qPreview":"# FastGPT API 路由开发规范\n## 6. 特殊配置\n### 6.3 流式响应 API\n\n","aLength":0,"aPreview":"NO_A"},{"id":"693e3f3527c38570d7d8e266","qLength":1032,"qPreview":"# FastGPT API 路由开发规范\n## 2. 基础模板\n### 2.3 更新操作 AP
I\n\n","aLength":0,"aPreview":"NO_A"}]}
[Info] 2025-12-14 23:39:16 Query test before sampling {"datasetId":"693e3eaa27c38570d7d8dffc","testCount":82,"datasetIdType":"string","datasetIdLength":24,"isValidObjectId":true}
[Info] 2025-12-14 23:39:16 Query test before sampling {"datasetId":"693e3ebe27c38570d7d8e057","testCount":66,"datasetIdType":"string","datasetIdLength":24,"isValidObjectId":true}
[Info] 2025-12-14 23:39:16 Sample data result {"datasetId":"693e3eaa27c38570d7d8dffc","sampleCount":0,"sampleSize":1000,"usedFallbackStrategy":false}
[Error] 2025-12-14 23:39:16 Dataset trainset generation failed
```