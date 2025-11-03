#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OpenTelemetry callback handler"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, Optional
from uuid import UUID

from typing_extensions import override

from diting_core.callbacks.base import AsyncCallbackHandler, ChainType
from diting_core.callbacks.otel_config import OpenTelemetryConfig
from diting_core.callbacks.otel_singleton import OpenTelemetrySingleton

if TYPE_CHECKING:
    try:
        from opentelemetry.trace import Span, Tracer
    except ImportError:
        Span = Any  # type: ignore
        Tracer = Any  # type: ignore

# Import Status and StatusCode at runtime since they're used outside TYPE_CHECKING
try:
    from opentelemetry.trace.status import Status, StatusCode
except ImportError:
    Status = Any  # type: ignore
    StatusCode = Any  # type: ignore

logger = logging.getLogger(__name__)

# Check if OpenTelemetry is available
try:
    from opentelemetry import trace

    OPENTELEMETRY_AVAILABLE = True
except ImportError:
    trace = None  # type: ignore
    OPENTELEMETRY_AVAILABLE = False
    logger.debug("OpenTelemetry packages not available, tracing will be disabled")


def _sanitize_attributes(
    attrs: Dict[str, Any], max_value_length: int = 800 * 1000
) -> Dict[str, Any]:
    """Sanitize attributes for OpenTelemetry.

    Args:
        attrs (Dict[str, Any]): Raw attributes.
        max_value_length (int): Maximum length for string values.

    Returns:
        Dict[str, Any]: Sanitized attributes safe for OpenTelemetry.
    """
    sanitized = {}
    for key, value in attrs.items():
        if value is None:
            continue
        elif isinstance(value, str):
            if len(value) > max_value_length:
                suffix = "... (truncated)"
                truncated_length = max_value_length - len(suffix)
                sanitized[key] = value[:truncated_length] + suffix
            else:
                sanitized[key] = value
        elif isinstance(value, (int, float, bool)):
            sanitized[key] = value
        else:
            try:
                json_str = json.dumps(value, ensure_ascii=False)
                if len(json_str) > max_value_length:
                    suffix = "... (truncated)"
                    truncated_length = max_value_length - len(suffix)
                    json_str = json_str[:truncated_length] + suffix
                sanitized[key] = json_str
            except (TypeError, ValueError):
                try:
                    str_value = str(value)
                    if len(str_value) > max_value_length:
                        suffix = "... (truncated)"
                        truncated_length = max_value_length - len(suffix)
                        str_value = str_value[:truncated_length] + suffix
                    sanitized[key] = str_value
                except Exception:
                    # Last resort: use class name
                    class_name = value.__class__.__name__
                    if len(class_name) > max_value_length:
                        class_name = class_name[:max_value_length]
                    sanitized[key] = class_name
    return sanitized


def _get_chain_type_attribute(chain_type: ChainType) -> str:
    """Get standardized chain type attribute.

    Args:
        chain_type (ChainType): Chain type enum.

    Returns:
        str: Standardized chain type string.
    """
    return f"diting.chain.type.{chain_type.value}"


