"""Type definitions for LightRAG instance management."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union

from lightrag.base import DocStatus
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
    addon_params: Optional[Dict[str, Any]] = None


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
    addon_params: Optional[Dict[str, Any]] = None


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


# Base request classes


class BaseLightRAGRequest(BaseModel):
    """Base class for LightRAG requests to reduce parameter redundancy."""

    workspace_id: str = Field(description="Workspace identifier")
    llm_model: str = Field(description="LLM model name")
    embedding_model: str = Field(description="Embedding model name")
    rerank_model: Optional[str] = Field(default=None, description="Rerank model name")
    timeout: Optional[int] = Field(ge=1, le=7200, default=3600, description="Request timeout in seconds")


class QueryParamOverrides(BaseModel):
    """Optional overrides for LightRAG QueryParam defaults."""

    mode: Optional[Literal["local", "global", "hybrid", "naive", "mix", "bypass"]] = Field(
        default=None, description="Query retrieval mode"
    )
    response_type: Optional[str] = Field(default=None, description="Response format preference")
    top_k: Optional[int] = Field(
        ge=1, le=1000, default=None, description="Number of top entities/relationships to retrieve"
    )
    chunk_top_k: Optional[int] = Field(ge=1, le=1000, default=None, description="Number of text chunks to retrieve")
    max_entity_tokens: Optional[int] = Field(
        ge=1, le=8192, default=None, description="Maximum tokens for entity context"
    )
    max_relation_tokens: Optional[int] = Field(
        ge=1, le=8192, default=None, description="Maximum tokens for relationship context"
    )
    max_total_tokens: Optional[int] = Field(ge=1, le=16384, default=None, description="Maximum total tokens budget")
    enable_rerank: Optional[bool] = Field(default=None, description="Enable reranking for retrieved chunks")
    include_references: Optional[bool] = Field(default=None, description="Include reference list in response")


class EnhancedPaginationParams(BaseModel):
    """Enhanced pagination parameters with sorting and filtering."""

    # Basic pagination
    page: int = Field(ge=1, default=1, description="Page number (1-based)")
    page_size: int = Field(ge=1, le=1000, default=100, description="Number of items per page")

    # Sorting options
    sort_by: Optional[str] = Field(default=None, description="Field to sort by")
    sort_direction: Literal["asc", "desc"] = Field(default="desc", description="Sort direction")

    # Filtering options
    filter_by: Optional[Dict[str, Any]] = Field(default=None, description="Filter criteria as key-value pairs")
    search_fields: Optional[List[str]] = Field(default=None, description="Fields to search in for text filtering")


# Document insertion


class InsertDocumentsRequest(BaseLightRAGRequest):
    """Request model for inserting documents into LightRAG."""

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


class DocumentInsertionStatus(str, Enum):
    """Status enumeration for document insertion operations."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class InsertionStatusRequest(BaseLightRAGRequest):
    """Request model for querying insertion status."""

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


class DeleteDocumentRequest(BaseLightRAGRequest):
    """Request model for deleting a document from LightRAG."""

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


# Document listing


class PaginationInfo(BaseModel):
    """Pagination information for list responses."""

    page: int = Field(description="Current page number (1-based)")
    page_size: int = Field(description="Number of items per page")
    total_items: int = Field(description="Total number of items")
    total_pages: int = Field(description="Total number of pages")
    has_next: bool = Field(description="Whether there are more pages")
    has_prev: bool = Field(description="Whether there are previous pages")


# Data retrieval


class DataRetrievalRequest(BaseLightRAGRequest):
    """Request model for retrieving structured data from LightRAG with complete QueryParam support."""

    # Query parameters
    query: str = Field(min_length=3, description="Query text for retrieval")

    # Core QueryParam fields
    mode: Literal["local", "global", "hybrid", "naive", "mix", "bypass"] = Field(
        default="mix", description="Query retrieval mode"
    )
    response_type: Optional[str] = Field(default=None, description="Response format preference")
    stream: Optional[bool] = Field(default=False, description="Enable streaming output")
    only_need_context: Optional[bool] = Field(
        default=None, description="Return only retrieved context without generation"
    )
    only_need_prompt: Optional[bool] = Field(default=None, description="Return only generated prompt")

    # Retrieval control parameters
    top_k: Optional[int] = Field(default=None, description="Number of top entities/relationships to retrieve")
    chunk_top_k: Optional[int] = Field(default=None, description="Number of text chunks to retrieve")
    max_entity_tokens: Optional[int] = Field(default=None, description="Maximum tokens for entity context")
    max_relation_tokens: Optional[int] = Field(default=None, description="Maximum tokens for relationship context")
    max_total_tokens: Optional[int] = Field(default=None, description="Maximum total tokens budget")

    # Enhancement parameters
    hl_keywords: list[str] = Field(default_factory=list, description="High-level keywords to prioritize")
    ll_keywords: list[str] = Field(default_factory=list, description="Low-level keywords to refine focus")
    conversation_history: Optional[List[Dict[str, Any]]] = Field(
        default=None, description="Conversation history context"
    )
    user_prompt: Optional[str] = Field(default=None, description="Custom user prompt for LLM")
    enable_rerank: Optional[bool] = Field(default=None, description="Enable reranking for retrieved chunks")
    include_references: Optional[bool] = Field(default=None, description="Include reference list in response")

    # Enhanced pagination parameters
    page: Optional[int] = Field(ge=1, default=1, description="Page number for pagination (1-based)")
    page_size: Optional[int] = Field(ge=1, le=1000, default=100, description="Number of items per page")
    sort_by: Optional[str] = Field(default=None, description="Field to sort results by")
    sort_direction: Literal["asc", "desc"] = Field(default="desc", description="Sort direction")

    # Filtering options
    filter_by: Optional[Dict[str, Any]] = Field(default=None, description="Filter criteria as key-value pairs")
    search_fields: Optional[List[str]] = Field(default=None, description="Fields to search in for text filtering")


class DataRetrievalResponse(BaseModel):
    """Response model for structured data retrieval from LightRAG."""

    success: bool
    message: str
    query: str
    mode: str

    # Retrieved data
    entities: List[Dict[str, Any]] = Field(default_factory=list)
    relationships: List[Dict[str, Any]] = Field(default_factory=list)
    chunks: List[Dict[str, Any]] = Field(default_factory=list)
    references: List[Dict[str, Any]] = Field(default_factory=list)

    # Metadata and pagination
    metadata: Dict[str, Any] = Field(default_factory=dict)
    pagination: Optional[PaginationInfo] = None

    # Performance info
    processing_time_ms: Optional[float] = None
    timeout_hit: bool = False


# Query with LLM generation


class QueryWithLLMRequest(DataRetrievalRequest):
    """Request model for querying LightRAG with LLM generation (aquery_llm)."""

    # Additional parameter for LLM generation
    system_prompt: Optional[str] = Field(default=None, description="Custom system prompt for LLM generation")


class QueryWithLLMResponse(BaseModel):
    """Response model for querying LightRAG with LLM generation."""

    # Direct response from aquery_llm
    data: Dict[str, Any] = Field(description="Raw response data from aquery_llm method")

    # Request metadata
    query: str = Field(description="Original query text")
    mode: str = Field(description="Query mode used")

    # Performance info
    processing_time_ms: Optional[float] = Field(default=None, description="Processing time in milliseconds")
    timeout_hit: bool = Field(default=False, description="Whether the query timed out")

    # Optional error info
    success: bool = Field(default=True, description="Whether the query was successful")
    error_message: Optional[str] = Field(default=None, description="Error message if query failed")
