# DiTing - AI Evaluation & Data Synthesis Platform

> A unified framework for LLM quality assessment and synthetic data generation

## 🚀 Project Overview

DiTing is a powerful AI evaluation and data synthesis platform designed specifically for Large Language Model (LLM) scenarios. It provides comprehensive evaluation metrics and high-quality synthetic data generation capabilities to help data scientists, AI engineers, and system developers better assess and improve AI system performance.

### Core Features

- 🎯 **Multi-dimensional Evaluation**: Supports answer correctness, relevancy, similarity, context precision, recall, and more
- 🔧 **Modular Architecture**: Separation of core engine (diting-core) and API server (diting-server)
- 📊 **High-quality Data Synthesis**: Generate high-quality evaluation datasets from raw corpora
- 🔌 **Flexible Extension**: Support for custom evaluation metrics and synthesis methods
- 🚄 **High-performance API**: High-performance web service built on FastAPI
- 📝 **Complete Type Support**: Data validation and type checking using Pydantic

## 📁 Project Structure

```
diting/
├── packages/
│   ├── diting-core/          # Core evaluation & synthesis engine
│   │   ├── src/diting_core/
│   │   │   ├── callbacks/     # Callback system
│   │   │   ├── cases/         # Test case definitions
│   │   │   ├── metrics/       # Evaluation metrics library
│   │   │   ├── models/        # LLM and Embedding models
│   │   │   ├── synthesis/     # Data synthesis modules
│   │   │   └── utilities/     # Utility functions
│   │   └── pyproject.toml
│   └── diting-server/         # Web API Server
│       ├── src/diting_server/
│       │   ├── apis/v1/       # API route definitions
│       │   ├── common/        # Common components
│       │   ├── config/        # Configuration management
│       │   ├── exceptions/    # Exception handling
│       │   ├── services/      # Business logic services
│       │   └── main.py        # Application entry point
│       └── pyproject.toml
├── tests/                     # Test suites
├── Dockerfile                 # Docker build file
├── Makefile                   # Build scripts
└── pyproject.toml            # Project configuration
```

## 🎯 Feature Scope

### DiTing Core (diting-core) - Evaluation & Synthesis Engine

diting-core is the core engine of the DiTing platform, providing a complete evaluation metrics library and data synthesis functionality. It is an independent Python package that can be directly integrated into other projects as a library.

#### 🔍 Evaluation Metrics Module

**Core Architecture**:

- `BaseMetric`: Abstract base class for all evaluation metrics
- `MetricValue`: Standardized evaluation result format
- Callback system: Support for evaluation process monitoring and logging

**Built-in Evaluation Metrics**:

1. **Answer Correctness**
   - Evaluates factual accuracy and semantic similarity between actual and expected outputs
   - Based on LLM judgment, combining F1 score and similarity calculations
   - Range: [0, 1], higher is better

2. **Answer Similarity**
   - Calculates cosine similarity between actual and expected outputs using embeddings
   - Suitable for evaluating semantically equivalent but lexically different answers
   - Range: [0, 1], higher is better

3. **Answer Relevancy**
   - Evaluates how relevant the generated answer is to the user input question
   - Based on question generation and similarity calculation
   - Range: [0, 1], higher is better

4. **Faithfulness**
   - Measures factual consistency between answers and retrieved context
   - Specifically designed for RAG systems
   - Range: [0, 1], higher indicates more faithful to context

5. **Context Recall**
   - Evaluates completeness of relevant information in retrieved context
   - Calculates proportion of reference answer claims supported by retrieved context
   - Range: [0, 1], higher indicates more complete retrieval

6. **Context Precision**
   - Evaluates proportion of relevant information in retrieved context
   - Uses Precision@k to calculate average precision
   - Range: [0, 1], higher indicates better retrieval quality

7. **QA Quality**
   - Comprehensive evaluation of question-answer pair quality
   - Combines multiple dimensions for overall scoring

8. **RAG Runtime**
   - Runtime evaluation specifically for RAG systems
   - Considers both retrieval and generation quality

9. **Custom Metric**
   - Supports user-defined evaluation logic
   - Define evaluation criteria through prompts

#### 🧪 Data Synthesis Module

**Core Architecture**:

- `BaseSynthesizer`: Abstract base class for data synthesizers
- `BaseCorpus`: Corpus management and processing
- Quality control: Built-in quality assessment and filtering mechanisms

**QA Synthesizer**:

- Generate high-quality question-answer pairs from given context and themes
- Support quality assessment and automatic retry mechanisms
- Configurable generation quantity and concurrency control
- Built-in quality threshold filtering
- Support batch generation and quality ranking

#### 🤖 Model Management Module

**LLM Model Support**:

- OpenAI GPT series
- Other OpenAI API-compatible models
- Extensible model factory pattern

**Embedding Model Support**:

- OpenAI Embeddings
- Custom embedding model integration
- Optimized vector similarity computation

#### 📋 Test Case Management

