代码问题如下：
```
[{
	"resource": "/d:/FastGPT/test/cases/service/core/train/rerank-data-generation.test.ts",
	"owner": "typescript",
	"code": "2339",
	"severity": 8,
	"message": "Property 'sourceInfo' does not exist on type 'FlattenMaps<{ dataIds: string[]; generationConfig: { model: string; temperature: number; }; generatedAt: Date; }>'.",
	"source": "ts",
	"startLineNumber": 316,
	"startColumn": 35,
	"endLineNumber": 316,
	"endColumn": 45,
	"origin": "extHost1"
}]
[{
	"resource": "/d:/FastGPT/test/cases/service/core/train/rerank-processor.test.ts",
	"owner": "typescript",
	"code": "2345",
	"severity": 8,
	"message": "Argument of type '{ data: { taskId: string; isRetry: boolean; }; }' is not assignable to parameter of type 'Job<RerankTrainTaskJobData, any, string>'.\n  Type '{ data: { taskId: string; isRetry: boolean; }; }' is missing the following properties from type 'Job<RerankTrainTaskJobData, any, string>': queue, name, opts, queueQualifiedName, and 58 more.",
	"source": "ts",
	"startLineNumber": 68,
	"startColumn": 45,
	"endLineNumber": 68,
	"endColumn": 48,
	"origin": "extHost1"
}]
[{
	"resource": "/d:/FastGPT/test/cases/service/core/train/rerank-training-flow.test.ts",
	"owner": "typescript",
	"code": "2353",
	"severity": 8,
	"message": "Object literal may only specify known properties, and 'name' does not exist in type 'CreateAicpOptimizationTaskRequest'.",
	"source": "ts",
	"startLineNumber": 134,
	"startColumn": 9,
	"endLineNumber": 134,
	"endColumn": 13,
	"origin": "extHost1"
},{
	"resource": "/d:/FastGPT/test/cases/service/core/train/rerank-training-flow.test.ts",
	"owner": "typescript",
	"code": "2339",
	"severity": 8,
	"message": "Property 'success' does not exist on type 'CreateAicpOptimizationTaskResponse'.",
	"source": "ts",
	"startLineNumber": 138,
	"startColumn": 21,
	"endLineNumber": 138,
	"endColumn": 28,
	"origin": "extHost1"
},{
	"resource": "/d:/FastGPT/test/cases/service/core/train/rerank-training-flow.test.ts",
	"owner": "typescript",
	"code": "2339",
	"severity": 8,
	"message": "Property 'error' does not exist on type 'CreateAicpOptimizationTaskResponse'.",
	"source": "ts",
	"startLineNumber": 139,
	"startColumn": 21,
	"endLineNumber": 139,
	"endColumn": 26,
	"origin": "extHost1"
}]
```
