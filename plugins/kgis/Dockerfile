FROM python:3.11-slim-bookworm AS builder

# Set environment variables for build
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_SYSTEM_PYTHON=true

# Install uv from official image for better performance
COPY --from=ghcr.io/astral-sh/uv:bookworm-slim /usr/local/bin/uv /usr/local/bin/uvx /bin/

# Create app directory
WORKDIR /app

# Copy dependency files first for better layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies with mount caching for faster builds
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-editable --no-dev

# Copy the project
ADD . /app

# Install project dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-editable --no-dev

# Production stage: Minimal runtime image
FROM python:3.11-slim-bookworm AS production

# Set environment variables for production
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Configure package mirrors for faster downloads
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r kgis && useradd -r -g kgis -d /tmp/kgis -s /bin/bash kgis

# Copy the environment from builder stage
COPY --from=builder --chown=kgis:kgis /app/.venv /app/.venv

# Set up environment
ENV PATH="/app/.venv/bin:${PATH}" \
    VIRTUAL_ENV="/app/.venv"

# Create application directories
RUN mkdir -p /tmp/kgis && \
    chown -R kgis:kgis /tmp/kgis

# Switch to non-root user
USER kgis

# Set working directory
WORKDIR /tmp/kgis

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Default command
CMD ["python", "-m", "kgis.main"]