- `LLMCase`: Standardized test case format
- Support for multiple input/output types
- Metadata management and extension

### DiTing Server (diting-server) - Web API Service

diting-server is built on FastAPI, providing high-performance Web API interfaces for diting-core, supporting distributed deployment and production environment usage.

#### 🌐 API Service Architecture

**Service Features**:

- High-performance asynchronous API based on FastAPI
- Complete type validation and automatic documentation generation
- Structured logging and monitoring support
- CORS support and security configuration
- Graceful error handling and exception management

#### 📡 API Endpoints

**Evaluation API**:

- **POST** `/api/v1/evaluations/runs` - Execute evaluation tasks
  - Support multiple LLM and Embedding model configurations
  - Real-time return of evaluation results and token usage
  - Support custom evaluation metrics
  - Provide detailed execution logs

**Data Synthesis API**:

- **POST** `/api/v1/dataset-synthesis/runs` - Execute data synthesis tasks
  - Support batch generation and metadata management
  - Provide detailed generation logs and usage statistics
  - Support quality control and filtering
  - Chunk processing and progress tracking

**Health Check API**:

- **GET** `/healthz` - Service health status check
  - Service availability monitoring
  - Dependency service status check

#### ⚙️ Service Management

**Configuration Management**:

- Environment variable configuration
- Dynamic configuration loading
- Model configuration management

**Logging System**:

- Structured log output
- Request tracing and performance monitoring
- Error reporting and debugging information

**Exception Handling**:

- Unified exception handling mechanism
- User-friendly error response format
- Detailed error information and suggestions

#### 🔧 Business Service Layer

**Evaluation Service**:

- Evaluation task orchestration and execution
- Model configuration parsing and validation
- Token usage statistics and billing

**Synthesis Service**:

- Data synthesis task management
- Quality control and filtering
- Batch processing and concurrency control

## 🛠️ Technology Stack

- **Backend Framework**: Python 3.11+ + FastAPI
- **Dependency Management**: uv
- **Data Validation**: Pydantic
- **Code Quality**: Ruff (formatting) + MyPy/Pyright (type checking)
- **Testing Framework**: Pytest + Coverage
- **Containerization**: Docker
- **Development Tools**: Pre-commit hooks

## 🚀 Quick Start

### Requirements

- Python 3.11+
- uv package manager
- Make build tool
- Docker (optional, for containerized deployment)

### Installation & Configuration

1. **Clone the project**

   ```bash
   git clone <repository-url>
   cd diting
   ```

2. **Install dependencies**

   ```bash
   make install
   ```

   This will automatically install all dependencies and configure pre-commit hooks.

3. **Sync dependencies** (optional)

   ```bash
   make sync
   ```

### Development Environment

#### Run Tests

```bash
# Run all tests
make test

# Generate coverage report
make testcov
```

#### Code Quality Checks

```bash
# Format code
make format

# Lint code
make lint

# Type check
make typecheck

# Run all quality checks
make all
```

#### Start Development Server

```bash
# Method 1: Direct run
cd packages/diting-server
uvicorn diting_server.main:app --reload --host 0.0.0.0 --port 3000

# Method 2: Use Python module
python -m diting_server.main
```

The server will start at `http://localhost:3000`, and API documentation can be accessed at `http://localhost:3000/docs`.

## 📦 Build & Deployment

### Docker Build

1. **Build image**

   ```bash
   docker build -t diting .
   ```

2. **Run container**

   ```bash
   docker run -p 3000:3000 diting
   ```

### Production Deployment

#### Using Docker Compose (Recommended)

```yaml
version: '3.8'
services:
  diting:
    image: diting:latest
    ports:
      - "3000:3000"
    environment:
      - LOG_LEVEL=INFO
      - LOG_FORMAT=json
    restart: unless-stopped
```

#### Direct Deployment

```bash
# Install production dependencies
uv sync --no-dev

# Start service
uvicorn diting_server.main:app --host 0.0.0.0 --port 3000 --workers 4
```

## 📚 Usage Examples

### Evaluation API Example

```python
import requests

# Evaluation request
request_data = {
    "llmConfig": {
        "name": "gpt-3.5-turbo",
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "your-api-key"
    },
    "metricConfig": {
        "metricName": "answer_correctness",
        "metricType": "builtin_metric"
    },
    "evalCase": {
        "userInput": "What is artificial intelligence?",
        "actualOutput": "AI is a branch of computer science",
        "expectedOutput": "Artificial intelligence is technology that simulates human intelligence"
    }
}

response = requests.post(
    "http://localhost:3000/api/v1/evaluations/runs",
    json=request_data
)

result = response.json()
print(f"Evaluation score: {result['data']['score']}")
print(f"Evaluation reason: {result['data']['reason']}")
```

### Data Synthesis API Example

