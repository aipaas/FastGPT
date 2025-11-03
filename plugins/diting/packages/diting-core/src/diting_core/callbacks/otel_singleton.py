#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OpenTelemetry singleton pattern to avoid multiple initialization warnings."""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING, Any, Optional

from .otel_config import OpenTelemetryConfig

if TYPE_CHECKING:
    try:
        from opentelemetry.trace import Tracer
    except ImportError:
        Tracer = Any  # type: ignore

logger = logging.getLogger(__name__)


class OpenTelemetrySingleton:
    """Thread-safe singleton pattern for OpenTelemetry tracer initialization.

    Prevents multiple tracer provider initialization warnings by ensuring
    only one tracer provider is created per application, even in multi-threaded
    environments.
    """

    _instance: Optional[OpenTelemetrySingleton] = None
    _initialized: bool = False
    _tracer: Optional[Any] = None
    _lock = threading.Lock()  # Class-level lock for thread safety

    def __new__(cls) -> OpenTelemetrySingleton:
        """Create singleton instance with thread safety using double-checked locking."""
        if cls._instance is None:
            with cls._lock:
                # Double-check pattern: check again inside the lock
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def get_tracer(cls, config: Optional[OpenTelemetryConfig] = None) -> Optional[Any]:
        """Get or create tracer instance with thread safety.

        Args:
            config (Optional[OpenTelemetryConfig]): Configuration for initialization

        Returns:
            Optional[trace.Tracer]: Tracer instance or None if disabled
        """
        singleton = cls()

        # Use lock to prevent race conditions during initialization
        if not singleton._initialized and config is not None:
            with cls._lock:
                # Double-check pattern: check again inside the lock
                if not singleton._initialized:
                    singleton._initialize(config)

        return singleton._tracer

    @classmethod
    def reset(cls) -> None:
        """Reset singleton state (for testing purposes) with thread safety."""
        with cls._lock:
            cls._instance = None
            cls._initialized = False
            cls._tracer = None

    def _initialize(self, config: OpenTelemetryConfig) -> None:
        """Initialize the tracer if not already done."""
        if self._initialized or not config.enabled:
            return

        try:
            # Import OpenTelemetry components
            from opentelemetry import trace
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                OTLPSpanExporter,
            )
            from opentelemetry.sdk.resources import Resource
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor

            if trace is None:
                logger.debug("OpenTelemetry not available")
                return

            # Check if already initialized globally
            existing_provider = trace.get_tracer_provider()
            if hasattr(existing_provider, "_resource"):
                logger.debug("Using existing global tracer provider")
                self._tracer = trace.get_tracer("diting_core")
                self._initialized = True
                return

            # Configure resource
            resource = Resource.create(
                {
                    "service.name": config.service_name,
                    "service.version": "0.1.0",
                    "service.namespace": "diting",
                }
            )

            # Configure trace provider
            trace_provider = TracerProvider(resource=resource)

            # Configure OTLP exporter
            exporter_kwargs = {
                "endpoint": config.endpoint,
                "headers": config.headers,
            }

            # Only add insecure parameter if supported
            if (
                config.endpoint
                and config.endpoint.startswith("http://")
                and hasattr(OTLPSpanExporter.__init__, "__code__")
                and "insecure" in OTLPSpanExporter.__init__.__code__.co_varnames
            ):
                exporter_kwargs["insecure"] = config.insecure

            exporter = OTLPSpanExporter(**exporter_kwargs)

            # Add span processor
            span_processor = BatchSpanProcessor(exporter)
            trace_provider.add_span_processor(span_processor)

            # Set global trace provider
            trace.set_tracer_provider(trace_provider)

            # Get tracer
            self._tracer = trace.get_tracer("diting_core")
            self._initialized = True

            logger.info(
                f"OpenTelemetry initialized for service '{config.service_name}'"
            )

        except Exception as e:
            logger.error(f"Failed to initialize OpenTelemetry: {e}")
            self._initialized = True  # Mark as initialized to avoid retry attempts


def get_tracer_from_env() -> Optional[Any]:
    """Get tracer using environment configuration.

    Returns:
        Optional[trace.Tracer]: Tracer instance or None if disabled
    """
    config = OpenTelemetryConfig.from_env()
    return OpenTelemetrySingleton.get_tracer(config)
