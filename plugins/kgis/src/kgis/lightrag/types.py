"""Type definitions for LightRAG instance management."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class InstanceStatus(str, Enum):
    """Instance status enumeration."""

    IDLE = "idle"
    BUSY = "busy"
    ERROR = "error"
    INITIALIZING = "initializing"


class StorageConfig(BaseModel):
    """Storage configuration for LightRAG instance."""

    kv_storage: Optional[str] = None
    graph_storage: Optional[str] = None
    vector_storage: Optional[str] = None
    doc_status_storage: Optional[str] = None


class InstanceConfig(BaseModel):
    """Configuration for creating LightRAG instance."""

    workspace_id: str
    llm_model: str
    embedding_model: str
    rerank_model: Optional[str] = None
    working_dir: Optional[str] = None
    storage_configs: Optional[StorageConfig] = None


class InstanceInfo(BaseModel):
    """Information about a LightRAG instance."""

    instance_id: str
    workspace_id: str
    config: InstanceConfig
    status: InstanceStatus
    ref_count: int = 0
    created_at: datetime
    last_accessed: datetime
    usage_count: int = 0
    error_message: Optional[str] = None
    storage_path: Optional[str] = None


class CreateInstanceRequest(BaseModel):
    """Request model for creating a new instance."""

    workspace_id: str
    llm_model: str
    embedding_model: str
    rerank_model: Optional[str] = None
    working_dir: Optional[str] = None
    storage_configs: Optional[StorageConfig] = None


class CreateInstanceResponse(BaseModel):
    """Response model for creating a new instance."""

    instance_id: str
    workspace_id: str
    status: str
    created_at: datetime


class FindInstanceRequest(BaseModel):
    """Request model for finding an instance."""

    workspace_id: str
    llm_model: str
    embedding_model: str
    rerank_model: Optional[str] = None


class FindInstanceResponse(BaseModel):
    """Response model for finding an instance."""

    found: bool
    instance_id: Optional[str] = None
    instance: Optional[InstanceInfo] = None


class ListInstancesResponse(BaseModel):
    """Response model for listing workspace instances."""

    instances: list[InstanceInfo]
    total_count: int


class DeleteInstanceResponse(BaseModel):
    """Response model for deleting an instance."""

    instance_id: str
    status: str
    message: str


class DeleteWorkspaceInstancesResponse(BaseModel):
    """Response model for deleting all instances in a workspace."""

    workspace_id: str
    deleted_instances: int
    status: str
    message: str
