"""Enhanced logging configuration for KGIS FastAPI application."""

import logging
import os
import sys
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import structlog
from structlog.types import EventDict, Processor


class LogFormat(str, Enum):
    """Supported log output formats."""

    JSON = "json"
    CONSOLE = "console"
    DEV = "dev"
    PLAIN = "plain"


class LogLevel(str, Enum):
    """Supported log levels."""

    CRITICAL = "CRITICAL"
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"
    DEBUG = "DEBUG"


@dataclass
class LoggingConfig:
    """Enhanced logging configuration with comprehensive options."""

    # Basic settings
    level: str = "INFO"
    format: LogFormat = LogFormat.JSON
    structured: bool = True

    # Output configuration
    enable_colors: bool = True
    show_timestamp: bool = True
    show_process_id: bool = False
    show_worker_id: bool = False
    show_callsite: bool = True

    # Timestamp format
    timestamp_format: str = "iso"  # "iso", "unix", or custom strftime pattern

    # File logging (optional)
    log_file: Optional[Path] = None
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    backup_count: int = 5

    # Logger filtering
    include_loggers: list[str] = field(default_factory=list)
    exclude_loggers: list[str] = field(default_factory=list)
    silence_loggers: list[str] = field(default_factory=lambda: ["uvicorn.access"])

    # Development features
    enable_rich_traceback: bool = True
    min_level_for_stack_trace: str = "ERROR"


# Processor functions for enhanced logging
def rename_event_key(_: Any, __: Any, event_dict: EventDict) -> EventDict:
    """Move 'event' key to 'message' for better compatibility with log analyzers."""
    event_dict["message"] = event_dict.pop("event", "")
    return event_dict


def drop_color_message_key(_: Any, __: Any, event_dict: EventDict) -> EventDict:
    """Remove Uvicorn's color_message field to prevent duplication."""
    event_dict.pop("color_message", None)
    return event_dict


def add_process_info(_: Any, __: Any, event_dict: EventDict) -> EventDict:
    """Add process information for debugging in development."""
    record = event_dict.get("_record")
    if record:
        event_dict["process"] = getattr(record, "process", os.getpid())
    return event_dict


def add_worker_info(_: Any, __: Any, event_dict: EventDict) -> EventDict:
    """Add worker information for multi-process environments."""
    record = event_dict.get("_record")
    if record:
        event_dict["worker"] = getattr(record, "worker", os.getpid())
    return event_dict


def add_enhanced_callsite(_: Any, __: Any, event_dict: EventDict) -> EventDict:
    """Add enhanced callsite information with function name."""
    record = event_dict.get("_record")
    if not record:
        return event_dict

    file_path = getattr(record, "pathname", "")
    line = getattr(record, "lineno", "")
    func = getattr(record, "funcName", "")

    if file_path and line:
        # Just show filename, not full path for cleaner output
        filename = os.path.basename(file_path)
        event_dict["source"] = f"{filename}:{line}"
        if func:
            event_dict["function"] = func

    return event_dict


def create_colorful_dev_renderer() -> Processor:
    """Create a colorful console renderer for development."""
    from structlog.dev import ConsoleRenderer

    return ConsoleRenderer(
        colors=True,
        exception_formatter=structlog.dev.rich_traceback,
    )


def get_processors(config: LoggingConfig) -> list[Processor]:
    """Build processor chain based on configuration."""
    processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.stdlib.ExtraAdder(),
        drop_color_message_key,
    ]

    # Add timestamp if enabled
    if config.show_timestamp:
        processors.append(structlog.processors.TimeStamper(fmt=config.timestamp_format))

    # Add development-specific processors
    if config.format == LogFormat.DEV:
        if config.show_process_id:
            processors.append(add_process_info)
        if config.show_worker_id:
            processors.append(add_worker_info)
        if config.show_callsite:
            processors.append(add_enhanced_callsite)
    elif config.show_callsite:
        # For production formats, use the standard callsite adder
        processors.append(
            structlog.processors.CallsiteParameterAdder({
                structlog.processors.CallsiteParameter.FILENAME,
                structlog.processors.CallsiteParameter.LINENO,
                structlog.processors.CallsiteParameter.FUNC_NAME,
            })
        )

    # Add stack info and exception handling
    processors.extend([
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ])

    # Add format-specific processors
    if config.format in [LogFormat.JSON, LogFormat.PLAIN]:
        processors.append(rename_event_key)

    return processors


