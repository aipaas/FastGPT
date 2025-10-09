# Proposal: Implement Evaluation-Driven Optimizer

## Summary

This proposal introduces an evaluation-driven APP (workflow) optimizer system for FastGPT. The optimizer analyzes evaluation results to automatically identify performance bottlenecks and provides user-triggered optimization strategies for workflows. The system follows a modular architecture with four core components: Problem Diagnostics Engine, Strategy Generator, Execution Engine, and Effect Monitor.

## Motivation

Current FastGPT evaluation system provides comprehensive metrics but lacks automated optimization capabilities. Users can identify performance issues through evaluation results but have no systematic way to address them. This creates a gap between evaluation insights and actionable improvements.

The evaluation-driven optimizer bridges this gap by:
- Automatically diagnosing workflow performance issues from evaluation results
- Generating targeted optimization strategies using specialized engines
- Safely executing optimizations with rollback capabilities
- Monitoring optimization effects for continuous improvement

## Design Overview

### Core Architecture
The optimizer consists of four main components working in sequence:

1. **Problem Diagnostics Engine**: Analyzes evaluation results and workflow configurations to identify specific performance bottlenecks and problematic nodes
2. **Strategy Generator**: Matches identified problems with appropriate optimization engines and generates executable optimization plans
3. **Execution Engine**: Safely applies optimization strategies with rollback capabilities and real-time monitoring
4. **Effect Monitor**: Tracks optimization results and feeds data back to the evaluation system for continuous learning

### User Interaction Model
- **User-Triggered**: Optimizations are initiated by users based on evaluation results, ensuring full control
- **Preview & Approve**: Users review optimization plans before execution, with ability to modify or reject changes
- **Safe Execution**: All optimizations are reversible with automatic rollback on failure

### Integration Points
- **Evaluation System**: Consumes evaluation results and metrics for problem diagnosis
- **Workflow System**: Modifies workflow node configurations through standard APIs
- **AI Model Services**: Uses AI models for intelligent optimization strategy generation
- **Queue System**: Leverages existing BullMQ infrastructure for task processing

## Why

The FastGPT evaluation system currently provides comprehensive performance metrics but lacks actionable optimization capabilities. Users can identify performance issues through evaluation results but have no systematic way to improve workflow performance based on these insights.

This creates several critical gaps:
1. **Manual Optimization Burden**: Users must manually analyze evaluation results and guess appropriate optimizations
2. **Inconsistent Improvements**: Lack of systematic approach leads to inconsistent optimization outcomes
3. **Risk of Breaking Changes**: Manual configuration changes risk breaking existing workflows
4. **No Learning from Success**: Successful optimizations aren't captured for reuse in similar scenarios
5. **Limited Expertise**: Users may lack domain knowledge for effective node-specific optimizations

The evaluation-driven optimizer addresses these gaps by providing an automated, safe, and learning-enabled optimization system that bridges the gap between evaluation insights and workflow improvements.

## What Changes

This proposal introduces four new core capabilities to the FastGPT evaluation system:

1. **Problem Diagnostics**: Automatic analysis of evaluation results to identify specific performance bottlenecks and optimization opportunities in workflows
2. **Strategy Generation**: Intelligent matching of identified problems with appropriate optimization engines and generation of safe, executable optimization plans
3. **Execution Engine**: Safe execution of optimization strategies with comprehensive rollback capabilities and real-time monitoring
4. **Effect Monitoring**: Continuous measurement of optimization impact with automated re-evaluation and learning feedback loops

The implementation adds new service modules, API endpoints, database schemas, and user interfaces while integrating seamlessly with existing evaluation and workflow systems.

## Implementation Scope

This change introduces:
- Core optimizer service interfaces and base classes
- Node-specific optimization engines (dataset-search, ai-chat, http-request initially)
- User interface components for optimization workflow
- API endpoints for optimizer management
- Integration with existing evaluation and workflow systems

## Success Criteria

- Users can successfully trigger optimizations from evaluation results
- Optimization strategies demonstrate measurable performance improvements (>10% average improvement in target metrics)
- System maintains 99.9% rollback success rate for failed optimizations
- Zero data loss or workflow corruption during optimization process
- Average optimization cycle time under 5 minutes for typical workflows

## Risks and Mitigations

**Risk**: Optimization changes could break existing workflows
**Mitigation**: Comprehensive rollback system with atomic configuration management

**Risk**: AI-generated optimization strategies may be ineffective
**Mitigation**: Strategy validation, user approval process, and effect monitoring feedback loop

**Risk**: Complex dependencies between workflow nodes
**Mitigation**: Dependency analysis in plan orchestrator and stepwise execution with precondition validation

## Dependencies

- Stable evaluation system with structured result output
- Workflow system APIs for configuration read/write
- AI model access for optimization strategy generation
- MongoDB for optimizer data persistence
- BullMQ for task queue processing