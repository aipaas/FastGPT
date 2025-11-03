#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OpenTelemetry configuration"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


class OpenTelemetryConfig:
    """Configuration for OpenTelemetry tracing in DiTing."""

    def __init__(
        self,
        enabled: bool = False,
        service_name: str = "diting",
        endpoint: Optional[str] = None,
        headers: Optional[dict[str, str]] = None,
        insecure: bool = True,
    ) -> None:
        """Initialize OpenTelemetry configuration.

        Args:
            enabled (bool): Whether OpenTelemetry tracing is enabled.
            service_name (str): Service name for tracing.
            endpoint (Optional[str]): OTLP HTTP endpoint URL.
            headers (Optional[dict[str, str]]): Headers for OTLP requests.
            insecure (bool): Whether to use insecure connection.
        """
        self.enabled = enabled
        self.service_name = service_name
        self.endpoint = endpoint
        self.headers = headers or {}
        self.insecure = insecure

    @classmethod
    def from_env(cls) -> OpenTelemetryConfig:
        """Create configuration from environment variables.

        Environment variables:
        - DITING_OTEL_ENABLED: Enable/disable OpenTelemetry (true/false)
        - DITING_OTEL_SERVICE_NAME: Service name (default: "diting")
        - DITING_OTEL_ENDPOINT: OTLP HTTP endpoint URL
        - DITING_OTEL_HEADERS: Headers for OTLP requests (JSON format)
        - DITING_OTEL_INSECURE: Use insecure connection (true/false, default: true)

        Returns:
            OpenTelemetryConfig: Configuration instance.
        """
        enabled = os.getenv("DITING_OTEL_ENABLED", "false").lower() == "true"

        if not enabled:
            return cls(enabled=False)

        service_name = os.getenv("DITING_OTEL_SERVICE_NAME", "diting")
        endpoint = os.getenv("DITING_OTEL_ENDPOINT")

        headers = {}
        headers_json = os.getenv("DITING_OTEL_HEADERS")
        if headers_json:
            import json

            try:
                headers = json.loads(headers_json)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning(f"Failed to parse DITING_OTEL_HEADERS: {e}")

        insecure = os.getenv("DITING_OTEL_INSECURE", "true").lower() == "true"

        return cls(
            enabled=enabled,
            service_name=service_name,
            endpoint=endpoint,
            headers=headers,
            insecure=insecure,
        )

    def validate(self) -> bool:
        """Validate configuration.

        Returns:
            bool: True if configuration is valid for tracing.
        """
        if not self.enabled:
            return True

        if not self.endpoint:
            logger.warning("OpenTelemetry is enabled but no endpoint configured")
            return False

        return True

    def __repr__(self) -> str:
        """String representation of the configuration."""
        return (
            f"OpenTelemetryConfig(enabled={self.enabled}, "
            f"service_name='{self.service_name}', "
            f"endpoint='{self.endpoint}', "
            f"insecure={self.insecure})"
        )