def get_renderer(config: LoggingConfig) -> Processor:
    """Get the appropriate renderer based on format configuration."""
    if config.format == LogFormat.JSON:
        return structlog.processors.JSONRenderer()
    elif config.format == LogFormat.CONSOLE:
        if config.enable_colors:
            return structlog.dev.ConsoleRenderer(colors=True)
        else:
            return structlog.dev.ConsoleRenderer(colors=False)
    elif config.format == LogFormat.DEV:
        return create_colorful_dev_renderer()
    elif config.format == LogFormat.PLAIN:
        return structlog.processors.UnicodeEncoder()
    else:
        return structlog.processors.JSONRenderer()


def clear_logger_handlers(logger_names: list[str], propagate: bool = True) -> None:
    """Clear handlers for specified loggers."""
    for name in logger_names:
        logger = logging.getLogger(name)
        for handler in logger.handlers[:]:
            handler.close()
            logger.removeHandler(handler)
        logger.propagate = propagate


def clear_logging() -> None:
    """Clear all existing logging configuration."""
    clear_logger_handlers(["uvicorn", "uvicorn.error"], propagate=True)
    clear_logger_handlers(["uvicorn.access"], propagate=False)

    # Close all handlers
    logging.shutdown()

    # Remove root handlers
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)


def create_file_handler(config: LoggingConfig) -> Optional[logging.Handler]:
    """Create a rotating file handler if log file is specified."""
    if not config.log_file:
        return None

    from logging.handlers import RotatingFileHandler

    # Ensure log directory exists
    config.log_file.parent.mkdir(parents=True, exist_ok=True)

    handler = RotatingFileHandler(
        filename=config.log_file, maxBytes=config.max_file_size, backupCount=config.backup_count, encoding="utf-8"
    )

    # Use JSON format for file logs
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=get_processors(config),
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ],
    )
    handler.setFormatter(formatter)
    return handler


def configure_logging(config: Optional[LoggingConfig] = None) -> None:
    """
    Configure enhanced logging for the application.

    Args:
        config: LoggingConfig instance. If None, uses default configuration.
    """
    if config is None:
        config = LoggingConfig()

    # Clear existing configuration
    clear_logging()

    # Reset structlog if it was already configured
    if structlog.is_configured():
        structlog.reset_defaults()

    # Build processor chain
    processors = get_processors(config)

    # Configure structlog
    structlog.configure(
        processors=processors
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Create formatters
    shared_processors = get_processors(config)
    renderer = get_renderer(config)

    # Standard library formatter
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    # Setup root logger
    root_handler = logging.StreamHandler(sys.stdout)
    root_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.addHandler(root_handler)
    root_logger.setLevel(config.level.upper())

    # Add file handler if configured
    if config.log_file:
        file_handler = create_file_handler(config)
        if file_handler:
            root_logger.addHandler(file_handler)

    # Configure specific loggers
    loggers_to_configure = ["uvicorn.error"]
    if not any("uvicorn.access" in name for name in config.silence_loggers):
        loggers_to_configure.append("uvicorn.access")

    for logger_name in loggers_to_configure:
        logger = logging.getLogger(logger_name)
        logger.handlers = [root_handler]
        logger.setLevel(config.level.upper())

    # Silence specified loggers
    for logger_name in config.silence_loggers:
        logger = logging.getLogger(logger_name)
        logger.propagate = False

    # Prevent double logging
    for logger_name in ["uvicorn", "uvicorn.error", "uvicorn.access"]:
        logging.getLogger(logger_name).propagate = False


# Convenience function for backward compatibility
def configure_basic_logging(
    log_level: str = "INFO", format_type: str = "json", enable_colors: Optional[bool] = None
) -> None:
    """
    Convenience function for basic logging configuration.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        format_type: Output format ('json', 'console', 'dev', 'plain')
        enable_colors: Enable colors (auto-detect if None)
    """
    if enable_colors is None:
        enable_colors = sys.stdout.isatty() and os.getenv("NO_COLOR") is None

    config = LoggingConfig(
        level=log_level.upper(),
        format=LogFormat(format_type),
        enable_colors=enable_colors,
    )

    configure_logging(config)
