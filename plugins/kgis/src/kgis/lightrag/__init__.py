"""LightRAG instance management module for KGIS."""

from kgis.lightrag.manager import LightRAGManager, get_manager
from kgis.lightrag.routes import router
from kgis.lightrag.types import (
    CreateInstanceRequest,
    CreateInstanceResponse,
    DeleteInstanceResponse,
    DeleteWorkspaceInstancesResponse,
    FindInstanceRequest,
    FindInstanceResponse,
    InstanceConfig,
    InstanceInfo,
    InstanceStatus,
    ListInstancesResponse,
    StorageConfig,
)

__all__ = [
    "LightRAGManager",
    "get_manager",
    "router",
    "CreateInstanceRequest",
    "CreateInstanceResponse",
    "DeleteInstanceResponse",
    "DeleteWorkspaceInstancesResponse",
    "FindInstanceRequest",
    "FindInstanceResponse",
    "InstanceConfig",
    "InstanceInfo",
    "InstanceStatus",
    "ListInstancesResponse",
    "StorageConfig",
]
