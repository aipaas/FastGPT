# Project Context

## Purpose
The FastGPT Evaluation Module provides comprehensive evaluation capabilities for AI workflows and applications. It enables users to assess AI model performance through structured datasets, configurable evaluation targets (workflows), and AI-based metrics. The module supports automated evaluation pipelines with parallel processing, usage tracking, and detailed result analysis.

## Tech Stack
- **Backend**: TypeScript + Node.js + NextJS API Routes
- **Database**: MongoDB with Mongoose ODM
- **Queue System**: BullMQ for task processing
- **Frontend**: React + TypeScript + Chakra UI
- **Testing**: Vitest for unit testing
- **Package Management**: pnpm workspaces (monorepo)
- **AI Integration**: Multiple AI providers through unified interface

## Project Conventions

### Code Style
- **Language**: TypeScript throughout with strict typing
- **Formatting**: Prettier with project-wide configuration
- **Linting**: ESLint with auto-fix enabled (`pnpm lint`)
- **Naming**: camelCase for variables/functions, PascalCase for components/classes
- **Comments**: Minimal comments unless explicitly requested - code should be self-documenting
- **File Extensions**: `.ts` for services/logic, `.tsx` for React components

### Architecture Patterns
- **Monorepo Structure**: Shared packages (`@fastgpt/global`, `@fastgpt/service`, `@fastgpt/web`) + project applications
- **Layered Architecture**: 
  - API Layer: `projects/app/src/pages/api/core/evaluation/`
  - Service Layer: `packages/service/core/evaluation/`
  - Schema Layer: MongoDB schemas with Mongoose
  - Frontend Layer: `projects/app/src/components/evaluation/`
- **Queue-Based Processing**: BullMQ for async evaluation task processing
- **Component Pattern**: Abstract base classes for extensible evaluation targets and metrics
- **Validation**: Schema-level validation with Mongoose validators

### Testing Strategy
- **Framework**: Vitest for unit and integration tests
- **Test Location**: Centralized in `test/` directory and project-specific `test/` folders
- **Commands**: `pnpm test` (all tests), `pnpm test:workflow` (workflow-specific)
- **Coverage**: Generated in `coverage/` directory
- **API Testing**: Dedicated test cases in `test/cases/api/evaluation/`

### Git Workflow
- **Main Branch**: `main` for production releases
- **Feature Branches**: `feat-*` pattern (currently on `feat-add-optimizer-design`)
- **Commit Messages**: Conventional commits with Chinese descriptions accepted
- **Development**: Feature branches merged to main after testing

## Domain Context

### Evaluation Task Components
1. **Evaluation Dataset**: Test data with configurable columns (userInput, expectedOutput, context)
2. **Evaluation Target**: Workflow to be evaluated (currently supports workflow type)
3. **Evaluation Metrics**: AI-model-based scoring mechanisms

### Key Concepts
- **Evaluation Items**: Individual test cases generated from dataset items
- **Parallel Processing**: Concurrent evaluation using BullMQ queues
- **Usage Tracking**: Resource consumption monitoring and limits
- **Metric Results**: Detailed scoring with AI model explanations

### Data Flow
1. Create evaluation task → Generate eval_items → Queue processing
2. Parallel execution: Target invocation → Metric evaluation → Result storage
3. Aggregation and reporting with average scores

## Important Constraints
- **AI Model Dependencies**: Evaluation metrics require AI model access for scoring
- **Resource Limits**: Usage tracking prevents resource exhaustion
- **Queue Concurrency**: Limited by BullMQ configuration and system resources
- **Schema Validation**: Strict validation for evaluation configs and data items
- **Team Isolation**: All evaluations are team-scoped for multi-tenancy

## External Dependencies
- **AI Providers**: Multiple AI model providers through unified interface
- **MongoDB**: Primary database for all evaluation data persistence
- **BullMQ**: Redis-backed queue system for task processing
- **Workflow Engine**: Integration with FastGPT's visual workflow system
- **Usage System**: Integration with FastGPT's usage tracking and billing
