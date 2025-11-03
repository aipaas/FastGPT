from typing import TYPE_CHECKING, Any, Optional

from diting_core.callbacks.base import Callbacks
from diting_core.callbacks.manager import new_group
from diting_core.callbacks.stdout import StdOutCallbackHandler

if TYPE_CHECKING:
    from diting_core.callbacks.opentelemetry import OpenTelemetryCallbackHandler
    from diting_core.callbacks.otel_config import OpenTelemetryConfig

# OpenTelemetry integration (optional)
OpenTelemetryCallbackHandler: Optional[Any] = None
OpenTelemetryConfig: Optional[Any] = None
OPENTELEMETRY_AVAILABLE = False

try:
    from diting_core.callbacks.opentelemetry import OpenTelemetryCallbackHandler
    from diting_core.callbacks.otel_config import OpenTelemetryConfig

    OPENTELEMETRY_AVAILABLE = True
except ImportError:
    pass  # Variables already initialized to None


if __name__ == "__main__":

    async def root_func(root_arg: str, callbacks: Callbacks) -> str:
        cm, grp_cb = await new_group("root", {"root_inputs": root_arg}, callbacks)
        outputs = await parent_func(root_arg, grp_cb)
        await cm.on_chain_end(outputs={"root_outputs": outputs})
        return outputs

    async def parent_func(parent_arg: str, callbacks: Callbacks) -> str:
        cm, grp_cb = await new_group("parent", {"parent_inputs": parent_arg}, callbacks)
        output1 = await child1_func(parent_arg, grp_cb)
        output2 = await child2_func(parent_arg, grp_cb)
        outputs = f"child1:{output1}, child2:{output2}"
        await cm.on_chain_end(outputs={"parent_outputs": outputs})
        return outputs

    async def child1_func(child1_arg: str, callbacks: Callbacks) -> str:
        cm, _ = await new_group("child1", {"child1_inputs": child1_arg}, callbacks)
        try:
            assert child1_arg != "child1 error", "mock child1_func run error"
            outputs = "child1_outputs"
            await cm.on_chain_end(outputs={"child1_outputs": outputs})
            return outputs
        except Exception as e:
            await cm.on_chain_error(e)
            raise e

    async def child2_func(child2_arg: str, callbacks: Callbacks) -> str:
        cm, _ = await new_group("child2", {"child2_inputs": child2_arg}, callbacks)
        outputs = "child2_outputs"
        try:
            assert child2_arg != "child2 error", "mock child2_func run error"

        except Exception as e:
            await cm.on_chain_error(e)
        await cm.on_chain_end(outputs={"child2_outputs": outputs})
        return outputs

    async def async_main():
        # Example 1: Using only StdOut callback handler
        print("=== Example 1: StdOut Callback Handler ===")
        stdout_handler = StdOutCallbackHandler()
        await root_func("all pass", [stdout_handler])

        # Example 2: Using both StdOut and OpenTelemetry handlers (if available)
        if OPENTELEMETRY_AVAILABLE:
            print("\n=== Example 2: StdOut + OpenTelemetry Callback Handlers ===")

            # Initialize OpenTelemetry handler with default configuration
            # This will use environment variables for configuration
            otel_handler = (
                OpenTelemetryCallbackHandler() if OpenTelemetryCallbackHandler else None
            )

            if otel_handler and otel_handler.is_enabled:
                print("OpenTelemetry tracing is enabled")
                handlers = [stdout_handler, otel_handler]
                await root_func("all pass with otel", handlers)

                # Flush any remaining spans
                otel_handler.flush()
            else:
                print("OpenTelemetry tracing is not configured or available")
                print(
                    "To enable OpenTelemetry, set DITING_OTEL_ENABLED=true and DITING_OTEL_ENDPOINT"
                )
                print(
                    "Example: DITING_OTEL_ENABLED=true DITING_OTEL_ENDPOINT=http://localhost:4318/v1/traces"
                )
        else:
            print("\nOpenTelemetry packages not installed")
            print("To install: pip install diting-core[otel]")

        # Example 3: Custom OpenTelemetry configuration (if available)
        if OPENTELEMETRY_AVAILABLE:
            print("\n=== Example 3: Custom OpenTelemetry Configuration ===")

            custom_config = (
                OpenTelemetryConfig(
                    enabled=True,
                    service_name="diting-example",
                    endpoint="http://localhost:4318/v1/traces",
                    headers={"Authorization": "Bearer your-token-here"},
                )
                if OpenTelemetryConfig
                else None
            )

            custom_handler = (
                OpenTelemetryCallbackHandler(custom_config)
                if OpenTelemetryCallbackHandler and custom_config
                else None
            )

            if custom_handler and custom_handler.is_enabled:
                print("Custom OpenTelemetry configuration is active")
                handlers = [stdout_handler, custom_handler]
                await root_func("custom config test", handlers)
                custom_handler.flush()
            else:
                print("Custom OpenTelemetry configuration is not valid")


async def error_example():
    """Example demonstrating error handling with callbacks."""
    print("\n=== Error Handling Example ===")
    stdout_handler = StdOutCallbackHandler()

    if OPENTELEMETRY_AVAILABLE:
        otel_handler = (
            OpenTelemetryCallbackHandler() if OpenTelemetryCallbackHandler else None
        )
        if otel_handler and otel_handler.is_enabled:
            handlers = [stdout_handler, otel_handler]
            try:
                await root_func("child1 error", handlers)
            except Exception:
                pass  # Expected error
            otel_handler.flush()
        else:
            try:
                await root_func("child1 error", [stdout_handler])
            except Exception:
                pass  # Expected error
    else:
        try:
            await root_func("child1 error", [stdout_handler])
        except Exception:
            pass  # Expected error


# if __name__ == '__main__':
#     import asyncio

#     asyncio.run(async_main())
#     asyncio.run(error_example())