class OpenTelemetryCallbackHandler(AsyncCallbackHandler):
    """OpenTelemetry callback handler for DiTing.

    This handler creates OpenTelemetry spans for chain executions,
    providing distributed tracing capabilities for DiTing workflows.
    """

    def __init__(self, config: Optional[OpenTelemetryConfig] = None) -> None:
        """Initialize OpenTelemetry callback handler.

        Args:
            config (Optional[OpenTelemetryConfig]): OpenTelemetry configuration.
                If None, will try to load from environment variables.
        """
        self.config = config or OpenTelemetryConfig.from_env()
        self._span_contexts: Dict[str, Any] = {}

        if not self.config.enabled:
            logger.debug("OpenTelemetry tracing disabled by configuration")
            self._tracer = None
            return

        # Use singleton to get tracer (no warnings, no duplication!)
        self._tracer = OpenTelemetrySingleton.get_tracer(self.config)

        if self._tracer is None:
            logger.warning(
                "Failed to initialize OpenTelemetry tracer, tracing disabled"
            )
            self.config.enabled = False
        else:
            logger.debug(
                f"OpenTelemetry tracer initialized for service '{self.config.service_name}'"
            )

    @property
    def is_enabled(self) -> bool:
        """Check if OpenTelemetry tracing is enabled and available.

        Returns:
            bool: True if tracing is enabled and available.
        """
        return self.config.enabled and self._tracer is not None

    @override
    async def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        """Handle chain start event.

        Creates a new OpenTelemetry span for the chain execution.

        Args:
            serialized (Dict[str, Any]): Serialized chain information.
            inputs (Dict[str, Any]): Chain inputs.
            run_id (UUID): Unique run identifier.
            parent_run_id (Optional[UUID]): Parent run identifier for nesting.
            metadata (Optional[Dict[str, Any]]): Additional metadata.
            **kwargs (Any): Additional keyword arguments.
        """
        if not self.is_enabled:
            return

        try:
            # Extract chain name
            name = kwargs.get("name") or (
                serialized.get("name", serialized.get("id", ["<unknown>"])[-1])
                if serialized
                else "<unknown>"
            )

            # Get chain type
            chain_type = kwargs.get("chain_type", ChainType.FUNC)

            # Determine parent span context
            parent_context = None
            if parent_run_id and str(parent_run_id) in self._span_contexts:
                parent_span = self._span_contexts[str(parent_run_id)]
                parent_context = trace.set_span_in_context(parent_span)  # type: ignore

            # Create span
            span_name = f"{chain_type.value}:{name}"
            span = self._tracer.start_span(  # type: ignore
                name=span_name,
                context=parent_context,
            )

            # Set span attributes
            span.set_attribute("diting.chain.name", name)
            span.set_attribute(_get_chain_type_attribute(chain_type), "true")
            span.set_attribute("diting.chain.run_id", str(run_id))

            if parent_run_id:
                span.set_attribute("diting.chain.parent_run_id", str(parent_run_id))

            # Add inputs as attributes (sanitized)
            if inputs:
                sanitized_inputs = _sanitize_attributes(inputs)
                for key, value in sanitized_inputs.items():
                    span.set_attribute(f"diting.chain.inputs.{key}", value)

            # Add metadata as attributes (sanitized)
            if metadata:
                sanitized_metadata = _sanitize_attributes(metadata)
                for key, value in sanitized_metadata.items():
                    span.set_attribute(f"diting.chain.metadata.{key}", value)

            # Add start time event
            span.add_event(
                "chain_start",
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

            # Store span context
            self._span_contexts[str(run_id)] = span

            logger.debug(
                f"Started OpenTelemetry span '{span_name}' for run_id {run_id}"
            )

        except Exception as e:
            logger.error(f"Failed to handle chain start for OpenTelemetry: {e}")

    @override
    async def on_chain_end(
        self,
        outputs: Dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        """Handle chain end event.

        Completes the OpenTelemetry span with outputs and timing information.

        Args:
            outputs (Dict[str, Any]): Chain outputs.
            run_id (UUID): Unique run identifier.
            parent_run_id (Optional[UUID]): Parent run identifier.
            **kwargs (Any): Additional keyword arguments.
        """
        if not self.is_enabled:
            return

        run_id_str = str(run_id)
        if run_id_str not in self._span_contexts:
            logger.warning(f"No span context found for run_id {run_id}")
            return

        try:
            span = self._span_contexts.pop(run_id_str)

            # Add outputs as attributes (sanitized)
            if outputs:
                sanitized_outputs = _sanitize_attributes(outputs)
                for key, value in sanitized_outputs.items():
                    span.set_attribute(f"diting.chain.outputs.{key}", value)

            # Add end time event
            span.add_event(
                "chain_end",
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

            # Set span status to OK
            span.set_status(Status(StatusCode.OK))  # type: ignore

            # End span
            span.end()

            logger.debug(f"Ended OpenTelemetry span for run_id {run_id}")

        except Exception as e:
            logger.error(f"Failed to handle chain end for OpenTelemetry: {e}")

    @override
    async def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        """Handle chain error event.

        Marks the OpenTelemetry span as failed with error information.

        Args:
            error (BaseException): The error that occurred.
            run_id (UUID): Unique run identifier.
            parent_run_id (Optional[UUID]): Parent run identifier.
            **kwargs (Any): Additional keyword arguments.
        """
        if not self.is_enabled:
            return

        run_id_str = str(run_id)
        if run_id_str not in self._span_contexts:
            logger.warning(f"No span context found for run_id {run_id}")
            return

        try:
            span = self._span_contexts.pop(run_id_str)

            # Add error information as attributes
            span.set_attribute("diting.chain.error.type", error.__class__.__name__)
            span.set_attribute("diting.chain.error.message", str(error))

            # Add error event
            span.add_event(
                "chain_error",
                {
                    "exception.type": error.__class__.__name__,
                    "exception.message": str(error),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

            # Set span status to ERROR
            span.set_status(
                Status(
                    StatusCode.ERROR,  # type: ignore
                    description=f"{error.__class__.__name__}: {error}",
                )
            )

            # End span
            span.end()

            logger.debug(f"Ended OpenTelemetry span with error for run_id {run_id}")

        except Exception as e:
            logger.error(f"Failed to handle chain error for OpenTelemetry: {e}")

    def flush(self) -> None:
        """Flush any pending spans.

        This method can be called to ensure all spans are exported
        before the application shuts down.
        """
        if not self.is_enabled:
            return

        try:
            if trace is None:
                return

            # End any remaining spans first to avoid cleanup warnings
            if self._span_contexts:
                logger.warning(
                    f"Ending {len(self._span_contexts)} unfinished spans before flush"
                )
                for run_id, span in self._span_contexts.items():
                    try:
                        if trace is not None:
                            span.set_status(
                                Status(
                                    StatusCode.ERROR,  # type: ignore
                                    description="Span ended due to explicit flush",
                                )
                            )
                        span.end()
                    except Exception as e:
                        logger.debug(f"Failed to end span {run_id}: {e}")

                self._span_contexts.clear()

            # Force flush the span processor
            trace_provider = trace.get_tracer_provider()  # type: ignore
            if hasattr(trace_provider, "force_flush"):
                trace_provider.force_flush()  # type: ignore
            logger.debug("Flushed OpenTelemetry spans")
        except Exception as e:
            logger.error(f"Failed to flush OpenTelemetry spans: {e}")

    def __del__(self) -> None:
        """Cleanup on deletion."""
        try:
            # End any remaining spans
            for run_id, span in self._span_contexts.items():
                logger.warning(f"Cleaning up unfinished span for run_id {run_id}")
                span.set_status(
                    Status(
                        StatusCode.ERROR,  # type: ignore
                        description="Span ended due to handler cleanup",
                    )
                )
                span.end()

            self.flush()
        except Exception:
            # Ignore errors during cleanup
            pass
