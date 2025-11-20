"""LightRAG instance management module for KGIS."""

from kgis.lightrag.document_routes import router as document_router
from kgis.lightrag.manager import LightRAGManager, get_manager
from kgis.lightrag.routes import router
from kgis.lightrag.types import (
    CreateInstanceRequest,
    CreateInstanceResponse,
    DeleteInstanceResponse,
    DeleteWorkspaceInstancesResponse,
    DocumentInsertionStatus,
    FindInstanceRequest,
    FindInstanceResponse,
    InsertDocumentsRequest,
    InsertDocumentsResponse,
    InsertionStatusRequest,
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
    "document_router",
    "CreateInstanceRequest",
    "CreateInstanceResponse",
    "DeleteInstanceResponse",
    "DeleteWorkspaceInstancesResponse",
    "DocumentInsertionStatus",
    "FindInstanceRequest",
    "FindInstanceResponse",
    "InsertDocumentsRequest",
    "InsertDocumentsResponse",
    "InsertionStatusRequest",
    "InstanceConfig",
    "InstanceInfo",
    "InstanceStatus",
    "ListInstancesResponse",
    "StorageConfig",
]
