"""Main FastAPI application for KGIS with structured logging."""

import os
import time
from typing import Any

import structlog
import uvicorn
from asgi_correlation_id import CorrelationIdMiddleware
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from starlette.responses import Response as StarletteResponse

from kgis.core.logging import configure_basic_logging
from kgis.lightrag import document_router as lightrag_document_router
from kgis.lightrag import router as lightrag_router

# Load environment variables from .env file
load_dotenv()

log_level = os.getenv("LOG_LEVEL", "INFO")
environment = os.getenv("LOG_FORMAT", "dev")
configure_basic_logging(log_level, environment)
logger = structlog.get_logger()

app = FastAPI(
    title="KGIS - Knowledge Graph Information System",
    description="FastAPI application for Knowledge Graph Information System with LightRAG instance management",
    version="1.0.0",
)

app.add_middleware(CorrelationIdMiddleware)

app.include_router(lightrag_router)
app.include_router(lightrag_document_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint"""
    return {"status": "healthy", "service": "kgis", "version": "0.1.0"}


@app.middleware("http")
async def logging_middleware(request: Request, call_next: Any) -> StarletteResponse:
    """Middleware to add request context and log request completion."""
    start_time = time.perf_counter()

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

        logger.info(
            "request_completed",
            status_code=response.status_code,
            process_time=f"{process_time:.4f}s",
        )
        return response

    except Exception as e:
        logger.exception("request_failed", error=str(e))
        raise e


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "true").lower() == "true"

    uvicorn.run(
        "kgis.main:app",
        host=host,
        port=port,
        reload=reload,
        log_config=None,
    )