```python
import requests

# Data synthesis request
synthesis_request = {
    "llmConfig": {
        "name": "gpt-3.5-turbo",
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "your-api-key"
    },
    "synthesizerConfig": {
        "synthesizerName": "q_a_synthesizer"
    },
    "inputData": {
        "context": ["Artificial intelligence is an important branch of computer science..."],
        "themes": ["AI basic concepts"]
    }
}

response = requests.post(
    "http://localhost:3000/api/v1/dataset-synthesis/runs",
    json=synthesis_request
)

result = response.json()
print(f"Generated question: {result['data']['qaPair']['question']}")
print(f"Generated answer: {result['data']['qaPair']['answer']}")
```

## 🔧 Configuration

### Environment Variables

- `LOG_LEVEL`: Log level (DEBUG, INFO, WARNING, ERROR)
- `LOG_FORMAT`: Log format (text, json)
- `HOST`: Service bind address (default: 0.0.0.0)
- `PORT`: Service port (default: 3000)

### OpenTelemetry Integration

DiTing supports OpenTelemetry for distributed tracing, providing comprehensive observability for evaluation and synthesis workflows.

#### Installation

To enable OpenTelemetry support, install the optional dependencies:

```bash
# Install diting-core with OpenTelemetry support
pip install diting-core[otel]

# Or using uv
uv add diting-core[otel]
```

#### Configuration

OpenTelemetry tracing is configured through environment variables:

- `DITING_OTEL_ENABLED`: Enable/disable OpenTelemetry tracing (default: false)
- `DITING_OTEL_SERVICE_NAME`: Service name for tracing (default: "diting")
- `DITING_OTEL_ENDPOINT`: OTLP HTTP endpoint URL (required if enabled)
- `DITING_OTEL_HEADERS`: Headers for OTLP requests (JSON format, optional)
- `DITING_OTEL_INSECURE`: Use insecure connection (default: true)

#### Example Configuration

```bash
# Enable OpenTelemetry with Jaeger
export DITING_OTEL_ENABLED=true
export DITING_OTEL_SERVICE_NAME=diting-production
export DITING_OTEL_ENDPOINT=http://jaeger:4318/v1/traces

# Enable with custom headers (for services requiring authentication)
export DITING_OTEL_ENABLED=true
export DITING_OTEL_ENDPOINT=https://your-tracing-service.com/v1/traces
export DITING_OTEL_HEADERS='{"Authorization": "Bearer your-token"}'
```

#### Usage Examples

**Basic Usage with Environment Configuration:**

```python
from diting_core.callbacks.opentelemetry import OpenTelemetryCallbackHandler
from diting_core.callbacks.stdout import StdOutCallbackHandler

# Handler will automatically use environment configuration
otel_handler = OpenTelemetryCallbackHandler()

if otel_handler.is_enabled:
    print("OpenTelemetry tracing is active")
    handlers = [StdOutCallbackHandler(), otel_handler]
else:
    print("OpenTelemetry tracing is not configured")
    handlers = [StdOutCallbackHandler()]

# Use handlers in your evaluation or synthesis tasks
# handlers parameter will be passed to metric.compute() or synthesizer.generate()
```

**Custom Configuration:**

```python
from diting_core.callbacks.opentelemetry import OpenTelemetryCallbackHandler
from diting_core.callbacks.otel_config import OpenTelemetryConfig

# Create custom configuration
config = OpenTelemetryConfig(
    enabled=True,
    service_name="diting-dev",
    endpoint="http://localhost:4318/v1/traces",
    headers={"Authorization": "Bearer dev-token"},
    insecure=True,
)

# Initialize handler with custom config
handler = OpenTelemetryCallbackHandler(config)
```

#### What Gets Traced

OpenTelemetry integration captures comprehensive tracing data for DiTing workflows:

**Chain Spans**: Each evaluation or synthesis operation creates a span with:
- Chain name and type (metric, synthetic, llm, embed, corpora, func)
- Input/output data (sanitized and truncated for size limits)
- Execution timing and duration
- Parent-child relationships for nested operations
- Metadata and configuration information

**Error Tracking**: Automatic error capture with:
- Error type and message
- Full stack traces
- Error timestamps
- Failed span context

**Span Attributes**: Detailed context including:
- Service name and version
- Chain type categorization
- Run IDs for correlation
- Input/output schemas
- Custom metadata

#### Supported Backends

OpenTelemetry integration works with any OTLP-compatible backend:

- **Jaeger**: Open source distributed tracing platform
- **Zipkin**: Distributed tracing system
- **Datadog**: Commercial observability platform
- **New Relic**: Application performance monitoring
- **Grafana Tempo**: Open source tracing backend
- **Custom OTLP endpoints**: Any service supporting OTLP/HTTP

### Model Configuration

Support for multiple LLM and Embedding models:

- OpenAI GPT series
- Other OpenAI API-compatible models
- Custom model integration

### Development Standards

- Use Ruff for code formatting
- Follow type annotation standards
- Write comprehensive unit tests
- Run `make all` to check code quality before committing

**DiTing** - Making AI evaluation and data synthesis simpler and more reliable.
