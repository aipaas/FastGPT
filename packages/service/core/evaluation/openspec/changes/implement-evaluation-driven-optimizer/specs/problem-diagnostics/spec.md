# Problem Diagnostics Engine Specification

## ADDED Requirements

### Requirement 1: Workflow Problem Analysis
The system MUST analyze evaluation results to identify workflow-level performance problems and bottleneck nodes.

#### Scenario: Multi-node workflow bottleneck identification
- GIVEN a workflow with 5 nodes where node 3 (dataset-search) has 95th percentile response time >3000ms and accuracy <80%
- WHEN the diagnostics engine analyzes the evaluation results
- THEN it MUST identify node 3 as a critical bottleneck with "performance" and "quality" problem categories
- AND it MUST provide specific metrics showing response time degradation and accuracy drop
- AND it MUST rank the node as highest priority for optimization

#### Scenario: Workflow dependency impact analysis
- GIVEN a workflow where node 2 failures cause cascade failures in nodes 4 and 5
- WHEN the diagnostics engine performs dependency analysis
- THEN it MUST identify node 2 as the root cause node
- AND it MUST mark nodes 4 and 5 as dependent failures
- AND it MUST prioritize node 2 optimization over downstream node fixes

### Requirement 2: Node-Specific Diagnostics
The system MUST provide specialized diagnostics for different workflow node types through a registry pattern.

#### Scenario: Dataset search node diagnostics
- GIVEN a dataset-search node with recall <70% and average retrieval time >1500ms
- WHEN the dataset search diagnostics engine analyzes the node
- THEN it MUST identify "low_recall" and "slow_retrieval" problem categories
- AND it MUST provide specific metrics: recall score, precision score, response time percentiles
- AND it MUST suggest potential causes: search parameters, index quality, query optimization

#### Scenario: AI chat node diagnostics
- GIVEN an ai-chat node with quality score <3.0 and high token usage >4000 tokens/request
- WHEN the AI chat diagnostics engine analyzes the node
- THEN it MUST identify "quality_degradation" and "cost_inefficiency" problem categories
- AND it MUST provide metrics: quality scores, token usage, response time, model temperature
- AND it MUST suggest causes: prompt engineering, model selection, parameter tuning

### Requirement 3: Standardized Diagnostic Output
The system MUST output standardized diagnostic data structures for consistent processing by downstream components.

#### Scenario: Diagnostic data structure validation
- GIVEN any workflow diagnostics output
- WHEN the diagnostics engine completes analysis
- THEN the output MUST conform to the WorkflowDiagnostics interface
- AND each NodeDiagnostics MUST include: nodeId, nodeType, status, overallScore, metrics, problemCategories
- AND metrics MUST include baseline comparisons and status indicators (normal/warning/critical)
- AND problemCategories MUST include severity levels and affected metric names

### Requirement 4: Extensible Diagnostics Registry
The system MUST support registration of new node type diagnostics engines without modifying core diagnostics logic.

#### Scenario: Custom node type registration
- GIVEN a new workflow node type "custom-api-processor"
- WHEN a custom diagnostics engine is registered for this node type
- THEN the diagnostics engine MUST route custom-api-processor nodes to the new engine
- AND the custom engine MUST produce NodeDiagnostics conforming to the standard interface
- AND the diagnostics MUST be included in overall workflow analysis
- AND the system MUST handle missing engines gracefully by using generic diagnostics

### Requirement 5: Performance Baseline Management
The system MUST maintain and compare against performance baselines for accurate problem identification.

#### Scenario: Baseline-driven anomaly detection
- GIVEN a node with historical average response time of 800ms (baseline)
- WHEN current evaluation shows response time of 2100ms
- THEN the diagnostics MUST flag this as a "performance_degradation" anomaly
- AND the severity MUST be calculated based on deviation from baseline (>2x = high severity)
- AND the trend analysis MUST indicate "degrading" status
- AND recommendations MUST reference the baseline performance target