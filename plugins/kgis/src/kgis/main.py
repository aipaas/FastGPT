"""Main FastAPI application for KGIS with structured logging."""

import time
from typing import Any, Dict

import structlog
import uvicorn
from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI, Request
from starlette.responses import Response as StarletteResponse

from kgis.core.logging import configure_basic_logging

configure_basic_logging("INFO", "dev")
logger = structlog.get_logger()

app = FastAPI(title="KGIS - Knowledge Graph Information System")

app.add_middleware(CorrelationIdMiddleware)


@app.middleware("http")
async def logging_middleware(request: Request, call_next: Any) -> StarletteResponse:
    """Middleware to add request context and log request completion."""
    start_time = time.perf_counter()

    # Clear context and bind initial request details
    structlog.contextvars.clear_contextvars()
    client_ip = request.client.host if request.client else "unknown"
    structlog.contextvars.bind_contextvars(
        method=request.method,
        path=request.url.path,
        client_ip=client_ip,
        user_agent=request.headers.get("user-agent"),
    )

    try:
        response: StarletteResponse = await call_next(request)

        process_time = time.perf_counter() - start_time

        # Log the completion of the request
        logger.info(
            "request_completed",
            status_code=response.status_code,
            process_time=f"{process_time:.4f}s",
        )
        return response

    except Exception as e:
        # Log unhandled exceptions
        logger.exception("request_failed", error=str(e))
        raise e


@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint."""
    logger.info("root_endpoint_accessed", message="Welcome to KGIS API")
    return {"message": "Welcome to KGIS - Knowledge Graph Information System"}


@app.get("/ping")
async def ping() -> Dict[str, str]:
    """Health check endpoint."""
    # This log will inherit 'path', 'method', etc. automatically
    logger.info("health_check_performed", status="healthy")
    return {"ping": "pong"}


@app.get("/health")
async def health() -> Dict[str, str]:
    """Detailed health check endpoint."""
    logger.info("detailed_health_check", status="healthy")
    return {"status": "healthy", "service": "KGIS", "version": "0.1.0"}


if __name__ == "__main__":
    # 4. CRITICAL: Disable Uvicorn's config so ours takes precedence
    uvicorn.run(
        "kgis.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_config=None,
    )
