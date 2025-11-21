"""Type definitions for LightRAG instance management."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


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


# Document insertion


class InsertDocumentsRequest(BaseModel):
    """Request model for inserting documents into LightRAG."""

    workspace_id: str
    llm_model: str
    embedding_model: str
    rerank_model: Optional[str] = None

    # Document insertion parameters
    input: Union[str, List[str]]
    split_by_character: Optional[str] = None
    split_by_character_only: bool = False
    ids: Optional[Union[str, List[str]]] = None
    file_paths: Optional[Union[str, List[str]]] = None
    track_id: Optional[str] = None


class InsertDocumentsResponse(BaseModel):
    """Response model for successful document insertion."""

    success: bool
    message: str
    inserted_count: int
    track_id: Optional[str] = None
    processing_time_ms: Optional[float] = None


# Document status enums from LightRAG
class DocStatus(str, Enum):
    """Document processing status enumeration from LightRAG."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DocumentInsertionStatus(str, Enum):
    """Status enumeration for document insertion operations."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class InsertionStatusRequest(BaseModel):
    """Request model for querying insertion status."""

    workspace_id: str
    llm_model: str
    embedding_model: str
    rerank_model: Optional[str] = None

    # Query parameters
    track_id: str


# Utility function for datetime formatting
def format_datetime(dt: Any) -> Optional[str]:
    """Format datetime to ISO format string with timezone information

    Args:
        dt: Datetime object, string, or None

    Returns:
        ISO format string with timezone information, or None if input is None
    """
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    if isinstance(dt, datetime):
        # If datetime object has no timezone info (naive datetime), add UTC timezone
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        # Return ISO format string with timezone information
        return dt.isoformat()  # type: ignore

    # For any other type, try to convert to string, but this may return None
    # if conversion fails or results in unexpected format
    try:
        result = str(dt)
        return result if result else None
    except Exception:
        return None


class DocStatusResponse(BaseModel):
    """Response model for individual document status from LightRAG."""

    id: str = Field(description="Document identifier")
    content_summary: str = Field(description="Summary of document content")
    content_length: int = Field(description="Length of document content in characters")
    status: DocStatus = Field(description="Current processing status")
    created_at: str = Field(description="Creation timestamp (ISO format string)")
    updated_at: str = Field(description="Last update timestamp (ISO format string)")
    track_id: Optional[str] = Field(default=None, description="Tracking ID for monitoring progress")
    chunks_count: Optional[int] = Field(default=None, description="Number of chunks the document was split into")
    error_msg: Optional[str] = Field(default=None, description="Error message if processing failed")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata about the document")
    file_path: str = Field(description="Path to the document file")


class TrackStatusResponse(BaseModel):
    """Response model for tracking document processing status by track_id from LightRAG"""

    track_id: str = Field(description="The tracking ID")
    documents: List[DocStatusResponse] = Field(description="List of documents associated with this track_id")
    total_count: int = Field(description="Total number of documents for this track_id")
    status_summary: Dict[str, int] = Field(description="Count of documents by status")


# Document deletion


class DeleteDocumentRequest(BaseModel):
    """Request model for deleting a document from LightRAG."""

    workspace_id: str
    llm_model: str
    embedding_model: str
    rerank_model: Optional[str] = None

    # Document deletion parameters
    doc_id: str
    delete_llm_cache: bool = False


class DeleteDocumentResponse(BaseModel):
    """Response model for document deletion operation."""

    success: bool
    message: str
    doc_id: str
    status: str
    file_path: Optional[str] = None
    processing_time_ms: Optional[float] = None
